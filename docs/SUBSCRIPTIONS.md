# Subscription app — mobile OTP, one device per account, Razorpay

## How access works

| Who | Can open job pages? |
|---|---|
| Not signed in | No → `/login` (mobile number + OTP only) |
| Signed in, first time | This browser is registered as the account's **one device**; a free trial starts (default 3 days) |
| Signed in on the registered device with a live trial / plan | Yes |
| Signed in on the registered device, trial/plan ended | No → `/subscribe` |
| Signed in on **another** device | No → `/device`: "This account is registered on another device" with **Move my account to this device** (allowed once every 30 days; the old device is signed out) |
| Admin / moderator | Always (any device) |

Public without sign-in: `/` (landing page with prices), `/login`, `/subscribe`, `/terms`, `/privacy`, `/refunds`, `/contact`, `/jobs/post` (employers post free; OTP sign-in still required), the Razorpay webhook.

It is enforced in two places:
1. **Database (RLS)** — job rows, source links and AI summaries are readable only when `public.has_job_access()` is true. Calling the Supabase API directly with the public anon key returns nothing.
2. **Website (middleware)** — sign-in, the device check and the plan check, cached for 10 minutes in a signed httpOnly cookie (`ACCESS_COOKIE_SECRET`).

### What "one device" means on the web
A website can't read a phone's hardware id. The "device" is a random id stored in the browser (cookie + localStorage); only its SHA-256 hash is kept in `user_devices`. Clearing site data or using another browser on the same phone counts as a new device — the user can move the account themselves (once per cooldown) or you can **Reset device** in `/admin/subscribers`. For a hardware-bound check, ship the site as an Android app later (Trusted Web Activity / Capacitor) and use the app's install id instead — the database side stays the same.

Tip: Supabase Pro also has **Auth → Sessions → "Enforce single session per user"**, which signs out older sessions on every new sign-in.

## Email + password sign-in (testing option)
Off by default. Turn it on in `/admin/subscribers → Access settings → Allow email + password sign-in`, or force it with `EMAIL_LOGIN=on` / `off` in the website env. The login page then shows **Mobile OTP | Email** tabs: create an account, sign in, or reset a forgotten password (`/account/password`). Email accounts follow the same rules — one registered device, the free trial once, then a plan — and show up in `/admin/subscribers` (search by phone or email).

- **AapStack**: Authentication → Settings → turn on email sign-ups. For quick testing switch **off** "require email confirmation" so a new account is signed in at once. With confirmation on, the link in the email lands on your Site URL with the session in the address (`#access_token=…`); the site picks it up automatically and registers the device. Set the Site URL to your website and add it to the allowed redirect URLs.
- **Supabase**: Authentication → Providers → Email. Add `https://<your domain>/auth/callback` to the redirect URLs (confirmation and reset links come back there).
- Before launch, decide whether to keep it: email accounts are easier to create than phone numbers, so a determined user can start more free trials (each still needs its own device).

## Automatic OTP fill
- **Android (Chrome)**: WebOTP API — the code is filled in and submitted automatically. The SMS **must end with a line `@<your domain> #<code>`**. Supabase → Authentication → SMS template:
  ```
  Your Mana Kosamu code is {{ .Code }}. Do not share it.

  @manakosamu.com #{{ .Code }}
  ```
  Use the exact domain the site runs on (HTTPS only); the whole SMS must be ≤ 140 characters.
- **iPhone (Safari)**: `autocomplete="one-time-code"` shows the code above the keyboard — one tap.
- Everywhere else the form submits itself as soon as 6 digits are typed. "Resend code" appears after 30 s.
- Indian SMS needs **DLT registration** with your SMS provider (MSG91 / Twilio / etc., configured in Supabase Auth → Phone). Register the template above exactly.

## Razorpay setup
1. Create a Razorpay account and complete KYC. Razorpay checks the site has **Terms, Privacy, Cancellation & Refunds and Contact** pages — they are at `/terms`, `/privacy`, `/refunds`, `/contact`. Fill in `NEXT_PUBLIC_BUSINESS_*` and have the texts reviewed.
2. Enable **Subscriptions** (UPI AutoPay, cards, e-mandate).
3. Dashboard → Subscriptions → **Plans**: create one plan per price (placeholders: ₹49 monthly, ₹129 every 3 months, ₹399 yearly). Paste each `plan_…` id into `/admin/subscribers → Plans`.
4. API keys → set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on the server (only the key id reaches the browser).
5. Webhooks → URL `https://<your domain>/api/razorpay/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`, events: all `subscription.*`.
6. Test with **test-mode** keys and test plans first, then switch to live.

Flow: `/subscribe` → server creates a Razorpay subscription (with `notes.user_id`) → Razorpay Checkout → server verifies `hmac_sha256(payment_id + "|" + subscription_id)` against the id it stored → access on. Renewals, failures and cancellations arrive by webhook (signature checked on the raw body, de-duplicated by event id, access end dates never move backwards). Users can turn off auto-renewal on `/subscribe` and keep access until the paid period ends.

## Admin (`/admin/subscribers`)
- Access mode (subscription / open), free-trial days, device-change cooldown.
- Plans: price, months, Razorpay plan id, active.
- Users by phone: plan status and end date, registered device, **Reset device**, **Grant days** (complimentary), **End trial/grant**.

## Going back to a free site
Set `ACCESS_MODE=open` and choose "Open" in `/admin/subscribers`.
