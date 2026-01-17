const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chalk = require('chalk');

puppeteer.use(StealthPlugin());

async function configurePage(page) {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
}

async function testAjeboMarket() {
    const query = 'nike sneakers';
    console.log(chalk.blue(`🧪 Testing Ajebo Market for: ${query}...`));

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await configurePage(page);

        const url = `https://ajebomarket.com/search?q=${encodeURIComponent(query)}`;
        console.log(`📍 Navigating to: ${url}`);

        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Search for the product grid item
        console.log('⏳ Waiting for .grid__item selector...');
        await page.waitForSelector('.grid__item', { timeout: 15000 }).catch(() => {
            console.log(chalk.red('❌ Timeout waiting for .grid__item'));
        });

        // Screenshot to see what's happening
        await page.screenshot({ path: 'ajebo_debug.png' });
        console.log(chalk.yellow('📸 Screenshot saved to ajebo_debug.png'));

        const results = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('li.grid__item').forEach(el => {
                const titleEl = el.querySelector('.card__heading a');
                const title = titleEl?.innerText.trim() || 'N/A';
                const link = titleEl?.href || 'N/A';

                const salePriceEl = el.querySelector('.price__sale .price-item--sale');
                const regularPriceEl = el.querySelector('.price__regular .price-item--regular');
                let priceText = (salePriceEl || regularPriceEl)?.innerText || 'N/A';

                const imgEl = el.querySelector('.card__media img');
                let img = imgEl?.getAttribute('srcset')?.split(',')[0].split(' ')[0] || imgEl?.src || 'N/A';
                if (img.startsWith('//')) img = 'https:' + img;

                items.push({ title, price: priceText, img, link });
            });
            return items;
        });

        console.log(chalk.green(`✅ Found ${results.length} items on page.`));
        if (results.length > 0) {
            console.log('📦 Sample results:');
            results.slice(0, 3).forEach((item, i) => {
                console.log(`   ${i + 1}. ${item.title} - ${item.price}`);
            });
        }

    } catch (error) {
        console.error(chalk.red('❌ Test failed:'), error.message);
    } finally {
        console.log('\n⏳ Closing in 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        await browser.close();
    }
}

testAjeboMarket();
