-- MarketPaperclip: initial database installation.
-- TARGET: ltommtumsvvqxdknpkfd ONLY.
-- Open https://supabase.com/dashboard/project/ltommtumsvvqxdknpkfd/sql/new
-- Run this entire file as postgres. It contains no credentials.
-- All six migrations and their history commit together or roll back together.
-- An existing application schema stops installation; nothing is reset.
-- Auth URL/email settings are a separate Dashboard step (see docs/SUPABASE-DASHBOARD.md).

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtext('marketpaperclip:initial-install'));

do $marketpaperclip_guard$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Run the installer as postgres in the Supabase SQL Editor.';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.classid = 'pg_class'::regclass and d.deptype = 'e')
  ) then
    raise exception 'Public application tables already exist. Stop and reconcile migrations; do not reset the database.';
  end if;
end;
$marketpaperclip_guard$;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;
do $marketpaperclip_history$
begin
  if exists (select 1 from supabase_migrations.schema_migrations) then
    raise exception 'Migration history already exists. Reconcile it before initial installation.';
  end if;
end;
$marketpaperclip_history$;

-- 001_marketplace.sql
-- MarketPaperclip. Apply to a dedicated Supabase project.

-- gen_random_uuid() is built into PostgreSQL 13+.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
 display_name text not null check(length(display_name) between 2 and 60),
 bio text not null default '' check(length(bio)<=600),
 website text not null default '' check(website='' or website like 'https://%'),
 created_at timestamptz not null default now()
);
create table public.market_admins(user_id uuid primary key references auth.users(id) on delete cascade);
create table public.seller_accounts(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 stripe_account_id text not null unique,
 charges_enabled boolean not null default false,
 payouts_enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.products(
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.profiles(id),
 slug text not null unique, title text not null check(length(title) between 3 and 80),
 tagline text not null check(length(tagline) between 15 and 160), description text not null check(length(description) between 80 and 20000),
 category text not null check(category in ('Développement','Recherche & data','Marketing','Opérations','Design','Support client')),
 kind text not null check(kind in ('agent','bundle')),
 engine text not null check(engine in ('Claude','GPT','Gemini','Ollama','Multi-modèles')),
 version text not null check(version ~ '^\d+\.\d+\.\d+$'),
 price_cents integer not null check(price_cents between 0 and 1000000), currency text not null default 'cad' check(currency='cad'),
 license text not null check(license in ('MIT','Apache-2.0','Commerciale — usage individuel','Commerciale — équipe')),
 tags text[] not null default '{}', requirements text not null, setup text not null,
 agent_count integer not null default 1 check(agent_count between 1 and 1000),
 status text not null default 'draft' check(status in ('draft','pending','published','rejected','archived')),
 moderation_note text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((kind='agent' and agent_count=1) or (kind='bundle' and agent_count>=2))
);
create index products_public_idx on public.products(status,created_at desc);
create index products_seller_idx on public.products(seller_id,created_at desc);
create index products_search_idx on public.products using gin(to_tsvector('simple',title||' '||tagline||' '||description));
create table public.product_files(
 id uuid primary key default gen_random_uuid(),product_id uuid not null unique references public.products(id) on delete cascade,
 storage_path text not null unique, original_name text not null, size_bytes integer not null check(size_bytes>0 and size_bytes<=20971520),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), version text not null,
 created_at timestamptz not null default now()
);
create table public.orders(
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references public.profiles(id),
 seller_id uuid not null references public.profiles(id), product_id uuid not null references public.products(id),
 product_title text not null, product_version text not null, license text not null,
 -- Immutable delivery snapshot: a seller update cannot swap a buyer's purchase.
 storage_path text not null, file_sha256 text not null,
 amount_cents integer not null check(amount_cents>=0), fee_cents integer not null check(fee_cents between 0 and amount_cents),
 currency text not null default 'cad' check(currency='cad'),
 status text not null default 'pending' check(status in ('pending','paid','failed','expired','refunded','partially_refunded','disputed')),
 stripe_session_id text unique, stripe_payment_intent text unique,
 checkout_url text, created_at timestamptz not null default now(), paid_at timestamptz,
 check(buyer_id<>seller_id)
);
create unique index orders_active_purchase on public.orders(buyer_id,product_id) where status in ('pending','paid','partially_refunded','disputed');
create index orders_seller_idx on public.orders(seller_id,created_at desc);
create table public.favorites(user_id uuid references public.profiles(id) on delete cascade,product_id uuid references public.products(id) on delete cascade,primary key(user_id,product_id));
create table public.reviews(id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),user_id uuid not null references public.profiles(id),rating integer not null check(rating between 1 and 5),body text not null check(length(body) between 10 and 2000),created_at timestamptz not null default now(),unique(product_id,user_id));
create table public.support_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),order_id uuid references public.orders(id),subject text not null check(length(subject) between 3 and 150),body text not null check(length(body) between 20 and 5000),status text not null default 'open' check(status in ('open','resolved')),created_at timestamptz not null default now());
create table public.stripe_events(id text primary key,type text not null,processed_at timestamptz not null default now());
create table public.audit_log(id bigint generated always as identity primary key,actor uuid,action text not null,target uuid,detail jsonb not null default '{}',created_at timestamptz not null default now());
create table public.rate_limits(key text primary key,window_start timestamptz not null,hits integer not null);

create function public.create_market_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,username,display_name) values(new.id,'dev-'||replace(new.id::text,'-','')::varchar(24),left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Développeur'),60));
 return new;
end;$$;
create trigger on_market_signup after insert on auth.users for each row execute function public.create_market_profile();

alter table public.profiles enable row level security;
alter table public.market_admins enable row level security;
alter table public.seller_accounts enable row level security;
alter table public.products enable row level security;
alter table public.product_files enable row level security;
alter table public.orders enable row level security;
alter table public.favorites enable row level security;
alter table public.reviews enable row level security;
alter table public.support_requests enable row level security;
alter table public.stripe_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;
create policy profiles_read on public.profiles for select using(true);
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy products_read on public.products for select using(status='published' or seller_id=auth.uid());
-- Products, files, orders, payment accounts and moderation are written by the server.
-- There are deliberately no browser write grants on these tables.
create policy orders_read on public.orders for select to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid());
create policy favorites_read on public.favorites for select to authenticated using(user_id=auth.uid());
create policy favorites_insert on public.favorites for insert to authenticated with check(user_id=auth.uid());
create policy favorites_delete on public.favorites for delete to authenticated using(user_id=auth.uid());
create policy reviews_read on public.reviews for select using(true);
create policy reviews_insert on public.reviews for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.orders o where o.buyer_id=auth.uid() and o.product_id=reviews.product_id and o.status='paid'));
create policy requests_read on public.support_requests for select to authenticated using(user_id=auth.uid());
create policy requests_insert on public.support_requests for insert to authenticated with check(user_id=auth.uid() and (order_id is null or exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=auth.uid())));
revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles,public.products,public.reviews to anon,authenticated;
grant update(display_name,username,bio,website) on public.profiles to authenticated;
grant select on public.orders,public.support_requests,public.favorites to authenticated;
grant insert on public.support_requests,public.reviews to authenticated;
grant insert,delete on public.favorites to authenticated;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('agent-packages','agent-packages',false,20971520,array['application/zip','application/x-zip-compressed','application/json']) on conflict(id) do nothing;
-- No storage.objects client policies: only server-controlled upload and signed download.

create function public.market_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.rate_limits(key,window_start,hits) values(p_key,now(),1) on conflict(key) do update set
 hits=case when public.rate_limits.window_start < now()-make_interval(secs=>p_seconds) then 1 else public.rate_limits.hits+1 end,
 window_start=case when public.rate_limits.window_start < now()-make_interval(secs=>p_seconds) then now() else public.rate_limits.window_start end returning hits into n;
 delete from public.rate_limits where window_start<now()-interval '1 day';
 return n<=p_limit;
end;$$;

-- Atomic webhook ledger + state transition. Replays are harmless, failures roll back.
create function public.market_apply_payment(p_event_id text,p_type text,p_order_id uuid,p_session_id text default null,p_payment_intent text default null,p_amount integer default null,p_currency text default null,p_buyer_id uuid default null,p_partial boolean default false) returns text language plpgsql security definer set search_path='' as $$
declare o public.orders; inserted integer;
begin
 insert into public.stripe_events(id,type) values(p_event_id,p_type) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return 'duplicate';end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Unknown order';end if;
 if p_type='paid' then
  if o.stripe_session_id is distinct from p_session_id or o.amount_cents is distinct from p_amount or o.currency is distinct from p_currency or o.buyer_id is distinct from p_buyer_id then raise exception 'Payment/order mismatch';end if;
  if o.status in ('pending','expired','failed') then update public.orders set status='paid',paid_at=now(),stripe_payment_intent=p_payment_intent where id=o.id;end if;
 elsif p_type='expired' then update public.orders set status='expired' where id=o.id and status='pending';
 elsif p_type='failed' then update public.orders set status='failed' where id=o.id and status='pending';
 elsif p_type='refunded' then
  if o.stripe_payment_intent is not null and o.stripe_payment_intent is distinct from p_payment_intent then raise exception 'Payment mismatch';end if;
  update public.orders set status=case when p_partial then 'partially_refunded' else 'refunded' end,stripe_payment_intent=p_payment_intent where id=o.id;
 elsif p_type='disputed' then update public.orders set status='disputed',stripe_payment_intent=p_payment_intent where id=o.id;
 else raise exception 'Unknown transition';end if;
 insert into public.audit_log(action,target,detail) values('payment.'||p_type,o.id,jsonb_build_object('event_id',p_event_id));
 return 'applied';
end;$$;
revoke all on function public.create_market_profile() from public,anon,authenticated;
revoke all on function public.market_rate_limit(text,integer,integer) from public,anon,authenticated;
revoke all on function public.market_apply_payment(text,text,uuid,text,text,integer,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.market_rate_limit(text,integer,integer) to service_role;
grant execute on function public.market_apply_payment(text,text,uuid,text,text,integer,text,uuid,boolean) to service_role;

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('001', 'marketplace', array[$marketpaperclip_001$-- MarketPaperclip. Apply to a dedicated Supabase project.

-- gen_random_uuid() is built into PostgreSQL 13+.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
 display_name text not null check(length(display_name) between 2 and 60),
 bio text not null default '' check(length(bio)<=600),
 website text not null default '' check(website='' or website like 'https://%'),
 created_at timestamptz not null default now()
);
create table public.market_admins(user_id uuid primary key references auth.users(id) on delete cascade);
create table public.seller_accounts(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 stripe_account_id text not null unique,
 charges_enabled boolean not null default false,
 payouts_enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.products(
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.profiles(id),
 slug text not null unique, title text not null check(length(title) between 3 and 80),
 tagline text not null check(length(tagline) between 15 and 160), description text not null check(length(description) between 80 and 20000),
 category text not null check(category in ('Développement','Recherche & data','Marketing','Opérations','Design','Support client')),
 kind text not null check(kind in ('agent','bundle')),
 engine text not null check(engine in ('Claude','GPT','Gemini','Ollama','Multi-modèles')),
 version text not null check(version ~ '^\d+\.\d+\.\d+$'),
 price_cents integer not null check(price_cents between 0 and 1000000), currency text not null default 'cad' check(currency='cad'),
 license text not null check(license in ('MIT','Apache-2.0','Commerciale — usage individuel','Commerciale — équipe')),
 tags text[] not null default '{}', requirements text not null, setup text not null,
 agent_count integer not null default 1 check(agent_count between 1 and 1000),
 status text not null default 'draft' check(status in ('draft','pending','published','rejected','archived')),
 moderation_note text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((kind='agent' and agent_count=1) or (kind='bundle' and agent_count>=2))
);
create index products_public_idx on public.products(status,created_at desc);
create index products_seller_idx on public.products(seller_id,created_at desc);
create index products_search_idx on public.products using gin(to_tsvector('simple',title||' '||tagline||' '||description));
create table public.product_files(
 id uuid primary key default gen_random_uuid(),product_id uuid not null unique references public.products(id) on delete cascade,
 storage_path text not null unique, original_name text not null, size_bytes integer not null check(size_bytes>0 and size_bytes<=20971520),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), version text not null,
 created_at timestamptz not null default now()
);
create table public.orders(
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references public.profiles(id),
 seller_id uuid not null references public.profiles(id), product_id uuid not null references public.products(id),
 product_title text not null, product_version text not null, license text not null,
 -- Immutable delivery snapshot: a seller update cannot swap a buyer's purchase.
 storage_path text not null, file_sha256 text not null,
 amount_cents integer not null check(amount_cents>=0), fee_cents integer not null check(fee_cents between 0 and amount_cents),
 currency text not null default 'cad' check(currency='cad'),
 status text not null default 'pending' check(status in ('pending','paid','failed','expired','refunded','partially_refunded','disputed')),
 stripe_session_id text unique, stripe_payment_intent text unique,
 checkout_url text, created_at timestamptz not null default now(), paid_at timestamptz,
 check(buyer_id<>seller_id)
);
create unique index orders_active_purchase on public.orders(buyer_id,product_id) where status in ('pending','paid','partially_refunded','disputed');
create index orders_seller_idx on public.orders(seller_id,created_at desc);
create table public.favorites(user_id uuid references public.profiles(id) on delete cascade,product_id uuid references public.products(id) on delete cascade,primary key(user_id,product_id));
create table public.reviews(id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),user_id uuid not null references public.profiles(id),rating integer not null check(rating between 1 and 5),body text not null check(length(body) between 10 and 2000),created_at timestamptz not null default now(),unique(product_id,user_id));
create table public.support_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),order_id uuid references public.orders(id),subject text not null check(length(subject) between 3 and 150),body text not null check(length(body) between 20 and 5000),status text not null default 'open' check(status in ('open','resolved')),created_at timestamptz not null default now());
create table public.stripe_events(id text primary key,type text not null,processed_at timestamptz not null default now());
create table public.audit_log(id bigint generated always as identity primary key,actor uuid,action text not null,target uuid,detail jsonb not null default '{}',created_at timestamptz not null default now());
create table public.rate_limits(key text primary key,window_start timestamptz not null,hits integer not null);

create function public.create_market_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,username,display_name) values(new.id,'dev-'||replace(new.id::text,'-','')::varchar(24),left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Développeur'),60));
 return new;
end;$$;
create trigger on_market_signup after insert on auth.users for each row execute function public.create_market_profile();

alter table public.profiles enable row level security;
alter table public.market_admins enable row level security;
alter table public.seller_accounts enable row level security;
alter table public.products enable row level security;
alter table public.product_files enable row level security;
alter table public.orders enable row level security;
alter table public.favorites enable row level security;
alter table public.reviews enable row level security;
alter table public.support_requests enable row level security;
alter table public.stripe_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;
create policy profiles_read on public.profiles for select using(true);
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy products_read on public.products for select using(status='published' or seller_id=auth.uid());
-- Products, files, orders, payment accounts and moderation are written by the server.
-- There are deliberately no browser write grants on these tables.
create policy orders_read on public.orders for select to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid());
create policy favorites_read on public.favorites for select to authenticated using(user_id=auth.uid());
create policy favorites_insert on public.favorites for insert to authenticated with check(user_id=auth.uid());
create policy favorites_delete on public.favorites for delete to authenticated using(user_id=auth.uid());
create policy reviews_read on public.reviews for select using(true);
create policy reviews_insert on public.reviews for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.orders o where o.buyer_id=auth.uid() and o.product_id=reviews.product_id and o.status='paid'));
create policy requests_read on public.support_requests for select to authenticated using(user_id=auth.uid());
create policy requests_insert on public.support_requests for insert to authenticated with check(user_id=auth.uid() and (order_id is null or exists(select 1 from public.orders o where o.id=order_id and o.buyer_id=auth.uid())));
revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles,public.products,public.reviews to anon,authenticated;
grant update(display_name,username,bio,website) on public.profiles to authenticated;
grant select on public.orders,public.support_requests,public.favorites to authenticated;
grant insert on public.support_requests,public.reviews to authenticated;
grant insert,delete on public.favorites to authenticated;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('agent-packages','agent-packages',false,20971520,array['application/zip','application/x-zip-compressed','application/json']) on conflict(id) do nothing;
-- No storage.objects client policies: only server-controlled upload and signed download.

create function public.market_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.rate_limits(key,window_start,hits) values(p_key,now(),1) on conflict(key) do update set
 hits=case when public.rate_limits.window_start < now()-make_interval(secs=>p_seconds) then 1 else public.rate_limits.hits+1 end,
 window_start=case when public.rate_limits.window_start < now()-make_interval(secs=>p_seconds) then now() else public.rate_limits.window_start end returning hits into n;
 delete from public.rate_limits where window_start<now()-interval '1 day';
 return n<=p_limit;
end;$$;

-- Atomic webhook ledger + state transition. Replays are harmless, failures roll back.
create function public.market_apply_payment(p_event_id text,p_type text,p_order_id uuid,p_session_id text default null,p_payment_intent text default null,p_amount integer default null,p_currency text default null,p_buyer_id uuid default null,p_partial boolean default false) returns text language plpgsql security definer set search_path='' as $$
declare o public.orders; inserted integer;
begin
 insert into public.stripe_events(id,type) values(p_event_id,p_type) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return 'duplicate';end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Unknown order';end if;
 if p_type='paid' then
  if o.stripe_session_id is distinct from p_session_id or o.amount_cents is distinct from p_amount or o.currency is distinct from p_currency or o.buyer_id is distinct from p_buyer_id then raise exception 'Payment/order mismatch';end if;
  if o.status in ('pending','expired','failed') then update public.orders set status='paid',paid_at=now(),stripe_payment_intent=p_payment_intent where id=o.id;end if;
 elsif p_type='expired' then update public.orders set status='expired' where id=o.id and status='pending';
 elsif p_type='failed' then update public.orders set status='failed' where id=o.id and status='pending';
 elsif p_type='refunded' then
  if o.stripe_payment_intent is not null and o.stripe_payment_intent is distinct from p_payment_intent then raise exception 'Payment mismatch';end if;
  update public.orders set status=case when p_partial then 'partially_refunded' else 'refunded' end,stripe_payment_intent=p_payment_intent where id=o.id;
 elsif p_type='disputed' then update public.orders set status='disputed',stripe_payment_intent=p_payment_intent where id=o.id;
 else raise exception 'Unknown transition';end if;
 insert into public.audit_log(action,target,detail) values('payment.'||p_type,o.id,jsonb_build_object('event_id',p_event_id));
 return 'applied';
end;$$;
revoke all on function public.create_market_profile() from public,anon,authenticated;
revoke all on function public.market_rate_limit(text,integer,integer) from public,anon,authenticated;
revoke all on function public.market_apply_payment(text,text,uuid,text,text,integer,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.market_rate_limit(text,integer,integer) to service_role;
grant execute on function public.market_apply_payment(text,text,uuid,text,text,integer,text,uuid,boolean) to service_role;$marketpaperclip_001$]);

-- 002_atomic_publication.sql
-- Every file and publication transition takes the same product row lock.
-- A concurrent upload cannot silently replace an approved package.
create function public.market_save_product(p_id uuid,p_seller uuid,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.products;f public.product_files;
begin
 select * into p from public.products where id=p_id for update;
 if not found or p.seller_id<>p_seller then raise exception 'Product not owned';end if;
 if p_data->>'status' not in ('draft','pending') then raise exception 'Invalid seller status';end if;
 if p_data->>'status'='pending' then
  select * into f from public.product_files where product_id=p_id;
  if not found or f.version<>p_data->>'version' then raise exception 'Matching package required';end if;
 end if;
 update public.products set title=p_data->>'title',tagline=p_data->>'tagline',description=p_data->>'description',category=p_data->>'category',kind=p_data->>'kind',engine=p_data->>'engine',version=p_data->>'version',price_cents=(p_data->>'price_cents')::integer,currency='cad',license=p_data->>'license',tags=array(select jsonb_array_elements_text(p_data->'tags')),requirements=p_data->>'requirements',setup=p_data->>'setup',agent_count=(p_data->>'agent_count')::integer,status=p_data->>'status',moderation_note='',updated_at=clock_timestamp() where id=p_id;
end;$$;
create function public.market_attach_file(p_id uuid,p_seller uuid,p_path text,p_name text,p_size integer,p_sha text,p_version text) returns void language plpgsql security definer set search_path='' as $$
declare p public.products;
begin
 select * into p from public.products where id=p_id for update;
 if not found or p.seller_id<>p_seller then raise exception 'Product not owned';end if;
 if p.status not in ('draft','rejected') or p.version<>p_version then raise exception 'Product changed; save a draft before upload';end if;
 insert into public.product_files(product_id,storage_path,original_name,size_bytes,sha256,version) values(p_id,p_path,p_name,p_size,p_sha,p_version)
 on conflict(product_id) do update set storage_path=excluded.storage_path,original_name=excluded.original_name,size_bytes=excluded.size_bytes,sha256=excluded.sha256,version=excluded.version,created_at=clock_timestamp();
 update public.products set status='draft',updated_at=clock_timestamp() where id=p_id;
end;$$;
create function public.market_moderate_product(p_id uuid,p_admin uuid,p_status text,p_note text,p_expected_updated timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare p public.products;f public.product_files;
begin
 if not exists(select 1 from public.market_admins where user_id=p_admin) then raise exception 'Admin required';end if;
 select * into p from public.products where id=p_id for update;
 if not found or p.status<>'pending' or p.updated_at is distinct from p_expected_updated then raise exception 'Product changed; review again';end if;
 if p_status not in ('published','rejected') then raise exception 'Invalid moderation status';end if;
 if p_status='published' then
  select * into f from public.product_files where product_id=p_id;
  if not found or f.version<>p.version then raise exception 'Matching package required';end if;
 end if;
 update public.products set status=p_status,moderation_note=p_note,updated_at=clock_timestamp() where id=p_id;
 insert into public.audit_log(actor,action,target) values(p_admin,'product.'||p_status,p_id);
end;$$;
revoke all on function public.market_save_product(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.market_attach_file(uuid,uuid,text,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.market_moderate_product(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.market_save_product(uuid,uuid,jsonb) to service_role;
grant execute on function public.market_attach_file(uuid,uuid,text,text,integer,text,text) to service_role;
grant execute on function public.market_moderate_product(uuid,uuid,text,text,timestamptz) to service_role;

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('002', 'atomic_publication', array[$marketpaperclip_002$-- Every file and publication transition takes the same product row lock.
-- A concurrent upload cannot silently replace an approved package.
create function public.market_save_product(p_id uuid,p_seller uuid,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.products;f public.product_files;
begin
 select * into p from public.products where id=p_id for update;
 if not found or p.seller_id<>p_seller then raise exception 'Product not owned';end if;
 if p_data->>'status' not in ('draft','pending') then raise exception 'Invalid seller status';end if;
 if p_data->>'status'='pending' then
  select * into f from public.product_files where product_id=p_id;
  if not found or f.version<>p_data->>'version' then raise exception 'Matching package required';end if;
 end if;
 update public.products set title=p_data->>'title',tagline=p_data->>'tagline',description=p_data->>'description',category=p_data->>'category',kind=p_data->>'kind',engine=p_data->>'engine',version=p_data->>'version',price_cents=(p_data->>'price_cents')::integer,currency='cad',license=p_data->>'license',tags=array(select jsonb_array_elements_text(p_data->'tags')),requirements=p_data->>'requirements',setup=p_data->>'setup',agent_count=(p_data->>'agent_count')::integer,status=p_data->>'status',moderation_note='',updated_at=clock_timestamp() where id=p_id;
end;$$;
create function public.market_attach_file(p_id uuid,p_seller uuid,p_path text,p_name text,p_size integer,p_sha text,p_version text) returns void language plpgsql security definer set search_path='' as $$
declare p public.products;
begin
 select * into p from public.products where id=p_id for update;
 if not found or p.seller_id<>p_seller then raise exception 'Product not owned';end if;
 if p.status not in ('draft','rejected') or p.version<>p_version then raise exception 'Product changed; save a draft before upload';end if;
 insert into public.product_files(product_id,storage_path,original_name,size_bytes,sha256,version) values(p_id,p_path,p_name,p_size,p_sha,p_version)
 on conflict(product_id) do update set storage_path=excluded.storage_path,original_name=excluded.original_name,size_bytes=excluded.size_bytes,sha256=excluded.sha256,version=excluded.version,created_at=clock_timestamp();
 update public.products set status='draft',updated_at=clock_timestamp() where id=p_id;
end;$$;
create function public.market_moderate_product(p_id uuid,p_admin uuid,p_status text,p_note text,p_expected_updated timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare p public.products;f public.product_files;
begin
 if not exists(select 1 from public.market_admins where user_id=p_admin) then raise exception 'Admin required';end if;
 select * into p from public.products where id=p_id for update;
 if not found or p.status<>'pending' or p.updated_at is distinct from p_expected_updated then raise exception 'Product changed; review again';end if;
 if p_status not in ('published','rejected') then raise exception 'Invalid moderation status';end if;
 if p_status='published' then
  select * into f from public.product_files where product_id=p_id;
  if not found or f.version<>p.version then raise exception 'Matching package required';end if;
 end if;
 update public.products set status=p_status,moderation_note=p_note,updated_at=clock_timestamp() where id=p_id;
 insert into public.audit_log(actor,action,target) values(p_admin,'product.'||p_status,p_id);
end;$$;
revoke all on function public.market_save_product(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.market_attach_file(uuid,uuid,text,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.market_moderate_product(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.market_save_product(uuid,uuid,jsonb) to service_role;
grant execute on function public.market_attach_file(uuid,uuid,text,text,integer,text,text) to service_role;
grant execute on function public.market_moderate_product(uuid,uuid,text,text,timestamptz) to service_role;$marketpaperclip_002$]);

-- 003_payment_reconciliation.sql
alter table public.orders add column total_cents integer;
alter table public.orders add column tax_cents integer not null default 0;
alter table public.orders add column financial_event_created bigint not null default 0;
alter table public.orders add column license_accepted_at timestamptz not null default now();
alter table public.orders add column terms_version text not null default 'launch-v1';
-- Replace the payment RPC with an ordered, auditable reconciliation function.
drop function public.market_apply_payment(text,text,uuid,text,text,integer,text,uuid,boolean);
create function public.market_apply_payment(p_event_id text,p_type text,p_order_id uuid,p_session_id text default null,p_payment_intent text default null,p_amount integer default null,p_currency text default null,p_buyer_id uuid default null,p_partial boolean default false,p_event_created bigint default 0,p_total integer default null,p_tax integer default 0) returns text language plpgsql security definer set search_path='' as $$
declare o public.orders;inserted integer;
begin
 insert into public.stripe_events(id,type) values(p_event_id,p_type) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return 'duplicate';end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Unknown order';end if;
 if p_type='paid' then
  if o.stripe_session_id is distinct from p_session_id or o.amount_cents is distinct from p_amount or o.currency is distinct from p_currency or o.buyer_id is distinct from p_buyer_id then raise exception 'Payment/order mismatch';end if;
  if coalesce(p_total,p_amount)<>p_amount+p_tax or p_tax<0 then raise exception 'Payment totals mismatch';end if;
  update public.orders set stripe_payment_intent=p_payment_intent,total_cents=coalesce(p_total,p_amount),tax_cents=p_tax,paid_at=coalesce(paid_at,now()),status=case when status in ('pending','expired','failed') then 'paid' else status end where id=o.id;
 elsif p_type in ('expired','failed') then
  if o.stripe_session_id is distinct from p_session_id then raise exception 'Session mismatch';end if;
  update public.orders set status=p_type where id=o.id and status='pending';
 elsif p_type in ('refunded','disputed','dispute_won') then
  if o.stripe_payment_intent is not null and o.stripe_payment_intent is distinct from p_payment_intent then raise exception 'Payment mismatch';end if;
  if p_event_created<o.financial_event_created then return 'stale';end if;
  update public.orders set status=case
   when o.status='refunded' then 'refunded'
   when p_type='refunded' then case when p_partial then 'partially_refunded' else 'refunded' end
   when p_type='disputed' then 'disputed'
   when p_type='dispute_won' then case when o.status='partially_refunded' then o.status else 'paid' end
   else o.status end,
   stripe_payment_intent=p_payment_intent,financial_event_created=p_event_created
   where id=o.id;
 else raise exception 'Unknown transition';end if;
 insert into public.audit_log(action,target,detail) values('payment.'||p_type,o.id,jsonb_build_object('event_id',p_event_id,'event_created',p_event_created));
 return 'applied';
end;$$;
revoke all on function public.market_apply_payment(text,text,uuid,text,text,integer,text,uuid,boolean,bigint,integer,integer) from public,anon,authenticated;
grant execute on function public.market_apply_payment(text,text,uuid,text,text,integer,text,uuid,boolean,bigint,integer,integer) to service_role;

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('003', 'payment_reconciliation', array[$marketpaperclip_003$alter table public.orders add column total_cents integer;
alter table public.orders add column tax_cents integer not null default 0;
alter table public.orders add column financial_event_created bigint not null default 0;
alter table public.orders add column license_accepted_at timestamptz not null default now();
alter table public.orders add column terms_version text not null default 'launch-v1';
-- Replace the payment RPC with an ordered, auditable reconciliation function.
drop function public.market_apply_payment(text,text,uuid,text,text,integer,text,uuid,boolean);
create function public.market_apply_payment(p_event_id text,p_type text,p_order_id uuid,p_session_id text default null,p_payment_intent text default null,p_amount integer default null,p_currency text default null,p_buyer_id uuid default null,p_partial boolean default false,p_event_created bigint default 0,p_total integer default null,p_tax integer default 0) returns text language plpgsql security definer set search_path='' as $$
declare o public.orders;inserted integer;
begin
 insert into public.stripe_events(id,type) values(p_event_id,p_type) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return 'duplicate';end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Unknown order';end if;
 if p_type='paid' then
  if o.stripe_session_id is distinct from p_session_id or o.amount_cents is distinct from p_amount or o.currency is distinct from p_currency or o.buyer_id is distinct from p_buyer_id then raise exception 'Payment/order mismatch';end if;
  if coalesce(p_total,p_amount)<>p_amount+p_tax or p_tax<0 then raise exception 'Payment totals mismatch';end if;
  update public.orders set stripe_payment_intent=p_payment_intent,total_cents=coalesce(p_total,p_amount),tax_cents=p_tax,paid_at=coalesce(paid_at,now()),status=case when status in ('pending','expired','failed') then 'paid' else status end where id=o.id;
 elsif p_type in ('expired','failed') then
  if o.stripe_session_id is distinct from p_session_id then raise exception 'Session mismatch';end if;
  update public.orders set status=p_type where id=o.id and status='pending';
 elsif p_type in ('refunded','disputed','dispute_won') then
  if o.stripe_payment_intent is not null and o.stripe_payment_intent is distinct from p_payment_intent then raise exception 'Payment mismatch';end if;
  if p_event_created<o.financial_event_created then return 'stale';end if;
  update public.orders set status=case
   when o.status='refunded' then 'refunded'
   when p_type='refunded' then case when p_partial then 'partially_refunded' else 'refunded' end
   when p_type='disputed' then 'disputed'
   when p_type='dispute_won' then case when o.status='partially_refunded' then o.status else 'paid' end
   else o.status end,
   stripe_payment_intent=p_payment_intent,financial_event_created=p_event_created
   where id=o.id;
 else raise exception 'Unknown transition';end if;
 insert into public.audit_log(action,target,detail) values('payment.'||p_type,o.id,jsonb_build_object('event_id',p_event_id,'event_created',p_event_created));
 return 'applied';
end;$$;
revoke all on function public.market_apply_payment(text,text,uuid,text,text,integer,text,uuid,boolean,bigint,integer,integer) from public,anon,authenticated;
grant execute on function public.market_apply_payment(text,text,uuid,text,text,integer,text,uuid,boolean,bigint,integer,integer) to service_role;$marketpaperclip_003$]);

-- 004_public_column_grants.sql
-- Moderation notes and private delivery snapshots do not belong in public API reads.
revoke select on public.products from anon,authenticated;
grant select(id,seller_id,slug,title,tagline,description,category,kind,engine,version,price_cents,currency,license,tags,requirements,setup,agent_count,status,created_at,updated_at) on public.products to anon,authenticated;
revoke select on public.orders from authenticated;
grant select(id,buyer_id,seller_id,product_id,product_title,product_version,license,amount_cents,total_cents,tax_cents,fee_cents,currency,status,created_at,paid_at) on public.orders to authenticated;

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('004', 'public_column_grants', array[$marketpaperclip_004$-- Moderation notes and private delivery snapshots do not belong in public API reads.
revoke select on public.products from anon,authenticated;
grant select(id,seller_id,slug,title,tagline,description,category,kind,engine,version,price_cents,currency,license,tags,requirements,setup,agent_count,status,created_at,updated_at) on public.products to anon,authenticated;
revoke select on public.orders from authenticated;
grant select(id,buyer_id,seller_id,product_id,product_title,product_version,license,amount_cents,total_cents,tax_cents,fee_cents,currency,status,created_at,paid_at) on public.orders to authenticated;$marketpaperclip_004$]);

-- 005_seller_statistics.sql
create function public.market_seller_stats(p_seller uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'total_products',(select count(*) from public.products where seller_id=p_seller),
 'published_products',(select count(*) from public.products where seller_id=p_seller and status='published'),
 'paid_orders',(select count(*) from public.orders where seller_id=p_seller and status='paid'),
 'net_revenue',(select coalesce(sum(amount_cents-fee_cents),0) from public.orders where seller_id=p_seller and status='paid'),
 'orders_count',(select count(*) from public.orders where seller_id=p_seller)
 );
$$;
revoke all on function public.market_seller_stats(uuid) from public,anon,authenticated;
grant execute on function public.market_seller_stats(uuid) to service_role;

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('005', 'seller_statistics', array[$marketpaperclip_005$create function public.market_seller_stats(p_seller uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'total_products',(select count(*) from public.products where seller_id=p_seller),
 'published_products',(select count(*) from public.products where seller_id=p_seller and status='published'),
 'paid_orders',(select count(*) from public.orders where seller_id=p_seller and status='paid'),
 'net_revenue',(select coalesce(sum(amount_cents-fee_cents),0) from public.orders where seller_id=p_seller and status='paid'),
 'orders_count',(select count(*) from public.orders where seller_id=p_seller)
 );
$$;
revoke all on function public.market_seller_stats(uuid) from public,anon,authenticated;
grant execute on function public.market_seller_stats(uuid) to service_role;$marketpaperclip_005$]);

-- 006_product_covers.sql
alter table public.products add column cover_url text;
grant select(cover_url) on public.products to anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-covers','product-covers',true,3145728,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- Public presentation images, uploaded only through the authenticated server route.

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('006', 'product_covers', array[$marketpaperclip_006$alter table public.products add column cover_url text;
grant select(cover_url) on public.products to anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-covers','product-covers',true,3145728,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- Public presentation images, uploaded only through the authenticated server route.$marketpaperclip_006$]);

do $marketpaperclip_verify$
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('profiles', 'market_admins', 'seller_accounts', 'products', 'product_files', 'orders', 'favorites', 'reviews', 'support_requests', 'stripe_events', 'audit_log', 'rate_limits') and c.relrowsecurity) <> 12 then
    raise exception 'Expected marketplace tables and RLS are incomplete. Installation rolled back.';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations where version in ('001', '002', '003', '004', '005', '006')) <> 6 then
    raise exception 'Migration history is incomplete. Installation rolled back.';
  end if;
  if not exists (select 1 from storage.buckets where id = 'agent-packages' and public = false and file_size_limit = 20971520)
     or not exists (select 1 from storage.buckets where id = 'product-covers' and public = true and file_size_limit = 3145728) then
    raise exception 'Storage configuration does not match the marketplace. Installation rolled back.';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'market_%' or p.proname = 'create_market_profile')
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) then
    raise exception 'A server-only function is exposed to a client role. Installation rolled back.';
  end if;
end;
$marketpaperclip_verify$;
notify pgrst, 'reload schema';
commit;

select 'MarketPaperclip: database installation complete' as status,
       (select count(*) from supabase_migrations.schema_migrations) as migrations,
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('profiles', 'market_admins', 'seller_accounts', 'products', 'product_files', 'orders', 'favorites', 'reviews', 'support_requests', 'stripe_events', 'audit_log', 'rate_limits') and c.relrowsecurity) as tables_with_rls;
