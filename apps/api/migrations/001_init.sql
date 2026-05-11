create table if not exists entitlements (
  user_id text primary key,
  plan text not null default 'trial',
  monthly_seconds_limit integer not null default 1800,
  monthly_seconds_used integer not null default 0,
  renews_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transcription_sessions (
  client_session_id text primary key,
  user_id text not null,
  provider text not null,
  privacy_mode text not null,
  language text not null,
  source text not null,
  mode text not null,
  platform text,
  app_version text,
  created_at timestamptz not null default now()
);

create index if not exists transcription_sessions_user_created_idx
  on transcription_sessions (user_id, created_at desc);

create table if not exists usage_events (
  id bigserial primary key,
  client_session_id text not null,
  user_id text not null,
  event text not null,
  duration_seconds integer not null default 0,
  word_count integer not null default 0,
  provider text not null,
  privacy_mode text not null,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_created_idx
  on usage_events (user_id, created_at desc);

create table if not exists billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);
