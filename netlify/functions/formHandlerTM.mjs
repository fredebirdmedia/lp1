// Use ESM imports.
import { Buffer } from 'node:buffer'; 

// Export function using the recommended ESM default export and V2 signature
export default async function (request, context) {
    
    // Access environment variables using process.env (stable access)
    const env = process.env;

    // --- 0. CREDENTIAL SETUP ---
    // Read directly from process.env for universal stability
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
        // Phone number is received but will be processed as is (no external validation)
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
    let finalScore = 0;
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
                console.error(`[SG Validation Error] Failed API Request. Status: ${response.status}`);
                validationVerdict = 'API_ERROR';
                emailIsValid = false; 
            } else {
                emailLookupResponse = await response.json(); 
                const validationResult = emailLookupResponse?.result;
                validationVerdict = validationResult.verdict; 
                finalScore = validationResult.score;
                const checks = emailLookupResponse?.result?.checks;

                // --- FILTERING STRATEGY ---
                // Hard Block Rule: Block if MX record is missing or known to bounce
                if (checks.has_mx_or_a_record === false || checks.has_known_bounces === true) {
                    console.log(`[Validation Fail] Email blocked by Hard Block Rule (MX/Bounce).`);
                    emailIsValid = false;
                } 
                // Accept emails that meet the minimum score (0.50 for Risky/Valid)
                else if (finalScore >= 0.50) { 
                    emailIsValid = true;
                } else {
                    console.log(`[Validation Fail] Email blocked by Score Rule (Score: ${finalScore}).`);
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


    // --- 4. PHONE VALIDATION SKIPPED ---
    // Phone validation is entirely removed to ensure stability.
    const phoneIsValidFinal = true; // Always true since we skip validation
    if (leadPhone && !phoneIsValidFinal) {
        leadPhone = null; 
    }


    // --- 5. EXECUTE LEAD SUBMISSIONS ---
    const promises = [];
    let sendgridPromise = null;
    
    // Determine tagging for SendGrid submission
    const sendGridValidationTag = (finalScore >= 0.85) ? 'valid' : 'risky';
    
    // -----------------------------------------------------------------
    // A. SENDGRID MARKETING REQUEST (REQUIRED FOR ALL VALID/RISKY LEADS)
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
        list_ids: [env.SENDGRID_LIST_ID || 'c35ce8c7-0b05-4686-ac5c-67717f5e5963'] 
    };

    console.log(`[Submission] Sending lead: ${leadEmail} (Tag: ${sendGridValidationTag}) to SendGrid Marketing.`);

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
        
    promises.push(sendgridPromise); 

    // -----------------------------------------------------------------
    // B. BREVO REQUEST (ONLY FOR HIGH-CONFIDENCE 'VALID' LEADS)
    // -----------------------------------------------------------------
    if (finalScore >= 0.85) { 
        
        const brevoUrl = 'https://api.brevo.com/v3/contacts';
        const brevoListId = 6; 
        const brevoApiKeyLocal = brevoApiKey; // Use a local name for clarity

        if (brevoApiKeyLocal) {
            const brevoData = {
                email: leadEmail,
                attributes: { SMS: leadPhone },
                listIds: [brevoListId],
                updateEnabled: true 
            };
            
            console.log(`[Submission] Sending high-confidence lead: ${leadEmail} to Brevo.`);

            const brevoPromise = fetch(brevoUrl, { 
                method: 'POST',
                headers: {
                    'api-key': brevoApiKeyLocal,
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
    
    const finalStatusCode = successful.length > 0 ? 200 : 502; 

    // Final return uses the V2 Response object (HTTP 200 on successful submission)
    return new Response(
        JSON.stringify({ message: message, details: results.map(r => r.value || r.reason) }),
        {
            status: finalStatusCode,
            headers: { 'Content-Type': 'application/json' }
        }
    );
}