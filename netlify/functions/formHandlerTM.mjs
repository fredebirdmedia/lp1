// Use ESM imports. Native fetch is used instead of axios.
import { URLSearchParams } from 'node:url'; // Helpful for building query strings

// Export function using the recommended ESM default export and V2 signature
export default async function (request, context) {
    
    // Use Netlify.env.get for accessing environment variables (recommended practice)
    const { env } = Netlify;
    
    // --- 1. HANDLE REQUEST BODY & INITIAL SETUP ---
    let leadEmail = null;
    let leadPhone = null;

    try {
        // V2: Read the request body as text and parse it
        const requestBody = await request.text();
        const { email, phone_number } = JSON.parse(requestBody);

        leadEmail = email;
        leadPhone = (phone_number && String(phone_number).trim()) || null;

    } catch (error) {
        // Catches JSON parsing errors (V2 Response format)
        return new Response(
            JSON.stringify({ error: 'Invalid JSON body provided.', details: error.message }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Initialize variables after successful parsing
    const normalized_phone = leadPhone; 
    let emailIsValid = false; 
    let phoneIsValid = !leadPhone;
    let emailLookupResponse = null;

    // --- 2. TEXTMAGIC LOOKUPS (Using Native fetch) ---
    const username = env.get('TEXTMAGIC_USERNAME');
    const apiKey = env.get('TEXTMAGIC_API_KEY');

    if (!username || !apiKey) {
        console.warn('TextMagic API credentials missing. Assuming validation is successful.');
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
    const tmResponse = await fetch(emailLookupUrl, { headers: authHeaders });

    // *** FIX 1: Check HTTP status FIRST ***
    if (!tmResponse.ok) {
        // If the request itself failed (e.g., 401/403/500)
        let errorData = await tmResponse.text();
        try { errorData = JSON.parse(errorData); } catch {}
        
        console.error(`TextMagic API Request Failed. Status: ${tmResponse.status}`, errorData);
        // CRITICAL: We DO NOT set emailIsValid = true here, validation failed.
        emailLookupResponse = { status: 'API Error' }; // Create a generic error response structure
    } else {
        // HTTP 200 OK - Process the JSON body
        emailLookupResponse = await tmResponse.json(); 

        if (emailLookupResponse.status === 'deliverable') {
            emailIsValid = true;
        } else {
            console.log(`Email validation failed for ${leadEmail}. Status: ${emailLookupResponse.status}`);
        }
    }
} catch (error) {
    console.error(`TextMagic email fetch failed (Exception):`, error.message);
    // If we have an uncaught network error here, we assume valid to let the lead pass.
    emailIsValid = true; 
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
                const carrierLookupUrl = `${baseUrl}carrier?phone=${leadPhone}`;
                const tmResponse = await fetch(carrierLookupUrl, { headers: authHeaders });
                const carrierLookupResponse = await tmResponse.json();

                if (carrierLookupResponse.status === 'valid' && carrierLookupResponse.type === 'mobile') {
                    phoneIsValid = true;
                } else {
                    phoneIsValid = false;
                    console.log(`Phone validation failed for ${leadPhone}. Status: ${carrierLookupResponse.status}, Type: ${carrierLookupResponse.type}`);
                }
            } catch (error) {
                console.error(`TextMagic carrier fetch failed:`, error.message);
                phoneIsValid = true; 
            }
        }
    }

    // --- 4. ADJUST DATA BASED ON VALIDATION ---
    if (leadPhone && !phoneIsValid) {
        console.warn(`Invalid phone number: ${leadPhone} detected. Stripping phone.`);
        leadPhone = null; 
    }

    // --- 5. EXECUTE LEAD SUBMISSIONS ---
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
        const errorData = await res.json();
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
            const errorData = await res.json();
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