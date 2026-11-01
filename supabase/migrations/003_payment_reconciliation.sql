begin;
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
commit;
