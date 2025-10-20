// Use ESM imports.
import { URLSearchParams } from 'node:url'; 

// Export function using the recommended ESM default export and V2 signature
export default async function (request, context) {
    
    // Use Netlify.env.get for accessing environment variables (recommended practice)
    const { env } = Netlify;
    
    // --- 1. HANDLE REQUEST BODY & INITIAL SETUP ---
    let leadEmail = null;
    let leadPhone = null;

    try {
        const requestBody = await request.text();
        const { email, phone_number } = JSON.parse(requestBody);

        leadEmail = email;
        leadPhone = (phone_number && String(phone_number).trim()) || null;

    } catch (error) {
        return new Response(
            JSON.stringify({ error: 'Invalid JSON body provided.', details: error.message }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Initialize variables
    let emailIsValid = false; 
    let phoneIsValid = !leadPhone; 
    let emailLookupResponse = null;

    // --- 2. TEXTMAGIC LOOKUPS (Using Native fetch & Basic Auth) ---
    const username = env.get('TEXTMAGIC_USERNAME');
    const apiKey = env.get('TEXTMAGIC_API_KEY');

    if (!username || !apiKey) {
        console.warn('TextMagic API credentials missing. Skipping validation.');
        emailIsValid = true; 
        phoneIsValid = true;
    } else {
        // Base64 encode credentials for Basic Auth
        const authString = Buffer.from(`${username}:${apiKey}`).toString('base64');
        const authHeaders = {
            'Authorization': `Basic ${authString}`,
            'Accept': 'application/json' // Ensure we request JSON
        };
        const baseUrl = 'https://rest.textmagic.com/api/v2/';


        // A. Email Validation (CRITICAL)
        try {
            // FIX: Use PATH PARAMETER and URL encode it completely
            const encodedEmail = encodeURIComponent(leadEmail);
            // New Correct URL: /api/v2/email-lookups/{email}
            const emailLookupUrl = `${baseUrl}email-lookups/${encodedEmail}`; 

            const tmResponse = await fetch(emailLookupUrl, { headers: authHeaders });

            if (!tmResponse.ok) {
                // Handle non-200 API response status
                let errorData = await tmResponse.text();
                try { errorData = JSON.parse(errorData); } catch {}
                
                console.error(`TextMagic API Request Failed. Status: ${tmResponse.status}`, errorData);
                emailLookupResponse = { status: 'API Error' }; 
                emailIsValid = false; // Validation fails
            } else {
                emailLookupResponse = await tmResponse.json(); 

                // Check for 'deliverable' status (as used in previous logs)
                if (emailLookupResponse.deliverability === 'deliverable') { 
                    emailIsValid = true;
                } else {
                    console.log(`Email validation failed. Status: ${emailLookupResponse.deliverability}`);
                }
            }
        } catch (error) {
            console.error(`TextMagic email fetch failed (Exception):`, error.message);
            emailIsValid = false; // Validation fails
            emailLookupResponse = { status: 'Network Exception' };
        }

        // --- 3. GATE CHECK (EMAIL IS REQUIRED) ---
        if (!emailIsValid) {
            return new Response(
                JSON.stringify({
                    error: 'Lead validation failed. Invalid email address.',
                    email_status: emailLookupResponse?.status || 'API Error'
                }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // B. Phone Number Validation (CONDITIONAL)
        if (leadPhone) {
            try {
                // FIX: Use PATH PARAMETER for phone lookup
                const encodedPhone = encodeURIComponent(leadPhone);
                // New Correct URL: /api/v2/lookups/{phone}
                const carrierLookupUrl = `${baseUrl}lookups/${encodedPhone}`; 
                const tmResponse = await fetch(carrierLookupUrl, { headers: authHeaders });
                
                if (!tmResponse.ok) {
                    phoneIsValid = false; // Validation fails
                    console.error(`TextMagic Carrier API Request Failed. Status: ${tmResponse.status}`);
                } else {
                    const carrierLookupResponse = await tmResponse.json();
                    // Check 'valid' boolean from documented response schema
                    if (carrierLookupResponse.valid === true && carrierLookupResponse.type === 'mobile') {
                        phoneIsValid = true;
                    } else {
                        phoneIsValid = false;
                        console.log(`Phone validation failed. Valid: ${carrierLookupResponse.valid}, Type: ${carrierLookupResponse.type}`);
                    }
                }
            } catch (error) {
                console.error(`TextMagic carrier fetch failed (Network/Exception):`, error.message);
                phoneIsValid = false; // Validation fails
            }
        }
    }

    // --- 4. ADJUST DATA BASED ON VALIDATION ---
    if (leadPhone && !phoneIsValid) {
        console.warn(`Invalid phone number: ${leadPhone} detected. Stripping phone.`);
        leadPhone = null; 
    }

    // --- 5. EXECUTE LEAD SUBMISSIONS ---
    // ... (SendGrid and Brevo logic remains the same, as it was already correct) ...
    const promises = [];

    // -----------------------------------------------------------------
    // 1. SENDGRID REQUEST - Using native fetch
    // -----------------------------------------------------------------
    const sendgridData = {
        contacts: [{ email: leadEmail, phone_number: leadPhone }],
        list_ids: [env.get('SENDGRID_LIST_ID') || 'c35ce8c7-0b05-4686-ac5c-67717f5e5963'] 
    };

    const sendgridPromise = fetch('https://api.sendgrid.com/v3/marketing/contacts', {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${env.get('API_KEY')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(sendgridData)
    })
    .then(async res => {
        if (res.ok) {
            console.log('SendGrid successful. Status:', res.status); 
            return { status: 'success', service: 'SendGrid' }; 
        }
        const errorText = await res.text();
        let errorData = { message: errorText };
        try { errorData = JSON.parse(errorText); } catch {}
        
        console.error('SendGrid failed. Status:', res.status, 'Error:', errorData);
        return { status: 'failed', service: 'SendGrid', error: errorData };
    })
    .catch(error => {
        console.error('SendGrid failed (Network/Fetch):', error.message);
        return { status: 'failed', service: 'SendGrid', error: error.message };
    });
        
    promises.push(sendgridPromise);

    // -----------------------------------------------------------------
    // 2. BREVO REQUEST - Using native fetch
    // -----------------------------------------------------------------
    const brevoApiKey = env.get('BREVO_API_KEY');
    const brevoUrl = 'https://api.brevo.com/v3/contacts';
    const brevoListId = 6; 

    if (brevoApiKey) {
        const brevoData = {
            email: leadEmail,
            attributes: { SMS: leadPhone },
            listIds: [brevoListId],
            updateEnabled: true 
        };

        const brevoPromise = fetch(brevoUrl, {
            method: 'POST',
            headers: {
                'api-key': brevoApiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(brevoData)
        })
        .then(async res => {
            if (res.ok || res.status === 201) {
                console.log('Brevo request successful. Status:', res.status);
                return { status: 'success', service: 'Brevo' };
            }
            const errorText = await res.text();
            let errorData = { message: errorText };
            try { errorData = JSON.parse(errorText); } catch {}
            
            console.error('Brevo failed. Status:', res.status, 'Error:', errorData);
            return { status: 'failed', service: 'Brevo', error: errorData };
        })
        .catch(error => {
            console.error('Brevo failed (Network/Fetch):', error.message);
            return { status: 'failed', service: 'Brevo', error: error.message };
        });

        promises.push(brevoPromise);
    }
    
    // -----------------------------------------------------------------
    // 6. FINISH
    // -----------------------------------------------------------------
    const results = await Promise.allSettled(promises);
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success');
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status === 'failed'));

    let message = 'Lead processed.';
    if (successful.length > 0) {
        message += ` Successes: ${successful.map(r => r.value.service).join(', ')}.`;
    }
    if (failed.length > 0) {
        message += ` Failures: ${failed.map(r => r.value.service || 'Unknown').join(', ')}.`;
    }
    
    const finalStatusCode = failed.length === promises.length && promises.length > 0 ? 502 : 200;

    // Final return uses the V2 Response object
    return new Response(
        JSON.stringify({ message: message, details: results.map(r => r.value || r.reason) }),
        {
            status: finalStatusCode,
            headers: { 'Content-Type': 'application/json' }
        }
    );
}