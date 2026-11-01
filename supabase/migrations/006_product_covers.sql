begin;
alter table public.products add column cover_url text;
grant select(cover_url) on public.products to anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-covers','product-covers',true,3145728,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- Public presentation images, uploaded only through the authenticated server route.
commit;
