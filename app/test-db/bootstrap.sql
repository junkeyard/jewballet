-- 로컬 테스트 DB 전용: Supabase가 기본으로 깔아 두는 것 중 우리 마이그레이션이 기대는 부분만 흉내 낸다.
-- 실제 Supabase 프로젝트에서 실행하지 않는다(이미 있는 롤·스키마와 충돌한다).
--
-- 적용 순서: bootstrap.sql → supabase/001 → 003 → 004 → 005 → 006
-- (002는 요금제를 지우는 SQL이라 운영에서도 실행 금지이므로 여기서도 건너뛴다.)

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit;
grant anon, authenticated, service_role to authenticator;

-- 001의 admin_profiles가 auth.users를 참조한다(004에서 제거됨).
create schema auth;
create table auth.users (id uuid primary key);

-- Supabase 기본 권한: public 스키마 객체는 세 롤에 열려 있고, 마이그레이션이 revoke로 잠근다.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
