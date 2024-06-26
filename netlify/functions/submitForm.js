// submitForm.js
const axios = require('axios');

exports.handler = async function (event, context) {
  try {
    const { email } = JSON.parse(event.body);

    const apiKey = process.env.API_KEY;
    const url = 'https://api.sendgrid.com/v3/marketing/contacts';
    const listId = 'c35ce8c7-0b05-4686-ac5c-67717f5e5963'; // Replace with your list ID

    const data = {
      contacts: [{ email: email }],
      list_ids: [listId]
    };

    const options = {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(data)
    };

    // Log before making the request
    console.log('Making Axios request with the following options:', options);

    const response = await axios.put(url, options.data, { headers: options.headers });

    // Log after successful response
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