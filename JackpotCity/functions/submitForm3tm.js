const axios = require('axios');

// NOTE: The separate callTextMagicApi function is removed to simplify structure.

exports.handler = async function (event, context) {
    try {
        const { email, phone_number } = JSON.parse(event.body);

        // --- 1. INITIAL SETUP AND NORMALIZATION (Like submitForm3.js) ---
        let leadEmail = email;
        let leadPhone = (phone_number && String(phone_number).trim()) || null;

        // Use the old file's variable name for phone normalization
        const normalized_phone = leadPhone; 
        
        let emailIsValid = false;
        let phoneIsValid = !leadPhone; // Start as true if no phone provided

        // --- 2. TEXTMAGIC LOOKUPS (New Validation Logic) ---
        const username = process.env.TEXTMAGIC_USERNAME;
        const apiKey = process.env.TEXTMAGIC_API_KEY;

        if (!username || !apiKey) {
            console.warn('TextMagic API credentials are missing. Assuming validation is successful to proceed.');
            // Skip TextMagic validation if credentials are missing.
            emailIsValid = true; 
            phoneIsValid = true;
        } else {
            const baseUrl = 'https://rest.textmagic.com/api/v2/lookup/';
            const authHeaders = {
                'X-TM-Username': username,
                'X-TM-Key': apiKey,
                'Content-Type': 'application/json'
            };

            // A. Email Validation (CRITICAL)
            try {
                const emailLookupUrl = `${baseUrl}email?email=${leadEmail}`;
                const emailLookupResponse = await axios.get(emailLookupUrl, { headers: authHeaders });

                if (emailLookupResponse.data.status === 'deliverable') {
                    emailIsValid = true;
                } else {
                    console.log(`Email validation failed for ${leadEmail}. Status: ${emailLookupResponse.data?.status}`);
                }
            } catch (error) {
                console.error(`TextMagic email failed:`, error.response?.data || error.message);
                // If API fails, assume valid to avoid blocking the user, but log the error.
                emailIsValid = true; 
            }

            // --- 3. GATE CHECK (EMAIL IS REQUIRED) ---
            if (!emailIsValid) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: 'Lead validation failed. Invalid email address.',
                        email_status: emailLookupResponse?.data?.status || 'API Error'
                    })
                };
            }

            // B. Phone Number Validation (CONDITIONAL)
            if (leadPhone) {
                try {
                    const carrierLookupUrl = `${baseUrl}carrier?phone=${leadPhone}`;
                    const carrierLookupResponse = await axios.get(carrierLookupUrl, { headers: authHeaders });

                    if (carrierLookupResponse.data.status === 'valid' && carrierLookupResponse.data.type === 'mobile') {
                        phoneIsValid = true;
                    } else {
                        phoneIsValid = false;
                        console.log(`Phone validation failed for ${leadPhone}. Status: ${carrierLookupResponse.data?.status}, Type: ${carrierLookupResponse.data?.type}`);
                    }
                } catch (error) {
                    console.error(`TextMagic carrier failed:`, error.response?.data || error.message);
                    phoneIsValid = true; // Assume valid if API fails
                }
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
        // ... (SendGrid logic is identical to old file, using leadPhone) ...
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
        // ... (Brevo logic is identical to old file, using leadPhone) ...
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