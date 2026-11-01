begin;
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
commit;
