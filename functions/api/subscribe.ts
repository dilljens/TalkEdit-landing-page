// Newsletter signup endpoint — captures email addresses
//
// Required environment variables (set in Cloudflare Pages dashboard):
//   RESEND_API_KEY         — Resend API key for sending confirmation + admin notification
//   NEWSLETTER_SENDER_EMAIL — From address for confirmation emails
//   ADMIN_EMAIL            — Email to notify on new subscribers (optional)

interface Env {
  RESEND_API_KEY: string;
  NEWSLETTER_SENDER_EMAIL: string;
  ADMIN_EMAIL?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const request = context.request;
  const env = context.env;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json() as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Valid email required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Send confirmation to subscriber
    if (env.RESEND_API_KEY && env.NEWSLETTER_SENDER_EMAIL) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.NEWSLETTER_SENDER_EMAIL,
          to: email,
          subject: 'You\'re subscribed to TalkEdit updates',
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
              <h1 style="color: #6366f1;">TalkEdit</h1>
              <p>Thanks for subscribing!</p>
              <p>You'll hear from us when there are new releases, features, and tips for getting the most out of TalkEdit.</p>
              <p style="color: #71717a; font-size: 12px; margin-top: 32px;">
                If you didn't subscribe, you can ignore this email.
              </p>
            </div>
          `,
        }),
      });
    }

    // Notify admin
    if (env.ADMIN_EMAIL && env.RESEND_API_KEY && env.NEWSLETTER_SENDER_EMAIL) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.NEWSLETTER_SENDER_EMAIL,
          to: env.ADMIN_EMAIL,
          subject: `New newsletter subscriber: ${email}`,
          html: `<p>New subscriber: <strong>${email}</strong></p>`,
        }),
      }).catch(() => {}); // Best-effort
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Subscribe error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
