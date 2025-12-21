const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chalk = require('chalk');

puppeteer.use(StealthPlugin());

async function debugJumia(query) {
    console.log(chalk.blue(`Debugging Jumia for: ${query}...`));
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });
    const page = await browser.newPage();
    // Use a very specific, modern UA
    const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
    await page.setUserAgent(UA);
    await page.setViewport({ width: 1366, height: 768 });

    try {
        const url = `https://www.jumia.com.ng/catalog/?q=${encodeURIComponent(query)}`;
        console.log(`Navigating to ${url}`);

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Handle cookie popup if present
        try {
            const cookieBtn = await page.waitForSelector('button.-bg-gy', { timeout: 3000 });
            if (cookieBtn) {
                console.log('Clicking cookie consent...');
                await cookieBtn.click();
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (e) {
            // Ignore if no cookie banner
        }

        console.log('Page loaded. Capturing screenshot...');
        await page.screenshot({ path: 'jumia_debug.png' });

        const html = await page.content();
        if (html.includes('Access Denied') || html.includes('captcha')) {
            console.log(chalk.red('Blocked by Jumia security!'));
            // Try to print the title or body text to see what kind of block
            const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 200));
            console.log('Body start:', bodyText);
            return;
        }

        // Jumia selectors (Updated based on common structure)
        // Container: article.prd._fb.col.c-prd
        // Title: h3.name
        // Price: div.prc
        // Image: img.img

        const results = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('article.prd, .c-prd').forEach(el => {
                const title = el.querySelector('.name')?.innerText || 'N/A';
                const price = el.querySelector('.prc')?.innerText || 'N/A';
                const img = el.querySelector('img.img')?.dataset.src || el.querySelector('img.img')?.src || 'N/A';
                const link = el.querySelector('a.core')?.href || 'N/A';

                if (title !== 'N/A' && price !== 'N/A') {
                    items.push({ title, price, img, link });
                }
            });
            return items.slice(0, 5);
        });

        console.log(`Found ${results.length} items.`);
        console.log('Sample Items:', results);

    } catch (error) {
        console.error(chalk.red('Debug error:'), error);
    } finally {
        await browser.close();
    }
}

debugJumia('iPhone 15');
