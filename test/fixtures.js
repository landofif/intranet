// Made-up intranet responses shaped like the real ones (no real data).

export const loginPage = `<form name="login-form" action="/kzn" method="post">
<input type="hidden" name="hash" value="abc123.456"/>
<input type="hidden" name="loginschool" value="kzn"/>
<input type="password" autocomplete="off" name="loginpassword" id="loginpassword"/>
<input type="text" id="loginuser" name="loginuser"/></form>`;

export const gradebookPage = `<html><script>var csrfToken='tok42';</script>
<script>intranet.gradebook=new Gradebook();intranet.gradebook.list.studentId=1001;</script></html>`;

// Logged-in pages may still carry a (hidden) login form, e.g. for re-login.
function listPage(grid) {
  return `<html><input type="password" autocomplete="off" name="loginpassword" id="loginpassword"/><script>$(function(){intranet.list.frontend.init({gridDataAndConfiguration:${JSON.stringify(grid)},frontend:{controller:'list',action:'index'}});});</script></html>`;
}

export const absencesPage = listPage({
  columns: [
    { field: 'Kurs_Anlass', title: 'Kurs_Anlass', width: 250 },
    { field: 'Datum', title: 'Datum' },
    { field: 'Status', title: 'Status' },
  ],
  data: {
    data: [
      {
        Kurs_Anlass: 'Mathematik {test}',
        Kurs_AnlassEscaped: 'Mathematik {test}',
        Datum: '01.09.2026',
        DatumEscaped: '01.09.2026',
        Status: 'entschuldigt "ok"',
        Absenzgruppe: 'Absenz',
      },
    ],
  },
  id: 112,
  caption: ' Listenname ',
});

export const emptyListPage = listPage({
  columns: [{ field: 'Datum', title: 'Datum' }, { field: 'Titel', title: 'Titel' }],
  data: { status: 'fail' },
  id: 1502,
});

export const lessons = [
  {
    id: 2, lessonDate: '2026-11-02', lessonStart: '09:45:00', lessonEnd: '10:30:00',
    title: 'Inf', subjectName: 'Informatik', courseName: 'Inf', roomName: '2H96',
    teacherAcronym: 'abc', timetableEntryTypeShort: 'lesson', message: null,
  },
  {
    id: 1, lessonDate: '2026-11-02', lessonStart: '07:45:00', lessonEnd: '08:30:00',
    title: 'D', subjectName: 'Deutsch', courseName: 'D', roomName: '2H96',
    teacherAcronym: 'xyz', timetableEntryTypeShort: 'cancel', message: null,
  },
];

export const periods = {
  status: 1,
  data: [
    { periodId: 84, periodName: 'Frühlingssemester 2026', current: null },
    { periodId: 85, periodName: 'Herbstsemester 2026/27', current: 1 },
  ],
};

export const courses = {
  status: 1,
  data: [{ courseId: '501', courseName: 'Mathematik, GF', courseShort: 'M' }],
};

export const gradeRows = {
  status: 1,
  data: [
    { date: '2026-09-10 00:00:00', title: 'Test 1', value: '5', gradeWeight: '1', isGradeStroked: '0' },
    { date: '2026-10-01 00:00:00', title: 'Test 2', value: '4.5', gradeWeight: '0.5', isGradeStroked: null },
    { title: 'Schnitt', value: '4.833' },
  ],
};
