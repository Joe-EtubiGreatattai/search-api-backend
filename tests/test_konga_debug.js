const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chalk = require('chalk');

puppeteer.use(StealthPlugin());

async function configurePage(page) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['stylesheet', 'font', 'media'].includes(req.resourceType())) {
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
        headless: true,
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

        // Trigger lazy loading
        await page.evaluate(() => window.scrollBy(0, 1000));
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('⏳ Waiting for selector: .List_listItem__KlvU2\n');
        await page.waitForSelector('.List_listItem__KlvU2', { timeout: 15000 }).catch(() => null);

        // Extract container HTML and image attributes
        const data = await page.evaluate(() => {
            const firstItem = document.querySelector('.List_listItem__KlvU2');
            if (!firstItem) return { error: 'Item not found' };

            const img = firstItem.querySelector('img');
            const imgAttrs = {};
            if (img) {
                for (const attr of img.attributes) {
                    imgAttrs[attr.name] = attr.value;
                }
            }

            // Also check for any other images in the container
            const allImgs = Array.from(firstItem.querySelectorAll('img')).map(i => {
                const attrs = {};
                for (const attr of i.attributes) {
                    attrs[attr.name] = attr.value;
                }
                return attrs;
            });

            return {
                html: firstItem.innerHTML,
                imgAttrs,
                allImgs
            };
        });

        if (data.error) {
            console.log(chalk.red(`❌ ${data.error}`));
        } else {
            console.log(chalk.green('✅ Container details extracted:'));
            console.log('\n🏗️  HTML Structure Snippet:', data.html.substring(0, 500) + '...');
            console.log('\n🖼️  Primary Image Attributes:', JSON.stringify(data.imgAttrs, null, 2));
            console.log('\n🖼️  All Images in Container:', JSON.stringify(data.allImgs, null, 2));
        }

    } catch (error) {
        console.error(chalk.red('❌ Error during test:'), error.message);
    } finally {
        await browser.close();
        console.log('\n✅ Test completed!');
    }
}

testKonga();
