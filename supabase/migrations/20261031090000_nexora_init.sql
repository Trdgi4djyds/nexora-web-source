-- =====================================================================================================
-- NEXORA SaaS — schéma complet (PostgreSQL / Supabase)
-- Comptes, profils, équipes, invitations, projets, documents NEX-DESIGN, Studio, ressources, commentaires,
-- supervision (cron + pg_net), audits de sécurité, notifications, support, annonces, drapeaux de
-- fonctionnalités, offres et abonnements, usage, configuration, journal d'audit, partage public.
-- Sécurité : RLS sur toutes les tables, fonctions SECURITY DEFINER à search_path vide, colonnes sensibles
-- protégées par déclencheurs. Temps réel : publication supabase_realtime. Stockage : 4 compartiments.
-- Le script est idempotent (peut être relancé sans casser les données).
-- =====================================================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Fonctions d'aide aux règles d'accès : dans un schéma privé, jamais exposé par l'API (recommandation Supabase).
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;
do $$
declare f text;
begin
  foreach f in array array['is_admin()', 'is_superadmin()', 'is_active_user()', 'org_role(uuid)', 'is_org_member(uuid)', 'can_edit_org(uuid)', 'can_manage_org(uuid)',
                           'shares_org_with(uuid)', 'org_plan(uuid)', 'config_value(text)', 'storage_org(text)'] loop
    execute format('drop function if exists public.%s cascade', f);
  end loop;
end $$;

-- ----------------------------------------------------------------------------------------------- types
do $$ begin create type public.app_role as enum ('user', 'admin', 'superadmin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.member_role as enum ('owner', 'admin', 'editor', 'viewer'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ticket_status as enum ('open', 'pending', 'resolved', 'closed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ticket_priority as enum ('low', 'normal', 'high', 'urgent'); exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------------------------- utilitaires
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ----------------------------------------------------------------------------------------------- offres
create table if not exists public.plans (
  id text primary key,
  name text not null,
  description text not null default '',
  price_month_cents integer not null default 0 check (price_month_cents >= 0),
  price_year_cents integer not null default 0 check (price_year_cents >= 0),
  currency text not null default 'EUR',
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '[]'::jsonb,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.plans (id, name, description, price_month_cents, price_year_cents, currency, limits, features, sort) values
  ('free', 'Gratuit', 'Pour découvrir NEXORA', 0, 0, 'EUR', '{"projects":3,"members":1,"designs":10,"storage_mb":200,"monitors":1,"scans_per_day":3}', '["Responsive Lab","NEX-DESIGN","Studio 3D","1 moniteur"]', 1),
  ('pro', 'Pro', 'Pour les créateurs et freelances', 900, 9000, 'EUR', '{"projects":50,"members":3,"designs":500,"storage_mb":10240,"monitors":20,"scans_per_day":100}', '["Tout le Gratuit","Exports 4K","Supervision toutes les minutes","Partage public"]', 2),
  ('team', 'Équipe', 'Pour les agences et équipes produit', 2900, 29000, 'EUR', '{"projects":500,"members":25,"designs":5000,"storage_mb":102400,"monitors":100,"scans_per_day":1000}', '["Tout le Pro","Collaboration temps réel","Rôles et invitations","Support prioritaire"]', 3),
  ('enterprise', 'Entreprise', 'Volume, sécurité et accompagnement', 0, 0, 'EUR', '{"projects":-1,"members":-1,"designs":-1,"storage_mb":-1,"monitors":-1,"scans_per_day":-1}', '["Illimité","SSO sur demande","Contrat et facturation dédiés"]', 4)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------------------------- profils
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  avatar_url text,
  app_role public.app_role not null default 'user',
  status text not null default 'active' check (status in ('active', 'suspended')),
  locale text not null default 'fr',
  timezone text not null default 'Africa/Porto-Novo',
  company text,
  job_title text,
  onboarding_done boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.profiles (lower(email));

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('web', 'windows', 'macos', 'linux')),
  name text not null default '',
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists devices_user_idx on public.devices (user_id);

-- ----------------------------------------------------------------------------------------------- équipes
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text unique,
  logo_url text,
  personal boolean not null default false,
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on public.organization_members (user_id);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.member_role not null default 'editor' check (role <> 'owner'),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);
create index if not exists invitations_org_idx on public.invitations (org_id);
create index if not exists invitations_email_idx on public.invitations (lower(email));

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations (id) on delete cascade,
  plan_id text not null default 'free' references public.plans (id),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled')),
  seats integer not null default 1 check (seats >= 1),
  current_period_end timestamptz,
  provider text not null default 'manual',
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------------------------- contenus
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  url text,
  kind text not null default 'site' check (kind in ('site', 'folder', 'app')),
  description text not null default '',
  color text,
  favicon text,
  settings jsonb not null default '{}'::jsonb,
  pinned boolean not null default false,
  archived boolean not null default false,
  local_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_org_idx on public.projects (org_id);
drop index if exists public.projects_local_key_idx;
create unique index if not exists projects_org_local_key on public.projects (org_id, local_key);

create table if not exists public.device_boards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  name text not null default 'Planche',
  devices jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists device_boards_org_idx on public.device_boards (org_id);

create table if not exists public.design_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null default 'Sans titre' check (char_length(name) between 1 and 160),
  pages_count integer not null default 1,
  thumb text,
  storage_path text,
  size_bytes bigint not null default 0,
  version integer not null default 1,
  local_id text,
  updated_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists design_documents_org_idx on public.design_documents (org_id);
drop index if exists public.design_documents_local_idx;
create unique index if not exists design_documents_org_local_id on public.design_documents (org_id, local_id);

create table if not exists public.studio_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  owner_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('scene', 'mockup', 'deck', 'pose')),
  name text not null default 'Sans titre',
  thumb text,
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_items_org_idx on public.studio_items (org_id);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  bucket text not null default 'assets',
  path text not null,
  name text not null default '',
  mime text,
  size_bytes bigint not null default 0,
  kind text not null default 'file' check (kind in ('image', 'video', 'model', 'font', 'export', 'file')),
  created_at timestamptz not null default now(),
  unique (bucket, path)
);
create index if not exists assets_org_idx on public.assets (org_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  target_type text not null check (target_type in ('project', 'design', 'studio')),
  target_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  page_id text,
  x numeric,
  y numeric,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists comments_target_idx on public.comments (target_type, target_id);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  target_type text not null check (target_type in ('design', 'studio', 'project')),
  target_id uuid not null,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists share_links_org_idx on public.share_links (org_id);

-- ----------------------------------------------------------------------------------------------- supervision et sécurité
create table if not exists public.monitors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  name text not null default '',
  url text not null check (url ~* '^https?://'),
  interval_minutes integer not null default 5 check (interval_minutes between 1 and 1440),
  expected_status integer not null default 200,
  keyword text,
  active boolean not null default true,
  last_status text not null default 'unknown' check (last_status in ('up', 'down', 'unknown')),
  last_checked_at timestamptz,
  last_latency_ms integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists monitors_org_idx on public.monitors (org_id);

create table if not exists public.monitor_checks (
  id bigint generated always as identity primary key,
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  status_code integer,
  ok boolean not null,
  latency_ms integer,
  error text,
  checked_at timestamptz not null default now()
);
create index if not exists monitor_checks_monitor_idx on public.monitor_checks (monitor_id, checked_at desc);

create table if not exists public.monitor_requests (
  request_id bigint primary key,
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  started_at timestamptz not null default now()
);

create table if not exists public.security_scans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  url text not null,
  score integer check (score between 0 and 100),
  grade text,
  findings jsonb not null default '[]'::jsonb,
  headers jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists security_scans_org_idx on public.security_scans (org_id, created_at desc);

-- ----------------------------------------------------------------------------------------------- communication
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'info',
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  level text not null default 'info' check (level in ('info', 'success', 'warning', 'critical')),
  audience text not null default 'all' check (audience in ('all', 'free', 'pro', 'team', 'enterprise', 'admins')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete set null,
  subject text not null check (char_length(subject) between 3 and 200),
  category text not null default 'question' check (category in ('question', 'bug', 'billing', 'feature', 'account', 'other')),
  status public.ticket_status not null default 'open',
  priority public.ticket_priority not null default 'normal',
  assigned_to uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id);
create index if not exists support_tickets_status_idx on public.support_tickets (status, updated_at desc);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 8000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);

-- ----------------------------------------------------------------------------------------------- pilotage
create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  description text not null default '',
  enabled boolean not null default true,
  rollout integer not null default 100 check (rollout between 0 and 100),
  plans text[] not null default '{}',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, description, enabled) values
  ('design', 'Espace NEX-DESIGN (design 2D et calques 3D)', true),
  ('studio', '3D & Motion Studio (scènes, maquettes, présentations)', true),
  ('responsive', 'Responsive Lab dans le navigateur', true),
  ('security', 'Audit de sécurité des sites', true),
  ('monitors', 'Supervision des sites (disponibilité)', true),
  ('realtime_presence', 'Présence et collaboration en temps réel', true),
  ('public_share', 'Liens de partage publics', true),
  ('desktop_sync', 'Synchronisation avec l’application Windows', true),
  ('ai_assistant', 'Assistant IA', true)
on conflict (key) do nothing;

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value, description) values
  ('signups_enabled', 'true', 'Les nouvelles inscriptions sont ouvertes'),
  ('maintenance', '{"enabled": false, "message": "NEXORA est en maintenance, merci de revenir dans quelques minutes."}', 'Mode maintenance (bandeau et lecture seule)'),
  ('default_plan', '"free"', 'Offre attribuée aux nouveaux espaces'),
  ('support_email', '""', 'Adresse affichée pour le support'),
  ('desktop_download_url', '""', 'Lien de téléchargement de l’application Windows')
on conflict (key) do nothing;

create table if not exists public.usage_daily (
  org_id uuid not null references public.organizations (id) on delete cascade,
  day date not null default current_date,
  metric text not null,
  value bigint not null default 0,
  primary key (org_id, day, metric)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  org_id uuid,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_org_idx on public.audit_logs (org_id, created_at desc);

-- ----------------------------------------------------------------------------------------------- fonctions de contrôle d'accès
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.app_role in ('admin', 'superadmin') and p.status = 'active');
$$;

create or replace function private.is_superadmin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.app_role = 'superadmin' and p.status = 'active');
$$;

create or replace function private.is_active_user() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active');
$$;

create or replace function private.org_role(org uuid) returns public.member_role language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_members m where m.org_id = org and m.user_id = (select auth.uid());
$$;

create or replace function private.is_org_member(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m where m.org_id = org and m.user_id = (select auth.uid()));
$$;

create or replace function private.can_edit_org(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
    where m.org_id = org and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin', 'editor') and p.status = 'active');
$$;

create or replace function private.can_manage_org(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m where m.org_id = org and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin'));
$$;

create or replace function private.shares_org_with(other uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members a join public.organization_members b on a.org_id = b.org_id
    where a.user_id = (select auth.uid()) and b.user_id = other);
$$;

create or replace function private.org_plan(org uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select s.plan_id from public.subscriptions s where s.org_id = org and s.status in ('active', 'trialing')), 'free');
$$;

create or replace function private.config_value(k text) returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.app_config where key = k;
$$;

-- ----------------------------------------------------------------------------------------------- création d'un compte
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  first_user boolean;
  display text;
  new_org uuid;
begin
  first_user := not exists (select 1 from public.profiles);
  if not first_user and coalesce((select value from public.app_config where key = 'signups_enabled'), 'true'::jsonb) = 'false'::jsonb then
    raise exception 'Les inscriptions sont fermées pour le moment.';
  end if;
  display := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1), 'Utilisateur');
  insert into public.profiles (id, email, full_name, avatar_url, app_role)
  values (new.id, new.email, display, new.raw_user_meta_data ->> 'avatar_url', case when first_user then 'superadmin'::public.app_role else 'user'::public.app_role end)
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  -- Espace personnel, avec son offre.
  insert into public.organizations (name, slug, personal, owner_id)
  values ('Espace de ' || display, 'u-' || substr(replace(new.id::text, '-', ''), 1, 12), true, new.id)
  returning id into new_org;
  insert into public.organization_members (org_id, user_id, role) values (new_org, new.id, 'owner') on conflict do nothing;
  insert into public.subscriptions (org_id, plan_id)
  values (new_org, coalesce((select value #>> '{}' from public.app_config where key = 'default_plan'), 'free'))
  on conflict (org_id) do update set plan_id = excluded.plan_id;
  insert into public.notifications (user_id, kind, title, body, link)
  values (new.id, 'welcome', 'Bienvenue sur NEXORA', 'Ton espace est prêt : ouvre un site, crée un design ou une scène 3D.', '#/');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Adresse e-mail modifiée dans Auth : on la recopie dans le profil.
create or replace function public.handle_user_email_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then update public.profiles set email = new.email where id = new.id; end if;
  return new;
end $$;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users for each row execute function public.handle_user_email_change();

-- Un utilisateur ne peut pas changer son propre rôle ni son statut.
create or replace function public.protect_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_admin() then
    new.app_role := old.app_role;
    new.status := old.status;
    new.email := old.email;
  end if;
  -- Seul un super-administrateur nomme ou retire un super-administrateur.
  if new.app_role is distinct from old.app_role and (new.app_role = 'superadmin' or old.app_role = 'superadmin')
     and (select auth.uid()) is not null and not private.is_superadmin() then
    raise exception 'Seul un super-administrateur peut modifier ce rôle.';
  end if;
  if old.app_role = 'superadmin' and new.app_role <> 'superadmin'
     and (select count(*) from public.profiles where app_role = 'superadmin' and status = 'active') <= 1 then
    raise exception 'Il doit rester au moins un super-administrateur.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles for each row execute function public.protect_profile();

-- Il reste toujours un propriétaire dans chaque équipe.
create or replace function public.protect_last_owner() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'DELETE' and old.role = 'owner') or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if exists (select 1 from public.organizations o where o.id = old.org_id)
       and (select count(*) from public.organization_members m where m.org_id = old.org_id and m.role = 'owner') <= 1 then
      raise exception 'Une équipe doit garder au moins un propriétaire.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists org_members_last_owner on public.organization_members;
create trigger org_members_last_owner before update or delete on public.organization_members for each row execute function public.protect_last_owner();

-- Le créateur d'une équipe en devient propriétaire, avec l'offre gratuite.
create or replace function public.handle_new_org() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is not null and not exists (select 1 from public.organization_members where org_id = new.id and user_id = new.owner_id) then
    insert into public.organization_members (org_id, user_id, role) values (new.id, new.owner_id, 'owner');
  end if;
  insert into public.subscriptions (org_id, plan_id) values (new.id, 'free') on conflict (org_id) do nothing;
  return new;
end $$;
drop trigger if exists organizations_after_insert on public.organizations;
create trigger organizations_after_insert after insert on public.organizations for each row execute function public.handle_new_org();

create or replace function public.org_defaults() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is null then new.owner_id := (select auth.uid()); end if;
  if new.slug is null then new.slug := lower(regexp_replace(new.name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6); end if;
  return new;
end $$;
drop trigger if exists organizations_defaults on public.organizations;
create trigger organizations_defaults before insert on public.organizations for each row execute function public.org_defaults();

-- Propriétaire / auteur rempli automatiquement.
create or replace function public.fill_owner() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name in ('projects', 'design_documents', 'studio_items', 'assets') and new.owner_id is null then new.owner_id := (select auth.uid()); end if;
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------------------------------- journal d'audit
create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb;
  org uuid;
  ident text;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  org := nullif(coalesce(rec ->> 'org_id', case when tg_table_name = 'organizations' then rec ->> 'id' end), '')::uuid;
  ident := coalesce(rec ->> 'id', rec ->> 'key', rec ->> 'user_id');
  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, meta)
  values (org, (select auth.uid()), lower(tg_op), tg_table_name, ident,
          jsonb_strip_nulls(jsonb_build_object('name', rec ->> 'name', 'title', rec ->> 'title', 'role', rec ->> 'role', 'status', rec ->> 'status', 'plan', rec ->> 'plan_id', 'app_role', rec ->> 'app_role')));
  return null;
end $$;

-- ----------------------------------------------------------------------------------------------- déclencheurs communs
do $$
declare t text;
begin
  foreach t in array array['plans', 'profiles', 'organizations', 'subscriptions', 'projects', 'device_boards', 'design_documents', 'studio_items', 'comments', 'monitors', 'announcements', 'support_tickets', 'feature_flags', 'app_config', 'user_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
  foreach t in array array['projects', 'design_documents', 'studio_items', 'assets'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_owner', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.fill_owner()', t || '_owner', t);
  end loop;
  foreach t in array array['organizations', 'organization_members', 'invitations', 'subscriptions', 'projects', 'design_documents', 'studio_items', 'monitors', 'share_links', 'support_tickets', 'announcements', 'feature_flags', 'app_config', 'plans'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- Changement de rôle ou de statut d'un utilisateur : tracé aussi.
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after update of app_role, status on public.profiles for each row execute function public.audit_row();

-- Version des documents incrémentée à chaque enregistrement (les autres sessions savent qu'il faut recharger).
create or replace function public.bump_version() returns trigger language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_by := (select auth.uid());
  return new;
end $$;
drop trigger if exists design_documents_version on public.design_documents;
create trigger design_documents_version before update on public.design_documents for each row
  when (new.storage_path is distinct from old.storage_path or new.size_bytes is distinct from old.size_bytes or new.name is distinct from old.name or new.thumb is distinct from old.thumb)
  execute function public.bump_version();
drop trigger if exists studio_items_version on public.studio_items;
create trigger studio_items_version before update on public.studio_items for each row when (new.data is distinct from old.data) execute function public.bump_version();

-- Tickets : date de clôture, notifications aux parties.
create or replace function public.ticket_status_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then new.closed_at := now(); end if;
  if new.status in ('open', 'pending') then new.closed_at := null; end if;
  -- Seul le support change la priorité et l'assignation.
  if not private.is_admin() then
    new.priority := old.priority;
    new.assigned_to := old.assigned_to;
    if new.status not in ('open', 'closed') then new.status := old.status; end if;
  end if;
  return new;
end $$;
drop trigger if exists support_tickets_status on public.support_tickets;
create trigger support_tickets_status before update on public.support_tickets for each row execute function public.ticket_status_change();

create or replace function public.ticket_message_notify() returns trigger language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  select * into t from public.support_tickets where id = new.ticket_id;
  update public.support_tickets set updated_at = now(),
    status = case when private.is_admin() and new.author_id <> t.user_id and t.status = 'open' then 'pending'::public.ticket_status
                  when new.author_id = t.user_id and t.status in ('pending', 'resolved') then 'open'::public.ticket_status else t.status end
  where id = new.ticket_id;
  if new.internal then return new; end if;
  if new.author_id is distinct from t.user_id then
    insert into public.notifications (user_id, kind, title, body, link)
    values (t.user_id, 'support', 'Réponse du support : ' || t.subject, left(new.body, 180), '#/support/' || t.id);
  else
    insert into public.notifications (user_id, kind, title, body, link)
    select p.id, 'support', 'Ticket : ' || t.subject, left(new.body, 180), '#/admin/support/' || t.id
    from public.profiles p where p.app_role in ('admin', 'superadmin') and p.status = 'active'
      and (t.assigned_to is null or p.id = t.assigned_to);
  end if;
  return new;
end $$;
drop trigger if exists ticket_messages_notify on public.ticket_messages;
create trigger ticket_messages_notify after insert on public.ticket_messages for each row execute function public.ticket_message_notify();

-- Commentaires : les membres de l'équipe sont prévenus.
create or replace function public.comment_notify() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, 'comment', 'Nouveau commentaire', left(new.body, 180), '#/' || new.target_type || '/' || new.target_id
  from public.organization_members m where m.org_id = new.org_id and m.user_id is distinct from new.author_id;
  return new;
end $$;
drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments for each row execute function public.comment_notify();

-- ----------------------------------------------------------------------------------------------- RLS
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.devices enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.projects enable row level security;
alter table public.device_boards enable row level security;
alter table public.design_documents enable row level security;
alter table public.studio_items enable row level security;
alter table public.assets enable row level security;
alter table public.comments enable row level security;
alter table public.share_links enable row level security;
alter table public.monitors enable row level security;
alter table public.monitor_checks enable row level security;
alter table public.monitor_requests enable row level security;
alter table public.security_scans enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.feature_flags enable row level security;
alter table public.app_config enable row level security;
alter table public.usage_daily enable row level security;
alter table public.audit_logs enable row level security;

-- Les politiques sont recréées à chaque exécution.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Offres : lisibles par tous (page de tarifs), modifiées par les admins.
create policy plans_read on public.plans for select using (active or private.is_admin());
create policy plans_admin on public.plans for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Profils : soi-même, les coéquipiers, et les admins.
create policy profiles_read on public.profiles for select to authenticated using (id = (select auth.uid()) or private.shares_org_with(id) or private.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_update_admin on public.profiles for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy user_settings_own on public.user_settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy devices_own on public.devices for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy devices_admin on public.devices for select to authenticated using (private.is_admin());

-- Équipes.
create policy orgs_read on public.organizations for select to authenticated using (private.is_org_member(id) or owner_id = (select auth.uid()) or private.is_admin());
create policy orgs_insert on public.organizations for insert to authenticated with check (private.is_active_user() and (owner_id is null or owner_id = (select auth.uid())) and not personal);
create policy orgs_update on public.organizations for update to authenticated using (private.can_manage_org(id) or private.is_admin()) with check (private.can_manage_org(id) or private.is_admin());
create policy orgs_delete on public.organizations for delete to authenticated using ((private.org_role(id) = 'owner' and not personal) or private.is_superadmin());

create policy members_read on public.organization_members for select to authenticated using (private.is_org_member(org_id) or private.is_admin());
create policy members_insert on public.organization_members for insert to authenticated with check (private.can_manage_org(org_id) and (role <> 'owner' or private.org_role(org_id) = 'owner'));
create policy members_update on public.organization_members for update to authenticated
  using (private.can_manage_org(org_id) or private.is_admin())
  with check ((private.can_manage_org(org_id) and (role <> 'owner' or private.org_role(org_id) = 'owner')) or private.is_admin());
create policy members_delete on public.organization_members for delete to authenticated using (private.can_manage_org(org_id) or user_id = (select auth.uid()) or private.is_admin());

create policy invitations_read on public.invitations for select to authenticated
  using (private.can_manage_org(org_id) or lower(email) = lower((select auth.jwt() ->> 'email')) or private.is_admin());
create policy invitations_insert on public.invitations for insert to authenticated with check (private.can_manage_org(org_id) and invited_by = (select auth.uid()));
create policy invitations_update on public.invitations for update to authenticated using (private.can_manage_org(org_id)) with check (private.can_manage_org(org_id));
create policy invitations_delete on public.invitations for delete to authenticated using (private.can_manage_org(org_id));

create policy subscriptions_read on public.subscriptions for select to authenticated using (private.is_org_member(org_id) or private.is_admin());
create policy subscriptions_admin on public.subscriptions for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Contenus d'équipe : lecture pour les membres, écriture pour les éditeurs.
do $$
declare t text;
begin
  foreach t in array array['projects', 'device_boards', 'design_documents', 'studio_items', 'assets', 'monitors', 'security_scans', 'share_links'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_org_member(org_id) or private.is_admin())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.can_edit_org(org_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.can_edit_org(org_id) or private.is_admin()) with check (private.can_edit_org(org_id) or private.is_admin())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.can_edit_org(org_id) or private.is_admin())', t || '_delete', t);
  end loop;
end $$;

create policy comments_read on public.comments for select to authenticated using (private.is_org_member(org_id) or private.is_admin());
create policy comments_insert on public.comments for insert to authenticated with check (private.is_org_member(org_id) and author_id = (select auth.uid()));
create policy comments_update on public.comments for update to authenticated using (author_id = (select auth.uid()) or private.can_manage_org(org_id)) with check (private.is_org_member(org_id));
create policy comments_delete on public.comments for delete to authenticated using (author_id = (select auth.uid()) or private.can_manage_org(org_id) or private.is_admin());

create policy monitor_checks_read on public.monitor_checks for select to authenticated using (private.is_org_member(org_id) or private.is_admin());
-- monitor_requests : interne (le système y écrit ; seuls les admins peuvent la lire).
create policy monitor_requests_admin on public.monitor_requests for select to authenticated using (private.is_admin());

create policy notifications_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
create policy notifications_admin on public.notifications for insert to authenticated with check (private.is_admin());

create policy announcements_read on public.announcements for select to authenticated using (
  (active and starts_at <= now() and (ends_at is null or ends_at > now()) and (audience <> 'admins' or private.is_admin())) or private.is_admin());
create policy announcements_admin on public.announcements for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy announcement_reads_own on public.announcement_reads for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy tickets_read on public.support_tickets for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());
create policy tickets_insert on public.support_tickets for insert to authenticated with check (user_id = (select auth.uid()) and private.is_active_user());
create policy tickets_update on public.support_tickets for update to authenticated using (user_id = (select auth.uid()) or private.is_admin()) with check (user_id = (select auth.uid()) or private.is_admin());
create policy tickets_delete on public.support_tickets for delete to authenticated using (private.is_admin());

create policy ticket_messages_read on public.ticket_messages for select to authenticated using (
  private.is_admin() or (not internal and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid()))));
create policy ticket_messages_insert on public.ticket_messages for insert to authenticated with check (
  author_id = (select auth.uid()) and (private.is_admin() or (not internal and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid())))));

create policy flags_read on public.feature_flags for select using (true);
create policy flags_admin on public.feature_flags for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy config_read on public.app_config for select using (key in ('signups_enabled', 'maintenance', 'support_email', 'desktop_download_url') or private.is_admin());
create policy config_admin on public.app_config for all to authenticated using (private.is_superadmin()) with check (private.is_superadmin());

create policy usage_read on public.usage_daily for select to authenticated using (private.is_org_member(org_id) or private.is_admin());

create policy audit_read on public.audit_logs for select to authenticated using (private.is_admin() or (org_id is not null and private.can_manage_org(org_id)));

-- ----------------------------------------------------------------------------------------------- fonctions appelées par l'application
-- Accepter une invitation (lien reçu par e-mail).
create or replace function public.accept_invitation(invite_token text) returns uuid language plpgsql security definer set search_path = '' as $$
declare inv record;
begin
  select * into inv from public.invitations where token = invite_token for update;
  if inv is null then raise exception 'Invitation introuvable.'; end if;
  if inv.status <> 'pending' then raise exception 'Cette invitation n’est plus valable.'; end if;
  if inv.expires_at < now() then update public.invitations set status = 'expired' where id = inv.id; raise exception 'Cette invitation a expiré.'; end if;
  if lower(inv.email) <> lower(coalesce((select auth.jwt() ->> 'email'), '')) then raise exception 'Cette invitation est destinée à une autre adresse e-mail.'; end if;
  insert into public.organization_members (org_id, user_id, role) values (inv.org_id, (select auth.uid()), inv.role)
  on conflict (org_id, user_id) do update set role = excluded.role;
  update public.invitations set status = 'accepted' where id = inv.id;
  return inv.org_id;
end $$;

-- Invitations en attente pour l'utilisateur connecté (affichées à la connexion).
create or replace function public.my_invitations() returns table (id uuid, token text, org_id uuid, org_name text, role public.member_role, invited_by_name text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.token, i.org_id, o.name, i.role, p.full_name, i.expires_at
  from public.invitations i join public.organizations o on o.id = i.org_id left join public.profiles p on p.id = i.invited_by
  where lower(i.email) = lower(coalesce((select auth.jwt() ->> 'email'), '')) and i.status = 'pending' and i.expires_at > now();
$$;

-- Quitter une équipe.
create or replace function public.leave_organization(org uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.organization_members where org_id = org and user_id = (select auth.uid());
end $$;

-- Compteur d'usage (exports, rendus, audits…).
create or replace function public.track_usage(org uuid, metric text, amount integer default 1) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_org_member(org) then raise exception 'Accès refusé.'; end if;
  insert into public.usage_daily (org_id, day, metric, value) values (org, current_date, metric, amount)
  on conflict (org_id, day, metric) do update set value = public.usage_daily.value + excluded.value;
end $$;

-- Limites de l'offre d'une équipe et usage actuel.
create or replace function public.org_quota(org uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lim jsonb;
begin
  if not (private.is_org_member(org) or private.is_admin()) then raise exception 'Accès refusé.'; end if;
  select p.limits into lim from public.plans p where p.id = private.org_plan(org);
  return jsonb_build_object(
    'plan', private.org_plan(org), 'limits', coalesce(lim, '{}'::jsonb),
    'usage', jsonb_build_object(
      'projects', (select count(*) from public.projects where org_id = org and not archived),
      'members', (select count(*) from public.organization_members where org_id = org),
      'designs', (select count(*) from public.design_documents where org_id = org and deleted_at is null),
      'monitors', (select count(*) from public.monitors where org_id = org),
      'storage_mb', round(coalesce((select sum(size_bytes) from public.assets where org_id = org), 0) / 1048576.0
                          + coalesce((select sum(size_bytes) from public.design_documents where org_id = org), 0) / 1048576.0, 1)));
end $$;

-- Lien de partage public : lecture seule, sans compte.
create or replace function public.get_shared(share_token text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  if coalesce((select enabled from public.feature_flags where key = 'public_share'), true) = false then return null; end if;
  select * into s from public.share_links where token = share_token and (expires_at is null or expires_at > now());
  if s is null then return null; end if;
  if s.target_type = 'design' then
    return (select jsonb_build_object('type', 'design', 'name', d.name, 'thumb', d.thumb, 'storage_path', d.storage_path, 'updated_at', d.updated_at, 'pages', d.pages_count)
            from public.design_documents d where d.id = s.target_id and d.deleted_at is null);
  elsif s.target_type = 'studio' then
    return (select jsonb_build_object('type', 'studio', 'kind', i.kind, 'name', i.name, 'thumb', i.thumb, 'updated_at', i.updated_at) from public.studio_items i where i.id = s.target_id);
  else
    return (select jsonb_build_object('type', 'project', 'name', p.name, 'url', p.url, 'description', p.description) from public.projects p where p.id = s.target_id);
  end if;
end $$;
grant execute on function public.get_shared(text) to anon, authenticated;

-- ----------------------------------------------------------------------------------------------- administration
create or replace function public.admin_stats() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Réservé aux administrateurs.'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'users_active_7d', (select count(*) from public.profiles where last_seen_at > now() - interval '7 days'),
    'users_new_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'users_suspended', (select count(*) from public.profiles where status = 'suspended'),
    'admins', (select count(*) from public.profiles where app_role in ('admin', 'superadmin')),
    'organizations', (select count(*) from public.organizations),
    'teams', (select count(*) from public.organizations where not personal),
    'projects', (select count(*) from public.projects),
    'designs', (select count(*) from public.design_documents where deleted_at is null),
    'studio_items', (select count(*) from public.studio_items),
    'monitors', (select count(*) from public.monitors),
    'monitors_down', (select count(*) from public.monitors where active and last_status = 'down'),
    'scans_30d', (select count(*) from public.security_scans where created_at > now() - interval '30 days'),
    'tickets_open', (select count(*) from public.support_tickets where status in ('open', 'pending')),
    'storage_mb', round(coalesce((select sum(size_bytes) from public.assets), 0) / 1048576.0 + coalesce((select sum(size_bytes) from public.design_documents), 0) / 1048576.0, 1),
    'paid_orgs', (select count(*) from public.subscriptions where plan_id <> 'free' and status in ('active', 'trialing')),
    'mrr_cents', (select coalesce(sum(p.price_month_cents * s.seats), 0) from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status = 'active'),
    'plans', (select coalesce(jsonb_object_agg(plan_id, n), '{}'::jsonb) from (select plan_id, count(*) n from public.subscriptions group by plan_id) x),
    'devices', (select coalesce(jsonb_object_agg(platform, n), '{}'::jsonb) from (select platform, count(distinct user_id) n from public.devices where last_seen_at > now() - interval '30 days' group by platform) y));
end $$;

create or replace function public.admin_timeseries(days integer default 30) returns table (day date, signups bigint, projects bigint, designs bigint, scans bigint, tickets bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Réservé aux administrateurs.'; end if;
  return query
  select d::date,
    (select count(*) from public.profiles where created_at::date = d::date),
    (select count(*) from public.projects where created_at::date = d::date),
    (select count(*) from public.design_documents where created_at::date = d::date),
    (select count(*) from public.security_scans where created_at::date = d::date),
    (select count(*) from public.support_tickets where created_at::date = d::date)
  from generate_series(current_date - (greatest(days, 1) - 1), current_date, interval '1 day') d
  order by 1;
end $$;

create or replace function public.admin_users(search text default '', page integer default 0, page_size integer default 25)
returns table (id uuid, email text, full_name text, avatar_url text, app_role public.app_role, status text, created_at timestamptz, last_seen_at timestamptz, orgs bigint, projects bigint, designs bigint, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Réservé aux administrateurs.'; end if;
  return query
  with f as (
    select p.* from public.profiles p
    where search = '' or p.email ilike '%' || search || '%' or p.full_name ilike '%' || search || '%' or p.company ilike '%' || search || '%')
  select f.id, f.email, f.full_name, f.avatar_url, f.app_role, f.status, f.created_at, f.last_seen_at,
    (select count(*) from public.organization_members m where m.user_id = f.id),
    (select count(*) from public.projects pr where pr.owner_id = f.id),
    (select count(*) from public.design_documents dd where dd.owner_id = f.id),
    (select count(*) from f)
  from f order by f.created_at desc
  limit greatest(1, least(page_size, 200)) offset greatest(0, page) * greatest(1, least(page_size, 200));
end $$;

create or replace function public.admin_orgs(search text default '')
returns table (id uuid, name text, personal boolean, owner_email text, plan_id text, sub_status text, members bigint, projects bigint, designs bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Réservé aux administrateurs.'; end if;
  return query
  select o.id, o.name, o.personal, p.email, coalesce(s.plan_id, 'free'), coalesce(s.status, 'active'),
    (select count(*) from public.organization_members m where m.org_id = o.id),
    (select count(*) from public.projects pr where pr.org_id = o.id),
    (select count(*) from public.design_documents d where d.org_id = o.id),
    o.created_at
  from public.organizations o left join public.profiles p on p.id = o.owner_id left join public.subscriptions s on s.org_id = o.id
  where search = '' or o.name ilike '%' || search || '%' or p.email ilike '%' || search || '%'
  order by o.created_at desc limit 500;
end $$;

create or replace function public.admin_set_role(target uuid, new_role public.app_role) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Réservé aux administrateurs.'; end if;
  if (new_role = 'superadmin' or (select app_role from public.profiles where id = target) = 'superadmin') and not private.is_superadmin() then
    raise exception 'Seul un super-administrateur peut modifier ce rôle.';
  end if;
  update public.profiles set app_role = new_role where id = target;
end $$;

create or replace function public.admin_set_status(target uuid, new_status text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Réservé aux administrateurs.'; end if;
  if target = (select auth.uid()) then raise exception 'Tu ne peux pas suspendre ton propre compte.'; end if;
  if (select app_role from public.profiles where id = target) = 'superadmin' and not private.is_superadmin() then raise exception 'Accès refusé.'; end if;
  update public.profiles set status = new_status where id = target;
  insert into public.notifications (user_id, kind, title, body)
  values (target, 'account', case when new_status = 'suspended' then 'Compte suspendu' else 'Compte réactivé' end,
          case when new_status = 'suspended' then 'Ton compte a été suspendu par un administrateur. Contacte le support pour en savoir plus.' else 'Ton compte est de nouveau actif.' end);
end $$;

create or replace function public.admin_set_plan(org uuid, plan text, sub_status text default 'active', period_end timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Réservé aux administrateurs.'; end if;
  insert into public.subscriptions (org_id, plan_id, status, current_period_end, provider)
  values (org, plan, sub_status, period_end, 'manual')
  on conflict (org_id) do update set plan_id = excluded.plan_id, status = excluded.status, current_period_end = excluded.current_period_end;
  insert into public.notifications (user_id, kind, title, body)
  select m.user_id, 'billing', 'Offre mise à jour', 'Ton espace passe à l’offre ' || coalesce((select name from public.plans where id = plan), plan) || '.'
  from public.organization_members m where m.org_id = org and m.role in ('owner', 'admin');
end $$;

-- Message à tous les utilisateurs (ou à une offre) dans le centre de notifications.
create or replace function public.admin_broadcast(title text, body text, audience text default 'all', link text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not private.is_admin() then raise exception 'Réservé aux administrateurs.'; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  select distinct p.id, 'broadcast', admin_broadcast.title, admin_broadcast.body, admin_broadcast.link
  from public.profiles p
  left join public.organization_members m on m.user_id = p.id
  left join public.subscriptions s on s.org_id = m.org_id
  where p.status = 'active' and (audience = 'all' or (audience = 'admins' and p.app_role in ('admin', 'superadmin')) or s.plan_id = audience);
  get diagnostics n = row_count;
  return n;
end $$;

-- Présence : dernier passage de l'utilisateur et de son appareil.
create or replace function public.touch_presence(platform text, device_name text default '', app_version text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return; end if;
  update public.profiles set last_seen_at = now() where id = (select auth.uid());
  update public.devices set last_seen_at = now(), app_version = coalesce(touch_presence.app_version, devices.app_version)
  where user_id = (select auth.uid()) and devices.platform = touch_presence.platform and name = device_name;
  if not found then
    insert into public.devices (user_id, platform, name, app_version) values ((select auth.uid()), touch_presence.platform, device_name, touch_presence.app_version);
  end if;
end $$;

-- Suppression de son propre compte (les données personnelles partent avec l'utilisateur Auth).
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Non connecté.'; end if;
  if exists (select 1 from public.profiles where id = uid and app_role = 'superadmin')
     and (select count(*) from public.profiles where app_role = 'superadmin') <= 1 then
    raise exception 'Nomme d’abord un autre super-administrateur.';
  end if;
  -- Équipes dont il est le seul membre : supprimées ; sinon la propriété passe au plus ancien administrateur.
  delete from public.organizations o where exists (select 1 from public.organization_members m where m.org_id = o.id and m.user_id = uid)
    and (select count(*) from public.organization_members m where m.org_id = o.id) = 1;
  update public.organization_members m set role = 'owner'
  where (m.org_id, m.user_id) in (
    select distinct on (x.org_id) x.org_id, x.user_id from public.organization_members x
    where x.user_id <> uid and x.org_id in (select org_id from public.organization_members where user_id = uid and role = 'owner')
    order by x.org_id, (x.role = 'admin') desc, x.created_at);
  delete from auth.users where id = uid;
end $$;


-- ----------------------------------------------------------------------------------------------- supervision (pg_cron + pg_net)
create or replace function public.run_monitor_checks() returns integer language plpgsql security definer set search_path = '' as $$
declare m record; rid bigint; n integer := 0;
begin
  if coalesce((select enabled from public.feature_flags where key = 'monitors'), true) = false then return 0; end if;
  for m in select * from public.monitors
           where active and (last_checked_at is null or last_checked_at <= now() - make_interval(mins => interval_minutes) + interval '20 seconds')
             and not exists (select 1 from public.monitor_requests r where r.monitor_id = monitors.id and r.started_at > now() - interval '2 minutes')
           limit 200 loop
    select net.http_get(url := m.url, headers := '{"User-Agent": "NEXORA-Monitor/1.0"}'::jsonb, timeout_milliseconds := 15000) into rid;
    insert into public.monitor_requests (request_id, monitor_id) values (rid, m.id);
    update public.monitors set last_checked_at = now() where id = m.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.collect_monitor_results() returns integer language plpgsql security definer set search_path = '' as $$
declare r record; ok boolean; prev text; n integer := 0; lat integer;
begin
  for r in select q.request_id, q.monitor_id, q.started_at, h.status_code, h.content, h.error_msg, h.timed_out, h.created, mo.expected_status, mo.keyword, mo.org_id, mo.last_status, mo.name, mo.url
           from public.monitor_requests q join net._http_response h on h.id = q.request_id join public.monitors mo on mo.id = q.monitor_id loop
    lat := greatest(0, (extract(epoch from (r.created - r.started_at)) * 1000)::integer);
    ok := coalesce(r.status_code = r.expected_status, false) and not coalesce(r.timed_out, false)
          and (r.keyword is null or r.keyword = '' or position(r.keyword in coalesce(r.content, '')) > 0);
    insert into public.monitor_checks (monitor_id, org_id, status_code, ok, latency_ms, error)
    values (r.monitor_id, r.org_id, r.status_code, ok, lat, case when ok then null else coalesce(r.error_msg, case when r.timed_out then 'Délai dépassé' else 'Statut ' || coalesce(r.status_code::text, '?') end) end);
    prev := r.last_status;
    update public.monitors set last_status = case when ok then 'up' else 'down' end, last_latency_ms = lat,
      last_error = case when ok then null else coalesce(r.error_msg, 'Statut ' || coalesce(r.status_code::text, '?')) end
    where id = r.monitor_id;
    if prev is distinct from (case when ok then 'up' else 'down' end) and prev <> 'unknown' then
      insert into public.notifications (user_id, kind, title, body, link)
      select m.user_id, 'monitor', case when ok then '✅ Site rétabli : ' else '🔴 Site injoignable : ' end || coalesce(nullif(r.name, ''), r.url),
             case when ok then 'Le site répond de nouveau (' || lat || ' ms).' else 'Le site ne répond plus correctement (' || coalesce(r.status_code::text, 'pas de réponse') || ').' end, '#/monitors'
      from public.organization_members m where m.org_id = r.org_id;
    end if;
    delete from public.monitor_requests where request_id = r.request_id;
    n := n + 1;
  end loop;
  -- Requêtes sans réponse depuis trop longtemps.
  delete from public.monitor_requests where started_at < now() - interval '10 minutes';
  return n;
end $$;

create or replace function public.cleanup_old_data() returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.monitor_checks where checked_at < now() - interval '30 days';
  delete from public.notifications where read_at is not null and read_at < now() - interval '90 days';
  delete from public.audit_logs where created_at < now() - interval '365 days';
  update public.invitations set status = 'expired' where status = 'pending' and expires_at < now();
end $$;


do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('nexora-monitors-run', 'nexora-monitors-collect', 'nexora-cleanup');
  perform cron.schedule('nexora-monitors-run', '* * * * *', 'select public.run_monitor_checks()');
  perform cron.schedule('nexora-monitors-collect', '* * * * *', 'select public.collect_monitor_results()');
  perform cron.schedule('nexora-cleanup', '17 3 * * *', 'select public.cleanup_old_data()');
end $$;

-- ----------------------------------------------------------------------------------------------- temps réel
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['profiles', 'organizations', 'organization_members', 'invitations', 'subscriptions', 'projects', 'device_boards', 'design_documents', 'studio_items', 'comments',
                          'monitors', 'monitor_checks', 'security_scans', 'notifications', 'announcements', 'support_tickets', 'ticket_messages', 'feature_flags', 'app_config'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
alter table public.design_documents replica identity full;
alter table public.studio_items replica identity full;
alter table public.projects replica identity full;

-- ----------------------------------------------------------------------------------------------- stockage
insert into storage.buckets (id, name, public, file_size_limit) values
  ('avatars', 'avatars', true, 5242880),
  ('design-files', 'design-files', false, 104857600),
  ('assets', 'assets', false, 209715200),
  ('exports', 'exports', false, 209715200)
on conflict (id) do nothing;

drop policy if exists "nexora avatars read" on storage.objects;
drop policy if exists "nexora avatars write" on storage.objects;
drop policy if exists "nexora avatars update" on storage.objects;
drop policy if exists "nexora avatars delete" on storage.objects;
drop policy if exists "nexora org files read" on storage.objects;
drop policy if exists "nexora org files insert" on storage.objects;
drop policy if exists "nexora org files update" on storage.objects;
drop policy if exists "nexora org files delete" on storage.objects;

-- Avatars : publics en lecture, chacun écrit dans son dossier <user_id>/.
create policy "nexora avatars read" on storage.objects for select using (bucket_id = 'avatars');
create policy "nexora avatars write" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "nexora avatars update" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "nexora avatars delete" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Fichiers d'équipe : dossier <org_id>/… ; lecture pour les membres, écriture pour les éditeurs.
create or replace function private.storage_org(name text) returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return (storage.foldername(name))[1]::uuid;
exception when others then return null;
end $$;

create policy "nexora org files read" on storage.objects for select to authenticated
  using (bucket_id in ('design-files', 'assets', 'exports') and (private.is_org_member(private.storage_org(name)) or private.is_admin()));
create policy "nexora org files insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('design-files', 'assets', 'exports') and private.can_edit_org(private.storage_org(name)));
create policy "nexora org files update" on storage.objects for update to authenticated
  using (bucket_id in ('design-files', 'assets', 'exports') and private.can_edit_org(private.storage_org(name)));
create policy "nexora org files delete" on storage.objects for delete to authenticated
  using (bucket_id in ('design-files', 'assets', 'exports') and (private.can_edit_org(private.storage_org(name)) or private.is_admin()));

-- ----------------------------------------------------------------------------------------------- droits d'exécution
-- Fonctions internes (déclencheurs, tâches planifiées) : jamais appelables depuis l'API.
do $$
declare f text;
begin
  foreach f in array array['run_monitor_checks()', 'collect_monitor_results()', 'cleanup_old_data()', 'handle_new_user()', 'handle_user_email_change()', 'protect_profile()',
                           'protect_last_owner()', 'handle_new_org()', 'org_defaults()', 'fill_owner()', 'audit_row()', 'bump_version()', 'ticket_status_change()',
                           'ticket_message_notify()', 'comment_notify()', 'set_updated_at()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  -- Actions : réservées aux utilisateurs connectés (chacune vérifie en plus les droits).
  foreach f in array array['accept_invitation(text)', 'my_invitations()', 'leave_organization(uuid)', 'track_usage(uuid, text, integer)', 'org_quota(uuid)', 'admin_stats()',
                           'admin_timeseries(integer)', 'admin_users(text, integer, integer)', 'admin_orgs(text)', 'admin_set_role(uuid, public.app_role)', 'admin_set_status(uuid, text)',
                           'admin_set_plan(uuid, text, text, timestamptz)', 'admin_broadcast(text, text, text, text)', 'touch_presence(text, text, text)', 'delete_my_account()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.get_shared(text) to anon, authenticated;
grant execute on all functions in schema private to anon, authenticated, service_role;
-- Fonction d'aide fournie avec certains projets Supabase : pas d'appel possible depuis l'API.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- Fin du schéma NEXORA.
