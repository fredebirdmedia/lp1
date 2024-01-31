const axios = require('axios');

exports.handler = async function (event, context) {
  try {
    if (event.httpMethod !== 'POST') {
      // Ensure that only POST requests are processed
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }

    const { email, phone_number, first_name } = JSON.parse(event.body);


    // Access the environment variable directly
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
      throw new Error('API_KEY is not defined');
    }

    const url = 'https://api.sendgrid.com/v3/marketing/contacts';
    const listId = 'c35ce8c7-0b05-4686-ac5c-67717f5e5963'; // Replace with your list ID

    const data = {
 contacts: [
      {
        email: email,
        country: "CA",
        custom_fields: {
          _rf10_T: phone_number,
          first_name: first_name,
          country: "CA"
        }
      }
    ],
  list_ids: [listId]
};

    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      data: data // Include the data field in the axios request
    };

    // Log before making the request
    console.log('Making Axios request with the following options:', options);

    const response = await axios.post(url, {}, options);


    // Log after a successful response
    console.log('Axios request successful. Response:', response.data);

    return {
      statusCode: response.status,
      body: JSON.stringify({ message: 'Email submitted successfully' })
    };
  } catch (error) {
    console.error('An error occurred:', error);

    return {
      statusCode: error.response?.status || 500,
      body: JSON.stringify({ error: 'An error occurred while submitting the email' })
    };
  }
};