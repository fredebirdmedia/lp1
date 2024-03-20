const axios = require('axios');

exports.handler = async function (event, context) {
  try {
    const { email, phone_number } = JSON.parse(event.body);

    // Handling request related to SendGrid
    const apiKey = process.env.API_KEY;
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
    const marketingApiKey = process.env.APIMP_KEY;
    const marketingApiUsername = 'blackbirdmedia_dk_casinomary';

    const marketingData = {
      listid: '117460', // Adding the list ID
      email_address: email,
      mobile_number: phone_number,
      data_fields: [/* Add your data fields here */] // Add any additional data fields as needed
    };

    const marketingOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Apiusername': marketingApiUsername,
        'Apitoken': marketingApiKey
      },
      data: JSON.stringify(marketingData)
    };

    console.log('Making Axios request to Marketing Platform with the following options:', marketingOptions);

    const marketingResponse = await axios.post(marketingUrl, marketingOptions.data, { headers: marketingOptions.headers });

    console.log('Marketing Platform request successful. Response:', marketingResponse.data);

    // Handling request related to SimpleTexting
    const simpleTextingUrl = 'https://api-app2.simpletexting.com/v2/api/contacts';
    const simpleTextingApiKey = process.env.API_ST;

    // Check if phone_number is provided before adding to SimpleTexting
    if (phone_number) {
      const simpleTextingData = {
        contactPhone: phone_number,
        listIds: [{
          id: '65d60667f82cb04ba121461f'
        }]
      };

      const simpleTextingOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${simpleTextingApiKey}`
        },
        data: JSON.stringify(simpleTextingData) // Convert object to JSON string
      };

      console.log('Making Axios request to SimpleTexting with the following options:', simpleTextingOptions);

      const simpleTextingResponse = await axios.post(simpleTextingUrl, simpleTextingOptions.data, { headers: simpleTextingOptions.headers });

      console.log('SimpleTexting request successful. Response:', simpleTextingResponse.data);
    }

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