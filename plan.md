# TalkEdit Landing Page — Build Plan

## Stack

| Layer | Choice | Status |
|-------|--------|--------|
| Domain | `talk-edit.com` | ✅ Registered via Cloudflare ($9.15/yr) |
| Hosting | Cloudflare Pages (free tier) | ✅ DNS + HTTPS handled automatically |
| Frontend | Static site (Tailwind + vanilla HTML/JS) | ✅ No framework overhead, one-page |
| Backend | Cloudflare Pages Functions + Stripe | ✅ No server to maintain |
| Payments | Stripe Checkout (hosted UI) | ✅ No PCI scope, no auth system |
| Email | Resend API | ✅ License delivery + newsletter |
| Distribution | Cloudflare R2 | ✅ AppImage, .msi, .dmg |

## Architecture

```
Visitor → talk-edit.com → Cloudflare Pages
           ├── Pricing → Stripe Checkout
           │              └── Webhook → license key email (via Resend)
           ├── Download → Cloudflare R2 (TalkEdit_latest_*)
           └── Newsletter → /api/subscribe → Resend
```

---

## Action Plan

### Step 1: Build the landing page ✅

- [x] **Scaffold `index.html`** — Tailwind CDN. Single page, no build step.
- [x] **Sections:**
  - Hero: tagline + "Download Beta" CTA
  - Features: 3x2 cards (long-form, offline, AI-powered, one-time price, keyboard-driven, export)
  - Pricing: 7-day free trial / Pro $49 / Business $99 (Pro→Business upgrade for $50)
  - Download: Linux AppImage, Windows .msi, macOS .dmg buttons
  - FAQ: trial terms, offline requirement, refund policy
  - Footer: email contact, social links
- [x] **Responsive** — mobile-first layout
- [x] **OG meta tags** — preview image, title, description for social shares
- [x] **SEO** — sitemap.xml, robots.txt, structured data (Schema.org Product, FAQ, HowTo)
- [x] **Blog** — articles at `/blog/*`

### Step 2: Deploy to Cloudflare Pages ✅

- [x] Cloudflare Pages project created and connected to git
- [x] `talk-edit.com` custom domain attached
- [x] DNS + HTTPS cert auto-provisioned
- [x] Pages Functions enabled at `/api/*`

### Step 3: Set up Stripe ✅

- [x] Stripe products created:
  - **Pro** ($49 one-time) — price `price_1RQFclP78vm6Q5n6HW3bb83C`, lookup_key `pro`
  - **Business** ($99 one-time) — price `price_1RQFdEP78vm6Q5n6fK2XxgGC`, lookup_key `business`
  - **Pro→Business upgrade** ($50, not yet created)
- [x] Stripe Checkout links generated and wired to Buy buttons
- [x] Tiers use `lookup_key` so the webhook can detect which was purchased

### Step 4: License key delivery ✅ (code done, needs config)

- [x] Cloudflare Pages Function at `/api/stripe-webhook` receives `checkout.session.completed`
- [x] Generates Ed25519-signed license key using `@noble/ed25519`
- [x] Emails license key via Resend API with branded template
- [ ] **Setup:** Configure Cloudflare Pages env vars + Stripe webhook endpoint (see below)

### Step 5: Distribution ✅

- [x] CI/CD in main TalkEdit repo builds AppImage, .msi, .dmg on tag push
- [x] Release artifacts uploaded to Cloudflare R2 as `TalkEdit_latest_*`
- [x] Download buttons link to R2 URLs

### Step 6: Launch readiness — remaining

- [ ] **Configure Cloudflare Pages env vars** (see Setup below)
- [ ] **Register Stripe webhook** pointing to `https://talk-edit.com/api/stripe-webhook`
- [ ] **Create Pro→Business upgrade price** in Stripe ($50, lookup_key `pro_to_business_upgrade`)
- [ ] **Build Rust binary** with the real public key and cut a release
- [ ] **End-to-end test:** buy → webhook fires → email arrives → key activates in app
- [ ] Analytics: Plausible or Umami

---

## Setup — Cloudflare Pages Environment Variables

Set these in Cloudflare Dashboard → talk-edit-landing-page → Settings → Environment Variables:

| Variable | Value | Source |
|----------|-------|--------|
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe Dashboard → Webhooks |
| `RESEND_API_KEY` | `re_...` | Resend dashboard → API Keys |
| `LICENSE_PRIVATE_KEY` | 64-char hex | Generated Ed25519 seed (see below) |
| `LICENSE_SENDER_EMAIL` | `hello@talk-edit.com` | Your domain email |

See `.env.example` for documentation.

### Ed25519 keypair

Generated on 2026-06-25. Private key stored in:
- ✅ Cloudflare Pages env var (to be configured)
- ✅ Public key embedded in Rust binary at `src-tauri/src/licensing.rs`

**Do not commit the private key to git.** If lost, generate a new pair and update the Rust binary.

---

## Stripe Webhook Registration

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://talk-edit.com/api/stripe-webhook`
3. Events: select `checkout.session.completed`
4. Copy signing secret (`whsec_...`) → set as `STRIPE_WEBHOOK_SECRET`
5. Test with Stripe CLI: `stripe trigger checkout.session.completed`

---

## Domain

| Domain | TLD | Cost | Status |
|--------|-----|------|--------|
| talk-edit.com | .com | $9.15/yr | ✅ Registered via Cloudflare |
| talk-edit.app | .app | ~$16/yr | Available if needed later |

---

## Future (deferred)

- License management portal
- Affiliate / referral tracking
- Account system (only if needed)
