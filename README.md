# meetup-connect

A tiny site for networking at meetups. Open a bookmarked page on your phone and it shows a QR code.
Someone scans it and gets a page titled **"Connect with Alexandra via"** with two buttons:

- **LinkedIn** opens your LinkedIn profile.
- **CV via email**: they type their email address, press enter, and receive your CV as a PDF attachment.

```
 your phone                          their phone
 ───────────                         ─────────────
 /qr.html#key=…  ──GET /api/qr──▶  QR code with  https://site/?t=<signed, expiring token>
                                        │ scan
                                        ▼
                                   index.html ──▶ LinkedIn
                                        │
                                        └─ email + bot check ──POST /api/send-cv──▶ Resend ──▶ email with CV.pdf
```

## Stack

| Piece | What it does | Cost |
|---|---|---|
| [Vercel](https://vercel.com) | Hosts the static pages (`public/`) and the two functions (`api/`) over HTTPS | Free (Hobby) |
| [Resend](https://resend.com) | Sends the email with the CV attached | Free up to 100 emails/day |
| [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) | Invisible bot check before an email is sent | Free |
| [`qrcode`](https://www.npmjs.com/package/qrcode) | Generates the QR code on the server | — |

## Setup

1. **Domain (recommended).** Resend can only send to arbitrary addresses from a domain you have verified,
   so you need a domain you own (about 100 SEK a year). Use it for the site too, e.g. `connect.yourname.se`.
2. **Resend:** create an account, add and verify your domain (DNS records for SPF/DKIM), and create an API key.
3. **Turnstile:** in the Cloudflare dashboard, open Turnstile and add a site for your domain. Put the
   **site key** in `public/config.js` and keep the **secret key** for the env vars.
4. **CV:** upload the PDF somewhere *private* with an unguessable URL (see "Where the CV lives" below).
   Do **not** commit it here, because this repo is public. `*.pdf` is in `.gitignore`.
5. **Vercel:** import this GitHub repo and set the environment variables listed in `.env.example`.
   Generate `TOKEN_SECRET` and `QR_ACCESS_KEY` with `openssl rand -base64 32`.
6. **LinkedIn:** set `linkedinUrl` in `public/config.js`.
7. On your phone, bookmark `https://<your-site>/qr.html#key=<QR_ACCESS_KEY>` (or add it to your home screen).

Local development: `npm install`, copy `.env.example` to `.env`, then `npx vercel dev`. Tests: `npm test`.

## Security notes

QR codes have no security of their own: a QR code is just a URL printed as a picture. What can be
secured is *where it points* and *what that page lets people do*.

**What this project does about it**

- **HTTPS only, on a domain you control.** People can see the domain before they open it. The site sends
  HSTS, a strict Content-Security-Policy, `X-Frame-Options: DENY` and `nosniff` (see `vercel.json`).
- **The QR link expires.** Each code contains a token signed with HMAC that is valid for `TOKEN_TTL_MINUTES`
  (default 120). If someone photographs your QR code and posts it online, the email button stops working
  after it expires. The LinkedIn button keeps working, since that is public anyway.
- **Only you can create codes.** `/api/qr` requires `QR_ACCESS_KEY`. The key is in the URL fragment
  (`#key=…`), which browsers never send to servers, so it doesn't show up in logs. Treat that bookmark like
  a password. If it leaks, change `QR_ACCESS_KEY` in Vercel.
- **The email endpoint can't easily be abused.** Without protection, anyone could make your site send
  your CV to thousands of addresses. That would be spam in your name and would get your domain blocklisted.
  Protection layers: the expiring token, the Turnstile bot check, a hidden honeypot field, strict
  single-address email validation (blocks injecting extra recipients), a per-instance rate limit, and
  Resend's own daily cap.
- **No secrets in the repo.** API keys, the CV location and your private email address are
  environment variables only.
- **The token is removed from the address bar** after the page loads, and `Referrer-Policy: no-referrer`
  stops it leaking to LinkedIn.
- Pages have `noindex` so search engines don't list them.

**Risks to be aware of**

- **QR swapping ("quishing").** On a printed poster or card, someone could stick their own QR code over
  yours. Showing it on your own phone screen mostly avoids this. If you ever print it, check it before
  every event.
- **Your phone screen is the key.** Anyone who borrows your unlocked phone can show your QR code. The worst
  case is someone getting your CV, which is low risk.
- **Your CV is personal data.** Leave your home address and personal ID number out of the PDF you hand out.
  Assume anything you send could be forwarded.
- **You store other people's emails** (in Resend's logs and in your notification emails). Under GDPR that
  is fine for this purpose, but don't reuse the addresses for anything else. Resend logs can be deleted.
- **The rate limit is best-effort.** Serverless instances don't share memory. If you ever see abuse, add
  a shared store such as Upstash Redis (free tier), or shorten `TOKEN_TTL_MINUTES`.
- **Typos.** If someone mistypes their address, a stranger gets your CV. The form makes them type it
  carefully, and the success message repeats the address.

## Where the CV lives

`CV_URL` must return the PDF and must not be guessable or listed anywhere. Some options:

- **Vercel Blob** (Storage → Blob in the Vercel project): upload the PDF. The URL contains a long random
  suffix. Simplest, because it is in the same account.
- A direct-download link from Google Drive or Dropbox. It works, but anyone who sees the link can share it.

To update your CV, replace the file and redeploy (or wait for function instances to restart).
