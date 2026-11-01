begin;
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
commit;
