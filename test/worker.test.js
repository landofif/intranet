// Integration test: the real Worker handler against a fake intranet.tam.ch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../worker/src/index.js';
import * as fx from './fixtures.js';

const env = { KZN_USER: 'me', KZN_PASSWORD: 'right', APP_KEY: 'k' };

function fakeIntranet() {
  const state = { logins: 0, loginPosts: [], validSession: null, counter: 0 };
  const loginRedirect = () =>
    new Response(fx.loginPage, { status: 200, headers: { 'set-cookie': 'sturmsession=anon; path=/' } });

  async function fetchFn(url, init = {}) {
    const { pathname } = new URL(url);
    const cookie = init.headers?.cookie || '';
    const authed = state.validSession && cookie.includes(`sturmsession=${state.validSession}`);
    const body = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : {};

    if (pathname === '/kzn' && init.method !== 'POST') return loginRedirect();
    if (pathname === '/kzn' && init.method === 'POST') {
      state.loginPosts.push(body);
      if (body.loginpassword !== 'right' || body.hash !== 'abc123.456' || !cookie.includes('sturmsession=anon')) {
        return new Response(fx.loginPage);
      }
      state.logins++;
      state.validSession = `s${++state.counter}`;
      return new Response(null, {
        status: 302,
        headers: { location: '/kzn/', 'set-cookie': `sturmsession=${state.validSession}; path=/; HttpOnly` },
      });
    }
    if (!authed) return loginRedirect();

    if (pathname === '/kzn/gradebook') return new Response(fx.gradebookPage);
    if (pathname === '/kzn/timetable/ajax-get-timetable') {
      assert.equal(body.csrfToken, 'tok42');
      assert.equal(body['studentId[]'], '1001');
      return Response.json({ status: 1, data: fx.lessons });
    }
    if (pathname === '/kzn/gradebook/ajax-get-periods') return Response.json(fx.periods);
    if (pathname === '/kzn/gradebook/ajax-get-courses-for-period') {
      assert.equal(body.periodId, '85');
      return Response.json(fx.courses);
    }
    if (pathname === '/kzn/gradebook/ajax-list-get-grades') return Response.json(fx.gradeRows);
    if (pathname === '/kzn/default/list/index/list/112') return new Response(fx.absencesPage);
    if (pathname === '/kzn/default/list/index/list/1502') return new Response(fx.emptyListPage);
    return new Response('not found', { status: 404 });
  }
  return { state, fetchFn };
}

const get = (handler, path, e = env, key = 'k') =>
  handler.fetch(new Request(`https://w.example${path}`, { headers: { authorization: `Bearer ${key}` } }), e);

test('rejects requests without the app key', async () => {
  const { fetchFn, state } = fakeIntranet();
  const res = await get(createHandler(fetchFn), '/timetable?from=1&to=2', env, 'wrong');
  assert.equal(res.status, 401);
  assert.equal(state.loginPosts.length, 0);
});

test('logs in once and serves timetable, grades and lists', async () => {
  const { fetchFn, state } = fakeIntranet();
  const h = createHandler(fetchFn);

  const [t1, t2] = await Promise.all([get(h, '/timetable?from=1&to=2'), get(h, '/timetable?from=1&to=2')]);
  assert.equal(t1.headers.get('access-control-allow-origin'), '*');
  const tt = await t1.json();
  assert.deepEqual(tt.lessons.map((l) => [l.start, l.type]), [['07:45', 'cancel'], ['09:45', 'lesson']]);
  assert.equal((await t2.json()).lessons.length, 2);
  assert.equal(state.logins, 1, 'parallel requests share one login');
  assert.deepEqual(state.loginPosts[0], { loginschool: 'kzn', loginuser: 'me', loginpassword: 'right', hash: 'abc123.456' });

  const grades = await (await get(h, '/grades')).json();
  assert.equal(grades.period, 'Herbstsemester 2026/27');
  assert.equal(grades.courses[0].name, 'Mathematik, GF');
  assert.equal(grades.courses[0].average, 4.833);
  assert.equal(grades.courses[0].grades.length, 2);

  const abs = await (await get(h, '/list/absences')).json();
  assert.equal(abs.rows[0].Status, 'entschuldigt "ok"');
  const hw = await (await get(h, '/list/homework')).json();
  assert.deepEqual(hw.rows, []);

  assert.equal((await get(h, '/list/nope')).status, 404);
  assert.equal((await get(h, '/timetable')).status, 400);
  assert.equal(state.logins, 1);
});

test('logs in again when the session expires', async () => {
  const { fetchFn, state } = fakeIntranet();
  const h = createHandler(fetchFn);
  assert.equal((await get(h, '/list/absences')).status, 200);
  state.validSession = 'server-forgot-it';
  const res = await get(h, '/list/absences');
  assert.equal(res.status, 200);
  assert.equal(state.logins, 2);
});

test('wrong password fails once, then stops trying', async () => {
  const { fetchFn, state } = fakeIntranet();
  const h = createHandler(fetchFn);
  const bad = { ...env, KZN_PASSWORD: 'wrong' };
  const res = await get(h, '/timetable?from=1&to=2', bad);
  assert.equal(res.status, 502);
  // The error says what the intranet answered, so a real failure can be told
  // apart: rejected password (login 200) vs. a step after login going wrong.
  assert.match((await res.json()).error, /Login failed \(login 200, gradebook 200, login page\)/);
  const again = await get(h, '/timetable?from=1&to=2', bad);
  assert.equal(again.status, 502);
  // While waiting, the error still says why the login failed.
  assert.match((await again.json()).error, /login 200, gradebook 200, login page.*waiting/);
  assert.equal(state.loginPosts.length, 1, 'no second login attempt during cooldown');
});
