// Stripe Checkout webhook — generates Ed25519-signed license keys on purchase
//
// Required environment variables (set in Cloudflare Pages dashboard):
//   STRIPE_WEBHOOK_SECRET  — Stripe webhook signing secret (whsec_*)
//   RESEND_API_KEY         — Resend API key for sending license emails
//   LICENSE_PRIVATE_KEY    — Ed25519 private key (hex) for signing licenses
//   LICENSE_SENDER_EMAIL   — From address for license emails
//
// Stripe products (update lookup_keys when prices change):
//   Pro:                    price_1RQFclP78vm6Q5n6HW3bb83C  → 49 USD,  lookup_key: 'pro'
//   Business:               price_1RQFdEP78vm6Q5n6fK2XxgGC → 99 USD,  lookup_key: 'business'
//   Pro→Business upgrade:  TODO: create in Stripe dashboard  → 50 USD,  lookup_key: 'pro_to_business_upgrade'
//
// To create the upgrade price:
// 1. Stripe Dashboard → Products → Create Product "Pro to Business Upgrade"
// 2. One-time price: $50 USD, set lookup_key = 'pro_to_business_upgrade'
// 3. After creation, copy the price_xxx ID and its Buy link
// 4. Update landing page "Pro users upgrade for $50" link to point to the new Checkout URL
// 5. Update this comment with the price_xxx ID
//
// License key format (Rust expects):
//   talkedit_v1_{base64(license_payload_json)}.{base64(ed25519_signature)}

import { etc, signAsync } from '@noble/ed25519';
const { hexToBytes, randomBytes } = etc;

// Base64 encode without padding (matches Rust's STANDARD_NO_PAD)
function b64encode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, '');
}

interface Env {
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY: string;
  LICENSE_PRIVATE_KEY: string;
  LICENSE_SENDER_EMAIL: string;
}

// License payload matching Rust's LicensePayload struct
interface LicensePayload {
  license_id: string;
  customer_email: string;
  tier: string;
  features: string[];
  issued_at: number;
  expires_at: number;
  max_activations: number;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const request = context.request;
  const env = context.env;

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
    const encoder = new TextEncoder();
    const stripeSecret = env.STRIPE_WEBHOOK_SECRET;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(stripeSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Parse the Stripe signature header: t=timestamp,v1=signature
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
      'HMAC', key, sigBytes, encoder.encode(signedPayload)
    );

    if (!valid) {
      return new Response('Invalid signature', { status: 400 });
    }

    const event = JSON.parse(body);

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

    // Determine license tier from line items lookup_keys
    const lineItems = session?.lines?.data || [];
    const lookupKeys = lineItems.map((item: any) => item.price?.lookup_key).filter(Boolean);
    const isUpgrade = lookupKeys.includes('pro_to_business_upgrade');
    const isBusiness = lookupKeys.includes('business') || isUpgrade;

    const tier = isBusiness ? 'business' : 'pro';
    const features = isBusiness
      ? ['bundled_deps', 'auto_updates', 'bg_removal', 'ai_editing']
      : ['bundled_deps', 'auto_updates'];

    // Build license payload matching Rust's LicensePayload struct
    const now = Math.floor(Date.now() / 1000);
    const payload: LicensePayload = {
      license_id: `talkedit_${session.id}`,
      customer_email: customerEmail,
      tier,
      features,
      issued_at: now,
      expires_at: 0,  // perpetual — never expires
      max_activations: 3,
    };

    // Sign with Ed25519 — use async API (sync requires sha512Sync which isn't available in Workers)
    const privateKeyBytes = hexToBytes(env.LICENSE_PRIVATE_KEY);
    const payloadBytes = encoder.encode(JSON.stringify(payload));
    const signatureBytes = await signAsync(payloadBytes, privateKeyBytes);

    // Build license key: talkedit_v1_{base64(payload)}.{base64(signature)}
    const payloadB64 = b64encode(new Uint8Array(payloadBytes));
    const sigB64 = b64encode(new Uint8Array(signatureBytes));
    const licenseKey = `talkedit_v1_${payloadB64}.${sigB64}`;

    // Determine display tier for email
    const tierName = tier === 'business' ? 'Business' : 'Pro';

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
        subject: `Your TalkEdit ${tierName} License Key`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h1 style="color: #6366f1;">TalkEdit License</h1>
            <p>Hi ${customerName},</p>
            ${isUpgrade
              ? `<p>Your license has been <strong>upgraded to TalkEdit Business</strong>!</p>`
              : `<p>Thank you for purchasing TalkEdit <strong>${tierName}</strong>!</p>`
            }
            <p>Your license key is:</p>
            <pre style="background: #f4f4f5; padding: 16px; border-radius: 8px; font-size: 12px; word-break: break-all; line-height: 1.6;">${licenseKey}</pre>
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
    }

    console.log(`License delivered: ${customerEmail} (${tier})${isUpgrade ? ' [upgrade]' : ''}`);
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
