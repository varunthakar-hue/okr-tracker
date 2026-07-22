// MoEngage stub — logs calls until API credentials are configured.

const MOENGAGE_API_KEY = process.env.MOENGAGE_API_KEY;
const MOENGAGE_APP_ID = process.env.MOENGAGE_APP_ID;
const IS_CONFIGURED = !!(MOENGAGE_API_KEY && MOENGAGE_APP_ID);

export async function sendWhatsApp({ to, message, founderName }) {
  const payload = {
    app_id: MOENGAGE_APP_ID,
    to,
    template_name: 'founder_congratulations',
    language_code: 'en',
    components: [{ type: 'body', parameters: [{ type: 'text', text: message }] }]
  };

  if (!IS_CONFIGURED) {
    console.log('[MoEngage STUB] sendWhatsApp:', JSON.stringify(payload, null, 2));
    return { channel: 'whatsapp_dm', status: 'stub_logged', payload };
  }

  // Real call when configured
  const res = await fetch(`https://api.moengage.com/v1/whatsapp/send`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${MOENGAGE_APP_ID}:${MOENGAGE_API_KEY}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  return { channel: 'whatsapp_dm', status: 'sent', response: json };
}

export async function sendEmail({ to, subject, body, founderName }) {
  const payload = {
    app_id: MOENGAGE_APP_ID,
    to,
    subject,
    body,
    from_name: 'Razorpay Community Team',
    from_email: 'community@razorpay.com'
  };

  if (!IS_CONFIGURED) {
    console.log('[MoEngage STUB] sendEmail:', JSON.stringify(payload, null, 2));
    return { channel: 'email', status: 'stub_logged', payload };
  }

  const res = await fetch(`https://api.moengage.com/v1/email/send`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${MOENGAGE_APP_ID}:${MOENGAGE_API_KEY}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  return { channel: 'email', status: 'sent', response: json };
}
