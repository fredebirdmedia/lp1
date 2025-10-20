const axios = require('axios');

exports.handler = async function (event, context) {
  try {
    const { email, phone_number } = JSON.parse(event.body);

    // Handling request related to SendGrid
    const apiKey = process.env.API_KEY;
    const sendgridUrl = 'https://api.sendgrid.com/v3/marketing/contacts';
    const sendgridListId = 'fbeae2e7-5aef-40c3-8afa-a9de61ba0e79'; // Replace with your SendGrid list ID

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

    // This is the code you provided, which correctly handles the success return
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email and phone number updated successfully' })
    };

  } catch (error) { // This is the catch block you provided
    console.error('An error occurred:', error);

    // This correctly handles the error return
    return {
      statusCode: error.response?.status || 500, // Use status from SendGrid if available, else 500
      body: JSON.stringify({ error: error.response?.data?.message || 'An error occurred while updating the email and phone number' })
    };
  }
};