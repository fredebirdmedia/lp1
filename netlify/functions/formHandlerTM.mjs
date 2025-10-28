// Use ESM imports.
import { URLSearchParams } from 'node:url'; 

// Export function using the recommended ESM default export and V2 signature
export default async function (request, context) {
    
    // Access environment variables using Netlify.env.get
    const { env } = Netlify;

    // --- 0. CREDENTIAL SETUP ---
    const sendgridValidationApiKey = env.get('SENDGRID_VALID'); 
    const twilioAccountSid = env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = env.get('TWILIO_AUTH_TOKEN');
    const sendgridMarketingApiKey = env.get('API_KEY'); 
    const brevoApiKey = env.get('BREVO_API_KEY');

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
    let phoneIsValid = !leadPhone; 
    let validationVerdict = 'Not_Run'; 
    let emailLookupResponse = null;

    // **LOGGING POINT 1: Before Validation**
    console.log(`[Validation Start] Checking email: ${leadEmail}`);

    // --- 2. EMAIL VALIDATION (SENDGRID) ---
    if (!sendgridValidationApiKey) {
        console.warn('SendGrid Validation API key missing. Skipping email check.');
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
                let errorData = await response.text();
                try { errorData = JSON.parse(errorData); } catch {}
                
                console.error(`[SG Validation Error] Failed API Request. Status: ${response.status}`, errorData);
                validationVerdict = 'API_ERROR';
                emailIsValid = false; 
            } else {
                emailLookupResponse = await response.json(); 
                const validationResult = emailLookupResponse?.result;
                validationVerdict = validationResult.verdict; 
                const score = validationResult.score;
                const checks = emailLookupResponse?.result?.checks;

                // --- FILTERING STRATEGY ---
                if (checks.has_mx_or_a_record === false || checks.has_known_bounces === true) {
                    console.log(`[Validation Fail] Email ${leadEmail} blocked by Hard Block Rule (MX/Bounce).`);
                    emailIsValid = false;
                } else if (score >= 0.50) { 
                    emailIsValid = true;
                } else {
                    console.log(`[Validation Fail] Email ${leadEmail} blocked by Score Rule (Score: ${score}).`);
                    emailIsValid = false;
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
    
    // **LOGGING POINT 2: After Successful Validation**
    console.log(`[Validation Pass] Email: ${leadEmail} passed the gate. Verdict: ${validationVerdict}`);

    // --- 4. PHONE VALIDATION (TWILIO LOOKUP) ---
    if (leadPhone) {
        // ... (Twilio Lookup API Logic) ...
    }

    // --- 5. ADJUST DATA BASED ON VALIDATION ---
    if (leadPhone && !phoneIsValid) {
        console.warn(`Invalid phone number: ${leadPhone} detected. Stripping phone.`);
        console.log(`[SUBMISSION] Stripping phone number from lead: ${leadEmail}.`);
        leadPhone = null; 
    }

    // --- 6. EXECUTE LEAD SUBMISSIONS ---
    // ******* CRITICAL FIX: Explicitly declare promises *******
    const promises = [];
    let sendgridPromise = null;
    let brevoPromise = null; 
    
    // Determine tagging for SendGrid submission
    const finalScore = emailLookupResponse?.result?.score || 0;
    const sendGridValidationTag = (finalScore >= 0.85) ? 'valid' : 'risky';
    
    // -----------------------------------------------------------------
    // A. SENDGRID MARKETING REQUEST (Definition and Push)
    // -----------------------------------------------------------------
    
    const sendgridData = {
        contacts: [{ 
            email: leadEmail, 
            phone_number: leadPhone,
            custom_fields: {
                "VALIDATION": sendGridValidationTag, 
                "SCORE": finalScore * 100
            }
        }],
        list_ids: [env.get('SENDGRID_LIST_ID') || 'c35ce8c7-0b05-4686-ac5c-67717f5e5963'] 
    };

    console.log(`[Submission] Sending lead: ${leadEmail} (Tag: ${sendGridValidationTag}) to SendGrid Marketing.`);

    // FIX ASSIGNMENT: Assign fetch promise to the declared variable
    sendgridPromise = fetch('https://api.sendgrid.com/v3/marketing/contacts', { 
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${sendgridMarketingApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(sendgridData)
    })
    .then(async res => {
        if (res.ok) {
            console.log('SendGrid Marketing successful. Status:', res.status); 
            return { status: 'success', service: 'SendGrid' }; 
        }
        return { status: 'failed', service: 'SendGrid', error: 'Submission failed.' };
    })
    .catch(error => {
        console.error('SendGrid Marketing failed (Network/Fetch):', error.message);
        return { status: 'failed', service: 'SendGrid', error: error.message };
    });
        
    promises.push(sendgridPromise); // PUSH

    // -----------------------------------------------------------------
    // B. BREVO REQUEST (HIGH-CONFIDENCE LEADS ONLY - Definition and Push)
    // -----------------------------------------------------------------
    if (finalScore >= 0.85) { 
        
        const brevoUrl = 'https://api.brevo.com/v3/contacts';
        const brevoListId = 6; 

        if (brevoApiKey) {
            const brevoData = {
                email: leadEmail,
                attributes: { SMS: leadPhone },
                listIds: [brevoListId],
                updateEnabled: true 
            };
            
            console.log(`[Submission] Sending high-confidence lead: ${leadEmail} to Brevo.`);

            // FIX ASSIGNMENT: Assign fetch promise to the declared variable
            brevoPromise = fetch(brevoUrl, { 
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

            promises.push(brevoPromise); // PUSH
        }
    } else {
        console.warn(`Brevo skipped for email ${leadEmail} due to score (${finalScore}).`);
    }
    
    // --- 7. FINISH ---
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