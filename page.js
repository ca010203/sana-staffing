const fmts = {int: d3.format(',.0f'), dec: d3.format(',.1f'), pct: d3.format('.0%'), spct: d3.format('+.1%'), sdec: d3.format('+,.1f')};
const monF = d3.utcFormat('%b %Y');
const monLabel = (m) => monF(new Date(m + '-01T00:00:00Z'));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const fmt = (v, f) => {
  if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) return '—';
  if (f === 'mon') return monLabel(v);
  const fn = fmts[f];
  return fn && typeof v === 'number' ? fn(v) : String(v);
};
const rowsOf = (id) => {
  const d = dash.data(id);
  return d.status === 'ok' && Array.isArray(d.data) ? d.data : null;
};
const jobNames = () => (rowsOf('jobs') || []).slice().sort((a, b) => (+a.ord || 0) - (+b.ord || 0)).map((j) => j.name);

dash.calc('staff_enriched', {
  title: 'Hours by person with job and side',
  description: 'Each month and position row from Push, with the job from the position list or a person override, and the side from the department list.',
  inputs: ['staff_month', 'job_map', 'person_job', 'venue_map'],
  fn: (staff, jobMap, personJob, venueMap) => {
    const pj = new Map(jobMap.map((r) => [r.position, r.job]));
    const ov = new Map(personJob.filter((r) => r.job).map((r) => [r.employee, r.job]));
    const vm = new Map(venueMap.map((r) => [r.department, r.venue]));
    return staff.map((r, i) => ({
      key: i, month: r.month, employee: r.employee, department: r.department, position: r.position,
      hours: +r.hours || 0, shifts: +r.shifts || 0, ot_hours: +r.ot_hours || 0, sched_hours: +r.sched_hours || 0,
      pos_job: pj.get(r.position) || 'Unassigned',
      job: ov.get(r.employee) || pj.get(r.position) || 'Unassigned',
      override: ov.get(r.employee) || '',
      venue: vm.get(r.department) || 'Shared'
    }));
  }
});

dash.calc('kpis', {
  title: 'Headline figures for the selection',
  description: 'Totals for the chosen month and side.',
  inputs: ['staff_enriched'],
  fn: (rows) => {
    const P = dash.params(); const mo = P.month || 'All'; const ve = P.venue || 'All';
    const inMonth = rows.filter((r) => mo === 'All' || r.month === mo);
    const sel = inMonth.filter((r) => ve === 'All' || r.venue === ve);
    const hours = d3.sum(sel, (r) => r.hours); const sched = d3.sum(sel, (r) => r.sched_hours); const shifts = d3.sum(sel, (r) => r.shifts);
    const people = new Set(sel.filter((r) => r.hours > 0).map((r) => r.employee)).size;
    return [{
      key: 'all', hours, people, shifts, avg_shift: shifts ? hours / shifts : null,
      ot_hours: d3.sum(sel, (r) => r.ot_hours),
      sana_hours: d3.sum(inMonth.filter((r) => r.venue === 'Sana'), (r) => r.hours),
      kitchen_hours: d3.sum(inMonth.filter((r) => r.venue === 'Kitchen'), (r) => r.hours),
      sched_hours: sched, var_pct: sched ? (hours - sched) / sched : null
    }];
  }
});

dash.calc('by_month', {
  title: 'Hours by month and side',
  description: 'Clocked and scheduled hours per month, split into Sana, Kitchen and Shared.',
  inputs: ['staff_enriched'],
  fn: (rows) => {
    return d3.rollups(rows, (v) => ({
      sana: d3.sum(v.filter((r) => r.venue === 'Sana'), (r) => r.hours),
      kitchen: d3.sum(v.filter((r) => r.venue === 'Kitchen'), (r) => r.hours),
      shared: d3.sum(v.filter((r) => r.venue === 'Shared'), (r) => r.hours),
      total: d3.sum(v, (r) => r.hours), sched: d3.sum(v, (r) => r.sched_hours)
    }), (r) => r.month).map(([m, o]) => ({key: m, month: m, ...o})).sort((a, b) => a.month < b.month ? -1 : 1);
  }
});

dash.calc('by_job', {
  title: 'Hours by job',
  description: 'Clocked and scheduled hours per job for the chosen month and side.',
  inputs: ['staff_enriched'],
  fn: (rows) => {
    const P = dash.params(); const mo = P.month || 'All'; const ve = P.venue || 'All';
    const sel = rows.filter((r) => (mo === 'All' || r.month === mo) && (ve === 'All' || r.venue === ve));
    const total = d3.sum(sel, (r) => r.hours);
    return d3.rollups(sel, (v) => {
      const hours = d3.sum(v, (r) => r.hours); const sched = d3.sum(v, (r) => r.sched_hours);
      return {
        people: new Set(v.filter((r) => r.hours > 0).map((r) => r.employee)).size,
        hours, share: total ? hours / total : null, shifts: d3.sum(v, (r) => r.shifts), ot_hours: d3.sum(v, (r) => r.ot_hours),
        sched_hours: sched, diff: hours - sched, diff_pct: sched ? (hours - sched) / sched : null
      };
    }, (r) => r.job).map(([j, o]) => ({key: j, job: j, ...o})).filter((r) => r.hours > 0 || r.sched_hours > 0).sort((a, b) => b.hours - a.hours);
  }
});

dash.calc('by_person', {
  title: 'Hours by person',
  description: 'Clocked and scheduled hours per person for the chosen month and side, with their job and side.',
  inputs: ['staff_enriched'],
  fn: (rows) => {
    const P = dash.params(); const mo = P.month || 'All'; const ve = P.venue || 'All';
    const sel = rows.filter((r) => (mo === 'All' || r.month === mo) && (ve === 'All' || r.venue === ve));
    const top = (v, k) => d3.greatest(d3.rollups(v, (a) => d3.sum(a, (r) => r.hours), (r) => r[k]), (d) => d[1])[0];
    return d3.rollups(sel, (v) => {
      const hours = d3.sum(v, (r) => r.hours); const shifts = d3.sum(v, (r) => r.shifts);
      return {
        job: top(v, 'job'), pos_job: top(v, 'pos_job'), override: v[0].override, venue: top(v, 'venue'),
        hours, shifts, avg_shift: shifts ? hours / shifts : null, ot_hours: d3.sum(v, (r) => r.ot_hours), sched_hours: d3.sum(v, (r) => r.sched_hours)
      };
    }, (r) => r.employee).map(([e, o]) => ({key: e, employee: e, ...o})).filter((r) => r.hours > 0 || r.sched_hours > 0).sort((a, b) => b.hours - a.hours);
  }
});

dash.calc('positions_tbl', {
  title: 'Push positions',
  description: 'Every Push position with its job, the people who clocked in it and its hours for the chosen month.',
  inputs: ['staff_enriched'],
  fn: (rows) => {
    const P = dash.params(); const mo = P.month || 'All';
    return d3.rollups(rows, (v) => {
      const m = v.filter((r) => mo === 'All' || r.month === mo);
      return {
        department: [...new Set(v.map((r) => r.department))].join(' / '), job: v[0].pos_job,
        people: new Set(m.filter((r) => r.hours > 0).map((r) => r.employee)).size, hours: d3.sum(m, (r) => r.hours)
      };
    }, (r) => r.position).map(([p, o]) => ({key: p, position: p, ...o})).sort((a, b) => a.department < b.department ? -1 : a.department > b.department ? 1 : b.hours - a.hours);
  }
});

dash.calc('departments_tbl', {
  title: 'Push departments',
  description: 'Every Push department with its side and its hours for the chosen month.',
  inputs: ['staff_enriched'],
  fn: (rows) => {
    const P = dash.params(); const mo = P.month || 'All';
    return d3.rollups(rows, (v) => ({
      venue: v[0].venue, hours: d3.sum(v.filter((r) => mo === 'All' || r.month === mo), (r) => r.hours)
    }), (r) => r.department).map(([d, o]) => ({key: d, department: d, ...o})).sort((a, b) => b.hours - a.hours);
  }
});

dash.calc('by_hour', {
  title: 'People on the clock by hour and job',
  description: 'Average people clocked in during each hour of the day, per job, for the chosen month and side.',
  inputs: ['hours_by_hour', 'job_map', 'venue_map'],
  fn: (hrs, jobMap, venueMap) => {
    const P = dash.params(); const mo = P.month || 'All'; const ve = P.venue || 'All';
    const pj = new Map(jobMap.map((r) => [r.position, r.job]));
    const vm = new Map(venueMap.map((r) => [r.department, r.venue]));
    const days = new Map();
    hrs.forEach((r) => days.set(r.month, Math.max(days.get(r.month) || 0, +r.days || 0)));
    const months = [...days.keys()].filter((m) => mo === 'All' || m === mo);
    const nd = d3.sum(months, (m) => days.get(m));
    const sums = new Map();
    hrs.filter((r) => months.includes(r.month) && (ve === 'All' || (vm.get(r.department) || 'Shared') === ve)).forEach((r) => {
      const job = pj.get(r.position) || 'Unassigned';
      for (let h = 0; h < 24; h++) { const k = h + '|' + job; sums.set(k, (sums.get(k) || 0) + (+r['h' + h] || 0)); }
    });
    return [...sums].map(([k, v]) => ({key: k, hour: +k.split('|')[0], job: k.slice(k.indexOf('|') + 1), people: nd ? v / nd : 0}));
  }
});

// ---------- helpers for drawings
function box(el, legend) {
  el.replaceChildren();
  const wrap = d3.select(el).append('div').attr('class', 'mb-box');
  if (legend && legend.length) {
    const lg = wrap.append('div').attr('class', 'mb-legend');
    legend.forEach((l) => { const k = lg.append('span').attr('class', 'mb-key'); k.append('i').style('background', l.color); k.append('span').text(l.label); });
  }
  return wrap;
}
function showTip(t, wrapNode, event, lines) {
  const p = d3.pointer(event, wrapNode);
  t.attr('hidden', null); t.selectAll('*').remove();
  lines.forEach((l, i) => t.append('div').style('font-weight', i ? null : '600').text(l));
  const w = t.node().offsetWidth;
  t.style('left', Math.max(0, Math.min(wrapNode.clientWidth - w, p[0] + 12)) + 'px').style('top', Math.max(0, p[1] - 8) + 'px');
}
const hourLabel = (h) => ((h % 12) || 12) + (h < 12 ? 'a' : 'p');
const short = (v) => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));

// ---------- text and controls
dash.draw('num', (el) => {
  const rows = rowsOf(el.dataset.source);
  if (!rows) { el.textContent = '—'; return; }
  const r = rows[+el.dataset.row || 0];
  el.textContent = r ? fmt(r[el.dataset.field], el.dataset.fmt) : '—';
});
dash.draw('periodname', (el) => {
  const P = dash.params();
  el.textContent = (P.month && P.month !== 'All' ? monLabel(P.month) : 'All months') + (P.venue && P.venue !== 'All' ? ' · ' + P.venue : '');
});
dash.draw('period', (sel) => {
  const rows = rowsOf('by_month') || [];
  sel.replaceChildren(new Option('All months', 'All'), ...rows.map((r) => new Option(monLabel(r.month), r.month)));
  sel.value = dash.params().month || 'All';
  sel.onchange = () => dash.setParams({month: sel.value});
});

// ---------- charts
dash.draw('chart_month', (el) => {
  const rows = rowsOf('by_month');
  if (!rows || !rows.length) { el.textContent = '—'; return; }
  const selM = dash.params().month || 'All';
  const keys = ['sana', 'kitchen', 'shared']; const names = {sana: 'Sana', kitchen: 'Kitchen', shared: 'Shared'};
  const col = (i) => dash.colors[i % dash.colors.length];
  const wrap = box(el, keys.map((k, i) => ({label: names[k], color: col(i)})));
  const W = el.clientWidth || 320; const H = 220; const m = {t: 16, r: 6, b: 22, l: 40};
  const svg = wrap.append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Clocked hours by month, stacked by Sana, Kitchen and Shared');
  const x = d3.scaleBand().domain(rows.map((r) => r.month)).range([m.l, W - m.r]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.total) * 1.08 || 1]).nice().range([H - m.b, m.t]);
  const ga = svg.append('g').attr('class', 'mb-axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(d3.format(',.0f')));
  ga.select('.domain').remove();
  svg.append('g').attr('class', 'mb-axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat((d) => d3.utcFormat('%b')(new Date(d + '-01T00:00:00Z'))).tickSize(0)).select('.domain').remove();
  const st = d3.stack().keys(keys)(rows);
  st.forEach((s, i) => svg.append('g').selectAll('rect').data(s).join('rect')
    .attr('x', (d) => x(d.data.month)).attr('width', x.bandwidth()).attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])))
    .style('fill', col(i)).style('opacity', (d) => selM === 'All' || selM === d.data.month ? 1 : 0.3));
  svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'mb-lbl').attr('text-anchor', 'middle')
    .attr('x', (d) => x(d.month) + x.bandwidth() / 2).attr('y', (d) => y(d.total) - 4).text((d) => short(d.total));
  const tip = wrap.append('div').attr('class', 'mb-tip').attr('hidden', '');
  svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (d) => x(d.month) - 2).attr('width', x.bandwidth() + 4).attr('y', m.t).attr('height', H - m.t - m.b).style('fill', 'transparent')
    .on('pointermove', (ev, d) => showTip(tip, wrap.node(), ev, [monLabel(d.month), 'Sana ' + fmt(d.sana, 'dec') + ' h', 'Kitchen ' + fmt(d.kitchen, 'dec') + ' h', 'Shared ' + fmt(d.shared, 'dec') + ' h', 'Total ' + fmt(d.total, 'dec') + ' h']))
    .style('cursor', 'pointer')
    .on('click', (ev, d) => dash.setParams({month: (dash.params().month || 'All') === d.month ? 'All' : d.month}))
    .on('pointerleave', () => tip.attr('hidden', ''));
});

dash.draw('chart_job', (el) => {
  const rows = rowsOf('by_job');
  if (!rows || !rows.length) { el.textContent = '—'; return; }
  const wrap = box(el, []);
  const W = el.clientWidth || 320; const rh = 30; const m = {t: 4, r: 74, b: 4, l: 92}; const H = rows.length * rh + m.t + m.b;
  const svg = wrap.append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Clocked hours by job');
  const y = d3.scaleBand().domain(rows.map((r) => r.job)).range([m.t, H - m.b]).padding(0.25);
  const x = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.hours) || 1]).range([m.l, W - m.r]);
  svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'mb-lbl mb-lbl-fg').attr('x', m.l - 8).attr('y', (d) => y(d.job) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text((d) => d.job);
  const tip = wrap.append('div').attr('class', 'mb-tip').attr('hidden', '');
  svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', m.l).attr('y', (d) => y(d.job)).attr('height', y.bandwidth()).attr('width', (d) => Math.max(1, x(d.hours) - m.l)).attr('rx', 3).style('fill', dash.colors[0])
    .on('pointermove', (ev, d) => showTip(tip, wrap.node(), ev, [d.job, fmt(d.hours, 'dec') + ' h, ' + fmt(d.share, 'pct'), d.people + ' people, ' + d.shifts + ' shifts']))
    .on('pointerleave', () => tip.attr('hidden', ''));
  svg.append('g').selectAll('text').data(rows).join('text').attr('class', 'mb-lbl').attr('x', (d) => x(d.hours) + 6).attr('y', (d) => y(d.job) + y.bandwidth() / 2).attr('dy', '0.35em').text((d) => fmt(d.hours, 'int') + ' h');
});

dash.draw('chart_hour', (el) => {
  const rows = rowsOf('by_hour');
  if (!rows || !rows.length) { el.textContent = '—'; return; }
  const jobTot = d3.rollups(rows, (v) => d3.sum(v, (r) => r.people), (r) => r.job).sort((a, b) => b[1] - a[1]).filter((d) => d[1] > 0.005);
  const jobs = jobTot.map((d) => d[0]);
  const col = (j) => dash.colors[jobs.indexOf(j) % dash.colors.length];
  const wrap = box(el, jobs.map((j) => ({label: j, color: col(j)})));
  const hrs = d3.range(24).map((h) => { const o = {hour: h}; jobs.forEach((j) => { o[j] = 0; }); rows.filter((r) => r.hour === h).forEach((r) => { if (r.job in o) o[r.job] = r.people; }); o.total = d3.sum(jobs, (j) => o[j]); return o; });
  const W = el.clientWidth || 320; const H = 260; const m = {t: 8, r: 6, b: 22, l: 34};
  const svg = wrap.append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Average people on the clock by hour of day, stacked by job');
  const x = d3.scaleBand().domain(d3.range(24)).range([m.l, W - m.r]).padding(0.12);
  const y = d3.scaleLinear().domain([0, d3.max(hrs, (d) => d.total) * 1.05 || 1]).nice().range([H - m.b, m.t]);
  svg.append('g').attr('class', 'mb-axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(d3.format(',.1~f'))).select('.domain').remove();
  svg.append('g').attr('class', 'mb-axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(d3.range(0, 24, 3)).tickFormat(hourLabel).tickSize(0)).select('.domain').remove();
  if (jobs.length) {
    d3.stack().keys(jobs)(hrs).forEach((s) => svg.append('g').selectAll('rect').data(s).join('rect')
      .attr('x', (d) => x(d.data.hour)).attr('width', x.bandwidth()).attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1]))).style('fill', col(s.key)));
  }
  const tip = wrap.append('div').attr('class', 'mb-tip').attr('hidden', '');
  svg.append('g').selectAll('rect').data(hrs).join('rect').attr('x', (d) => x(d.hour) - 1).attr('width', x.bandwidth() + 2).attr('y', m.t).attr('height', H - m.t - m.b).style('fill', 'transparent')
    .on('pointermove', (ev, d) => showTip(tip, wrap.node(), ev, [hourLabel(d.hour) + ' to ' + hourLabel((d.hour + 1) % 24), d3.format(',.1f')(d.total) + ' people', ...jobs.filter((j) => d[j] >= 0.05).map((j) => j + ' ' + d3.format(',.1f')(d[j]))]))
    .on('pointerleave', () => tip.attr('hidden', ''));
});

// ---------- tables
async function save(kind, id, row) {
  let ok = true;
  try {
    if (!id) throw new Error('no id');
    const db = await claude.use('db');
    await db.doc('data/staffing/' + kind + '/' + id).set(row);
  } catch (e) { ok = false; }
  document.querySelectorAll('.mb-unsaved').forEach((p) => { p.hidden = ok; });
  return ok;
}
function pick(td, current, options, blankLabel, onPick) {
  const sel = document.createElement('select');
  sel.className = 'dash-select';
  const opts = options.slice();
  if (current && !opts.includes(current)) opts.push(current);
  if (blankLabel != null) sel.appendChild(new Option(blankLabel, ''));
  opts.forEach((o) => sel.appendChild(new Option(o, o)));
  sel.value = current || '';
  sel.addEventListener('change', () => onPick(sel.value));
  td.classList.add('mb-t');
  td.appendChild(sel);
}
function fillRows(tb, custom) {
  const table = tb.closest('table');
  const d = dash.data(table.dataset.source);
  tb.replaceChildren();
  if (d.status !== 'ok' || !Array.isArray(d.data)) return;
  const ths = [...table.querySelectorAll('thead th')];
  d.data.forEach((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = encodeURIComponent(r.key);
    ths.forEach((th, i) => {
      const td = document.createElement('td');
      td.className = th.classList.contains('mb-l') ? 'mb-t' : 'mb-n';
      if (custom && custom[i]) custom[i](td, r);
      else if (th.dataset.field) td.textContent = fmt(r[th.dataset.field], th.dataset.fmt);
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}
dash.draw('rows', (el) => fillRows(el, null));
dash.draw('rows_people', (el) => fillRows(el, {
  1: (td, r) => pick(td, r.override || '', jobNames(), 'Position job (' + r.pos_job + ')', (v) => save('person_job', slug(r.employee), {employee: r.employee, job: v}))
}));
dash.draw('rows_positions', (el) => fillRows(el, {
  2: (td, r) => pick(td, r.job, jobNames(), null, (v) => save('job_map', slug(r.position), {position: r.position, job: v}))
}));
dash.draw('rows_depts', (el) => fillRows(el, {
  1: (td, r) => pick(td, r.venue, ['Sana', 'Kitchen', 'Shared'], null, (v) => save('venue_map', slug(r.department), {department: r.department, venue: v}))
}));

// ---------- listeners
const tabBtns = [...document.querySelectorAll('.mb-tab')];
function openTab(name) {
  document.querySelectorAll('[data-panel]').forEach((s) => { s.hidden = s.dataset.panel !== name; });
  tabBtns.forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle('mb-on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
  dash.setLink(name);
}
tabBtns.forEach((t) => t.addEventListener('click', () => openTab(t.dataset.tab)));
const startTab = (location.hash || '').replace('#', '');
if (tabBtns.some((t) => t.dataset.tab === startTab) && startTab !== 'overview') openTab(startTab);

const smonth = document.getElementById('table-smonth');
if (smonth) {
  smonth.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-key]');
    if (!tr) return;
    const m = decodeURIComponent(tr.dataset.key);
    dash.setParams({month: (dash.params().month || 'All') === m ? 'All' : m});
  });
}
document.querySelectorAll('.mb-venuesel').forEach((s) => s.addEventListener('change', () => dash.setParams({venue: s.value})));
dash.onData(() => {
  document.querySelectorAll('.mb-venuesel').forEach((s) => { s.value = dash.params().venue || 'All'; });
});

const addBtn = document.getElementById('mb-addjob');
const addInp = document.getElementById('mb-newjob');
if (addBtn && addInp) {
  addBtn.addEventListener('click', async () => {
    const name = addInp.value.trim();
    const id = slug(name);
    if (!id) return;
    const jobs = rowsOf('jobs') || [];
    if (jobs.some((j) => slug(j.name) === id)) { addInp.value = ''; return; }
    const ord = (d3.max(jobs, (j) => +j.ord || 0) || 0) + 1;
    if (await save('jobs', id, {name, ord})) addInp.value = '';
  });
}
