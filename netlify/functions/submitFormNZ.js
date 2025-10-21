// Use ESM imports. Native fetch is used for API calls.

// Export function using the recommended ESM default export and V2 signature
export default async function (request, context) {
    
    // Access environment variables using Netlify.env.get (recommended V2 practice)
    const { env } = Netlify;

    // --- 1. HANDLE REQUEST BODY & INITIAL SETUP ---
    let email = null;
    let phone_number = null;

    try {
        // V2: Read the request body as text and parse it
        const requestBody = await request.text();
        const data = JSON.parse(requestBody);
        
        email = data.email;
        phone_number = data.phone_number;

    } catch (error) {
        // Handle malformed requests early
        return new Response(
            JSON.stringify({ error: 'Invalid request body provided.' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // --- 2. SENDGRID REQUEST (NZ Specific Logic) ---
    try {
        const apiKey = env.get('API_KEY');
        const sendgridUrl = 'https://api.sendgrid.com/v3/marketing/contacts';
        // Use NZ-specific list ID
        const sendgridListId = 'cb1fe44b-01fe-43b0-9995-6a932f5a538b'; 

        const sendgridData = {
            contacts: [{
                email: email,
                phone_number: phone_number
            }],
            list_ids: [sendgridListId]
        };

        console.log(`[SendGrid] Submitting email: ${email}, Phone: ${phone_number}`);

        // Use native fetch to make the request
        const response = await fetch(sendgridUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sendgridData)
        });

        if (!response.ok) {
            // Read error response text/JSON for debugging
            const errorBody = await response.text();
            
            console.error(`SendGrid failed. Status: ${response.status}. Body: ${errorBody}`);

            // Return a V2 error response
            return new Response(
                JSON.stringify({ 
                    error: `SendGrid submission failed.`,
                    details: errorBody 
                }),
                { status: response.status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        console.log('SendGrid request successful. Status:', response.status);

        // --- 3. SUCCESS RESPONSE ---
        return new Response(
            JSON.stringify({ message: 'Email and phone number updated successfully' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        // Handle uncaught errors (like network failures or internal exceptions)
        console.error('A critical error occurred during submission:', error);

        return new Response(
            JSON.stringify({ 
                error: 'An unexpected internal error occurred.',
                details: error.message || 'Check function logs for details.'
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};