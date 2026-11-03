import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
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

test('course grades split grades from summary rows and use the intranet average', () => {
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
