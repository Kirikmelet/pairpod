alter table public.users
  add column if not exists clothing_url text;

update public.users
set clothing_url = nullif(configurations #>> '{character3d,clothingImageUrl}', '')
where clothing_url is null
  and nullif(configurations #>> '{character3d,clothingImageUrl}', '') is not null;
