const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chalk = require('chalk');

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

/**
 * Helper to optimize page (block resources + set UA)
 */
async function configurePage(page) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });
    // Standard UA for most sites
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
}

/**
 * Scrapes Slot.ng for a given query
 */
async function testScrapeSlot(query) {
    console.log(chalk.blue(`[Test] Searching Slot.ng for: "${query}"...`));

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1280,800'
        ]
    });

    try {
        const page = await browser.newPage();
        await configurePage(page);

        const startTime = Date.now();
        await page.goto(`https://slot.ng/shop?q=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Wait for product items to appear
        const selectorFound = await page.waitForSelector('.product-item', { timeout: 15000 })
            .then(() => true)
            .catch(() => false);

        if (!selectorFound) {
            console.log(chalk.yellow('[Test] Warning: No products found or selector ".product-item" timed out.'));
            // Take a screenshot for debugging if it fails
            await page.screenshot({ path: 'test_slot_timeout.png' });
            return { success: false, results: [], error: 'Timeout/No results' };
        }

        const results = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('li.product-item').forEach(el => {
                const titleEl = el.querySelector('.product-item__title a');
                const title = titleEl?.innerText.trim() || 'N/A';
                const link = titleEl?.href || 'N/A';
                const price = el.querySelector('.prodcut-price .text-gray-100')?.innerText.trim() || 'N/A';
                const img = el.querySelector('img.img-fluid')?.src || 'N/A';

                if (title !== 'N/A' && price !== 'N/A') {
                    items.push({ title, price, img, link });
                }
            });
            return items;
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(chalk.green(`[Test] Success! Found ${results.length} results in ${duration}s.`));

        if (results.length > 0) {
            console.log(chalk.gray('--- Sample Result ---'));
            console.log(JSON.stringify(results[0], null, 2));
            console.log(chalk.gray('----------------------'));

            // Basic Validations
            const hasPrice = results[0].price.includes('₦');
            const hasTitle = results[0].title.length > 0;
            const hasLink = results[0].link.startsWith('http');

            console.log(`Validations:
  - Has Naira symbol: ${hasPrice ? '✅' : '❌'}
  - Has Title: ${hasTitle ? '✅' : '❌'}
  - Valid Link: ${hasLink ? '✅' : '❌'}`);
        }

        return { success: true, results, count: results.length, duration };

    } catch (error) {
        console.error(chalk.red('[Test] Error during scrape:'), error.message);
        return { success: false, error: error.message };
    } finally {
        await browser.close();
    }
}

// Run the test
const query = process.argv[2] || 'power bank';
testScrapeSlot(query).then(res => {
    if (res.success && res.count > 0) {
        process.exit(0);
    } else {
        process.exit(1);
    }
});
