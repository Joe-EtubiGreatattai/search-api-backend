const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chalk = require('chalk');
const Table = require('cli-table3');

puppeteer.use(StealthPlugin());

async function scrapeAmazon(page, query) {
    console.log(chalk.blue(`Searching Amazon for: ${query}...`));
    try {
        await page.goto(`https://www.amazon.com/s?k=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Wait for results or captcha
        await page.waitForSelector('.s-result-item', { timeout: 15000 }).catch(() => null);

        // Check for captcha
        const isCaptcha = await page.evaluate(() => document.body.innerText.includes('Type the characters you see in this image'));
        if (isCaptcha) {
            console.log(chalk.yellow('Amazon: Captcha detected.'));
            return [];
        }

        const results = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.s-result-item[data-component-type="s-search-result"]').forEach(el => {
                const title = el.querySelector('h2 span')?.innerText || 'N/A';
                const price = el.querySelector('.a-price .a-offscreen')?.innerText || 'N/A';
                const img = el.querySelector('.s-image')?.src || 'N/A';
                const link = el.querySelector('a.a-link-normal')?.href || 'N/A';

                if (title !== 'N/A' && price !== 'N/A') {
                    items.push({ source: 'Amazon', title, price, img, link });
                }
            });
            return items;
        });
        return results.slice(0, 15);
    } catch (error) {
        console.error(chalk.red('Amazon scrape error:'), error.message);
        return [];
    }
}

async function scrapeEbay(page, query) {
    console.log(chalk.blue(`Searching eBay for: ${query}...`));
    try {
        await page.goto(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForSelector('.srp-results, .su-card-container', { timeout: 15000 }).catch(() => null);

        // Scroll to trigger lazy loading
        await page.evaluate(async () => {
            window.scrollBy(0, 1000);
            await new Promise(r => setTimeout(r, 1000));
            window.scrollBy(0, 1000);
        });

        const results = await page.evaluate(() => {
            const items = [];
            // Target both traditional .s-item and new .s-card selectors
            const elements = document.querySelectorAll('.s-item, .s-item__wrapper, .su-card-container, .s-card');

            elements.forEach(el => {
                // Title
                const titleEl = el.querySelector('.s-item__title span[role="heading"]') ||
                    el.querySelector('.s-item__title') ||
                    el.querySelector('.s-card__title span') ||
                    el.querySelector('.s-card__title');

                // Price
                const priceEl = el.querySelector('.s-item__price') ||
                    el.querySelector('.s-card__price');

                // Image
                const imgEl = el.querySelector('.s-item__image-img') ||
                    el.querySelector('.s-card__image') ||
                    el.querySelector('img');

                // Link
                const linkEl = el.querySelector('.s-item__link') ||
                    el.querySelector('.s-card__link') ||
                    el.querySelector('a');

                const title = titleEl?.innerText || 'N/A';
                const price = priceEl?.innerText || 'N/A';
                const img = imgEl?.getAttribute('src') || imgEl?.src || 'N/A';
                const link = linkEl?.href || 'N/A';

                // Skip "Shop on eBay" and other noise, and ensure title is substantial
                if (title !== 'N/A' && price !== 'N/A' && !title.includes('Shop on eBay') && title.length > 10) {
                    items.push({ source: 'eBay', title, price, img, link });
                }
            });
            return items;
        });
        return results.slice(0, 15);
    } catch (error) {
        console.error(chalk.red('eBay scrape error:'), error.message);
        return [];
    }
}

async function startScraping(query) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });

    try {
        const [amazonPage, ebayPage] = await Promise.all([
            browser.newPage(),
            browser.newPage()
        ]);

        // Set User Agents
        const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        await amazonPage.setUserAgent(UA);
        await ebayPage.setUserAgent(UA);

        // Run scrapes in parallel
        const [amazonResults, ebayResults] = await Promise.all([
            scrapeAmazon(amazonPage, query),
            scrapeEbay(ebayPage, query)
        ]);

        const allResults = [...amazonResults, ...ebayResults];

        if (allResults.length === 0) {
            console.log(chalk.red('No results found on Amazon or eBay.'));
        } else {
            const table = new Table({
                head: [
                    chalk.green('Source'),
                    chalk.green('Product'),
                    chalk.green('Price'),
                    chalk.green('Link')
                ],
                colWidths: [10, 40, 15, 60],
                wordWrap: true
            });

            allResults.forEach(item => {
                table.push([
                    item.source,
                    item.title,
                    item.price,
                    chalk.cyan(item.link)
                ]);
            });

            console.log(table.toString());
            console.log(chalk.yellow(`\nFound ${allResults.length} total results.`));
            console.log(chalk.gray('(Ordered by source, max 15 per platform)'));
        }

    } catch (error) {
        console.error(chalk.red('Scraping session failed:'), error.message);
    } finally {
        await browser.close();
    }
}

const query = process.argv.slice(2).join(' ');

if (!query) {
    console.log(chalk.yellow('Usage: node index.js "item to search"'));
    process.exit(1);
}

startScraping(query);
