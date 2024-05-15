// fetchData.js

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const { startDate, endDate } = JSON.parse(event.body);

    try {
        const response = await fetch(`https://www.buffalopartners.com/api/campaignfeed?username=blackbirdmedia&apikey=44DB33F3-37CE-4A09-87A3-40A0FAE787B6&startdate=${startDate}&enddate=${endDate}`);
        const data = await response.text();
        return {
            statusCode: 200,
            body: data
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch data from buffalopartners.com' })
        };
    }
};
