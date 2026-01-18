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
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
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

                // Extract rating
                const rating = el.querySelector('.a-icon-alt')?.innerText || 'N/A';

                if (title !== 'N/A' && price !== 'N/A') {
                    items.push({ source: 'Amazon', title, price, img, link, rating });
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

                // Extract rating for eBay
                // eBay ratings can be tricky, often in .x-star-rating .visually-hidden
                const ratingEl = el.querySelector('.x-star-rating .visually-hidden') ||
                    el.querySelector('.b-rating__rating-star span');
                const rating = ratingEl?.innerText || 'N/A';

                if (title !== 'N/A' && price !== 'N/A' && !title.includes('Shop on eBay') && title.length > 10) {
                    items.push({ source: 'eBay', title, price, img, link, rating });
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
        // IMPORTANT: Set User Agent for Jiji to avoid bot detection
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        await page.goto(`https://jiji.ng/search?query=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded', // Faster initial load
            timeout: 60000
        });

        // Debug logging for Render
        const pageTitle = await page.title();
        console.log(`[Jiji Debug] Page Title: ${pageTitle}`);

        // Wait for results with fallback
        console.log('[Jiji Debug] Waiting for selectors...');
        await page.waitForSelector('.qa-advert-list-item, .b-list-advert-base', { timeout: 20000 }).catch(async () => {
            const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300));
            console.log(`[Jiji Debug] Selector timeout. Body start: ${bodyText.replace(/\n/g, ' ')}`);
        });

        // Perform some scrolling for lazy loading
        await page.evaluate(() => {
            window.scrollBy(0, 500);
            return new Promise(resolve => setTimeout(resolve, 500));
        });

        const results = await page.evaluate(() => {
            const items = [];
            // Target both common Jiji selectors
            document.querySelectorAll('.qa-advert-list-item, .b-list-advert-base').forEach(el => {
                const titleEl = el.querySelector('.qa-advert-title') || el.querySelector('.b-advert-title-inner');
                const title = titleEl?.innerText || 'N/A';
                const price = el.querySelector('.qa-advert-price')?.innerText || 'N/A';
                const img = el.querySelector('img')?.src || 'N/A';
                const link = el.href || (el.tagName === 'A' ? el.href : el.querySelector('a')?.href) || 'N/A';

                const rating = 'N/A';

                if (title !== 'N/A' && price !== 'N/A' && !title.includes('Shop on')) {
                    items.push({ source: 'Jiji', title, price, img, link, rating });
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
        const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
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

                // Extract rating for Jumia
                // Jumia uses .stars._s text content like "4.5 out of 5"
                const rating = el.querySelector('.stars._s')?.innerText || 'N/A';

                if (title !== 'N/A' && price !== 'N/A') {
                    items.push({ source: 'Jumia', title, price, img, link, rating });
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

async function scrapeKonga(page, query) {
    console.log(chalk.blue(`Searching Konga for: ${query}...`));
    try {
        await configurePage(page);
        await page.goto(`https://www.konga.com/search?search=${encodeURIComponent(query)}`, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Give Konga extra time to load results and scroll slightly to trigger lazy loading
        await page.evaluate(() => window.scrollBy(0, 1000));
        await new Promise(resolve => setTimeout(resolve, 4000));

        await page.waitForSelector('.List_listItem__KlvU2', { timeout: 20000 }).catch(() => {
            console.log(chalk.yellow('⚠️  Konga: Timeout waiting for results'));
        });

        const results = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.List_listItem__KlvU2').forEach(el => {
                const titleEl = el.querySelector('.ListingCard_productTitle__9Kzxv');
                const title = titleEl?.innerText.trim() || 'N/A';

                const linkEl = el.querySelector('a[href^="/product/"]');
                const link = linkEl ? `https://www.konga.com${linkEl.getAttribute('href')}` : 'N/A';

                const priceEl = el.querySelector('.shared_price__gnso_');
                const price = priceEl?.innerText.replace(/₦|,/g, '').trim() || 'N/A';

                // Konga uses complex lazy loading (Next.js)
                const imgEl = el.querySelector('img[alt]');

                // 1. Try to find a non-placeholder image in the container
                const allImages = Array.from(el.querySelectorAll('img'));
                const realImg = allImages.find(i => i.src && !i.src.startsWith('data:image') && i.src.length > 50) ||
                    allImages.find(i => i.getAttribute('data-src') || i.getAttribute('srcset'));

                let img = 'N/A';
                if (realImg) {
                    img = realImg.getAttribute('data-src') ||
                        realImg.getAttribute('srcset')?.split(',')[0].trim().split(' ')[0] ||
                        realImg.src;
                } else if (imgEl) {
                    img = imgEl.getAttribute('data-src') ||
                        imgEl.getAttribute('srcset')?.split(',')[0].trim().split(' ')[0] ||
                        imgEl.src;
                }

                // 2. Fallback: Parse Next.js image URL or noscript
                if (img === 'N/A' || img.startsWith('data:image')) {
                    const noscript = el.querySelector('noscript');
                    if (noscript) {
                        const match = noscript.innerHTML.match(/src="([^"]+)"/);
                        if (match) img = match[1];
                    }
                }

                if (img === 'N/A' || img.startsWith('data:image')) {
                    const imgMatch = el.innerHTML.match(/https:\/\/[^\s\"\'\>]+?\.(jpg|png|webp|jpeg)/i);
                    if (imgMatch) img = imgMatch[0];
                }

                if (title !== 'N/A' && price !== 'N/A' && !title.includes('Shop on')) {
                    items.push({ source: 'Konga', title, price, img, link, rating: 'N/A' });
                }
            });
            return items;
        });

        console.log(chalk.green(`✓ Konga returned ${results.length} results`));
        return results.slice(0, 15);
    } catch (error) {
        console.error(chalk.red('Konga scrape error:'), error.message);
        return [];
    }
}

async function scrapeAjeboMarket(page, query) {
    console.log(chalk.blue(`Searching Ajebo Market for: ${query}...`));
    try {
        await page.goto(`https://ajebomarket.com/search?q=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Give it time to load dynamic items
        await new Promise(resolve => setTimeout(resolve, 4000));

        const results = await page.evaluate(() => {
            const items = [];
            // Extensive Shopify/Ajebo selectors
            const containers = document.querySelectorAll('.grid__item, .product-item, .card-wrapper, .product-card, .list-view-item');
            containers.forEach(el => {
                const titleEl = el.querySelector('.card__heading, .product-item__title, .h4, .list-view-item__title, .product-card__title');
                const title = titleEl?.innerText.trim() || 'N/A';

                const priceEl = el.querySelector('.price-item--sale, .price-item--regular, .price, .money, .product-card__price');
                const priceMatch = priceEl?.innerText.match(/₦\s*([\d,]+)/) || priceEl?.innerText.match(/([\d,]+)/);
                const price = priceMatch ? priceMatch[1].replace(/,/g, '') : 'N/A';

                const linkEl = el.querySelector('a');
                const link = linkEl ? (linkEl.href.startsWith('http') ? linkEl.href : window.location.origin + linkEl.getAttribute('href')) : 'N/A';

                const imgEl = el.querySelector('img');
                const rawImg = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('srcset')?.split(',')[0].trim().split(' ')[0] || imgEl?.src || 'N/A';
                let img = rawImg;
                if (img.startsWith('//')) img = 'https:' + img;

                if (title !== 'N/A' && price !== 'N/A' && price !== '0' && link !== 'N/A' && title.length > 3) {
                    items.push({ source: 'Ajebo Market', title, price, img, link, rating: 'N/A' });
                }
            });
            return items;
        });
        console.log(chalk.green(`✓ Ajebo Market returned ${results.length} results`));
        return results.slice(0, 15);
    } catch (error) {
        console.error(chalk.red('Ajebo Market scrape error:'), error.message);
        return [];
    }
}

async function scrapeDexStitches(page, query) {
    console.log(chalk.blue(`Searching DexStitches for: ${query}...`));

    // Generate variations to try if the first one fails
    // 1. Original
    // 2. Normalize apostrophes (Mens -> Men's, Men's -> Mens)
    const variations = [query];

    // Common fashion normalization hack
    if (query.toLowerCase().includes("mens") && !query.toLowerCase().includes("men's")) {
        variations.push(query.replace(/mens/i, "Men's"));
        variations.push(query.replace(/mens/i, "Male"));
    } else if (query.toLowerCase().includes("men's")) {
        variations.push(query.replace(/men's/i, "Mens"));
    }

    // Female variations
    if (query.toLowerCase().includes("womens") && !query.toLowerCase().includes("women's")) {
        variations.push(query.replace(/womens/i, "Women's"));
        variations.push(query.replace(/womens/i, "Female"));
    } else if (query.toLowerCase().includes("women's")) {
        variations.push(query.replace(/women's/i, "Womens"));
    } else if (query.toLowerCase().includes("ladies")) {
        variations.push(query.replace(/ladies/i, "Women's"));
    }

    try {
        await configurePage(page);
        let results = [];

        for (const q of variations) {
            if (results.length > 0) break; // Stop if we found something

            console.log(chalk.dim(`   Trying variation: "${q}"`));

            await page.goto(`https://dexstitches.com/index.php?route=product/search&search=${encodeURIComponent(q)}`, {
                waitUntil: 'domcontentloaded',
                timeout: 30000 // Shorter timeout for retries
            });

            // Lazy load wait
            await new Promise(resolve => setTimeout(resolve, 2500));

            results = await page.evaluate(() => {
                const items = [];
                const selector = '.product-list .product, .product-grid .product';
                document.querySelectorAll(selector).forEach(el => {
                    const titleEl = el.querySelector('.name a');
                    const title = titleEl?.innerText.trim() || 'N/A';
                    const link = titleEl?.href || 'N/A';
                    const priceEl = el.querySelector('.price');
                    const price = priceEl?.innerText.split('\n')[0].replace(/,/g, '').trim() || 'N/A';
                    const imgEl = el.querySelector('.image img');
                    const img = imgEl?.getAttribute('data-echo') || imgEl?.src || 'N/A';

                    if (title !== 'N/A' && price !== 'N/A' && link !== 'N/A' && title.length > 3) {
                        items.push({
                            source: 'DexStitches',
                            title,
                            price,
                            img,
                            link,
                            rating: 'N/A'
                        });
                    }
                });
                return items;
            });

            if (results.length === 0) {
                console.log(chalk.gray(`   No results for "${q}"`));
            }
        }

        console.log(chalk.green(`✓ DexStitches returned ${results.length} results`));
        return results.slice(0, 15);
    } catch (error) {
        console.error(chalk.red('DexStitches scrape error:'), error.message);
        return [];
    }
}

async function scrapeSlot(page, query) {
    console.log(chalk.blue(`Searching Slot.ng for: ${query}...`));
    try {
        await configurePage(page);
        await page.goto(`https://slot.ng/shop?q=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        await page.waitForSelector('.product-item', { timeout: 15000 }).catch(() => null);

        const results = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('li.product-item').forEach(el => {
                const titleEl = el.querySelector('.product-item__title a');
                const title = titleEl?.innerText.trim() || 'N/A';
                const link = titleEl?.href || 'N/A';
                const price = el.querySelector('.prodcut-price .text-gray-100')?.innerText.trim() || 'N/A';
                const img = el.querySelector('img.img-fluid')?.src || 'N/A';

                if (title !== 'N/A' && price !== 'N/A') {
                    items.push({ source: 'Slot', title, price, img, link, rating: 'N/A' });
                }
            });
            return items;
        });
        return results.slice(0, 15);
    } catch (error) {
        console.error(chalk.red('Slot scrape error:'), error.message);
        return [];
    }
}

/**
 * Interleave results from multiple sources to ensure a balanced mix.
 * @param {Array[]} arrays - Array of result arrays from different sources.
 * @returns {Array} - Single interleaved array.
 */
function interleaveResults(arrays) {
    const interleaved = [];
    const maxLen = Math.max(...arrays.map(arr => arr.length));

    for (let i = 0; i < maxLen; i++) {
        for (const arr of arrays) {
            if (i < arr.length) {
                interleaved.push(arr[i]);
            }
        }
    }
    return interleaved;
}

app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to the Custom Scraper API! 🚀',
        status: 'running',
        endpoints: {
            search: '/api/search?q=query'
        }
    });
});


app.get('/api/search', async (req, res) => {
    let { q, category } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

    // Detect/Verify category if not provided OR if it's 'other'
    if (!category || category === 'other') {
        const query = q.toLowerCase();
        const gadgetKeywords = ['phone', 'laptop', 'tablet', 'headphone', 'earphone', 'airpod', 'watch', 'smartwatch', 'speaker', 'computer', 'monitor', 'keyboard', 'mouse', 'camera', 'tv', 'console', 'playstation', 'xbox', 'gadget', 'electronic', 'charger', 'cable', 'adapter'];
        const fashionKeywords = ['shirt', 'pant', 'shoe', 'sneaker', 'dress', 'jacket', 'cloth', 'wear', 'bag', 'fashion', 'jewelry', 'boutique', 'skirt', 'blouse', 'suit', 'jeans', 'jean', 'hoodie', 'sweater', 'vintage'];

        if (gadgetKeywords.some(k => query.includes(k))) category = 'gadget';
        else if (fashionKeywords.some(k => query.includes(k))) category = 'fashion';
    }

    console.log(chalk.green(`\nNew web search request: ${q}`));

    let browser;

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--window-size=1280,800'
            ],
            timeout: 60000 // Longer timeout for Render
        });
        let amazonResults = [];
        let ebayResults = [];
        let jijiResults = [];
        let slotResults = [];
        let jumiaResults = [];
        let kongaResults = [];
        let ajeboResults = [];
        let dexStitchesResults = [];

        // Helper for sequential execution to prevent Resource Exhaustion on Render
        const runScraper = async (name, scrapeFn) => {
            let page;
            try {
                page = await browser.newPage();
                const res = await scrapeFn(page, q);
                await page.close();
                return res;
            } catch (e) {
                console.error(`${name} task error:`, e.message);
                if (page) await page.close().catch(() => { });
                return [];
            }
        };

        console.log(chalk.yellow('Starting concurrent scrape (to improve performance)...'));

        const tasks = [];

        // Nigerian Stores based on Category
        if (category === 'gadget') {
            tasks.push(runScraper('Slot', scrapeSlot).then(res => slotResults = res));
            tasks.push(runScraper('Konga', scrapeKonga).then(res => kongaResults = res));
            tasks.push(runScraper('Jiji', scrapeJiji).then(res => jijiResults = res));
            // Adding Jumia as a backup for gadgets if needed, though it was skipped in sequential
            tasks.push(runScraper('Jumia', scrapeJumia).then(res => jumiaResults = res));
        } else if (category === 'fashion') {
            // Fashion is Konga, Ajebo Market, DexStitches and Jumia
            tasks.push(runScraper('Konga', scrapeKonga).then(res => kongaResults = res));
            tasks.push(runScraper('Ajebo market', scrapeAjeboMarket).then(res => ajeboResults = res));
            tasks.push(runScraper('DexStitches', scrapeDexStitches).then(res => dexStitchesResults = res));
            tasks.push(runScraper('Jumia', scrapeJumia).then(res => jumiaResults = res));
        } else {
            // Default: Search Konga, Jiji and Jumia
            tasks.push(runScraper('Konga', scrapeKonga).then(res => kongaResults = res));
            tasks.push(runScraper('Jiji', scrapeJiji).then(res => jijiResults = res));
            tasks.push(runScraper('Jumia', scrapeJumia).then(res => jumiaResults = res));
        }

        // Common sources - Always searched
        tasks.push(runScraper('Jumia', scrapeJumia).then(res => jumiaResults = res));
        tasks.push(runScraper('Amazon', scrapeAmazon).then(res => amazonResults = res));

        // Wait for all to complete in parallel
        await Promise.allSettled(tasks);

        const allResults = interleaveResults([slotResults, kongaResults, jijiResults, jumiaResults, ajeboResults, dexStitchesResults, amazonResults]); // Removed ebayResults

        const responseData = {
            total: allResults.length,
            counts: {
                Amazon: amazonResults.length,
                // eBay: ebayResults.length,
                Jiji: jijiResults.length,
                Slot: slotResults.length,
                Jumia: jumiaResults.length,
                Konga: kongaResults.length,
                Ajebo: ajeboResults.length,
                DexStitches: dexStitchesResults.length
            },
            results: allResults
        };

        console.log(chalk.green(`Search completed. Found ${allResults.length} total results.`));
        console.log(chalk.cyan(`  📊 Results breakdown:`));
        console.log(chalk.yellow(`     • Slot.ng: ${slotResults.length}`));
        console.log(chalk.yellow(`     • Konga: ${kongaResults.length}`));
        console.log(chalk.yellow(`     • Jiji: ${jijiResults.length}`));
        console.log(chalk.yellow(`     • Jumia: ${jumiaResults.length}`));
        console.log(chalk.yellow(`     • Ajebo Market: ${ajeboResults.length}`));
        console.log(chalk.yellow(`     • DexStitches: ${dexStitchesResults.length}`));
        if (dexStitchesResults.length > 0) {
            console.log(chalk.gray(`       (First DexStitches: ${dexStitchesResults[0].title})`));
        }
        console.log(chalk.yellow(`     • Amazon: ${amazonResults.length}`));
        // console.log(chalk.yellow(`     • eBay: ${ebayResults.length}`));
        res.json(responseData);

    } catch (error) {
        console.error(chalk.red('API search failed:'), error.message);
        res.status(500).json({ error: 'Scraping failed' });
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (err) {
                console.error('Error closing browser:', err.message);
            }
        }
    }
});

// Global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
    console.error(chalk.red('UNCAUGHT EXCEPTION! 💥'));
    console.error(err);
});

process.on('unhandledRejection', (err) => {
    console.error(chalk.red('UNHANDLED REJECTION! 💥'));
    console.error(err);
});

app.listen(PORT, () => {
    console.log(chalk.magenta(`\n🚀 Server running on http://localhost:${PORT}`));
});
