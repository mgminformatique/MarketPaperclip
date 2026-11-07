begin;
-- Existing unique, lowercase usernames are the public @handles.
create index profiles_username_prefix_idx on public.profiles(username text_pattern_ops);
create table public.conversations (
 id uuid primary key default gen_random_uuid(),
 member_a uuid not null references public.profiles(id), member_b uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(member_a,member_b), check(member_a<member_b)
);
create table public.conversation_members (
 conversation_id uuid references public.conversations(id) on delete cascade,
 user_id uuid references public.profiles(id), last_read_at timestamptz not null default '-infinity',
 typing_until timestamptz, primary key(conversation_id,user_id)
);
create table public.messages (
 id bigint generated always as identity primary key,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references public.profiles(id), client_id uuid not null,
 body text not null default '' check(length(body)<=5000), image_path text,
 reply_to bigint references public.messages(id), created_at timestamptz not null default now(),
 edited_at timestamptz, deleted_at timestamptz,
 unique(sender_id,client_id), check(length(trim(body))>0 or image_path is not null or deleted_at is not null)
);
create index messages_conversation_idx on public.messages(conversation_id,id desc);
create table public.message_reactions (
 message_id bigint references public.messages(id) on delete cascade, user_id uuid references public.profiles(id),
 emoji text not null check(emoji in ('👍','❤️','😂','😮','😢','🙏')), primary key(message_id,user_id)
);
create table public.user_blocks (
 user_id uuid references public.profiles(id), blocked_id uuid references public.profiles(id),
 created_at timestamptz not null default now(), primary key(user_id,blocked_id), check(user_id<>blocked_id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 kind text not null, source_id uuid not null, title text not null, href text not null,
 amount_cents integer, created_at timestamptz not null default now(), read_at timestamptz,
 unique(user_id,kind,source_id)
);
create index notifications_user_idx on public.notifications(user_id,created_at desc,id desc);
create index conversations_a_idx on public.conversations(member_a,updated_at desc);
create index conversations_b_idx on public.conversations(member_b,updated_at desc);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.user_blocks enable row level security;
alter table public.notifications enable row level security;
create policy conversations_read on public.conversations for select to authenticated using(auth.uid() in (member_a,member_b));
create policy members_read on public.conversation_members for select to authenticated using(exists(select 1 from public.conversations c where c.id=conversation_id and auth.uid() in (c.member_a,c.member_b)));
create policy messages_read on public.messages for select to authenticated using(exists(select 1 from public.conversations c where c.id=conversation_id and auth.uid() in (c.member_a,c.member_b)));
create policy reactions_read on public.message_reactions for select to authenticated using(exists(select 1 from public.messages m where m.id=message_id));
create policy blocks_read on public.user_blocks for select to authenticated using(user_id=auth.uid());
create policy notifications_read on public.notifications for select to authenticated using(user_id=auth.uid());
revoke all on public.conversations,public.conversation_members,public.messages,public.message_reactions,public.user_blocks,public.notifications from anon,authenticated;
grant select on public.conversations,public.conversation_members,public.messages,public.message_reactions,public.user_blocks,public.notifications to authenticated;
grant all on public.conversations,public.conversation_members,public.messages,public.message_reactions,public.user_blocks,public.notifications to service_role;
grant usage,select on sequence public.messages_id_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('chat-images','chat-images',false,3145728,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;

-- Only the authenticated API may call these procedures; actor is derived from Auth.
create function public.market_chat_start(p_actor uuid,p_peer uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if p_actor=p_peer then raise exception 'Invalid recipient'; end if;
 -- Serialize blocking and sends/creation for the same pair.
 perform pg_advisory_xact_lock(hashtextextended(least(p_actor,p_peer)::text||greatest(p_actor,p_peer)::text,0));
 if exists(select 1 from public.user_blocks where (user_id=p_actor and blocked_id=p_peer) or (user_id=p_peer and blocked_id=p_actor)) then raise exception 'Blocked conversation'; end if;
 insert into public.conversations(member_a,member_b) values(least(p_actor,p_peer),greatest(p_actor,p_peer))
 on conflict(member_a,member_b) do update set member_a=excluded.member_a returning id into cid;
 insert into public.conversation_members(conversation_id,user_id) values(cid,p_actor),(cid,p_peer) on conflict do nothing;
 return cid;
end;$$;
create function public.market_chat_action(p_actor uuid,p_conversation uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.conversations; peer uuid; m public.messages; mid bigint; result jsonb;
begin
 select * into c from public.conversations where id=p_conversation;
 if not found or p_actor not in (c.member_a,c.member_b) then raise exception 'Conversation not found'; end if;
 peer:=case when c.member_a=p_actor then c.member_b else c.member_a end;
 perform pg_advisory_xact_lock(hashtextextended(c.member_a::text||c.member_b::text,0));
 if p_action='block' then
  insert into public.user_blocks(user_id,blocked_id) values(p_actor,peer) on conflict do nothing; return '{}';
 elsif p_action='unblock' then
  delete from public.user_blocks where user_id=p_actor and blocked_id=peer; return '{}';
 elsif p_action='read' then
  -- Acknowledge only messages the browser actually received, never a later arrival.
  select * into m from public.messages where id=(p_data->>'message_id')::bigint and conversation_id=c.id;
  if found then update public.conversation_members set last_read_at=greatest(last_read_at,m.created_at) where conversation_id=c.id and user_id=p_actor; end if;
  return '{}';
 end if;
 if exists(select 1 from public.user_blocks where (user_id=p_actor and blocked_id=peer) or (user_id=peer and blocked_id=p_actor)) then raise exception 'Blocked conversation'; end if;
 if p_action='typing' then
  update public.conversation_members set typing_until=case when (p_data->>'active')::boolean then now()+interval '6 seconds' else null end where conversation_id=c.id and user_id=p_actor;
 elsif p_action='send' then
  select * into m from public.messages where sender_id=p_actor and client_id=(p_data->>'client_id')::uuid;
  if found then
   if m.conversation_id<>c.id then raise exception 'Invalid message'; end if;
   return jsonb_build_object('id',m.id);
  end if;
  if p_data->>'reply_to' is not null and not exists(select 1 from public.messages where id=(p_data->>'reply_to')::bigint and conversation_id=c.id) then raise exception 'Invalid reply'; end if;
  if p_data->>'image_path' is not null and (p_data->>'image_path') not like p_actor::text||'/'||c.id::text||'/%' then raise exception 'Invalid image'; end if;
  insert into public.messages(conversation_id,sender_id,client_id,body,image_path,reply_to)
   values(c.id,p_actor,(p_data->>'client_id')::uuid,trim(coalesce(p_data->>'body','')),p_data->>'image_path',(p_data->>'reply_to')::bigint) returning id into mid;
  update public.conversations set updated_at=now() where id=c.id;
  update public.conversation_members set typing_until=null where conversation_id=c.id and user_id=p_actor;
  return jsonb_build_object('id',mid);
 elsif p_action in ('edit','delete','react') then
  select * into m from public.messages where id=(p_data->>'message_id')::bigint and conversation_id=c.id for update;
  if not found or m.deleted_at is not null then raise exception 'Message not found'; end if;
  if p_action='react' then
   if p_data->>'emoji' is null then delete from public.message_reactions where message_id=m.id and user_id=p_actor;
   else insert into public.message_reactions(message_id,user_id,emoji) values(m.id,p_actor,p_data->>'emoji') on conflict(message_id,user_id) do update set emoji=excluded.emoji; end if;
  else
   if m.sender_id<>p_actor then raise exception 'Message not found'; end if;
   if p_action='edit' then update public.messages set body=trim(p_data->>'body'),edited_at=now() where id=m.id;
   else
    update public.messages set body='',image_path=null,deleted_at=now() where id=m.id;
    delete from public.message_reactions where message_id=m.id;
   end if;
  end if;
 else raise exception 'Invalid action'; end if;
 return '{}';
end;$$;
revoke all on function public.market_chat_start(uuid,uuid),public.market_chat_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.market_chat_start(uuid,uuid),public.market_chat_action(uuid,uuid,text,jsonb) to service_role;

-- Transactional notification creation, independent of product kind; no historical backfill.
create function public.market_order_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='paid' and (tg_op='INSERT' or old.status is distinct from 'paid') then
  insert into public.notifications(user_id,kind,source_id,title,href,amount_cents) values
   (new.seller_id,case when new.amount_cents=0 then 'acquisition' else 'sale' end,new.id,new.product_title,'/studio',new.amount_cents),
   (new.buyer_id,'purchase',new.id,new.product_title,'/library',new.amount_cents) on conflict do nothing;
 elsif new.status in ('refunded','partially_refunded','disputed') and old.status is distinct from new.status then
  insert into public.notifications(user_id,kind,source_id,title,href,amount_cents) values
   (new.seller_id,new.status,new.id,new.product_title,'/studio',new.amount_cents),
   (new.buyer_id,new.status,new.id,new.product_title,'/library',new.amount_cents) on conflict do nothing;
 end if;
 return new;
end;$$;
create trigger order_notifications after insert or update of status on public.orders for each row execute function public.market_order_notification();
create function public.market_offer_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare label text;
begin
 select title into label from public.products where id=new.product_id;
 if tg_op='INSERT' then
  insert into public.notifications(user_id,kind,source_id,title,href,amount_cents) values(new.seller_id,'offer',new.id,label,'/studio',new.amount_cents) on conflict do nothing;
 elsif old.status is distinct from new.status and new.status in ('accepted','declined') then
  insert into public.notifications(user_id,kind,source_id,title,href,amount_cents) values(new.buyer_id,'offer_'||new.status,new.id,label,'/library',new.amount_cents) on conflict do nothing;
 end if;
 return new;
end;$$;
create trigger offer_notifications after insert or update of status on public.offers for each row execute function public.market_offer_notification();
revoke all on function public.market_order_notification(),public.market_offer_notification() from public,anon,authenticated;
create function public.market_chat_inbox(p_actor uuid,p_page integer default 0) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'unread', (select count(*) from public.messages m join public.conversation_members cm on cm.conversation_id=m.conversation_id and cm.user_id=p_actor where m.sender_id<>p_actor and m.created_at>cm.last_read_at and m.deleted_at is null),
 'conversations',coalesce((select jsonb_agg(row_to_json(t) order by t.updated_at desc,t.id) from (
  select c.id,c.updated_at,
   jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url) as peer,
   (select jsonb_build_object('body',m.body,'image',m.image_path is not null,'deleted',m.deleted_at is not null,'sender_id',m.sender_id,'created_at',m.created_at) from public.messages m where m.conversation_id=c.id order by m.id desc limit 1) as latest,
   (select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id<>p_actor and m.created_at>cm.last_read_at and m.deleted_at is null) as unread,
   exists(select 1 from public.user_blocks b where b.user_id=p_actor and b.blocked_id=p.id) as blocked_by_me,
   exists(select 1 from public.user_blocks b where b.user_id=p.id and b.blocked_id=p_actor) as blocked_by_peer
  from public.conversations c join public.conversation_members cm on cm.conversation_id=c.id and cm.user_id=p_actor
  join public.profiles p on p.id=case when c.member_a=p_actor then c.member_b else c.member_a end
  order by c.updated_at desc,c.id limit 30 offset least(greatest(p_page,0),10000)*30
 ) t),'[]'::jsonb));
$$;
revoke all on function public.market_chat_inbox(uuid,integer) from public,anon,authenticated;
grant execute on function public.market_chat_inbox(uuid,integer) to service_role;
notify pgrst, 'reload schema';
commit;
