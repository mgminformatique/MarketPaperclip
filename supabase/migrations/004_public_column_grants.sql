begin;
-- Moderation notes and private delivery snapshots do not belong in public API reads.
revoke select on public.products from anon,authenticated;
grant select(id,seller_id,slug,title,tagline,description,category,kind,engine,version,price_cents,currency,license,tags,requirements,setup,agent_count,status,created_at,updated_at) on public.products to anon,authenticated;
revoke select on public.orders from authenticated;
grant select(id,buyer_id,seller_id,product_id,product_title,product_version,license,amount_cents,total_cents,tax_cents,fee_cents,currency,status,created_at,paid_at) on public.orders to authenticated;
commit;
