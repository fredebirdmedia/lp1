exports.handler = async function (event, context) {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }

    const { email, phone_number, first_name } = event.queryStringParameters;

    // Access the environment variable directly
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
      throw new Error('API_KEY is not defined');
    }

    const url = 'https://api.sendgrid.com/v3/marketing/contacts';
    const listId = 'c35ce8c7-0b05-4686-ac5c-67717f5e5963';

    const data = {
      contacts: [
        {
          email: email,
          country: "CA",
          phone_number: phone_number,
          first_name: first_name
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
      data: data
    };

    console.log('Making Axios request with the following options:', options);

    const response = await axios.post(url, {}, options);

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