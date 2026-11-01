-- MarketPaperclip. Apply to a dedicated Supabase project.
begin;
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
commit;
