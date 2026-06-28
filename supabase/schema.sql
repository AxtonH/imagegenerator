create extension if not exists "pgcrypto";

do $$ begin
  create type profile_role as enum ('user', 'creative_lead', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type generation_provider as enum ('gemini');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type generation_status as enum ('processing', 'completed', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type usage_event_type as enum (
    'login',
    'generate_image',
    'generation_success',
    'generation_failed',
    'refine_image',
    'download_image',
    'save_image',
    'favorite_image',
    'view_history',
    'view_admin_dashboard',
    'usage_limit_reached'
  );
exception when duplicate_object then null;
end $$;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  odoo_user_id bigint unique not null,
  odoo_employee_id bigint,
  full_name text not null,
  email text unique not null,
  department text,
  job_title text,
  role profile_role not null default 'user',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  original_prompt text not null,
  enhanced_prompt text,
  mode text not null,
  aspect_ratio text not null,
  number_of_variations integer not null check (number_of_variations in (1, 2, 4)),
  provider generation_provider not null default 'gemini',
  model text not null,
  status generation_status not null default 'processing',
  error_message text,
  estimated_cost numeric(10, 4) not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists generated_images (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references generations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  image_url text not null,
  storage_path text not null,
  is_saved boolean not null default false,
  is_favorite boolean not null default false,
  downloaded_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists refinement_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  parent_generation_id uuid not null references generations(id) on delete cascade,
  parent_image_id uuid references generated_images(id) on delete set null,
  refinement_prompt text not null,
  new_generation_id uuid not null references generations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  event_type usage_event_type not null,
  generation_id uuid references generations(id) on delete set null,
  image_id uuid references generated_images(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists usage_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  monthly_generation_limit integer not null default 100,
  current_month_generation_count integer not null default 0,
  month text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create table if not exists api_cost_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  generation_id uuid not null references generations(id) on delete cascade,
  provider generation_provider not null default 'gemini',
  model text not null,
  estimated_cost numeric(10, 4) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_generations_user_created on generations(user_id, created_at desc);
create index if not exists idx_generated_images_user_created on generated_images(user_id, created_at desc);
create index if not exists idx_usage_events_created on usage_events(created_at desc);
create index if not exists idx_usage_events_user_created on usage_events(user_id, created_at desc);
create index if not exists idx_usage_limits_month on usage_limits(month);

insert into storage.buckets (id, name, public)
values ('generated-images', 'generated-images', true)
on conflict (id) do nothing;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
