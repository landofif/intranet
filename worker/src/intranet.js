// Talks to intranet.tam.ch: logs in with the stored credentials, keeps the
// session in memory while the Worker isolate lives, and re-logs in once when
// the session has expired.
import {
  extractCsrf,
  extractHash,
  extractListGrid,
  extractNotice,
  extractStudentId,
  isLoginPage,
} from './parse.js';

const BASE = 'https://intranet.tam.ch';
const SCHOOL = 'kzn';
// A failed login may make the intranet show a captcha, so after one failure
// stop trying for a while instead of hammering it with bad credentials.
const LOGIN_COOLDOWN_MS = 15 * 60 * 1000;

export class LoginError extends Error {}
class SessionExpired extends Error {
  message = 'The intranet refused the session right after logging in.';
}

const answer = (r) => `${r.status}${r.headers.get('location') ? ` → ${r.headers.get('location')}` : ''}`;

export class Intranet {
  constructor(env, fetchFn) {
    this.env = env;
    // Wrapped so the global fetch isn't called with `this` bound to the class
    // (Workers throws "Illegal invocation" for that).
    this.fetch = fetchFn ?? ((...args) => fetch(...args));
    this.session = null; // { cookies: Map, csrf, studentId }
    this.loginPromise = null;
    this.loginFailedAt = 0;
    this.loginFailure = '';
  }

  cookieHeader(cookies) {
    return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  storeCookies(cookies, res) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  async login() {
    if (Date.now() - this.loginFailedAt < LOGIN_COOLDOWN_MS) {
      throw new LoginError(`${this.loginFailure} Now waiting 15 min before the next try.`);
    }
    const cookies = new Map();
    const page = await this.fetch(`${BASE}/${SCHOOL}`, { redirect: 'manual' });
    this.storeCookies(cookies, page);
    const hash = extractHash(await page.text());
    if (!hash) throw new LoginError('Login form not found.');

    const res = await this.fetch(`${BASE}/${SCHOOL}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: this.cookieHeader(cookies),
      },
      body: new URLSearchParams({
        loginschool: SCHOOL,
        loginuser: this.env.KZN_USER,
        loginpassword: this.env.KZN_PASSWORD,
        hash,
      }),
    });
    this.storeCookies(cookies, res);
    const postHtml = await res.text();
    const redirect = res.headers.get('location') ? await this.openRedirect(res.headers.get('location'), cookies) : [];

    // The gradebook page carries both the CSRF token and the student id.
    const gb = await this.fetch(`${BASE}/${SCHOOL}/gradebook`, {
      redirect: 'manual',
      headers: { cookie: this.cookieHeader(cookies) },
    });
    const html = await gb.text();
    const csrf = extractCsrf(html);
    const studentId = extractStudentId(html);
    if (!csrf || !studentId) {
      this.loginFailedAt = Date.now();
      // Say what the intranet answered (no secrets or page content), so a
      // rejected password can be told apart from a later step going wrong.
      const detail = [`login ${answer(res)}`, ...redirect, `gradebook ${answer(gb)}`];
      if (isLoginPage(html)) detail.push('login page');
      if (/captcha/i.test(postHtml)) detail.push('captcha');
      this.loginFailure = `Login failed (${detail.join(', ')}).`;
      throw new LoginError(this.loginFailure);
    }
    this.session = { cookies, csrf, studentId };
  }

  // Opens the page the login redirects to, as a browser would: the gradebook
  // has refused the session until this happened. Returns what the page shows
  // for the error of a failed login, as the redirect itself carries no reason.
  // Stays on the intranet, as the cookies go along, and reports no text from a
  // logged-in page.
  async openRedirect(location, cookies) {
    const url = new URL(location, `${BASE}/`);
    if (url.origin !== BASE) return [];
    try {
      const page = await this.fetch(url.href, { redirect: 'manual', headers: { cookie: this.cookieHeader(cookies) } });
      this.storeCookies(cookies, page);
      const html = await page.text();
      const facts = [`after redirect ${answer(page)}`];
      if (/logout|abmelden/i.test(html)) {
        facts.push('logged in');
      } else {
        if (isLoginPage(html)) facts.push('login form');
        if (/captcha/i.test(html)) facts.push('captcha');
        const notice = extractNotice(html);
        if (notice) facts.push(`"${notice}"`);
      }
      return facts;
    } catch {
      return ['after redirect failed'];
    }
  }

  // Concurrent requests share one login instead of each starting their own.
  async ensureSession() {
    if (this.session) return this.session;
    this.loginPromise ??= this.login().finally(() => {
      this.loginPromise = null;
    });
    await this.loginPromise;
    return this.session;
  }

  async withSession(fn) {
    const session = await this.ensureSession();
    try {
      return await fn(session);
    } catch (e) {
      if (!(e instanceof SessionExpired)) throw e;
      if (this.session === session) this.session = null;
      return fn(await this.ensureSession());
    }
  }

  async request(session, path, { form, method = form ? 'POST' : 'GET' } = {}) {
    const res = await this.fetch(`${BASE}/${SCHOOL}/${path}`, {
      method,
      redirect: 'manual',
      headers: {
        cookie: this.cookieHeader(session.cookies),
        ...(path.includes('ajax-') && { 'x-requested-with': 'XMLHttpRequest' }),
        ...(form && { 'content-type': 'application/x-www-form-urlencoded' }),
      },
      body: form && new URLSearchParams(form),
    });
    // An expired session redirects to, or renders, the login page. Callers
    // check for the login page themselves: logged-in pages may contain a
    // login form too.
    if (res.status >= 300 && res.status < 400) throw new SessionExpired();
    return res.text();
  }

  async json(session, path, opts) {
    const text = await this.request(session, path, opts);
    try {
      return JSON.parse(text);
    } catch {
      throw new SessionExpired();
    }
  }

  timetable(from, to) {
    return this.withSession(async (s) => {
      const r = await this.json(s, 'timetable/ajax-get-timetable', {
        form: {
          startDate: from,
          endDate: to,
          'studentId[]': s.studentId,
          holidaysOnly: 0,
          csrfToken: s.csrf,
        },
      });
      return r.data || [];
    });
  }

  grades() {
    return this.withSession(async (s) => {
      const periods = (await this.json(s, 'gradebook/ajax-get-periods')).data;
      const period = periods.find((p) => p.current) || periods.at(-1);
      const courses =
        (await this.json(s, 'gradebook/ajax-get-courses-for-period', {
          form: { periodId: period.periodId, view: 'list' },
        })).data || [];
      const rows = await Promise.all(
        courses.map((c) =>
          this.json(s, 'gradebook/ajax-list-get-grades', {
            form: { studentId: s.studentId, courseId: c.courseId, periodId: period.periodId },
          }).then((r) => r.data || []),
        ),
      );
      return { period: period.periodName, courses, rows };
    });
  }

  list(listId) {
    return this.withSession(async (s) => {
      const html = await this.request(s, `default/list/index/list/${listId}`);
      const grid = extractListGrid(html);
      if (!grid && isLoginPage(html)) throw new SessionExpired();
      if (!grid) throw new Error(`List ${listId} not found on page.`);
      return grid;
    });
  }
}
