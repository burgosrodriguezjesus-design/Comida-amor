-- Comida Amor: tablas. Cada persona solo puede ver y cambiar sus propios datos (RLS).

-- ---------- Perfiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  timezone text not null default 'Europe/Madrid' check (char_length(timezone) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Al crear la cuenta se crea su perfil con el nombre indicado.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, timezone)
  values (
    new.id,
    coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'name'), 60), ''), 'Yo'),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'Europe/Madrid')
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Registros ----------
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  eaten_at text not null check (eaten_at ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  meal_type text not null check (meal_type in ('desayuno','media_manana','comida','merienda','cena','snack','bebida','otro')),
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 40),
  notes text not null default '' check (char_length(notes) <= 2000),
  feeling_note text not null default '' check (char_length(feeling_note) <= 2000),
  symptoms text[] not null default '{}' check (cardinality(symptoms) <= 8),
  other_symptoms text not null default '' check (char_length(other_symptoms) <= 300),
  photo_ids uuid[] not null default '{}' check (cardinality(photo_ids) <= 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_array_length(items) > 0 or notes <> '')
);
create index entries_user_time on public.entries (user_id, eaten_at);

-- ---------- Fotos (archivos en el bucket privado «photos», carpeta = id de la persona) ----------
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  width int,
  height int,
  created_at timestamptz not null default now()
);
create index photos_user on public.photos (user_id);

-- ---------- Recordatorios ----------
create table public.reminder_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  quiet_minutes int not null default 60 check (quiet_minutes between 0 and 240),
  times jsonb not null default '[{"id":"desayuno","time":"09:30","enabled":true},{"id":"comida","time":"15:00","enabled":true},{"id":"cena","time":"21:45","enabled":true}]'
    check (jsonb_typeof(times) = 'array' and jsonb_array_length(times) <= 8),
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

create table public.reminder_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  reminder_id text not null,
  local_date text not null,
  status text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, reminder_id, local_date)
);

-- ---------- Seguridad por filas ----------
alter table public.profiles enable row level security;
alter table public.entries enable row level security;
alter table public.photos enable row level security;
alter table public.reminder_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_log enable row level security; -- sin políticas: solo el servidor

create policy "perfil propio: leer" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "perfil propio: cambiar" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "registros propios" on public.entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "fotos propias" on public.photos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recordatorios propios" on public.reminder_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "suscripciones propias: leer" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "suscripciones propias: borrar" on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
