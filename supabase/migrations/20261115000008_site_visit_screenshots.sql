-- Every other website on screen gets its own screenshot (R16 change requested 2026-11-15 after the demo
-- run showed a claude.ai visit without one). New screenshot reason: 'site_visit'.
alter table public.screenshots drop constraint screenshots_reason_check;
alter table public.screenshots add constraint screenshots_reason_check check (reason in ('interval', 'violation', 'site_visit'));
