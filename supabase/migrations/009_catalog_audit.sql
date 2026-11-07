-- Restored verbatim from the existing production migration ledger.
-- Evidence catalogue, independent of commercial products and their prices.
begin;

create table public.catalog_audit_entries(
 catalog_id text primary key check(length(catalog_id) between 3 and 220),
 slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{2,180}$'),
 owner_id uuid not null references public.profiles(id),
 title text not null check(length(title) between 1 and 200),
 item_type text not null check(item_type in ('agents','skills','commands','settings','hooks','mcps','mods','loops','plugins','plugins_inclus')),
 category text not null default '',
 description text not null default '' check(length(description)<=20000),
 source_url text not null check(source_url ~ '^https://'),
 source_revision text not null default '',
 package_sha256 text check(package_sha256 is null or package_sha256 ~ '^[0-9a-f]{64}$'),
 source_available boolean not null default false,
 license_status text not null default 'a_verifier' check(license_status in ('permissive_identifiee','restrictions_explicites','a_verifier','source_absente')),
 test_status text not null default 'not_tested' check(test_status in ('not_tested','partial','passed_bounded','failed','blocked','source_missing')),
 runtime_level text not null default 'none' check(runtime_level in ('none','syntax','prompt_smoke','sandbox_function','mocked_integration','native_integration')),
 model_names text[] not null default '{}',
 duplicate_of text,
 search_text text not null default '',
 details jsonb not null default '{}' check(jsonb_typeof(details)='object' and length(details::text)<=100000),
 is_public boolean not null default true,
 sale_clearance boolean not null default false,
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 approved_package_sha256 text,
 approved_scope text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(not sale_clearance or (
   source_available and license_status='permissive_identifiee'
   and test_status='passed_bounded' and runtime_level in ('sandbox_function','native_integration')
   and reviewed_by is not null and reviewed_at is not null
   and package_sha256 is not null and approved_package_sha256 is not null
   and approved_package_sha256=package_sha256
   and approved_scope is not null and length(trim(approved_scope))>=30
 ))
);

create index catalog_audit_owner_idx on public.catalog_audit_entries(owner_id);

create index catalog_audit_type_idx on public.catalog_audit_entries(item_type,test_status);

create index catalog_audit_license_idx on public.catalog_audit_entries(license_status);

create index catalog_audit_model_idx on public.catalog_audit_entries using gin(model_names);

alter table public.catalog_audit_entries enable row level security;

revoke all on public.catalog_audit_entries from public,anon,authenticated;

grant all on public.catalog_audit_entries to service_role;

-- Only a privileged operator imports evidence. A changed package loses its
-- approval. Metadata, a scanner label or a valid JSON response is not approval.
create function public.market_audit_changed() returns trigger language plpgsql set search_path='' as $$
begin
 if new.package_sha256 is distinct from old.package_sha256 then
  new.sale_clearance=false;new.reviewed_by=null;new.reviewed_at=null;
  new.approved_package_sha256=null;new.approved_scope=null;
 end if;
 new.updated_at=clock_timestamp();
 return new;
end;$$;

create trigger market_audit_changed before update on public.catalog_audit_entries
for each row execute function public.market_audit_changed();

alter table public.products add column catalog_audit_id text references public.catalog_audit_entries(catalog_id);

grant select(catalog_audit_id) on public.products to anon,authenticated;

create function public.market_assert_catalog_ready(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.products; a public.catalog_audit_entries; f public.product_files;
begin
 select * into p from public.products where id=p_id;
 if not found or p.catalog_audit_id is null then return;end if;
 select * into a from public.catalog_audit_entries where catalog_id=p.catalog_audit_id;
 select * into f from public.product_files where product_id=p.id;
 if a.catalog_id is null or not a.is_public or not a.sale_clearance or a.owner_id<>p.seller_id
   or f.product_id is null or f.version<>p.version
   or f.sha256 is distinct from a.approved_package_sha256
   or a.package_sha256 is distinct from a.approved_package_sha256 then
  raise exception 'Catalog audit approval required';
 end if;
end;$$;

revoke all on function public.market_assert_catalog_ready(uuid) from public,anon,authenticated;

grant execute on function public.market_assert_catalog_ready(uuid) to service_role;

create function public.market_catalog_product_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.catalog_audit_entries;f public.product_files;
begin
 if tg_op='UPDATE' and old.catalog_audit_id is not null and new.catalog_audit_id is distinct from old.catalog_audit_id then
  raise exception 'Catalog audit link is immutable';
 end if;
 if new.catalog_audit_id is null then return new;end if;
 select * into a from public.catalog_audit_entries where catalog_id=new.catalog_audit_id;
 if a.catalog_id is null or a.owner_id<>new.seller_id then raise exception 'Catalog audit owner mismatch';end if;
 if new.status='published' then
  select * into f from public.product_files where product_id=new.id;
  if not a.sale_clearance or not a.is_public or f.product_id is null or f.version<>new.version
    or f.sha256 is distinct from a.approved_package_sha256 then
   raise exception 'Catalog audit approval required';
  end if;
 end if;
 return new;
end;$$;

create trigger market_catalog_product_guard before insert or update on public.products
for each row execute function public.market_catalog_product_guard();

create function public.market_catalog_order_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.market_assert_catalog_ready(new.product_id);
 return new;
end;$$;

create trigger market_catalog_order_guard before insert on public.orders
for each row execute function public.market_catalog_order_guard();

create function public.market_catalog_offer_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or (new.status='accepted' and old.status is distinct from 'accepted') then
  perform public.market_assert_catalog_ready(new.product_id);
 end if;
 return new;
end;$$;

create trigger market_catalog_offer_guard before insert or update on public.offers
for each row execute function public.market_catalog_offer_guard();

create function public.market_catalog_audit_stats() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'total',count(*),
  'available',count(*) filter(where source_available),
  'tested',count(*) filter(where runtime_level not in ('none','syntax')),
  'bounded_pass',count(*) filter(where test_status='passed_bounded'),
  'restricted',count(*) filter(where license_status='restrictions_explicites'),
  'review',count(*) filter(where license_status='a_verifier'),
  'duplicates',count(*) filter(where duplicate_of is not null),
  'sale_cleared',count(*) filter(where sale_clearance),
  'updated_at',max(updated_at),
  'by_type',(select coalesce(jsonb_object_agg(item_type,n),'{}') from
    (select item_type,count(*) n from public.catalog_audit_entries where is_public group by item_type) s)
 ) from public.catalog_audit_entries where is_public;
$$;

revoke all on function public.market_catalog_audit_stats() from public,anon,authenticated;

grant execute on function public.market_catalog_audit_stats() to service_role;

comment on table public.catalog_audit_entries is 'Observed evidence and declared capabilities. No automatic sale clearance from smoke tests.';

commit;
