const axios = require('axios');
const chalk = require('chalk');

async function testScrapperIntegration() {
    const q = 'nike sneakers';
    const url = `http://192.168.0.127:3001/api/search?q=${encodeURIComponent(q)}`;

    console.log(chalk.blue(`🧪 Testing Scrapper API for: "${q}"`));
    console.log(`📍 URL: ${url}`);

    try {
        const response = await axios.get(url);
        const data = response.data;

        console.log(chalk.green('\n✅ API call successful!'));
        console.log(`📊 Total results: ${data.total}`);
        console.log('📈 Counts:', data.counts);

        if (data.counts.Ajebo > 0) {
            console.log(chalk.green(`🎉 SUCCESS: Ajebo Market returned ${data.counts.Ajebo} results!`));
        } else {
            console.log(chalk.red('❌ FAILURE: Ajebo Market still returned 0 results.'));
        }

    } catch (error) {
        console.error(chalk.red('\n❌ API call failed:'), error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

testScrapperIntegration();
