// Pure helpers that turn intranet.tam.ch responses into the app's JSON.
// No network here, so everything is unit-testable with fixtures.

export function extractHash(html) {
  const m = html.match(/name="hash"\s+value="([^"]+)"/);
  return m ? m[1] : null;
}

export function extractCsrf(html) {
  const m = html.match(/var csrfToken='([^']+)'/);
  return m ? m[1] : null;
}

export function extractStudentId(html) {
  const m = html.match(/intranet\.gradebook\.list\.studentId=(\d+);/);
  return m ? m[1] : null;
}

export function isLoginPage(text) {
  return text.includes('name="loginpassword"');
}

// List pages (absences, exams, homework) embed their grid as a JS object
// literal: `gridDataAndConfiguration:{...}`. The object itself is valid JSON,
// so find its matching closing brace and parse it.
export function extractListGrid(html) {
  const key = 'gridDataAndConfiguration:';
  const i = html.indexOf(key);
  if (i < 0) return null;
  const start = i + key.length;
  let depth = 0;
  let inString = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inString) {
      if (ch === '\\') j++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(html.slice(start, j + 1));
  }
  return null;
}

// An empty list comes back as `data: {status: "fail"}` instead of `data: {data: []}`.
export function listFromGrid(grid) {
  const columns = grid.columns.map((c) => ({ field: c.field, title: c.title.replace(/_/g, ' ') }));
  const rows = (grid.data?.data || []).map((row) =>
    Object.fromEntries(columns.map((c) => [c.field, row[c.field] ?? ''])),
  );
  return { columns, rows };
}

// type is the intranet's short code: "lesson", "cancel", "rmchg", ...
export function mapLesson(l) {
  return {
    id: l.id,
    date: l.lessonDate,
    start: l.lessonStart.slice(0, 5),
    end: l.lessonEnd.slice(0, 5),
    short: l.title,
    subject: l.subjectName || l.courseName || l.title,
    room: l.roomName || '',
    teacher: l.teacherAcronym || '',
    type: l.timetableEntryTypeShort,
    message: l.message || '',
  };
}

export function mapTimetable(lessons) {
  return lessons
    .map(mapLesson)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

// A course's rows are its grades plus trailing summary rows without a date,
// e.g. "Schnitt" (the intranet's own average) and "Zeugnisnote".
export function mapCourseGrades(rows) {
  const grades = [];
  const summary = [];
  for (const g of rows) {
    if (g.date === undefined) {
      summary.push({ title: g.title, value: g.value });
    } else {
      grades.push({
        date: g.date.slice(0, 10),
        title: g.title,
        value: g.value,
        weight: g.gradeWeight,
        struck: !!g.isGradeStroked && g.isGradeStroked !== '0',
      });
    }
  }
  const avg = summary.find((s) => s.title === 'Schnitt')?.value;
  return { grades, summary, average: avg == null ? null : parseFloat(avg) };
}
