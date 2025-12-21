const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chalk = require('chalk');

puppeteer.use(StealthPlugin());

async function scrapeJiji(query) {
    console.log(chalk.blue(`Debugging Jiji.ng for: ${query}...`));
    const browser = await puppeteer.launch({
        headless: true, // Change to false to see the browser
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });
    const page = await browser.newPage();
    const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    await page.setUserAgent(UA);

    try {
        const url = `https://jiji.ng/search?query=${encodeURIComponent(query)}`;
        console.log(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('Page loaded. Checking for selectors...');

        // Take a screenshot
        await page.screenshot({ path: 'jiji_debug.png' });
        console.log('Screenshot saved to jiji_debug.png');

        const html = await page.content();
        if (html.includes('Cloudflare') || html.includes('Verify you are human')) {
            console.log(chalk.red('Blocked by Cloudflare/Bot Detection!'));
            return;
        }

        // Try to find any items
        const rawItems = await page.$$('.qa-advert-list-item');
        console.log(`Found ${rawItems.length} elements with .qa-advert-list-item`);

        const bAdvertItems = await page.$$('.b-list-advert-base');
        console.log(`Found ${bAdvertItems.length} elements with .b-list-advert-base`);

        const results = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.qa-advert-list-item, .b-list-advert-base').forEach(el => {
                const title = el.querySelector('.qa-advert-title, .b-advert-title-inner')?.innerText || 'N/A';
                const price = el.querySelector('.qa-advert-price')?.innerText || 'N/A';
                const img = el.querySelector('img')?.src || 'N/A';
                items.push({ title, price, img });
            });
            return items;
        });

        console.log('Extracted Items:', results.slice(0, 3));

    } catch (error) {
        console.error(chalk.red('Debug error:'), error);
    } finally {
        await browser.close();
    }
}

scrapeJiji('iPhone 15');
