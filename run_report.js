// Read-only Push Operations report runner.
// Paste into the console of https://app-elb.pushoperations.com/analytics/reports (signed in).
// It posts the same form the Reports page posts and parses the one <table> in the reply.
// It does not edit schedules, employees, clocks, payroll or settings.
//
//   const rows = await runReport('<report-type value>', '2026-01-01', '2026-01-31');
//
// Clock report columns: First Name, Last Name, Employee Number, Clock ID, Position, Department,
//   Date In, Time In, Date Out, Time Out, Status, Total, Break, Total Less Break, Regular,
//   Overtime, Doubletime, Overtime Weekly, Statutory Holiday Work, comments.
// Schedule report: Position, Department, Preset, Tag, Date In ... Total Less Break (idx 13 = scheduled hours),
//   Clock Approved Hours (idx 19), Total Less Break (idx 21 = clocked), Hours Variance (idx 22).
// Drop the "TOTALS:" summary rows (blank Position) before summing.
window.runReport = async (type, start, end) => {
  const f = document.querySelector('#reports-form');
  f.querySelector('[name=report-type]').value = type;
  f.querySelector('[name=start-date]').value = start;
  f.querySelector('[name=end-date]').value = end;
  const r = await fetch(f.action, {method: 'POST', body: new FormData(f), credentials: 'include'});
  const t = await r.text();
  const d = new DOMParser().parseFromString(t, 'text/html');
  const tb = d.querySelector('table');
  if (!tb) return {status: r.status, rows: null, len: t.length};
  return {status: r.status, rows: [...tb.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()))};
};
