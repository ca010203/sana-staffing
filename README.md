# Sana Staffing + Labour

Source for the "Sana Staffing + Labour" dashboard, a Claude Data artifact.

- `index.html`, `page.js`: the page (tabs, charts, tables, calcs).
- `datasets.json`: dataset documents (`dash/meta`, `dash/params`, `datasets/*`).
- `seed.json`: starting jobs, position-to-job map and department-to-side map.
- `run_report.js`: read-only console helper that runs Push Operations reports.
- `data/` is git-ignored. It holds `staff_month.json` and `hours_by_hour.json`, which contain employee names.

## Data shapes

`staff_month.json`: `{month, employee, department, position, hours, shifts, ot_hours, sched_hours, sched_shifts}` per employee, position and month (`YYYY-MM`).

`hours_by_hour.json`: `{month, department, position, days, h0..h23}`, clocked hours falling in each hour of the day.

## Rebuild

1. Create a Data artifact and write `datasets.json` entries, with the two data files uploaded and their `/_blob/` urls filled in.
2. Seed `data/staffing/{jobs,job_map,venue_map}/<slug>` from `seed.json`. The slug is the lowercased name with non-alphanumerics collapsed to `-`.
3. Write `index.html` to `files/index.html` and `page.js` to `files/page.js`.

Sana is the Wellness department, Kitchen is FOH, BOH and BOH Salary, Management is Shared. Hours are after breaks. Dollar figures are estimates: hours times hourly rates typed per job on the Jobs tab (`data/staffing/job_rate`), since Push's labour reports are hours only. Percent of sales and of service use Sana's Trybe net and day-pass sales (`data/sales_month.json`, git-ignored with the other data files).
