begin;

do $$
begin
  if exists (select 1 from public.entitlements limit 1) then
    raise exception 'Existing entitlements found. Plans cannot be replaced safely until current entitlements are migrated or removed.';
  end if;
end
$$;

alter table public.plans drop constraint if exists plans_plan_type_check;
alter table public.plans add constraint plans_plan_type_check check (plan_type in ('monthly', 'daily'));

delete from public.plans;

insert into public.plans (name, plan_type, monthly_limit, duration_days, price)
values
  ('매일반', 'monthly', 20, 30, 210000),
  ('혼합반 (레벨2 + 레벨1/입문반) 주3회', 'monthly', 12, 30, 190000),
  ('레벨1/입문반 주3회', 'monthly', 12, 30, 170000),
  ('레벨2 주2회', 'monthly', 8, 30, 170000),
  ('혼합반 (레벨2 + 레벨1/입문반) 주2회', 'monthly', 8, 30, 160000),
  ('레벨1/입문반 주2회', 'monthly', 8, 30, 140000),
  ('토슈즈(+파드되 특강) 주1회', 'monthly', 4, 30, 120000),
  ('일일 수강권', 'daily', 1, 1, 30000);

commit;
