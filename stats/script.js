// Initialize date picker
flatpickr('.datepicker', {
    dateFormat: 'Y-m-d', // Specify the date format
});

// Update the fetchData function to make a request to your Netlify Function
async function fetchData(startDate, endDate) {
    try {
        const response = await fetch('/.netlify/functions/fetchData', {
            method: 'POST',
            body: JSON.stringify({ startDate, endDate })
        });
        const data = await response.text();
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
