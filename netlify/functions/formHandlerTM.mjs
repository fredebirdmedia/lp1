// --- 6. EXECUTE LEAD SUBMISSIONS ---

// Use a new, clean array (promises)
const promises = [];

// -----------------------------------------------------------------
// A. SENDGRID MARKETING REQUEST 
// ... (The SendGrid promise creation block must result in a defined sendgridPromise) ...
promises.push(sendgridPromise); // <-- This promise is always added

// -----------------------------------------------------------------
// B. BREVO REQUEST (HIGH-CONFIDENCE LEADS ONLY)
// -----------------------------------------------------------------
if (finalScore >= 0.85) { 
    // This block ONLY runs if the score is high enough
    const brevoApiKey = env.get('BREVO_API_KEY');
    
    if (brevoApiKey) {
        // ... (Brevo promise creation code, resulting in brevoPromise) ...
        
        promises.push(brevoPromise); // <-- ONLY PUSH IF IT'S HIGH-CONFIDENCE AND READY TO SEND
    }
} else {
    console.warn(`Brevo skipped for email ${leadEmail} due to score (${finalScore}).`);
}

// -----------------------------------------------------------------
// 7. FINISH
// -----------------------------------------------------------------
// This line now only waits for the promises that were actually added.
const results = await Promise.allSettled(promises); 
// ... (Rest of final return logic) ...