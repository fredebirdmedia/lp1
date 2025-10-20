// Use native Node.js/Web Standard fetch API
// Note: No need to import fetch since it's global in Node 18+ runtime
// Note: If you still need TextMagic, you would use 'node:url' for URLSearchParams,
// but since the final code provided doesn't include it, we'll stick to core modules.

// Export function using the recommended ESM default export and V2 signature
export default async function (request, context) {
    
    // Use Netlify.env.get for environment variables
    const { env } = Netlify;

    // --- 1. HANDLE REQUEST BODY & SETUP ---
    try {
        // V2: Read the request body as text
        const requestBody = await request.text();
        const { email, phone_number } = JSON.parse(requestBody);

        const leadEmail = email;
        const normalized_phone = (phone_number && String(phone_number).trim()) || null;
        
        const promises = [];

        // -----------------------------------------------------------------
        // 1. SENDGRID REQUEST - Using native fetch
        // -----------------------------------------------------------------
        const apiKey = env.get('API_KEY');
        const sendgridUrl = 'https://api.sendgrid.com/v3/marketing/contacts';
        const sendgridListId = 'c35ce8c7-0b05-4686-ac5c-67717f5e5963'; 

        const sendgridData = {
            contacts: [{
                email: leadEmail,
                phone_number: normalized_phone
            }],
            list_ids: [sendgridListId]
        };
        
        const sendgridPromise = fetch(sendgridUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sendgridData)
        })
        .then(res => {
            if (res.ok) {
                console.log('SendGrid request successful. Status:', res.status);
                return { status: 'success', service: 'SendGrid' };
            }
            // Read error response text/JSON here for better error logging
            return res.json().then(errorData => {
                 console.error('SendGrid failed. Status:', res.status, 'Error:', errorData);
                 return { status: 'failed', service: 'SendGrid', error: errorData };
            });
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

        if (!brevoApiKey) {
            console.warn('BREVO_API_KEY is missing. Skipping Brevo request.');
        } else {
            const brevoData = {
                email: leadEmail,
                attributes: { SMS: normalized_phone },
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
            .then(res => {
                if (res.ok || res.status === 201) { // Brevo POST returns 201
                    console.log('Brevo request successful. Status:', res.status);
                    return { status: 'success', service: 'Brevo' };
                }
                return res.json().then(errorData => {
                    console.error('Brevo failed. Status:', res.status, 'Error:', errorData);
                    return { status: 'failed', service: 'Brevo', error: errorData };
                });
            })
            .catch(error => {
                console.error('Brevo failed (Network/Fetch):', error.message);
                return { status: 'failed', service: 'Brevo', error: error.message };
            });

            promises.push(brevoPromise);
        }
        
        // -----------------------------------------------------------------
        // 3. EXECUTE AND RETURN (V2 Response)
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
        
        const statusCode = failed.length === promises.length && promises.length > 0 ? 502 : 200;

        // Final return uses the V2 Response object (Web Standard)
        return new Response(
            JSON.stringify({ message: message, details: results.map(r => r.value || r.reason) }),
            {
                status: statusCode,
                headers: { 'Content-Type': 'application/json' }
            }
        );
        
    } catch (error) {
        // Catches JSON parsing or top-level handler errors
        console.error('A critical function error occurred:', error.message);

        return new Response(
            JSON.stringify({ 
                error: 'Critical Error: Lead could not be processed due to a function error.',
                details: error.message 
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}