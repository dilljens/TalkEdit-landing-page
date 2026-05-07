# TalkEdit Landing Page — Build Plan

## Stack

| Layer | Choice | Status |
|-------|--------|--------|
| Domain | `talk-edit.com` | ✅ Registered via Cloudflare ($9.15/yr) |
| Hosting | Cloudflare Pages (free tier) | DNS + HTTPS handled automatically |
| Frontend | Static site (Tailwind + vanilla HTML/JS) | No framework overhead, one-page |
| Backend | None — Stripe Checkout + GitHub Releases | No server to maintain |
| Payments | Stripe Checkout (hosted UI) | No PCI scope, no auth system |
| Distribution | GitHub Releases | AppImage + .deb via tag push |

## Architecture

```
Visitor → talk-edit.com → Cloudflare Pages
           ├── Pricing → Stripe Checkout
           │              └── Webhook → license key email
           ├── Download → GitHub Releases (AppImage + .deb)
           └── FAQ / Support → mailto or form
```

---

## Action Plan

### Step 1: Build the landing page

- [x] **Scaffold `index.html`** — Tailwind CDN. Single page, no build step.
- [x] **Sections:**
  - Hero: tagline + "Download Beta" CTA
  - Features: 3x2 cards (long-form, offline, AI-powered, one-time price, keyboard-driven, export)
  - Pricing: 7-day free trial / Pro $39 / Business $79
  - Download: Linux AppImage + .deb buttons
  - FAQ: trial terms, offline requirement, refund policy
  - Footer: email contact, social links
- [x] **Responsive** — mobile-first layout
- [x] **OG meta tags** — preview image, title, description for social shares

### Step 2: Deploy to Cloudflare Pages

- [ ] Create Cloudflare Pages project (drag-drop or connect git repo)
- [ ] Attach `talk-edit.com` as custom domain
- [ ] Cloudflare auto-provisions DNS + HTTPS cert

### Step 3: Set up Stripe

- [ ] Create Stripe account (or use existing)
- [ ] Create two products: Pro ($39 one-time), Business ($79 one-time)
- [ ] Generate Stripe Checkout links
- [ ] Wire "Buy" buttons on landing page to Checkout links

### Step 4: License key delivery (simple first)

- [ ] **Manual (beta):** Stripe sends receipt email, you email license key manually. Fine for low volume.
- [ ] **Later:** Cloudflare Pages Function receives `checkout.session.completed` webhook → generates license key (`base64(hmac(email + tier + timestamp, secret))`) → emails via SendGrid/Resend

### Step 5: Distribution

- [ ] Confirm/add GitHub Actions workflow that builds AppImage + .deb on tag push
- [ ] Download buttons on landing page link to latest GitHub Release assets

### Step 6: Launch readiness

- [ ] Analytics: Plausible or Umami (privacy-friendly, no Google Analytics)
- [ ] Contact: `mailto:hello@talk-edit.com` or Formspree
- [ ] SEO: `<title>`, `<meta description>`, Product schema, sitemap.xml, robots.txt
- [ ] Refund policy: 30-day money back, listed in FAQ and Stripe return URL

---

## Domain

| Domain | TLD | Cost | Status |
|--------|-----|------|--------|
| talk-edit.com | .com | $9.15/yr | ✅ Registered via Cloudflare |
| talk-edit.app | .app | ~$16/yr | Available if needed later |

---

## Future (deferred)

- License management portal
- Blog / changelog
- Affiliate tracking
- Account system (only if needed)
