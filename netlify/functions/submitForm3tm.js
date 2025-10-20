const axios = require('axios');

// Helper function to make an authenticated TextMagic API call
async function callTextMagicApi(endpoint, params) {
    const username = process.env.TEXTMAGIC_USERNAME;
    const apiKey = process.env.TEXTMAGIC_API_KEY;

    if (!username || !apiKey) {
        console.warn('TextMagic API credentials are missing. Skipping lookup.');
        return { status: 'error', error: 'Missing TextMagic API credentials.' };
    }

    const url = `https://rest.textmagic.com/api/v2/lookup/${endpoint}`;
    
    // Convert object to query string
    const queryString = new URLSearchParams(params).toString();
    const finalUrl = `${url}?${queryString}`;

    try {
        const response = await axios.get(finalUrl, {
            headers: {
                'X-TM-Username': username,
                'X-TM-Key': apiKey,
                'Content-Type': 'application/json'
            }
        });
        
        return { status: 'success', data: response.data };

    } catch (error) {
        // Log the failure but return a structure the main logic can handle
        console.error(`TextMagic ${endpoint} failed:`, error.response?.data || error.message);
        return { status: 'api_failed', error: error.response?.data?.message || error.message };
    }
}


exports.handler = async function (event, context) {
    try {
        const { email, phone_number } = JSON.parse(event.body);

        // --- 1. INITIAL SETUP AND NORMALIZATION ---
        let leadEmail = email;
        let leadPhone = (phone_number && String(phone_number).trim()) || null;
        
        let emailIsValid = false;
        let phoneIsValid = !leadPhone; // Start as true if no phone provided

        // --- 2. TEXTMAGIC LOOKUPS ---

        // A. Email Validation (CRITICAL)
        const emailLookup = await callTextMagicApi('email', { email: leadEmail });

        // Check if TextMagic returned successfully and the email is deliverable
        if (emailLookup.status === 'success' && emailLookup.data.status === 'deliverable') {
            emailIsValid = true;
        } else {
            console.log(`Email validation failed for ${leadEmail}. Status: ${emailLookup.data?.status || 'API error'}`);
        }

        // --- 3. GATE CHECK (EMAIL IS REQUIRED) ---
        if (!emailIsValid) {
             // If email is bad, reject the entire submission as it's the core contact point.
             return {
                 statusCode: 400,
                 body: JSON.stringify({
                     error: 'Lead validation failed. Invalid email address.',
                     email_status: emailLookup.data?.status
                 })
             };
        }


        // B. Phone Number Validation (CONDITIONAL)
        if (leadPhone) {
            const carrierLookup = await callTextMagicApi('carrier', { phone: leadPhone });

            // Check if valid status AND that it's a mobile number (good for SMS)
            if (carrierLookup.status === 'success' && carrierLookup.data.status === 'valid' && carrierLookup.data.type === 'mobile') {
                phoneIsValid = true;
            } else {
                phoneIsValid = false;
                console.log(`Phone validation failed for ${leadPhone}. Status: ${carrierLookup.data?.status || 'API error'}, Type: ${carrierLookup.data?.type}`);
            }
        }

        // --- 4. ADJUST DATA BASED ON VALIDATION ---
        
        // If the phone number is invalid, set it to null so it's not sent to other services.
        if (leadPhone && !phoneIsValid) {
            console.warn(`Invalid phone number: ${leadPhone} detected. Stripping phone from lead submission.`);
            leadPhone = null; 
        }

        // --- 5. EXECUTE LEAD SUBMISSIONS ---

        const promises = [];
        
        // -----------------------------------------------------------------
        // 1. SENDGRID REQUEST
        // -----------------------------------------------------------------
        const apiKey = process.env.API_KEY;
        const sendgridUrl = 'https://api.sendgrid.com/v3/marketing/contacts';
        const sendgridListId = 'c35ce8c7-0b05-4686-ac5c-67717f5e5963'; 

        const sendgridData = {
          contacts: [{
            email: leadEmail,
            phone_number: leadPhone // Will be null if invalid
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
        // 2. BREVO REQUEST
        // -----------------------------------------------------------------
        const brevoApiKey = process.env.BREVO_API_KEY; 
        const brevoUrl = 'https://api.brevo.com/v3/contacts';
        const brevoListId = 6; 

        if (!brevoApiKey) {
          console.warn('BREVO_API_KEY is missing. Skipping Brevo request.');
        } else {
          const brevoData = {
            email: leadEmail,
            attributes: {
              SMS: leadPhone // Will be null if invalid
            },
            listIds: [brevoListId],
            updateEnabled: true 
          };

          const brevoHeaders = {
            'api-key': brevoApiKey,
            'Content-Type': 'application/json'
          };

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
        if (leadPhone === null && phone_number) {
            message += ' Phone number was invalid and excluded.';
        }
        if (successful.length > 0) {
          message += ` Successes: ${successful.map(r => r.value.service).join(', ')}.`;
        }
        if (failed.length > 0) {
          message += ` Failures: ${failed.map(r => r.value.service || 'Unknown').join(', ')}.`;
        }
        
        // Determine status code
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