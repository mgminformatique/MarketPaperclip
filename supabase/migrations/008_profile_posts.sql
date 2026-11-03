-- MarketPaperclip 008 — public profiles in the style of a social page:
-- a profile photo, a banner and posts presenting the creator's agents and
-- bundles for sale.
-- Browsers only read. Every write goes through the authenticated server
-- routes, which check image signatures, the ownership of attached listings
-- and rate limits. Additive: the code deployed before it keeps working.
begin;

-- Profile photo and banner ----------------------------------------------------
-- Public URLs in the profile-media bucket, written by the server only: the
-- browser update grant on profiles stays limited to display_name, username,
-- bio and website. Public reads use the existing select grant on profiles.
alter table public.profiles add column avatar_url text;
alter table public.profiles add column banner_url text;

-- Posts -----------------------------------------------------------------------
-- A post is text, up to four photos and optionally one of the author's own
-- published listings. The server checks that at least one of them is present.
create table public.posts(
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.profiles(id) on delete cascade,
 body text not null default '' check(length(body)<=2000),
 product_id uuid references public.products(id) on delete set null,
 images text[] not null default '{}' check(cardinality(images)<=4),
 created_at timestamptz not null default now()
);
create index posts_author_idx on public.posts(author_id,created_at desc);
alter table public.posts enable row level security;
create policy posts_read on public.posts for select using(true);
revoke all on public.posts from anon,authenticated;
grant select on public.posts to anon,authenticated;
grant all on public.posts to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-media','profile-media',true,3145728,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- No storage.objects client policies: uploads go through the server routes.
commit;
