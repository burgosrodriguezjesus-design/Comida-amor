-- ---------- Almacenamiento privado de fotos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 12582912, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "fotos: leer las propias" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos: subir a su carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos: borrar las propias" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- Configuración privada del servidor (no expuesta en la API) ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.settings (key text primary key, value text not null);
alter table private.settings enable row level security;

-- Datos para la función de recordatorios (solo con la clave de servicio).
create function public.push_config() returns json
language sql security definer set search_path = '' as $$
  select json_object_agg(key, value) from private.settings
  where key in ('vapid_public_key', 'vapid_private_key', 'vapid_subject', 'cron_secret', 'allow_registration');
$$;
revoke all on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;
