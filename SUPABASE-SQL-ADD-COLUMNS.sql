-- Run in Supabase SQL editor
alter table providers add column if not exists logo_url text;
alter table providers add column if not exists description text;
