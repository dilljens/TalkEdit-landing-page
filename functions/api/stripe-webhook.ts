// Stripe Checkout webhook — generates Ed25519-signed license keys on purchase
//
// Required environment variables (set in Cloudflare Pages dashboard):
//   STRIPE_WEBHOOK_SECRET  — Stripe webhook signing secret (whsec_*)
//   RESEND_API_KEY         — Resend API key for sending license emails
//   LICENSE_PRIVATE_KEY    — Ed25519 private key (hex) for signing licenses
//   LICENSE_SENDER_EMAIL   — From address for license emails
//
// Stripe products:
//   Pro:     price_1RQFclP78vm6Q5n6HW3bb83C  → 49 USD
//   Business: price_1RQFdEP78vm6Q5n6fK2XxgGC → 99 USD

import { etc } from '@noble/ed25519';
const { hexToBytes, bytesToHex } = etc;

interface Env {
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY: string;
  LICENSE_PRIVATE_KEY: string;
  LICENSE_SENDER_EMAIL: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const request = context.request;
  const env = context.env;

  // Only accept POST
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Validate required env vars
  const missing: string[] = [];
  if (!env.STRIPE_WEBHOOK_SECRET) missing.push('STRIPE_WEBHOOK_SECRET');
  if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!env.LICENSE_PRIVATE_KEY) missing.push('LICENSE_PRIVATE_KEY');
  if (!env.LICENSE_SENDER_EMAIL) missing.push('LICENSE_SENDER_EMAIL');
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    return new Response('Webhook not configured', { status: 500 });
  }

  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return new Response('Missing stripe-signature header', { status: 400 });
    }

    // Verify Stripe webhook signature using HMAC
    const stripeSecret = env.STRIPE_WEBHOOK_SECRET;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(stripeSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Parse the Stripe signature header
    // Format: t=timestamp,v1=signature
    const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
      const [k, ...v] = part.split('=');
      acc[k.trim()] = v.join('=');
      return acc;
    }, {});

    const timestamp = parts['t'];
    const sig = parts['v1'];

    if (!timestamp || !sig) {
      return new Response('Invalid signature format', { status: 400 });
    }

    const signedPayload = `${timestamp}.${body}`;
    const sigBytes = hexToBytes(sig);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(signedPayload)
    );

    if (!valid) {
      return new Response('Invalid signature', { status: 400 });
    }

    // Parse the event
    const event = JSON.parse(body);

    // We only process checkout.session.completed
    if (event.type !== 'checkout.session.completed') {
      return new Response(`Unhandled event type: ${event.type}`, { status: 200 });
    }

    const session = event.data.object;
    const customerEmail = session.customer_details?.email;
    const customerName = session.customer_details?.name || 'TalkEdit User';

    if (!customerEmail) {
      console.error('No customer email in session:', session.id);
      return new Response('No customer email', { status: 400 });
    }

    // Determine license tier from line items or metadata
    const lineItems = session?.lines?.data || [];
    const isBusiness = lineItems.some((item: any) =>
      item.price?.lookup_key === 'business' ||
      item.description?.toLowerCase().includes('business')
    );
    const tier = isBusiness ? 'business' : 'pro';

    // Generate license key
    const privateKeyBytes = hexToBytes(env.LICENSE_PRIVATE_KEY);
    const licenseData = JSON.stringify({
      email: customerEmail,
      tier,
      issued: new Date().toISOString(),
      sessionId: session.id,
    });

    // Sign with Ed25519
    const { sign } = await import('@noble/ed25519');
    const signatureBytes = await sign(encoder.encode(licenseData), privateKeyBytes);
    const licenseKey = bytesToHex(signatureBytes);

    // Build the full license payload (base64 encoded for easy copying)
    const licensePayload = {
      key: licenseKey,
      data: licenseData,
    };
    const encodedLicense = btoa(JSON.stringify(licensePayload));

    // Send license email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.LICENSE_SENDER_EMAIL,
        to: customerEmail,
        subject: `Your TalkEdit ${tier === 'business' ? 'Business' : 'Pro'} License Key`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h1 style="color: #6366f1;">TalkEdit License</h1>
            <p>Hi ${customerName},</p>
            <p>Thank you for purchasing TalkEdit <strong>${tier === 'business' ? 'Business' : 'Pro'}</strong>!</p>
            <p>Your license key is:</p>
            <pre style="background: #f4f4f5; padding: 16px; border-radius: 8px; font-size: 14px; word-break: break-all;">${encodedLicense}</pre>
            <p>To activate:</p>
            <ol>
              <li>Open TalkEdit</li>
              <li>Click the license icon in the toolbar</li>
              <li>Paste your license key and click Activate</li>
            </ol>
            <p style="color: #71717a; font-size: 12px; margin-top: 32px;">
              If you have any issues, reply to this email or contact hello@talk-edit.com
            </p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const emailError = await emailResponse.text();
      console.error('Failed to send license email:', emailError);
      // Don't fail the webhook — the license was still generated
    }

    console.log(`License delivered: ${customerEmail} (${tier})`);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Stripe webhook error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
