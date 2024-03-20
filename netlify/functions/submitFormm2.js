const axios = require('axios');

exports.handler = async function (event, context) {
  try {
    const { email, phone_number } = JSON.parse(event.body);

    // Handling request related to SendGrid
    const apiKey = process.env.SENDGRID_API_KEY;
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
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(sendgridData)
    };

    console.log('Making Axios request to SendGrid with the following options:', sendgridOptions);

    const sendgridResponse = await axios.put(sendgridUrl, sendgridOptions.data, { headers: sendgridOptions.headers });

    console.log('SendGrid request successful. Response:', sendgridResponse.data);

    // Handling request related to the marketing platform
    const marketingUrl = 'https://api.mailmailmail.net/v2.0/Profiles';
    const marketingListId = '117460'; // Replace with your marketing platform list ID

    const marketingApiKey = process.env.APIMP_KEY;
    const marketingApiUsername = 'blackbirdmedia_dk_casinomary';

    const marketingData = {
      listid: marketingListId,
      email_address: email,
      mobile_number: phone_number,
      mobile_prefix: '', // Replace with appropriate value if needed
      data_fields: [], // Add any additional data fields as needed
      confirmed: false,
      add_to_autoresponders: false
    };

    const marketingOptions = {
      method: 'PUT', // Use PUT method for marketing platform
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Username': marketingApiUsername,
        'X-Api-Token': marketingApiKey
      },
      data: JSON.stringify(marketingData)
    };

    console.log('Making Axios request to Marketing Platform with the following options:', marketingOptions);

    const marketingResponse = await axios.put(marketingUrl, marketingOptions.data, { headers: marketingOptions.headers });

    console.log('Marketing Platform request successful. Response:', marketingResponse.data);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email and phone number updated successfully' })
    };
  } catch (error) {
    console.error('An error occurred:', error);

    return {
      statusCode: error.response?.status || 500,
      body: JSON.stringify({ error: error.response?.data?.message || 'An error occurred while updating the email and phone number' })
    };
  }
};