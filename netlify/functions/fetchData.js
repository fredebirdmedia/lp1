// Update the fetchData function to make a request to your Netlify Function
async function fetchData(startDate, endDate) {
    try {
        const response = await fetch('/.netlify/functions/fetchData', {
            method: 'POST',
            body: JSON.stringify({ startDate, endDate })
        });

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

        // Parse XML data
        let parser = new DOMParser();
        let xmlDoc = parser.parseFromString(data, "text/xml");

        // Convert XML data to HTML string for display
        let html = xmlDoc.documentElement.outerHTML;

        // Display XML data in the campaign-feed div
        document.getElementById('campaign-feed').innerHTML = html;
    } catch (error) {
        console.error('Error fetching XML:', error);
    }
}
