const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chalk = require('chalk');

puppeteer.use(StealthPlugin());

async function testAjebo() {
    console.log(chalk.blue('🧪 Testing Ajebo Market scraper...'));
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const query = 'vintage jean jacket';

    try {
        await page.goto(`https://ajebomarket.com/search?q=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await new Promise(r => setTimeout(r, 5000));

        const results = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.product-item').forEach(el => {
                const title = el.querySelector('.product-item__title')?.innerText.trim() || 'N/A';
                const price = el.querySelector('.price')?.innerText.trim() || 'N/A';
                const img = el.querySelector('img')?.src || 'N/A';
                const link = el.querySelector('a')?.href || 'N/A';
                items.push({ title, price, img, link });
            });
            return items;
        });

        console.log(chalk.green(`✅ Found ${results.length} results`));
        if (results.length > 0) {
            console.log(JSON.stringify(results.slice(0, 3), null, 2));
        } else {
            console.log(chalk.red('❌ No results found. Dumping HTML structure...'));
            const html = await page.evaluate(() => {
                return document.body.innerHTML.substring(0, 1000);
            });
            console.log(html);
        }

    } catch (e) {
        console.error(chalk.red('Error:'), e.message);
    } finally {
        await browser.close();
    }
}

testAjebo();
