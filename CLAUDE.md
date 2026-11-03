# kzn-intranet

Personal iOS home-screen app for intranet.tam.ch/kzn. Read `docs/index.md` first.

- Static site (`index.html`, `app.js`, `style.css`) is served by GitHub Pages from the repo root; it only talks to the Worker.
- `worker/` is a Cloudflare Worker that logs in to the intranet with secrets and returns clean JSON.
- Tests: `npm test` (Node's built-in runner, no install needed). Fixtures in `test/fixtures.js` are made up; never commit real intranet responses (grades, names).
- Never retry a failed intranet login in a loop: the intranet may start asking for a captcha.
