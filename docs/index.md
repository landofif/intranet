# kzn-intranet docs

## What it does
Opens on this week's timetable (today selected, swipe or tap days, ‹ › for weeks). Lessons show abbreviated subjects from `SUBJECT_SHORT` in `app.js`; a subject not listed there shows its full name. A room change makes the lesson's card yellow and a cancelled lesson's card red, with no extra label; any other lesson type shows its code as a badge. A free time of 30 min or more (`LONG_BREAK_MIN`), like lunch, leaves a gap before the next lesson. The lesson running now gets a blue tint and bar (a room change stays yellow with the bar); `markNow` updates this every minute and on reopening. Tabs for grades (average worked out per course in `worker/src/parse.js`), absences, exams and homework. ⚙ has the Worker URL + key and the theme (Automatisch follows the device, Hell, Dunkel; stored in `localStorage` as `kzn-theme`).

## Why a Worker
intranet.tam.ch sends no CORS headers, so a GitHub Pages site can't read it directly. The Worker (`worker/src/index.js`) holds the login and proxies.

## Key files
- `worker/src/index.js` – auth (`Authorization: Bearer <APP_KEY>`), routes, CORS.
- `worker/src/intranet.js` – login (follows the redirect), session reuse, re-login on expiry, 15 min cooldown after a failed login.
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
- Grades: `ajax-get-periods` → `ajax-get-courses-for-period` (`periodId`, `view=list`) → `ajax-list-get-grades` per course. Rows without `date` are summary rows the teacher adds, with free titles (seen: `Schnitt`, `Zeugnisnote`, `Mitarbeit 1 Bonus/Malus`, `Mitarbeit und Beteiligung`). So the average is never read from them: it is the weighted mean of the grades (struck or empty ones skipped) plus every summary row with a value below 1 (bonus or malus), kept between 1 and 6. A real malus has not been seen yet.
- Lists: `/kzn/default/list/index/list/<id>` (112 absences, 1503 exams, 1502 homework) embed `gridDataAndConfiguration:{…}`; empty list = `data:{status:"fail"}`.

## Setup / deploy
1. `npm install` (gets Wrangler), `npx wrangler login`. In a shell without nvm (luna's kitty) there is no `npx`; use `./node_modules/.bin/wrangler …` instead. Wrangler hides typed secrets; to see what you type: `read -P "Wert: " v; printf '%s' $v | ./node_modules/.bin/wrangler secret put NAME --config worker/wrangler.jsonc; set -e v`.
2. In `worker/`: `npx wrangler secret put KZN_USER`, `… KZN_PASSWORD`, `… APP_KEY` (a long random string).
3. `npm run deploy` → note the `*.workers.dev` URL.
4. Push to GitHub, enable Pages (branch `main`, root). Live: repo `landofif/intranet` → https://landofif.github.io/intranet/, Worker https://kzn-intranet.kzn-intranet.workers.dev. Open the Pages URL in Safari, enter Worker URL + key in ⚙, then Share → Add to Home Screen. If the home-screen app opens on settings anyway, enter them there once (it may keep its own storage).

Local dev: put the three secrets in `worker/.dev.vars` (gitignored) and run `npm run dev`.

## Gotchas
- A failed login might trigger a captcha on the intranet; the Worker waits 15 min before trying again (per isolate).
- The intranet does not block Cloudflare IPs (verified 2026-11-03).
- Logged-in HTML pages can contain a login form too, so "has `name=\"loginpassword\"`" alone does not mean the session expired; `list()` only treats it as expired when the list data is missing.
- The login's 302 redirect has to be opened before using the session. Without that, `/kzn/gradebook` sometimes answered `302 → /kzn` and the same request worked right after opening `/kzn/` (seen once, 2026-11-04). Whether opening the page or just the extra moment helps is not known, nor why it was only sometimes.
- A login error says what the intranet answered, including what the redirect page shows (`after redirect …`). What a wrong password really looks like has not been seen: the fixtures' `login 200` is made up, and `login 302` alone does not prove the password was accepted.

## Tests
`npm test`: `test/parse.test.js` (unit) and `test/worker.test.js` (integration: real handler vs fake intranet: login, shared login, session expiry, wrong-password cooldown, all routes).
