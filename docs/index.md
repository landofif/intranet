# kzn-intranet docs

## What it does
Opens on this week's timetable (today selected, swipe or tap days, ‹ › for weeks). Tabs for grades (intranet's own average per course), absences, exams and homework.

## Why a Worker
intranet.tam.ch sends no CORS headers, so a GitHub Pages site can't read it directly. The Worker (`worker/src/index.js`) holds the login and proxies.

## Key files
- `worker/src/index.js` – auth (`Authorization: Bearer <APP_KEY>`), routes, CORS.
- `worker/src/intranet.js` – login, session reuse, re-login on expiry, 15 min cooldown after a failed login.
- `worker/src/parse.js` – pure parsing/mapping (tested).
- `app.js` – the frontend; Worker URL + key are stored in `localStorage` (`kzn-config`).

## Worker API
| Route | Returns |
|---|---|
| `GET /timetable?from=<ms>&to=<ms>` | `{lessons:[{date,start,end,short,subject,room,teacher,type,message}]}`; `type` is `lesson`, `cancel`, `rmchg`, … |
| `GET /grades` | `{period, courses:[{name,short,grades,summary,average}]}` (current semester) |
| `GET /list/absences` · `/list/exams` · `/list/homework` | `{columns:[{field,title}], rows:[…]}` |

## Intranet endpoints used (mapped 2026-11-03)
- Login: `GET /kzn` (cookie `sturmsession` + hidden `hash`), then `POST /kzn` with `loginuser`, `loginpassword`, `loginschool=kzn`, `hash`.
- `/kzn/gradebook` page has `var csrfToken='…'` and `intranet.gradebook.list.studentId=…`.
- Timetable: `POST /kzn/timetable/ajax-get-timetable` (`startDate`, `endDate` in ms, `studentId[]`, `holidaysOnly=0`, `csrfToken`). Cancelled or room-changed lessons replace the normal entry (`timetableEntryTypeShort`).
- Grades: `ajax-get-periods` → `ajax-get-courses-for-period` (`periodId`, `view=list`) → `ajax-list-get-grades` per course. Rows without `date` are summary rows (`Schnitt`, `Zeugnisnote`).
- Lists: `/kzn/default/list/index/list/<id>` (112 absences, 1503 exams, 1502 homework) embed `gridDataAndConfiguration:{…}`; empty list = `data:{status:"fail"}`.

## Setup / deploy
1. `npm install` (gets Wrangler), `npx wrangler login`. In a shell without nvm (luna's kitty) there is no `npx`; use `./node_modules/.bin/wrangler …` instead. Wrangler hides typed secrets; to see what you type: `read -P "Wert: " v; printf '%s' $v | ./node_modules/.bin/wrangler secret put NAME --config worker/wrangler.jsonc; set -e v`.
2. In `worker/`: `npx wrangler secret put KZN_USER`, `… KZN_PASSWORD`, `… APP_KEY` (a long random string).
3. `npm run deploy` → note the `*.workers.dev` URL.
4. Push to GitHub, enable Pages (branch `main`, root). Open the Pages URL in Safari, enter Worker URL + key in ⚙, then Share → Add to Home Screen. If the home-screen app opens on settings anyway, enter them there once (it may keep its own storage).

Local dev: put the three secrets in `worker/.dev.vars` (gitignored) and run `npm run dev`.

## Gotchas
- A failed login might trigger a captcha on the intranet; the Worker waits 15 min before trying again (per isolate).
- The intranet does not block Cloudflare IPs (verified 2026-11-03).
- Logged-in HTML pages can contain a login form too, so "has `name=\"loginpassword\"`" alone does not mean the session expired; `list()` only treats it as expired when the list data is missing.
- A login error says what the intranet answered: `login 200 … login page` = wrong username/password; `login 302 …` = password accepted, a later step failed.

## Tests
`npm test`: `test/parse.test.js` (unit) and `test/worker.test.js` (integration: real handler vs fake intranet: login, shared login, session expiry, wrong-password cooldown, all routes).
