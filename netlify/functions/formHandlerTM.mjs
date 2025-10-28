// Use ESM imports.
import { Buffer } from 'node:buffer'; 
import process from 'process'; 

// Export function using the recommended ESM default export and V2 signature
export default async function (request, context) {
    
    // Access environment variables (stable access)
    const env = process.env;

    // --- 0. CREDENTIAL SETUP ---
    const sendgridValidationApiKey = env.SENDGRID_VALID; 
    const sendgridMarketingApiKey = env.API_KEY; 
    const brevoApiKey = env.BREVO_API_KEY;

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
            JSON.stringify({ error: 'Invalid JSON body provided.', details: error.message }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Initialize variables
    let emailIsValid = false; 
    let validationVerdict = 'Not_Run'; 
    let finalScore = 0; // Still capturing score for SendGrid tagging
    let emailLookupResponse = null;

    console.log(`[Validation Start] Checking email: ${leadEmail}`);

    // --- 2. EMAIL VALIDATION (SENDGRID VALIDATION API) ---
    if (!sendgridValidationApiKey) {
        console.warn('SendGrid Validation API key missing. Skipping external check.');
        emailIsValid = true; 
        validationVerdict = 'API_KEY_MISSING';
    } else {
        const validationUrl = 'https://api.sendgrid.com/v3/validations/email'; 
        
        try {
            const response = await fetch(validationUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sendgridValidationApiKey}`, 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: leadEmail })
            });

            if (!response.ok) {
                console.error(`[SG Validation Error] Failed API Request. Status: ${response.status}`);
                validationVerdict = 'API_ERROR';
                emailIsValid = false; 
            } else {
                emailLookupResponse = await response.json(); 
                const validationResult = emailLookupResponse?.result;
                validationVerdict = validationResult.verdict; 
                finalScore = validationResult.score; 
                const checks = emailLookupResponse?.result?.checks;

                // --- SIMPLIFIED PERMISSIVE FILTERING STRATEGY ---
                // Block only if the email is definitively Invalid or has hard bounce checks.
                if (validationVerdict === 'Invalid' || checks.has_known_bounces === true) {
                    console.log(`[Validation Fail] Email blocked by Hard Invalid Rule (Verdict: ${validationVerdict}).`);
                    emailIsValid = false;
                } 
                // ACCEPT EVERYTHING ELSE (Valid, Risky, Unknown)
                else { 
                    emailIsValid = true;
                }
            }
        } catch (error) {
            console.error(`[Network Fail] SendGrid validation fetch failed:`, error.message);
            validationVerdict = 'NETWORK_ERROR';
            emailIsValid = false; 
        }
    }

    // --- 3. GATE CHECK (EMAIL IS REQUIRED) ---
    if (!emailIsValid) {
        return new Response(
            JSON.stringify({
                error: 'Lead validation failed. Invalid email address.',
                validation_type: 'EMAIL_FAILED', 
                email_status: validationVerdict
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }
    
    console.log(`[Validation Pass] Email: ${leadEmail} passed the gate. Verdict: ${validationVerdict}`);

    // --- 4. PHONE VALIDATION SKIPPED ---
    // (Twilio/Phone validation is entirely removed for stability.)
    
    // --- 5. EXECUTE LEAD SUBMISSIONS (SIMPLIFIED) ---
    const promises = [];
    
    // Determine tagging for SendGrid submission
    // Tagging is now 'valid' or 'risky' based on the API verdict, not a score threshold.
    const sendGridValidationTag = (validationVerdict === 'Valid') ? 'valid' : 'risky';
    
    // -----------------------------------------------------------------
    // A. SENDGRID MARKETING REQUEST (ALL ACCEPTABLE LEADS)
    // -----------------------------------------------------------------
    
    const sendgridData = {
        contacts: [{ 
            email: leadEmail, 
            phone_number: leadPhone,
            custom_fields: {
                "VALIDATION": sendGridValidationTag, // Tagging: 'valid' or 'risky'
                "SCORE": finalScore * 100 // Still pass score for data retention
            }
        }],
        list_ids: [env.SENDGRID_LIST_ID || 'c35ce8c7-0b05-4686-ac5c-67717f5e5963'] 
    };

    console.log(`[Submission] Sending lead to SendGrid Marketing (Tag: ${sendGridValidationTag}).`);

    const sendgridPromise = fetch('https://api.sendgrid.com/v3/marketing/contacts', { 
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${sendgridMarketingApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(sendgridData)
    })
    .then(async res => {
        if (res.ok) { return { status: 'success', service: 'SendGrid' }; }
        return { status: 'failed', service: 'SendGrid', error: 'Submission failed.' };
    })
    .catch(error => {
        console.error('SendGrid Marketing failed (Network/Fetch):', error.message);
        return { status: 'failed', service: 'SendGrid', error: error.message };
    });
        
    promises.push(sendgridPromise); 

    // -----------------------------------------------------------------
    // B. BREVO REQUEST (ALL ACCEPTABLE LEADS - NO SCORE FILTER)
    // -----------------------------------------------------------------
    if (brevoApiKey) { 
        
        const brevoUrl = 'https://api.brevo.com/v3/contacts';
        const brevoListId = 6; 

        const brevoData = {
            email: leadEmail,
            attributes: { SMS: leadPhone },
            listIds: [brevoListId],
            updateEnabled: true 
        };
        
        console.log(`[Submission] Sending lead to Brevo.`);

        const brevoPromise = fetch(brevoUrl, { 
            method: 'POST',
            headers: {
                'api-key': brevoApiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(brevoData)
        })
        .then(async res => {
            if (res.ok || res.status === 201) { return { status: 'success', service: 'Brevo' }; }
            return { status: 'failed', service: 'Brevo', error: 'Submission failed.' };
        })
        .catch(error => {
            console.error('Brevo failed (Network/Fetch):', error.message);
            return { status: 'failed', service: 'Brevo', error: error.message };
        });

        promises.push(brevoPromise); 
    }
    
    // --- 6. FINISH ---
    const results = await Promise.allSettled(promises);
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success');
    
    const finalStatusCode = successful.length > 0 ? 200 : 502; 

    return new Response(
        JSON.stringify({ message: 'Submission completed.' }),
        {
            status: finalStatusCode,
            headers: { 'Content-Type': 'application/json' }
        }
    );
}