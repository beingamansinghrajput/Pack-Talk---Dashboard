-- ============================================================
-- Survey Dashboard — Database Schema for Supabase
-- Run this once in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- 1. PROFILES (one row per login account: you = admin, TLs = tl)
create table if not exists profiles (
  id uuid references auth.users(id) primary key,
  email text not null,
  full_name text,
  role text not null default 'tl' check (role in ('admin', 'tl')),
  created_at timestamptz default now()
);

-- Auto-create a profile row whenever someone new logs in for the first time
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'tl')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- 2. PROJECTS (one row per survey)
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  project_id text unique not null,
  project_name text not null,
  target int default 0,
  loi int default 0,
  ir int default 0,
  country text,
  launch_date date default current_date,
  status text default 'Live' check (status in ('Live', 'Paused', 'Closed')),
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- 3. RESPONSES (one row per respondent hit — the core data)
create table if not exists responses (
  id uuid default gen_random_uuid() primary key,
  project_id text not null references projects(project_id) on delete cascade,
  uid text not null,
  start_time timestamptz not null,
  end_time timestamptz,
  country text,
  screener_pass boolean not null default true,
  quota_status text not null default 'Open' check (quota_status in ('Open', 'Full')),
  completed boolean not null default false,
  status text generated always as (
    case
      when screener_pass = false then 'Terminated'
      when quota_status = 'Full' then 'QuotaFull'
      when completed = true then 'Completed'
      else 'Disqualify'
    end
  ) stored,
  duration_min numeric generated always as (
    case when end_time is not null
      then round(extract(epoch from (end_time - start_time)) / 60, 1)
      else null
    end
  ) stored,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique (project_id, uid)
);

create index if not exists idx_responses_project on responses(project_id);
create index if not exists idx_responses_status on responses(status);
create index if not exists idx_responses_start on responses(start_time);

-- ============================================================
-- ROW LEVEL SECURITY — every logged-in user can read everything;
-- only admins can manage projects; anyone logged in can add responses.
-- ============================================================

alter table profiles enable row level security;
alter table projects enable row level security;
alter table responses enable row level security;

create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- Profiles: everyone logged in can see the team list; only admin edits roles
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_admin" on profiles for update using (is_admin());

-- Projects: everyone logged in can view; only admin creates/edits/deletes
drop policy if exists "projects_select" on projects;
create policy "projects_select" on projects for select using (auth.role() = 'authenticated');

drop policy if exists "projects_insert_admin" on projects;
create policy "projects_insert_admin" on projects for insert with check (is_admin());

drop policy if exists "projects_update_admin" on projects;
create policy "projects_update_admin" on projects for update using (is_admin());

drop policy if exists "projects_delete_admin" on projects;
create policy "projects_delete_admin" on projects for delete using (is_admin());

-- Responses: everyone logged in can view + add (TLs punch in data); only admin deletes
drop policy if exists "responses_select" on responses;
create policy "responses_select" on responses for select using (auth.role() = 'authenticated');

drop policy if exists "responses_insert" on responses;
create policy "responses_insert" on responses for insert with check (auth.role() = 'authenticated');

drop policy if exists "responses_update" on responses;
create policy "responses_update" on responses for update using (auth.role() = 'authenticated');

drop policy if exists "responses_delete_admin" on responses;
create policy "responses_delete_admin" on responses for delete using (is_admin());

-- ============================================================
-- AFTER RUNNING THIS: make yourself admin.
-- 1. Sign up once through the app (creates your login + a 'tl' profile row)
-- 2. Come back here and run:
--    update profiles set role = 'admin' where email = 'YOUR_EMAIL_HERE';
-- ============================================================
