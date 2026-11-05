begin;

-- References only: neither installation tokens, user OAuth tokens nor archives are stored.
create table public.github_connections (
 seller_id uuid not null references public.profiles(id) on delete cascade,
 installation_id bigint not null check(installation_id>0),
 account_login text not null, repositories jsonb not null check(jsonb_typeof(repositories)='array'),
 updated_at timestamptz not null default now(), primary key(seller_id,installation_id)
);
create table public.github_oauth_states (
 state_hash text primary key check(state_hash ~ '^[a-f0-9]{64}$'),
 seller_id uuid not null references public.profiles(id) on delete cascade,
 origin text not null, next_path text not null, installation_id bigint, expires_at timestamptz not null
);
create index github_oauth_states_expiry on public.github_oauth_states(expires_at);
alter table public.github_connections enable row level security;
alter table public.github_oauth_states enable row level security;
revoke all on public.github_connections,public.github_oauth_states from public,anon,authenticated;
grant all on public.github_connections,public.github_oauth_states to service_role;

create function public.market_valid_github_source(s jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;
begin
 if s is null or jsonb_typeof(s)<>'object' or not s ?& array['installation_id','repository_id','release_id','asset_id','owner','repo','tag','commit_sha','asset_name','size_bytes','sha256','immutable']
 or s-array['installation_id','repository_id','release_id','asset_id','owner','repo','tag','commit_sha','asset_name','size_bytes','sha256','immutable']<>'{}'::jsonb then return false;end if;
 foreach k in array array['installation_id','repository_id','release_id','asset_id','size_bytes'] loop
  if jsonb_typeof(s->k)<>'number' or (s->>k)!~'^[1-9][0-9]*$' or (s->>k)::numeric>9007199254740991 then return false;end if;
 end loop;
 return coalesce((s->>'size_bytes')::bigint<2147483648 and s->>'owner' ~ '^[a-zA-Z0-9-]+$'
  and s->>'repo' ~ '^[a-zA-Z0-9_.-]+$' and length(s->>'tag') between 1 and 255
  and s->>'commit_sha' ~ '^[a-f0-9]{40}$' and s->>'sha256' ~ '^[a-f0-9]{64}$'
  and length(s->>'asset_name') between 5 and 200 and s->>'asset_name' ~* '\.(zip|json)$'
  and jsonb_typeof(s->'immutable')='boolean',false);
end;$$;

alter table public.product_files add column source_provider text not null default 'supabase',
 add column github_source jsonb, add column source_available boolean not null default true,
 add column source_checked_at timestamptz;
alter table public.product_files alter column storage_path drop not null;
alter table public.product_files drop constraint product_files_size_bytes_check;
alter table public.product_files add constraint product_files_provider_check check(
 (source_provider='supabase' and storage_path is not null and github_source is null and size_bytes between 1 and 20971520)
 or (source_provider='github_release' and storage_path is null and public.market_valid_github_source(github_source)
 and sha256=github_source->>'sha256' and original_name=github_source->>'asset_name' and size_bytes=(github_source->>'size_bytes')::bigint));
alter table public.orders add column source_provider text not null default 'supabase', add column github_source jsonb;
alter table public.orders alter column storage_path drop not null;
alter table public.orders add constraint orders_provider_check check(
 (source_provider='supabase' and storage_path is not null and github_source is null)
 or (source_provider='github_release' and storage_path is null and public.market_valid_github_source(github_source) and file_sha256=github_source->>'sha256'));

create function public.market_attach_github_file(p_id uuid,p_seller uuid,p_version text,p_source jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.products;
begin
 select * into p from public.products where id=p_id for update;
 if not found or p.seller_id<>p_seller then raise exception 'Product not owned';end if;
 if p.status not in ('draft','rejected') or p.version<>p_version then raise exception 'Product changed';end if;
 if not public.market_valid_github_source(p_source) then raise exception 'Invalid source';end if;
 if not exists(select 1 from public.github_connections where seller_id=p_seller and installation_id=(p_source->>'installation_id')::bigint
  and repositories @> jsonb_build_array(jsonb_build_object('id',(p_source->>'repository_id')::bigint))) then raise exception 'Repository not authorized';end if;
 insert into public.product_files(product_id,storage_path,original_name,size_bytes,sha256,version,source_provider,github_source,source_available,source_checked_at)
 values(p_id,null,p_source->>'asset_name',(p_source->>'size_bytes')::integer,p_source->>'sha256',p_version,'github_release',p_source,true,now())
 on conflict(product_id) do update set storage_path=null,original_name=excluded.original_name,size_bytes=excluded.size_bytes,sha256=excluded.sha256,
 version=excluded.version,source_provider='github_release',github_source=excluded.github_source,source_available=true,source_checked_at=now(),created_at=clock_timestamp();
 update public.products set status='draft',updated_at=clock_timestamp() where id=p_id;
end;$$;

-- Keep legacy uploads usable, including replacing a GitHub source in a draft.
create or replace function public.market_attach_file(p_id uuid,p_seller uuid,p_path text,p_name text,p_size integer,p_sha text,p_version text) returns void language plpgsql security definer set search_path='' as $$
declare p public.products;
begin
 select * into p from public.products where id=p_id for update;
 if not found or p.seller_id<>p_seller then raise exception 'Product not owned';end if;
 if p.status not in ('draft','rejected') or p.version<>p_version then raise exception 'Product changed; save a draft before upload';end if;
 insert into public.product_files(product_id,storage_path,original_name,size_bytes,sha256,version) values(p_id,p_path,p_name,p_size,p_sha,p_version)
 on conflict(product_id) do update set storage_path=excluded.storage_path,original_name=excluded.original_name,size_bytes=excluded.size_bytes,sha256=excluded.sha256,
 version=excluded.version,source_provider='supabase',github_source=null,source_available=true,source_checked_at=null,created_at=clock_timestamp();
 update public.products set status='draft',updated_at=clock_timestamp() where id=p_id;
end;$$;

create function public.market_github_source_health(p_product uuid,p_source jsonb,p_available boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.products where id=p_product for update;
 update public.product_files set source_available=p_available,source_checked_at=now()
 where product_id=p_product and source_provider='github_release' and github_source=p_source;
 if found and not p_available then
  update public.products set status='archived',updated_at=clock_timestamp() where id=p_product and status in ('published','pending');
 end if;
end;$$;
create function public.market_github_invalidate(p_installation bigint,p_repository bigint,p_release bigint,p_asset bigint) returns void language plpgsql security definer set search_path='' as $$
declare f public.product_files;
begin
 if p_installation is null then raise exception 'Installation required';end if;
 for f in select * from public.product_files where source_provider='github_release'
  and (github_source->>'installation_id')::bigint=p_installation
  and (p_repository is null or (github_source->>'repository_id')::bigint=p_repository)
  and (p_release is null or (github_source->>'release_id')::bigint=p_release)
  and (p_asset is null or (github_source->>'asset_id')::bigint=p_asset) order by product_id loop
  perform public.market_github_source_health(f.product_id,f.github_source,false);
 end loop;
end;$$;

-- Serializes checkout against replacement and suspension; rejects a stale app snapshot.
create function public.market_delivery_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
declare f public.product_files;p public.products;
begin
 if tg_op='UPDATE' then
  if row(new.source_provider,new.github_source,new.storage_path,new.file_sha256,new.product_version,new.product_id,new.seller_id,new.buyer_id,new.license)
   is distinct from row(old.source_provider,old.github_source,old.storage_path,old.file_sha256,old.product_version,old.product_id,old.seller_id,old.buyer_id,old.license)
   then raise exception 'Immutable delivery snapshot';end if;
  return new;
 end if;
 select * into p from public.products where id=new.product_id for share;
 select * into f from public.product_files where product_id=new.product_id;
 if new.source_provider='github_release' or f.source_provider='github_release' then
  if p.status<>'published' or p.seller_id<>new.seller_id or not f.source_available
   or f.source_provider is distinct from new.source_provider or f.github_source is distinct from new.github_source
   or f.version is distinct from new.product_version or f.sha256 is distinct from new.file_sha256 then raise exception 'Delivery source changed';end if;
 end if;
 return new;
end;$$;
create trigger market_delivery_snapshot before insert or update on public.orders for each row execute function public.market_delivery_snapshot();

-- Enforce availability under the product lock in all publication paths.
create function public.market_source_publication_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('pending','published') and exists(select 1 from public.product_files where product_id=new.id and source_provider='github_release' and not source_available)
 then raise exception 'Source unavailable';end if;
 return new;
end;$$;
create trigger market_source_publication_guard before update of status on public.products for each row execute function public.market_source_publication_guard();

revoke all on function public.market_attach_github_file(uuid,uuid,text,jsonb),public.market_github_source_health(uuid,jsonb,boolean),public.market_github_invalidate(bigint,bigint,bigint,bigint),public.market_delivery_snapshot(),public.market_source_publication_guard() from public,anon,authenticated;
grant execute on function public.market_attach_github_file(uuid,uuid,text,jsonb),public.market_github_source_health(uuid,jsonb,boolean),public.market_github_invalidate(bigint,bigint,bigint,bigint) to service_role;
commit;
