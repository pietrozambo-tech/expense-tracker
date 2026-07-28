# tracklylab.com - landing + legal pages

This folder is the complete static site for **tracklylab.com**: a landing page
plus the Privacy Policy and Terms of Service, ready to deploy as-is.

- `index.html` - landing page (handwritten; edit freely)
- `privacy.html`, `terms.html` - **generated** from `src/app/lib/legalContent.ts`
  by `pnpm site`. Do not edit these by hand - change the source module and
  regenerate, so the site and the in-app screens always say the same thing.
- `CNAME` - tells GitHub Pages the custom domain (ignored by other hosts)

## Deploying (choose one)

**Option A - second GitHub repo (recommended)**
1. Create a new repo, e.g. `tracklylab-site`, and push the *contents* of this
   folder to its default branch.
2. Repo Settings → Pages → deploy from that branch.
3. Settings → Pages → Custom domain: `tracklylab.com` (the CNAME file keeps it
   set across pushes). Enable "Enforce HTTPS" once the certificate is issued.
4. At your DNS provider, point the domain at GitHub Pages:
   - `A` records for `tracklylab.com` → 185.199.108.153, 185.199.109.153,
     185.199.110.153, 185.199.111.153
   - `CNAME` record for `www` → `<your-username>.github.io`

**Option B - Cloudflare Pages / Netlify**
Drag-and-drop this folder into a new project and attach the custom domain in
their dashboard. Delete `CNAME` if the host complains about it.

## After it is live: Google OAuth consent screen

1. **Verify the domain**: Google Search Console → add property
   `tracklylab.com` → DNS verification → add the TXT record at your DNS
   provider (same panel as the Resend records).
2. In Google Cloud Console → OAuth consent screen, fill in:
   - Authorised domain: `tracklylab.com`
   - Application home page: `https://tracklylab.com`
   - Privacy policy: `https://tracklylab.com/privacy.html`
   - Terms of service: `https://tracklylab.com/terms.html`
3. Leave the **logo** empty for now - uploading one triggers Google's brand
   verification review (days to weeks). Add it when the final logo is ready.

Note: the consent screen may still say "to continue to *xxxx*.supabase.co" -
that line names the OAuth redirect target and is fixed only by a Supabase
custom auth domain (paid add-on), not by anything in this folder.
