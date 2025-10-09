const axios = require('axios');

exports.handler = async function (event, context) {
  try {
    const { email, phone_number } = JSON.parse(event.body);

    // Handling request related to SendGrid
    const apiKey = process.env.API_KEY;
    // Note: SendGrid's Marketing Contacts API uses 'PUT' to add or update contacts.
    // The path for adding or updating contacts is usually /v3/marketing/contacts
    const sendgridUrl = 'https://api.sendgrid.com/v3/marketing/contacts';
    const sendgridListId = 'c35ce8c7-0b05-4686-ac5c-67717f5e5963'; // Replace with your SendGrid list ID

    const sendgridData = {
      contacts: [{
        email: email,
        // SendGrid API typically expects 'phone_number' within custom fields or reserved fields if available,
        // but it's used here as per the original code's structure for consistency.
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

    console.log('Making Axios request to SendGrid with the following options:', {
      method: sendgridOptions.method,
      url: sendgridUrl,
      // Omit data and API key from log for security, but include other useful info
      headers: { ...sendgridOptions.headers, 'Authorization': 'Bearer [API_KEY_HIDDEN]' } 
    });

    // Axios PUT call structure: axios.put(url, data, [config])
    const sendgridResponse = await axios.put(sendgridUrl, sendgridOptions.data, { headers: sendgridOptions.headers });

    console.log('SendGrid request successful. Status:', sendgridResponse.status, 'Response Data:', sendgridResponse.data);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email and phone number updated successfully in SendGrid' })
    };
  } catch (error) {
    console.error('An error occurred:', error.message);
    // Log the full error object for detailed debugging if needed
    // console.error(error); 

    // Handle potential Axios error structure
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.errors 
      ? JSON.stringify(error.response.data.errors) // SendGrid errors are often in an 'errors' array
      : error.message || 'An error occurred while updating the email and phone number in SendGrid';

    return {
      statusCode: statusCode,
      body: JSON.stringify({ 
        error: `SendGrid Update Failed: ${errorMessage}`
      })
    };
  }
};