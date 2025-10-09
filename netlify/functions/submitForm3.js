const axios = require('axios');

exports.handler = async function (event, context) {
  try {
    const { email, phone_number } = JSON.parse(event.body);

    // --- SETUP: Collect all API promises ---
    const promises = [];

    // -----------------------------------------------------------------
    // 1. SENDGRID REQUEST (Existing Logic)
    // -----------------------------------------------------------------
    const apiKey = process.env.API_KEY;
    const sendgridUrl = 'https://api.sendgrid.com/v3/marketing/contacts';
    const sendgridListId = 'c35ce8c7-0b05-4686-ac5c-67717f5e5963'; // Your SendGrid List ID

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
    
    // Create the SendGrid promise
    const sendgridPromise = axios.put(sendgridUrl, sendgridOptions.data, { headers: sendgridOptions.headers })
      .then(res => {
        console.log('SendGrid request successful. Status:', res.status);
        return { status: 'success', service: 'SendGrid' };
      })
      .catch(error => {
        console.error('SendGrid failed:', error.response?.data?.errors || error.message);
        return { status: 'failed', service: 'SendGrid', error: error.response?.data || error.message };
      });
      
    promises.push(sendgridPromise);


    // -----------------------------------------------------------------
    // 2. BREVO REQUEST (NEW Logic)
    // -----------------------------------------------------------------
    const brevoApiKey = process.env.BREVO_API_KEY; // Must be set in Netlify Environment
    const brevoUrl = 'https://api.brevo.com/v3/contacts';
    const brevoListId = **6**; // ⬅️ UPDATED: Brevo List ID

    if (!brevoApiKey) {
      console.warn('BREVO_API_KEY is missing. Skipping Brevo request.');
    } else {
      const brevoData = {
        email: email,
        attributes: {
          SMS: phone_number // Brevo uses 'SMS' for mobile/phone. Use international format (e.g., +4512345678).
        },
        listIds: [brevoListId],
        updateEnabled: true // Allows creation or update
      };

      const brevoHeaders = {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json'
      };

      // Create the Brevo promise
      const brevoPromise = axios.post(brevoUrl, brevoData, { headers: brevoHeaders })
        .then(res => {
          console.log('Brevo request successful. Status:', res.status);
          return { status: 'success', service: 'Brevo' };
        })
        .catch(error => {
          console.error('Brevo failed:', error.response?.data?.message || error.message);
          return { status: 'failed', service: 'Brevo', error: error.response?.data || error.message };
        });

      promises.push(brevoPromise);
    }
    
    
    // -----------------------------------------------------------------
    // 3. EXECUTE ALL REQUESTS CONCURRENTLY
    // -----------------------------------------------------------------
    const results = await Promise.allSettled(promises);
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success');
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status === 'failed'));

    // Summarize the results
    let message = 'Lead processed.';
    if (successful.length > 0) {
      message += ` Successes: ${successful.map(r => r.value.service).join(', ')}.`;
    }
    if (failed.length > 0) {
      message += ` Failures: ${failed.map(r => r.value.service || 'Unknown').join(', ')}.`;
    }
    
    // Determine status code: return 502 if all required services failed, otherwise 200/202 is fine.
    const statusCode = failed.length === promises.length && promises.length > 0 ? 502 : 200;

    return {
      statusCode: statusCode,
      body: JSON.stringify({ message: message, details: results.map(r => r.value || r.reason) })
    };
    
  } catch (error) {
    // This catches errors that occur *before* the API calls (e.g., JSON parsing)
    console.error('A critical function error occurred:', error.message);

    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Critical Error: Lead could not be processed due to a function error.',
        details: error.message 
      })
    };
  }
};