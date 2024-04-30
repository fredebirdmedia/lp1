const axios = require('axios');

exports.handler = async function (event, context) {
  try {
    const { email, phone_number } = JSON.parse(event.body);

    // Setup for SendGrid
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    const sendgridUrl = 'https://api.sendgrid.com/v3/marketing/contacts';
    const sendgridListId = 'c35ce8c7-0b05-4686-ac5c-67717f5e5963'; // Replace with your SendGrid list ID

    const sendgridData = {
      contacts: [{
        email: email,
        phone_number: phone_number
      }],
      list_ids: [sendgridListId]
    };

    const sendgridOptions = {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(sendgridData)
    };

    // Setup for Marketing Platform
    const marketingApiUsername = process.env.MARKETING_API_USERNAME;
    const marketingApiToken = process.env.MARKETING_API_TOKEN;
    const marketingUrl = 'https://api.mailmailmail.net/v2.0/Profiles';
    const marketingListId = 24; // Replace with your Marketing Platform list ID

    const marketingData = {
      listid: marketingListId,
      email_address: email,
      mobile_number: phone_number,
      mobile_prefix: '45', // Assuming this is constant
      data_fields: [], // You can add additional data fields here if needed
      confirmed: false,
      add_to_autoresponders: false
    };

    const marketingOptions = {
      method: 'POST',
      url: marketingUrl,
      headers: {
        'Apiusername': marketingApiUsername,
        'Apitoken': marketingApiToken,
        'Content-Type': 'application/json'
      },
      data: marketingData
    };

    // Log before making the requests
    console.log('Making SendGrid Axios request with the following options:', sendgridOptions);
    console.log('Making Marketing Platform Axios request with the following options:', marketingOptions);

    // Send requests concurrently
    const [sendgridResponse, marketingResponse] = await Promise.all([
      axios(sendgridUrl, sendgridOptions),
      axios(marketingOptions)
    ]);

    // Log after successful responses
    console.log('SendGrid Axios request successful. Response:', sendgridResponse.data);
    console.log('Marketing Platform Axios request successful. Response:', marketingResponse.data);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email and phone number updated successfully in SendGrid and profile added to Marketing Platform' })
    };
  } catch (error) {
    console.error('An error occurred:', error);

    return {
      statusCode: error.response?.status || 500,
      body: JSON.stringify({ error: 'An error occurred' })
    };
  }
};
