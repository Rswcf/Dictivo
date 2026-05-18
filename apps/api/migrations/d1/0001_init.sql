create table if not exists entitlements (
  user_id text primary key,
  plan text not null default 'trial',
  monthly_seconds_limit integer not null default 1800,
  monthly_seconds_used integer not null default 0,
  renews_at text not null default (datetime('now', '+14 days')),
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
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
  created_at text not null default (datetime('now'))
);

create index if not exists transcription_sessions_user_created_idx
  on transcription_sessions (user_id, created_at desc);

create table if not exists usage_events (
  id integer primary key autoincrement,
  client_session_id text not null,
  user_id text not null,
  event text not null,
  duration_seconds integer not null default 0,
  word_count integer not null default 0,
  provider text not null,
  privacy_mode text not null,
  created_at text not null default (datetime('now'))
);

create index if not exists usage_events_user_created_idx
  on usage_events (user_id, created_at desc);

create table if not exists billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  received_at text not null default (datetime('now'))
);

create table if not exists rate_limit_buckets (
  bucket_key text primary key,
  request_count integer not null default 0,
  expires_at integer not null
);

create index if not exists rate_limit_buckets_expires_idx
  on rate_limit_buckets (expires_at);
