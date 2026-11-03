// Cloudflare Worker entry: checks the app key, routes to the intranet client
// and returns clean JSON with CORS headers for the GitHub Pages site.
import { Intranet, LoginError } from './intranet.js';
import { listFromGrid, mapCourseGrades, mapTimetable } from './parse.js';

const LISTS = { absences: 112, exams: 1503, homework: 1502 };

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization',
  'access-control-allow-methods': 'GET, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });
}

async function route(intranet, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'timetable') {
    const from = Number(url.searchParams.get('from'));
    const to = Number(url.searchParams.get('to'));
    if (!from || !to || to <= from) return json({ error: 'from and to (ms) required' }, 400);
    return json({ lessons: mapTimetable(await intranet.timetable(from, to)) });
  }
  if (parts[0] === 'grades') {
    const { period, courses, rows } = await intranet.grades();
    return json({
      period,
      courses: courses.map((c, i) => ({ name: c.courseName, short: c.courseShort, ...mapCourseGrades(rows[i]) })),
    });
  }
  if (parts[0] === 'list' && LISTS[parts[1]]) {
    return json(listFromGrid(await intranet.list(LISTS[parts[1]])));
  }
  return json({ error: 'not found' }, 404);
}

export function createHandler(fetchFn) {
  let intranet = null;
  return {
    async fetch(request, env) {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      if (!env.APP_KEY || request.headers.get('authorization') !== `Bearer ${env.APP_KEY}`) {
        return json({ error: 'unauthorized' }, 401);
      }
      intranet ??= new Intranet(env, fetchFn);
      try {
        return await route(intranet, new URL(request.url));
      } catch (e) {
        console.error(e);
        return json({ error: e.message }, e instanceof LoginError ? 502 : 500);
      }
    },
  };
}

export default createHandler();
