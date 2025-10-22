// Use ESM imports.
import { URLSearchParams } from 'node:url'; 

// Export function using the recommended ESM default export and V2 signature
export default async function (request, context) {
    
    // Access environment variables using Netlify.env.get
    const { env } = Netlify;
    
    // --- 1. HANDLE REQUEST BODY & INITIAL SETUP ---
    let leadEmail = null;
    let leadPhone = null;

    try {
        const requestBody = await request.text();
        const data = JSON.parse(requestBody);
        
        leadEmail = data.email;
        leadPhone = (data.phone_number && String(data.phone_number).trim()) || null;

    } catch (error) {
        return new Response(
            JSON.stringify({ error: 'Invalid request body provided.' }),
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

    // **LOGGING POINT 1: Before Validation**
    console.log(`[Validation Start] Checking email: ${leadEmail}`);


    if (!username || !apiKey) {
        console.warn('TextMagic API credentials missing. Skipping validation.');
        emailIsValid = true; 
        phoneIsValid = true;
    } else {
        const authString = Buffer.from(`${username}:${apiKey}`).toString('base64');
        const authHeaders = {
            'Authorization': `Basic ${authString}`,
            'Accept': 'application/json' 
        };
        const baseUrl = 'https://rest.textmagic.com/api/v2/';

        // A. Email Validation (CRITICAL)
        try {
            const encodedEmail = encodeURIComponent(leadEmail);
            const emailLookupUrl = `${baseUrl}email-lookups/${encodedEmail}`; 
            const tmResponse = await fetch(emailLookupUrl, { headers: authHeaders });

            if (!tmResponse.ok) {
                let errorData = await tmResponse.text();
                try { errorData = JSON.parse(errorData); } catch {}
                
                console.error(`[TM Error] Failed API Request for ${leadEmail}. Status: ${tmResponse.status}`, errorData);
                
                emailLookupResponse = { status: 'API Error' }; 
                emailIsValid = false; 
            } else {
                emailLookupResponse = await tmResponse.json(); 

                // Permissive Email Validation: allow 'deliverable' OR 'unknown'
                if (
                    emailLookupResponse.deliverability === 'deliverable' ||
                    emailLookupResponse.deliverability === 'unknown'
                ) { 
                    emailIsValid = true;
                } else {
                    console.log(`[Validation Fail] Email ${leadEmail} failed. Status: ${emailLookupResponse.deliverability}`);
                }
            }
        } catch (error) {
            console.error(`[Network Fail] Email fetch failed for ${leadEmail}:`, error.message);
            emailIsValid = false; 
            emailLookupResponse = { status: 'Network Exception' };
        }

        // --- 3. GATE CHECK (EMAIL IS REQUIRED) ---
        if (!emailIsValid) {
            // CRITICAL for client-side event triggering
            return new Response(
                JSON.stringify({
                    error: 'Lead validation failed. Invalid email address.',
                    validation_type: 'EMAIL_FAILED', 
                    email_status: emailLookupResponse?.status || 'API Error'
                }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }
        
        console.log(`[Validation Pass] Email: ${leadEmail} passed the gate.`);


        // B. Phone Number Validation (CONDITIONAL)
        if (leadPhone) {
            // FIX: Append country=NZ to carrier lookup if phone lacks international format
            // This checks if the phone number starts with a '+' symbol (international format)
            const countryQuery = leadPhone.startsWith('+') ? '' : '?country=NZ'; 
            
            try {
                const encodedPhone = encodeURIComponent(leadPhone);
                // Correct URL path: /api/v2/lookups/{phone}
                const carrierLookupUrl = `${baseUrl}lookups/${encodedPhone}${countryQuery}`; 
                const tmResponse = await fetch(carrierLookupUrl, { headers: authHeaders });
                
                if (!tmResponse.ok) {
                    phoneIsValid = false; // Validation fails
                    console.error(`[TM Error] Carrier API Request Failed for ${leadPhone}. Status: ${tmResponse.status}`);
                } else {
                    const carrierLookupResponse = await tmResponse.json();
                    
                    // Permissive Phone Validation: valid=true AND mobile/voip, OR ambiguous (valid=null)
                    if (carrierLookupResponse.valid === true && (carrierLookupResponse.type === 'mobile' || carrierLookupResponse.type === 'voip')) {
                         phoneIsValid = true;
                    } else if (carrierLookupResponse.valid === null) {
                         phoneIsValid = true; // Permissive: Allow if status is ambiguous.
                         console.warn(`[Ambiguous Phone] Phone validation for ${leadPhone} was ambiguous. Allowing.`);
                    } else {
                        phoneIsValid = false; // Validation failed 
                        console.log(`[Validation Fail] Phone ${leadPhone} failed. Valid: ${carrierLookupResponse.valid}, Type: ${carrierLookupResponse.type}`);
                    }
                }
            } catch (error) {
                console.error(`[Network Fail] Carrier fetch failed for ${leadPhone}:`, error.message);
                phoneIsValid = false; // Block the lead
            }
        }
    }

    // --- 4. ADJUST DATA BASED ON VALIDATION ---
    if (leadPhone && !phoneIsValid) {
        console.warn(`Invalid phone number: ${leadPhone} detected. Stripping phone.`);
        // LOGGING: Final Submission Check
        console.log(`[SUBMISSION] Stripping phone number from lead: ${leadEmail}.`);
        leadPhone = null; 
    }

    // --- 5. EXECUTE LEAD SUBMISSIONS (No Brevo/Marketing Platform) ---
    const promises = [];

    // -----------------------------------------------------------------
    // 1. SENDGRID REQUEST (NZ List ID) - Using native fetch
    // -----------------------------------------------------------------
    const sendgridData = {
        contacts: [{ email: leadEmail, phone_number: leadPhone }],
        // Use NZ-specific list ID
        list_ids: ['cb1fe44b-01fe-43b0-9995-6a932f5a538b'] 
    };

    // LOGGING: Final Submission Check
    console.log(`[Submission] Sending lead: ${leadEmail}, Phone: ${leadPhone === null ? 'STRIPPED' : leadPhone} to SendGrid.`);

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
    // 2. BREVO/MARKETING PLATFORM REMOVED
    // -----------------------------------------------------------------
    
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