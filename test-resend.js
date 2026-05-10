// Run with: node --env-file=.env test-resend.js (Node 20+)
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const url = process.env.VITE_SUPABASE_URL 
  ? `${process.env.VITE_SUPABASE_URL}/functions/v1/broadcast-email`
  : 'https://tauunmprgfnjzwbjulwb.supabase.co/functions/v1/broadcast-email';

const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const testRecipientEmail = process.env.TEST_RECIPIENT_EMAIL;

async function confirmSend() {
  console.warn('WARNING: This script will trigger the broadcast-email Edge Function.');
  console.warn('Only proceed if TEST_RECIPIENT_EMAIL is a safe test inbox.');

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question('Type SEND to continue, or anything else to cancel: ');
  rl.close();

  return answer.trim() === 'SEND';
}

async function test() {
  if (!key) {
    console.error("Error: Supabase Anon Key not found in environment variables.");
    console.error("Please run with: node --env-file=.env test-resend.js");
    return;
  }

  if (!testRecipientEmail) {
    console.error('Error: TEST_RECIPIENT_EMAIL is not set. Aborting test send.');
    return;
  }

  const confirmed = await confirmSend();
  if (!confirmed) {
    console.log('Aborted by user. No request sent.');
    return;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: 'Test',
        message: 'Test Broadcast from Script',
        recipientGroup: 'INDIVIDUAL',
        recipientEmail: testRecipientEmail
      })
    });
    
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Body:', text);
  } catch (error) {
    console.error('Test execution failed:', error.message || error);
  }
}

test();
