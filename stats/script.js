document.addEventListener("DOMContentLoaded", function() {
    // Initialize date picker
    flatpickr('.datepicker', {
        dateFormat: 'Y-m-d',
    });

    // Fetch data function
    function fetchData(startDate, endDate) {
        fetch(`https://www.buffalopartners.com/api/campaignfeed?username=blackbirdmedia&apikey=44DB33F3-37CE-4A09-87A3-40A0FAE787B6&startdate=${startDate}&enddate=${endDate}`)
            .then(response => response.text())
            .then(data => {
                // Parse XML data
                let parser = new DOMParser();
                let xmlDoc = parser.parseFromString(data, "text/xml");
                
                // Convert XML data to HTML string for display
                let html = xmlDoc.documentElement.outerHTML;

                // Display XML data in the campaign-feed div
                document.getElementById('campaign-feed').innerHTML = html;
            })
            .catch(error => {
                console.error('Error fetching XML:', error);
            });
    }

    // Apply filter button click event
    document.getElementById('apply-filter').addEventListener('click', function() {
        // Get selected start and end dates
        let startDate = document.getElementById('start-date').value;
        let endDate = document.getElementById('end-date').value;

        // Fetch data for the selected date range
        fetchData(startDate, endDate);
    });

    // Fetch data for default date range (May 1st to May 15th)
    fetchData('2024-05-01', '2024-05-15');
});
