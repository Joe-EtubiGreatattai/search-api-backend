const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chalk = require('chalk');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Helper to optimize page (block resources + set UA)
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
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
}

async function scrapeAmazon(page, query) {
    console.log(chalk.blue(`Searching Amazon for: ${query}...`));
    try {
        await configurePage(page);
        await page.goto(`https://www.amazon.com/s?k=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForSelector('.s-result-item', { timeout: 15000 }).catch(() => null);

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
        await configurePage(page);
        await page.goto(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForSelector('.srp-results, .su-card-container', { timeout: 15000 }).catch(() => null);

        await page.evaluate(async () => {
            window.scrollBy(0, 1000);
            await new Promise(r => setTimeout(r, 1000));
        });

        const results = await page.evaluate(() => {
            const items = [];
            const elements = document.querySelectorAll('.s-item, .s-item__wrapper, .su-card-container, .s-card');

            elements.forEach(el => {
                const titleEl = el.querySelector('.s-item__title span[role="heading"]') ||
                    el.querySelector('.s-item__title') ||
                    el.querySelector('.s-card__title span');

                const priceEl = el.querySelector('.s-item__price') ||
                    el.querySelector('.s-card__price');

                const imgEl = el.querySelector('.s-item__image-img') ||
                    el.querySelector('.s-card__image') ||
                    el.querySelector('img');

                const linkEl = el.querySelector('.s-item__link') ||
                    el.querySelector('.s-card__link') ||
                    el.querySelector('a');

                const title = titleEl?.innerText || 'N/A';
                const price = priceEl?.innerText || 'N/A';
                const img = imgEl?.getAttribute('src') || imgEl?.src || 'N/A';
                const link = linkEl?.href || 'N/A';

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

async function scrapeJiji(page, query) {
    console.log(chalk.blue(`Searching Jiji.ng for: ${query}...`));
    try {
        await configurePage(page);
        await page.goto(`https://jiji.ng/search?query=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Wait for results
        await page.waitForSelector('.qa-advert-list-item', { timeout: 15000 }).catch(() => null);

        // Perform some scrolling for lazy loading
        await page.evaluate(() => {
            window.scrollBy(0, 500);
            return new Promise(resolve => setTimeout(resolve, 500));
        });

        const results = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.qa-advert-list-item').forEach(el => {
                const titleEl = el.querySelector('.qa-advert-title') || el.querySelector('.b-advert-title-inner');
                const title = titleEl?.innerText || 'N/A';
                const price = el.querySelector('.qa-advert-price')?.innerText || 'N/A';
                const img = el.querySelector('img')?.src || 'N/A';
                const link = el.href;

                if (title !== 'N/A' && price !== 'N/A' && !title.includes('Shop on')) {
                    items.push({ source: 'Jiji', title, price, img, link });
                }
            });
            return items.slice(0, 15);
        });
        return results;
    } catch (error) {
        console.error(chalk.red('Jiji scrape error:'), error.message);
        return [];
    }
}

async function scrapeJumia(page, query) {
    console.log(chalk.blue(`Searching Jumia for: ${query}...`));
    try {
        // Apply resource blocking first
        await configurePage(page);
        // Then override UA for Jumia specifically
        const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
        await page.setUserAgent(UA);
        await page.setViewport({ width: 1366, height: 768 });

        const url = `https://www.jumia.com.ng/catalog/?q=${encodeURIComponent(query)}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Handle cookie popup if present
        try {
            const cookieBtn = await page.waitForSelector('button.-bg-gy', { timeout: 3000 });
            if (cookieBtn) {
                await cookieBtn.click();
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (e) {
            // Ignore
        }

        const results = await page.evaluate(() => {
            const items = [];
            // Jumia selectors
            document.querySelectorAll('article.prd, .c-prd').forEach(el => {
                const title = el.querySelector('.name')?.innerText || el.querySelector('h3.name')?.innerText || 'N/A';
                const price = el.querySelector('.prc')?.innerText || 'N/A';
                const img = el.querySelector('img.img')?.dataset.src || el.querySelector('img.img')?.src || 'N/A';
                const link = el.querySelector('a.core')?.href || 'N/A';

                if (title !== 'N/A' && price !== 'N/A') {
                    items.push({ source: 'Jumia', title, price, img, link });
                }
            });
            return items.slice(0, 15);
        });
        return results;
    } catch (error) {
        console.error(chalk.red('Jumia scrape error:'), error.message);
        return [];
    }
}

app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

    console.log(chalk.green(`\nNew web search request: ${q}`));

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });

    try {
        const [amazonPage, ebayPage, jijiPage, jumiaPage] = await Promise.all([
            browser.newPage(),
            browser.newPage(),
            browser.newPage(),
            browser.newPage()
        ]);

        // Run scrapers sequentially to save memory on free tier
        const amazonResults = await scrapeAmazon(amazonPage, q);
        const ebayResults = await scrapeEbay(ebayPage, q);
        const jijiResults = await scrapeJiji(jijiPage, q);
        // Jumia disabled for performance - uncomment to re-enable
        // const jumiaResults = await scrapeJumia(jumiaPage, q);

        const allResults = [...amazonResults, ...ebayResults, ...jijiResults]; // Add ...jumiaResults back when enabled
        console.log(chalk.green(`Search completed. Found ${allResults.length} total results.`));
        res.json(allResults);

    } catch (error) {
        console.error(chalk.red('API search failed:'), error.message);
        res.status(500).json({ error: 'Scraping failed' });
    } finally {
        await browser.close();
    }
});

app.listen(PORT, () => {
    console.log(chalk.magenta(`\n🚀 Server running on http://localhost:${PORT}`));
});
