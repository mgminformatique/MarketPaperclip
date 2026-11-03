-- MarketPaperclip 007 — the user market: public activity, listing controls,
-- buyer offers and aggregated market statistics.
-- Buyers are never identified in public data. Every write goes through
-- server-only functions; browsers keep read access to their own offers.
begin;

-- Listing state ---------------------------------------------------------------
-- approved_version lets a seller pause and relist an already reviewed package
-- without a new review; any content change still goes back to moderation.
alter table public.products add column approved_version text;
alter table public.products add column listed_at timestamptz;
grant select(listed_at) on public.products to anon,authenticated;

-- Offers ----------------------------------------------------------------------
create table public.offers(
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id) on delete cascade,
 buyer_id uuid not null references public.profiles(id) on delete cascade,
 seller_id uuid not null references public.profiles(id) on delete cascade,
 amount_cents integer not null check(amount_cents between 100 and 1000000),
 list_cents integer not null check(list_cents between 0 and 1000000),
 currency text not null default 'cad' check(currency='cad'),
 message text not null default '' check(length(message)<=500),
 status text not null default 'pending' check(status in ('pending','accepted','declined','withdrawn','expired','completed')),
 expires_at timestamptz not null default now()+interval '7 days',
 responded_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(buyer_id<>seller_id)
);
create unique index offers_one_active on public.offers(buyer_id,product_id) where status in ('pending','accepted');
create index offers_seller_idx on public.offers(seller_id,created_at desc);
create index offers_buyer_idx on public.offers(buyer_id,created_at desc);
create index offers_product_idx on public.offers(product_id,status);
alter table public.offers enable row level security;
create policy offers_read on public.offers for select to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid());
grant select on public.offers to authenticated;

alter table public.orders add column offer_id uuid references public.offers(id);
create index orders_product_status_idx on public.orders(product_id,status);
create index orders_paid_idx on public.orders(paid_at desc) where status in ('paid','partially_refunded');

-- Public market events (no buyer identity) ------------------------------------
create table public.market_events(
 id bigint generated always as identity primary key,
 product_id uuid not null references public.products(id) on delete cascade,
 seller_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('listed','relisted','delisted','price_changed','sold','offer')),
 amount_cents integer check(amount_cents is null or amount_cents between 0 and 1000000),
 previous_cents integer check(previous_cents is null or previous_cents between 0 and 1000000),
 created_at timestamptz not null default now()
);
create index market_events_recent_idx on public.market_events(created_at desc,id desc);
create index market_events_product_idx on public.market_events(product_id,created_at desc);
create index market_events_seller_idx on public.market_events(seller_id,created_at desc);
alter table public.market_events enable row level security;
-- No browser grants: the server exposes curated, filtered views of this table.

create function public.market_product_events() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='published' and old.status is distinct from 'published' then
  insert into public.market_events(product_id,seller_id,kind,amount_cents)
  values(new.id,new.seller_id,case when old.status='archived' then 'relisted' else 'listed' end,new.price_cents);
 elsif old.status='published' and new.status<>'published' then
  insert into public.market_events(product_id,seller_id,kind,amount_cents) values(new.id,new.seller_id,'delisted',new.price_cents);
 elsif new.status='published' and new.price_cents is distinct from old.price_cents then
  insert into public.market_events(product_id,seller_id,kind,amount_cents,previous_cents)
  values(new.id,new.seller_id,'price_changed',new.price_cents,old.price_cents);
 end if;
 return new;
end;$$;
create trigger market_product_events after update of status,price_cents on public.products
for each row execute function public.market_product_events();

-- A sale is recorded once, when an order first becomes paid. A dispute won
-- later (disputed -> paid) is not a new sale.
create function public.market_order_events() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='paid' and (tg_op='INSERT' or old.status in ('pending','expired','failed')) then
  insert into public.market_events(product_id,seller_id,kind,amount_cents) values(new.product_id,new.seller_id,'sold',new.amount_cents);
  if new.offer_id is not null then
   update public.offers set status='completed',updated_at=now() where id=new.offer_id and status='accepted';
  end if;
 end if;
 return new;
end;$$;
create trigger market_order_events after insert or update of status on public.orders
for each row execute function public.market_order_events();

-- Moderation records the reviewed version (same signature, grants preserved).
create or replace function public.market_moderate_product(p_id uuid,p_admin uuid,p_status text,p_note text,p_expected_updated timestamptz) returns void language plpgsql security definer set search_path='' as $$
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
 update public.products set status=p_status,moderation_note=p_note,updated_at=clock_timestamp(),
  approved_version=case when p_status='published' then p.version else approved_version end,
  listed_at=case when p_status='published' then now() else listed_at end
 where id=p_id;
 insert into public.audit_log(actor,action,target) values(p_admin,'product.'||p_status,p_id);
end;$$;

-- Listing controls ------------------------------------------------------------
create function public.market_set_price(p_id uuid,p_seller uuid,p_price integer) returns void language plpgsql security definer set search_path='' as $$
declare p public.products;
begin
 select * into p from public.products where id=p_id for update;
 if not found or p.seller_id<>p_seller then raise exception 'Product not owned';end if;
 if p_price is null or p_price<0 or p_price>1000000 then raise exception 'Invalid price';end if;
 if p.status not in ('published','archived') then raise exception 'Listing price applies to reviewed products';end if;
 if p.price_cents=p_price then return;end if;
 update public.products set price_cents=p_price,updated_at=clock_timestamp() where id=p_id;
 insert into public.audit_log(actor,action,target,detail) values(p_seller,'listing.price',p_id,jsonb_build_object('from',p.price_cents,'to',p_price));
end;$$;

create function public.market_set_listing(p_id uuid,p_seller uuid,p_action text) returns text language plpgsql security definer set search_path='' as $$
declare p public.products;f public.product_files;
begin
 select * into p from public.products where id=p_id for update;
 if not found or p.seller_id<>p_seller then raise exception 'Product not owned';end if;
 if p_action='pause' then
  if p.status<>'published' then raise exception 'Only a published listing can be paused';end if;
  update public.products set status='archived',updated_at=clock_timestamp() where id=p_id;
 elsif p_action='resume' then
  if p.status<>'archived' then raise exception 'Only a paused listing can be resumed';end if;
  select * into f from public.product_files where product_id=p_id;
  if not found or f.version<>p.version or p.approved_version is distinct from p.version then raise exception 'Review required';end if;
  update public.products set status='published',listed_at=now(),updated_at=clock_timestamp() where id=p_id;
 else raise exception 'Unknown listing action';end if;
 insert into public.audit_log(actor,action,target) values(p_seller,'listing.'||p_action,p_id);
 return p_action;
end;$$;

-- Offers ----------------------------------------------------------------------
create function public.market_make_offer(p_product uuid,p_buyer uuid,p_amount integer,p_message text) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.products;new_id uuid;
begin
 select * into p from public.products where id=p_product for share;
 if not found or p.status<>'published' then raise exception 'Product unavailable';end if;
 if p.seller_id=p_buyer then raise exception 'Own product';end if;
 if p.price_cents<=0 then raise exception 'Free product';end if;
 if p_amount is null or p_amount<100 or p_amount>=p.price_cents then raise exception 'Offer must be below the listing price';end if;
 if p_amount*5<p.price_cents then raise exception 'Offer too low';end if;
 if length(coalesce(p_message,''))>500 then raise exception 'Message too long';end if;
 if exists(select 1 from public.orders where buyer_id=p_buyer and product_id=p_product and status in ('paid','partially_refunded','disputed')) then raise exception 'Already owned';end if;
 update public.offers set status='expired',updated_at=now()
  where buyer_id=p_buyer and product_id=p_product and status in ('pending','accepted') and expires_at<now();
 if (select count(*) from public.offers where buyer_id=p_buyer and status='pending' and expires_at>=now())>=20 then raise exception 'Too many open offers';end if;
 insert into public.offers(product_id,buyer_id,seller_id,amount_cents,list_cents,message)
 values(p.id,p_buyer,p.seller_id,p_amount,p.price_cents,coalesce(p_message,'')) returning id into new_id;
 insert into public.market_events(product_id,seller_id,kind,amount_cents) values(p.id,p.seller_id,'offer',p_amount);
 return new_id;
end;$$;

create function public.market_respond_offer(p_offer uuid,p_seller uuid,p_action text) returns text language plpgsql security definer set search_path='' as $$
declare o public.offers;
begin
 select * into o from public.offers where id=p_offer for update;
 if not found or o.seller_id<>p_seller then raise exception 'Offer not found';end if;
 if o.status<>'pending' or o.expires_at<now() then raise exception 'Offer closed';end if;
 if p_action='accept' then
  if not exists(select 1 from public.products where id=o.product_id and status='published') then raise exception 'Product unavailable';end if;
  -- The buyer then has 72 hours to pay the agreed amount.
  update public.offers set status='accepted',responded_at=now(),expires_at=now()+interval '72 hours',updated_at=now() where id=o.id;
 elsif p_action='decline' then
  update public.offers set status='declined',responded_at=now(),updated_at=now() where id=o.id;
 else raise exception 'Unknown offer action';end if;
 return p_action;
end;$$;

create function public.market_withdraw_offer(p_offer uuid,p_buyer uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.offers;
begin
 select * into o from public.offers where id=p_offer for update;
 if not found or o.buyer_id<>p_buyer then raise exception 'Offer not found';end if;
 if o.status not in ('pending','accepted') then raise exception 'Offer closed';end if;
 update public.offers set status='withdrawn',updated_at=now() where id=o.id;
end;$$;

-- Market statistics -------------------------------------------------------------
-- A sale is a paid order with a positive amount; free acquisitions are counted
-- separately. Refunded and disputed orders are excluded from volume.
create function public.market_overview(p_days integer) returns jsonb language sql stable security definer set search_path='' as $$
 with win as (
  select case when coalesce(p_days,0)<=0 then '-infinity'::timestamptz else now()-make_interval(days=>least(p_days,3650)) end as since,
         least(greatest(coalesce(nullif(p_days,0),30),1),90) as span
 ), paid as (
  select o.amount_cents,o.paid_at from public.orders o,win
  where o.status in ('paid','partially_refunded') and o.paid_at>=win.since
 ), days as (
  select generate_series(date_trunc('day',now())-make_interval(days=>(select span from win)-1),date_trunc('day',now()),interval '1 day') as d
 )
 select jsonb_build_object(
  'volume_cents',(select coalesce(sum(amount_cents),0) from paid),
  'sales',(select count(*) from paid where amount_cents>0),
  'acquisitions',(select count(*) from paid),
  'listed',(select count(*) from public.products where status='published'),
  'creators',(select count(distinct seller_id) from public.products where status='published'),
  'floor_cents',(select min(price_cents) from public.products where status='published' and price_cents>0),
  'avg_cents',(select round(avg(price_cents))::integer from public.products where status='published' and price_cents>0),
  'free',(select count(*) from public.products where status='published' and price_cents=0),
  'new_listings',(select count(*) from public.products p,win where p.status='published' and p.listed_at>=win.since),
  'open_offers',(select count(*) from public.offers o join public.products p on p.id=o.product_id where o.status='pending' and o.expires_at>=now() and p.status='published'),
  'series',(select coalesce(jsonb_agg(jsonb_build_object('day',to_char(days.d,'YYYY-MM-DD'),
     'volume_cents',(select coalesce(sum(amount_cents),0) from paid where paid_at>=days.d and paid_at<days.d+interval '1 day'),
     'sales',(select count(*) from paid where amount_cents>0 and paid_at>=days.d and paid_at<days.d+interval '1 day')) order by days.d),'[]'::jsonb) from days)
 );
$$;

create function public.market_leaderboard(p_days integer,p_limit integer) returns jsonb language sql stable security definer set search_path='' as $$
 with win as (select case when coalesce(p_days,0)<=0 then '-infinity'::timestamptz else now()-make_interval(days=>least(p_days,3650)) end as since),
 board as (
  select pr.username,pr.display_name,
   coalesce((select sum(o.amount_cents) from public.orders o,win where o.seller_id=pr.id and o.status in ('paid','partially_refunded') and o.paid_at>=win.since),0)::bigint as volume_cents,
   (select count(*) from public.orders o,win where o.seller_id=pr.id and o.status in ('paid','partially_refunded') and o.amount_cents>0 and o.paid_at>=win.since) as sales,
   (select count(*) from public.products x where x.seller_id=pr.id and x.status='published') as listed,
   coalesce((select s.charges_enabled and s.payouts_enabled from public.seller_accounts s where s.user_id=pr.id),false) as verified,
   (select min(x.listed_at) from public.products x where x.seller_id=pr.id and x.status='published') as first_listed
  from public.profiles pr
  where exists(select 1 from public.products x where x.seller_id=pr.id and x.status='published')
 )
 select coalesce(jsonb_agg(to_jsonb(b) order by b.volume_cents desc,b.sales desc,b.listed desc,b.first_listed),'[]'::jsonb)
 from (select * from board order by volume_cents desc,sales desc,listed desc,first_listed limit least(greatest(coalesce(p_limit,10),1),50)) b;
$$;

create function public.market_trending(p_days integer,p_limit integer) returns jsonb language sql stable security definer set search_path='' as $$
 with win as (select case when coalesce(p_days,0)<=0 then '-infinity'::timestamptz else now()-make_interval(days=>least(p_days,3650)) end as since),
 ranked as (
  select p.id,
   (select count(*) from public.orders o,win where o.product_id=p.id and o.status in ('paid','partially_refunded') and o.paid_at>=win.since) as acquisitions,
   (select coalesce(sum(o.amount_cents),0) from public.orders o,win where o.product_id=p.id and o.status in ('paid','partially_refunded') and o.paid_at>=win.since)::bigint as volume_cents,
   (select count(*) from public.favorites f where f.product_id=p.id) as favorites,
   (select count(*) from public.offers x where x.product_id=p.id and x.status='pending' and x.expires_at>=now()) as offers,
   p.listed_at
  from public.products p where p.status='published'
 )
 select coalesce(jsonb_agg(to_jsonb(r) order by r.acquisitions desc,r.volume_cents desc,r.offers desc,r.favorites desc,r.listed_at desc nulls last),'[]'::jsonb)
 from (select * from ranked order by acquisitions desc,volume_cents desc,offers desc,favorites desc,listed_at desc nulls last limit least(greatest(coalesce(p_limit,8),1),24)) r;
$$;

create function public.market_product_stats(p_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(p.id,jsonb_build_object(
  'sales',(select count(*) from public.orders o where o.product_id=p.id and o.status in ('paid','partially_refunded') and o.amount_cents>0),
  'acquisitions',(select count(*) from public.orders o where o.product_id=p.id and o.status in ('paid','partially_refunded')),
  'volume_cents',(select coalesce(sum(o.amount_cents),0) from public.orders o where o.product_id=p.id and o.status in ('paid','partially_refunded')),
  'last_sale_cents',(select o.amount_cents from public.orders o where o.product_id=p.id and o.status in ('paid','partially_refunded') and o.amount_cents>0 order by o.paid_at desc limit 1),
  'last_sale_at',(select o.paid_at from public.orders o where o.product_id=p.id and o.status in ('paid','partially_refunded') and o.amount_cents>0 order by o.paid_at desc limit 1),
  'favorites',(select count(*) from public.favorites f where f.product_id=p.id),
  'offers',(select count(*) from public.offers x where x.product_id=p.id and x.status='pending' and x.expires_at>=now()),
  'best_offer_cents',(select max(x.amount_cents) from public.offers x where x.product_id=p.id and x.status='pending' and x.expires_at>=now()),
  'listed_at',p.listed_at)),'{}'::jsonb)
 from public.products p where p.id=any(p_ids) and p.status='published';
$$;

create function public.market_activity(p_product uuid,p_seller uuid,p_limit integer) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',e.id,'kind',e.kind,'amount_cents',e.amount_cents,'previous_cents',e.previous_cents,'created_at',e.created_at,
   'product',jsonb_build_object('slug',p.slug,'title',p.title,'kind',p.kind,'engine',p.engine,'cover_url',p.cover_url),
   'seller',jsonb_build_object('username',pr.username,'display_name',pr.display_name)
  ) order by e.created_at desc,e.id desc),'[]'::jsonb)
 from (
  select ev.* from public.market_events ev join public.products px on px.id=ev.product_id
  where px.status='published' and (p_product is null or ev.product_id=p_product) and (p_seller is null or ev.seller_id=p_seller)
  order by ev.created_at desc,ev.id desc limit least(greatest(coalesce(p_limit,30),1),100)
 ) e
 join public.products p on p.id=e.product_id
 join public.profiles pr on pr.id=e.seller_id;
$$;

create function public.market_creator_stats(p_seller uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'sales',(select count(*) from public.orders where seller_id=p_seller and status in ('paid','partially_refunded') and amount_cents>0),
  'acquisitions',(select count(*) from public.orders where seller_id=p_seller and status in ('paid','partially_refunded')),
  'volume_cents',(select coalesce(sum(amount_cents),0) from public.orders where seller_id=p_seller and status in ('paid','partially_refunded')),
  'buyers',(select count(distinct buyer_id) from public.orders where seller_id=p_seller and status in ('paid','partially_refunded')),
  'listed',(select count(*) from public.products where seller_id=p_seller and status='published'),
  'rating',(select round(avg(r.rating)::numeric,2) from public.reviews r join public.products p on p.id=r.product_id where p.seller_id=p_seller),
  'reviews',(select count(*) from public.reviews r join public.products p on p.id=r.product_id where p.seller_id=p_seller),
  'verified',coalesce((select s.charges_enabled and s.payouts_enabled from public.seller_accounts s where s.user_id=p_seller),false),
  'member_since',(select created_at from public.profiles where id=p_seller),
  'first_listed',(select min(listed_at) from public.products where seller_id=p_seller and status='published')
 );
$$;

revoke all on function public.market_product_events() from public,anon,authenticated;
revoke all on function public.market_order_events() from public,anon,authenticated;
revoke all on function public.market_set_price(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.market_set_listing(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.market_make_offer(uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.market_respond_offer(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.market_withdraw_offer(uuid,uuid) from public,anon,authenticated;
revoke all on function public.market_overview(integer) from public,anon,authenticated;
revoke all on function public.market_leaderboard(integer,integer) from public,anon,authenticated;
revoke all on function public.market_trending(integer,integer) from public,anon,authenticated;
revoke all on function public.market_product_stats(uuid[]) from public,anon,authenticated;
revoke all on function public.market_activity(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.market_creator_stats(uuid) from public,anon,authenticated;
grant execute on function public.market_set_price(uuid,uuid,integer) to service_role;
grant execute on function public.market_set_listing(uuid,uuid,text) to service_role;
grant execute on function public.market_make_offer(uuid,uuid,integer,text) to service_role;
grant execute on function public.market_respond_offer(uuid,uuid,text) to service_role;
grant execute on function public.market_withdraw_offer(uuid,uuid) to service_role;
grant execute on function public.market_overview(integer) to service_role;
grant execute on function public.market_leaderboard(integer,integer) to service_role;
grant execute on function public.market_trending(integer,integer) to service_role;
grant execute on function public.market_product_stats(uuid[]) to service_role;
grant execute on function public.market_activity(uuid,uuid,integer) to service_role;
grant execute on function public.market_creator_stats(uuid) to service_role;
-- Supabase default privileges grant new tables to browser roles; RLS already
-- blocks them, and these explicit revokes keep the 001 posture.
revoke all on public.offers,public.market_events from anon,authenticated;
revoke all on sequence public.market_events_id_seq from anon,authenticated;
grant select on public.offers to authenticated;
grant all on public.offers,public.market_events to service_role;
grant usage,select on all sequences in schema public to service_role;
commit;
