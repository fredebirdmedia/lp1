// Define the fetchData function
async function fetchData(startDate, endDate) {
    try {
        // Your existing logic for fetching data goes here
        const response = await fetch(`https://www.buffalopartners.com/api/campaignfeed?username=blackbirdmedia&apikey=44DB33F3-37CE-4A09-87A3-40A0FAE787B6&startdate=${startDate}&enddate=${endDate}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/xml')) {
            throw new Error('Response is not in XML format');
        }

        const data = await response.text();

        // Check if the response is not empty
        if (data.trim() === '') {
            throw new Error('Empty response received');
        }

        return {
            statusCode: 200,
            body: data
        };
    } catch (error) {
        console.error('Error fetching XML:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error fetching XML' })
        };
    }
}

// Handler function for incoming requests
exports.handler = async function(event, context) {
    try {
        const { startDate, endDate } = JSON.parse(event.body);
        const result = await fetchData(startDate, endDate);
        return result;
    } catch (error) {
        console.error('Error handling request:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};
