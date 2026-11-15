-- 2026-11-15 feedback: every tab switch gets its own screenshot, taken once the new tab is on screen
-- (the warning screenshot had been grabbed before the switch was drawn). New screenshot reason: 'tab_switch'.
alter table public.screenshots drop constraint screenshots_reason_check;
alter table public.screenshots add constraint screenshots_reason_check check (reason in ('interval', 'violation', 'site_visit', 'tab_switch'));
