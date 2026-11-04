import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractNotice,
  extractCsrf,
  extractHash,
  extractListGrid,
  extractStudentId,
  isLoginPage,
  listFromGrid,
  mapCourseGrades,
  mapTimetable,
} from '../worker/src/parse.js';
import * as fx from './fixtures.js';

test('reads login hash, csrf token and student id', () => {
  assert.equal(extractHash(fx.loginPage), 'abc123.456');
  assert.equal(extractCsrf(fx.gradebookPage), 'tok42');
  assert.equal(extractStudentId(fx.gradebookPage), '1001');
  assert.equal(extractCsrf(fx.loginPage), null);
});

test('detects the login page', () => {
  assert.equal(isLoginPage(fx.loginPage), true);
  assert.equal(isLoginPage(fx.gradebookPage), false);
});

test('extracts list grid even with braces and quotes inside strings', () => {
  const grid = extractListGrid(fx.absencesPage);
  assert.equal(grid.id, 112);
  assert.equal(grid.data.data[0].Kurs_Anlass, 'Mathematik {test}');
  assert.equal(extractListGrid('<html>no grid</html>'), null);
});

test('list keeps only the visible columns and prettifies titles', () => {
  const list = listFromGrid(extractListGrid(fx.absencesPage));
  assert.deepEqual(list.columns[0], { field: 'Kurs_Anlass', title: 'Kurs Anlass' });
  assert.deepEqual(list.rows, [
    { Kurs_Anlass: 'Mathematik {test}', Datum: '01.09.2026', Status: 'entschuldigt "ok"' },
  ]);
});

test('empty list ("status: fail") becomes no rows', () => {
  const list = listFromGrid(extractListGrid(fx.emptyListPage));
  assert.deepEqual(list.rows, []);
  assert.equal(list.columns.length, 2);
});

test('timetable is mapped and sorted by date and time', () => {
  const t = mapTimetable(fx.lessons);
  assert.deepEqual(t.map((l) => l.start), ['07:45', '09:45']);
  assert.deepEqual(t[0], {
    id: 1, date: '2026-11-02', start: '07:45', end: '08:30', short: 'D', subject: 'Deutsch',
    room: '2H96', teacher: 'xyz', type: 'cancel', message: '',
  });
});

test('course grades split grades from summary rows', () => {
  const c = mapCourseGrades(fx.gradeRows.data);
  assert.equal(c.grades.length, 2);
  assert.deepEqual(c.grades[0], { date: '2026-09-10', title: 'Test 1', value: '5', weight: '1', struck: false });
  assert.equal(c.grades[1].struck, false);
  assert.deepEqual(c.summary, [{ title: 'Schnitt', value: '4.833' }]);
  assert.equal(c.average, 4.833);
});

test('course without grades has no average', () => {
  const c = mapCourseGrades([{ title: 'Zeugnisnote', value: null, isGradeStroked: null }]);
  assert.equal(c.average, null);
  assert.deepEqual(c.grades, []);
});

const row = (value, gradeWeight = '1', isGradeStroked = '0', title = 'Test') => ({
  date: '2026-09-10 00:00:00', title, value, gradeWeight, isGradeStroked,
});
const note = (title, value) => ({ title, value });

test('the average comes from the grades, whatever summary rows the teacher adds', () => {
  assert.equal(mapCourseGrades([row('5'), row('4'), note('Schnitt 1:', '2.0')]).average, 4.5);
  assert.equal(mapCourseGrades([row('5'), row('4')]).average, 4.5);
  assert.equal(mapCourseGrades([row('5'), note('Zeugnisnote', '3.5')]).average, 5);
});

test('the average uses the weights and skips struck or missing grades', () => {
  assert.equal(mapCourseGrades([row('6', '1'), row('3', '0.2')]).average, 5.5);
  assert.equal(mapCourseGrades([row('5'), row('1', '1', '1')]).average, 5);
  assert.equal(mapCourseGrades([row('5'), row(null)]).average, 5);
  assert.equal(mapCourseGrades([row(null)]).average, null);
});

test('bonus and malus rows change the average, whatever they are called', () => {
  const grade = row('4.5');
  assert.equal(mapCourseGrades([grade, note('Mitarbeit und Beteiligung', '+0.05')]).average, 4.55);
  assert.equal(mapCourseGrades([grade, note('Teams-Aufgaben (aktueller Stand)', '0.1')]).average, 4.6);
  assert.equal(mapCourseGrades([grade, note('Mitarbeit 1 Bonus/Malus', '-0.25')]).average, 4.25);
  assert.equal(mapCourseGrades([grade, note('Malus', '−0.25')]).average, 4.25);
  assert.equal(mapCourseGrades([grade, note('Bonus', '+0.1'), note('Malus', '-0.3')]).average, 4.3);
  assert.equal(mapCourseGrades([grade, note('Bemerkung', null), note('Bemerkung', 'gut')]).average, 4.5);
});

test('the average stays on the 1 to 6 scale, and a bonus alone gives none', () => {
  assert.equal(mapCourseGrades([row('5.9'), note('Bonus', '0.25')]).average, 6);
  assert.equal(mapCourseGrades([row('1.1'), note('Malus', '-0.5')]).average, 1);
  assert.equal(mapCourseGrades([note('Bonus', '0.25')]).average, null);
});

test('a login notice skips the standing hints of the real login page', () => {
  const standing = `<noscript><div class="status-message error">
JavaScript wird ben&ouml;tigt </div></noscript>
<div id="layout-cookie-error" class="status-message error">
Cookies m&uuml;ssen aktiviert sein </div>`;
  assert.equal(extractNotice(standing), '');
  assert.equal(extractNotice(`${standing}<div class="status-message error">\n Anmeldung  fehlgeschlagen </div>`), 'Anmeldung fehlgeschlagen');
});
