const express = require('express');
const { loginUser } = require('../services/authService');
const { deleteUserAccount } = require('../services/userService');

const router = express.Router();
const support = 'CampusVault.co@gmail.com';
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — CampusVault</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;line-height:1.6;color:#111827}h1{color:#07883f}a{color:#087f3e}label{display:block;margin-top:16px}input{box-sizing:border-box;width:100%;padding:12px;margin-top:5px}button{margin-top:20px;padding:12px 18px;background:#07883f;color:white;border:0;border-radius:8px}small{color:#4b5563}</style></head><body><p><strong>CampusVault</strong></p><h1>${title}</h1>${body}<hr><small>Contact: <a href="mailto:${support}">${support}</a> · Last updated 10 September 2026</small></body></html>`;

router.use((req, res, next) => {
  if (!['/privacy', '/terms', '/delete-account'].includes(req.path)) return next();
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  next();
});

router.get('/privacy', (req, res) => res.type('html').send(page('Privacy Policy', `
  <p>CampusVault is a student gig marketplace. We collect account details (name, email, college, branch, year and skills), profile content, gig and application activity, messages, community posts, reviews, device push token, and files you choose to upload.</p>
  <h2>How data is used</h2><p>We use this data to authenticate users, show profiles and gigs, match opportunities, provide chat and notifications, prevent abuse, support users, and operate the service. We do not sell personal data.</p>
  <h2>Sharing and security</h2><p>Public profile and marketplace content is visible to other users. Service providers used for hosting, database storage, email, and push delivery process only the data needed to provide those services. Data is transmitted over HTTPS and access credentials are protected.</p>
  <h2>Control and deletion</h2><p>You can edit profile data in the app and permanently delete your account from Settings. You may also use the <a href="/delete-account">web deletion page</a>. Deletion removes the account and associated app content from active systems, subject to short-lived backups, security records, and legal obligations.</p>
  <h2>Children</h2><p>CampusVault is intended for college students and is not directed to children under 13.</p>`)));

router.get('/terms', (req, res) => res.type('html').send(page('Terms of Use', `
  <p>Use CampusVault lawfully and honestly. You are responsible for your account, listings, applications, messages, work, and agreements with other users.</p>
  <h2>Marketplace rules</h2><p>Do not post illegal, deceptive, abusive, discriminatory, sexually explicit, dangerous, infringing, or spam content. Do not impersonate others, misuse personal data, manipulate reviews, or evade platform safeguards. Report concerns through Help & Support.</p>
  <h2>Transactions</h2><p>CampusVault helps students connect and confirm gig completion; it does not guarantee user performance, payment, or identity. Verify counterparties and keep personal and financial information private.</p>
  <h2>Enforcement</h2><p>We may remove content or restrict accounts that violate these terms, protect users, or comply with law. Features may change as the service improves.</p>`)));

router.get('/delete-account', (req, res) => res.type('html').send(page('Delete your account', `
  <p>This permanently removes your CampusVault profile and associated gigs, applications, messages, community posts, reviews, notifications, feedback, and stored uploads. Active gigs assigned to you are reopened. This cannot be undone.</p>
  <form method="post" action="/delete-account"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" minlength="6" required></label><label>Type DELETE<input name="confirmation" pattern="DELETE" required></label><button type="submit">Delete permanently</button></form>`)));

router.post('/delete-account', async (req, res) => {
  try {
    if (req.body.confirmation !== 'DELETE') return res.status(400).type('html').send(page('Deletion not confirmed', '<p>Type DELETE exactly to confirm. No data was changed.</p><p><a href="/delete-account">Try again</a></p>'));
    const result = await loginUser(req.body.email, req.body.password);
    await deleteUserAccount(result.user._id, 'DELETE');
    return res.type('html').send(page('Account deleted', '<p>Your CampusVault account and associated active data have been permanently deleted.</p>'));
  } catch (_error) {
    return res.status(401).type('html').send(page('Deletion failed', '<p>The credentials were not accepted. No data was changed.</p><p><a href="/delete-account">Try again</a> or contact support.</p>'));
  }
});

module.exports = router;
