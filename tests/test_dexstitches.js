const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chalk = require('chalk');

puppeteer.use(StealthPlugin());

async function configurePage(page) {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
}

async function testDexStitches(query) {
    console.log(chalk.blue(`🚀 Testing DexStitches for: ${query}...`));
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await configurePage(page);

        const url = `https://dexstitches.com/index.php?route=product/search&search=${encodeURIComponent(query)}`;
        console.log(chalk.gray(`Visiting: ${url}`));

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log(chalk.gray('Waiting for products to load...'));
        await new Promise(resolve => setTimeout(resolve, 5000));

        const results = await page.evaluate(() => {
            const items = [];
            const selector = '.product-list .product, .product-grid .product';
            const containers = document.querySelectorAll(selector);

            containers.forEach(el => {
                const titleEl = el.querySelector('.name a');
                const title = titleEl?.innerText.trim() || 'N/A';
                const link = titleEl?.href || 'N/A';

                const priceEl = el.querySelector('.price');
                const priceText = priceEl?.innerText.split('\n')[0] || 'N/A';
                const price = priceText.replace(/₦|,/g, '').trim();

                const imgEl = el.querySelector('.image img');
                const img = imgEl?.getAttribute('data-echo') || imgEl?.src || 'N/A';

                if (title !== 'N/A' && price !== 'N/A') {
                    items.push({ title, price, img, link });
                }
            });
            return items;
        });

        if (results.length > 0) {
            console.log(chalk.green(`✅ Success! Found ${results.length} results.`));
            console.log(chalk.white('First 3 results:'));
            console.table(results.slice(0, 3));
        } else {
            console.log(chalk.red('❌ No results found.'));
            // Take a screenshot for debugging
            await page.screenshot({ path: 'dexstitches_debug.png' });
            console.log(chalk.yellow('Saved dexstitches_debug.png for inspection.'));
        }

    } catch (error) {
        console.error(chalk.red('FATAL ERROR:'), error);
    } finally {
        await browser.close();
    }
}

const query = process.argv[2] || 'suit';
testDexStitches(query);
