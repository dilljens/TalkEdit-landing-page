// Check promotion code redemptions — returns usage count for a given code.
//
// Optional. Use when a creator asks "how many sales from my code?"
// Each creator gets a URL like: talk-edit.com/api/check-ref?code=PODCASTER10
//
// Required environment variables:
//   STRIPE_SECRET_KEY  — Stripe secret key (sk_live_*) for API access

interface Env {
  STRIPE_SECRET_KEY?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { STRIPE_SECRET_KEY } = context.env;

  if (!STRIPE_SECRET_KEY) {
    return new Response('Not configured', { status: 500 });
  }

  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response(
      JSON.stringify({ error: 'Missing code parameter. Usage: /api/check-ref?code=YOUR_CODE' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // List promotion codes matching this code
    const res = await fetch(`https://api.stripe.com/v1/promotion_codes?code=${encodeURIComponent(code)}&limit=1`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Stripe API error:', err);
      return new Response(JSON.stringify({ error: 'Failed to check code' }), { status: 500 });
    }

    const data: any = await res.json();

    if (!data.data || data.data.length === 0) {
      return new Response(
        JSON.stringify({ code, found: false, message: 'Code not found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const promo = data.data[0];
    const redemptions = promo.times_redeemed || 0;
    const maxRedemptions = promo.max_redemptions || null;

    return new Response(
      JSON.stringify({
        code,
        found: true,
        redemptions,
        max_redemptions: maxRedemptions,
        active: promo.active,
        coupon_name: promo.coupon?.name || null,
        created: promo.created,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('check-ref error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
