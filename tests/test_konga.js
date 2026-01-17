const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chalk = require('chalk');

puppeteer.use(StealthPlugin());

async function configurePage(page) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
}

async function testKonga() {
    const query = 'vintage jean jacket';
    console.log(chalk.blue(`\n🧪 Testing Konga scraper for: "${query}"\n`));

    const browser = await puppeteer.launch({
        headless: false, // Set to false to see what's happening
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1280,800'
        ]
    });

    try {
        const page = await browser.newPage();
        await configurePage(page);

        const url = `https://www.konga.com/search?search=${encodeURIComponent(query)}`;
        console.log(`📍 Navigating to: ${url}\n`);

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log('⏳ Waiting for selector: .List_listItem__KlvU2\n');
        await page.waitForSelector('.List_listItem__KlvU2', { timeout: 15000 }).catch(() => {
            console.log('⚠️  Selector .List_listItem__KlvU2 not found!');
        });

        // Take a screenshot for debugging
        await page.screenshot({ path: 'konga_debug.png', fullPage: true });
        console.log('📸 Screenshot saved as konga_debug.png\n');

        // Check what's on the page
        const pageTitle = await page.title();
        console.log(`📄 Page title: ${pageTitle}\n`);

        // Try to find elements
        const elementCount = await page.evaluate(() => {
            return {
                listItems: document.querySelectorAll('.List_listItem__KlvU2').length,
                productTitles: document.querySelectorAll('.ListingCard_productTitle__9Kzxv').length,
                prices: document.querySelectorAll('.shared_price__gnso_').length,
                links: document.querySelectorAll('a[href^="/product/"]').length,
                images: document.querySelectorAll('img[alt]').length
            };
        });

        console.log('🔍 Element counts:');
        console.log(`   • List items (.List_listItem__KlvU2): ${elementCount.listItems}`);
        console.log(`   • Product titles (.ListingCard_productTitle__9Kzxv): ${elementCount.productTitles}`);
        console.log(`   • Prices (.shared_price__gnso_): ${elementCount.prices}`);
        console.log(`   • Product links (a[href^="/product/"]): ${elementCount.links}`);
        console.log(`   • Images (img[alt]): ${elementCount.images}\n`);

        // Try to extract data
        const { results, firstItemHTML } = await page.evaluate(() => {
            const items = [];
            let firstItemHTML = '';
            const listItems = document.querySelectorAll('.List_listItem__KlvU2');

            listItems.forEach((el, index) => {
                if (index === 0) {
                    firstItemHTML = el.innerHTML;
                }

                // Check common lazy-load attributes
                const img = imgEl?.getAttribute('data-src') ||
                    imgEl?.getAttribute('data-original') ||
                    imgEl?.getAttribute('src') || 'N/A';

                if (title !== 'N/A' && price !== 'N/A' && !title.includes('Shop on')) {
                    items.push({ source: 'Konga', title, price, img, link, rating: 'N/A' });
                }
            });
            return { results: items, firstItemAttrs };
        });

        if (firstItemHTML) {
            console.log('🏗️  First item HTML structure:', firstItemHTML);
        }

        console.log(`\n✅ Extracted ${results.length} valid items from Konga\n`);

        if (results.length > 0) {
            console.log('📦 Sample results:');
            results.slice(0, 3).forEach((item, i) => {
                console.log(`\n   ${i + 1}. ${item.title}`);
                console.log(`      Price: ₦${item.price}`);
                console.log(`      Image: ${item.img}`);
                console.log(`      Link: ${item.link.substring(0, 60)}...`);
            });
        } else {
            console.log('❌ No results extracted! Check the screenshot for details.');
        }

        // Wait a bit before closing so you can see the page
        console.log('\n⏳ Keeping browser open for 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error) {
        console.error('❌ Error during test:', error.message);
        console.error(error.stack);
    } finally {
        await browser.close();
        console.log('\n✅ Test completed!');
    }
}

testKonga();
