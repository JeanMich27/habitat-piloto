-- Bucket público para la foto de perfil del micrositio. No existía ninguna
-- imagen de asesor en Storage antes de esto (solo 'generated-documents',
-- privado). Convención de ruta: {auth_uid}/archivo — así la política de
-- escritura no necesita tocar la tabla usuarios, solo compara con auth.uid().

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares-publicos', 'avatares-publicos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatares_publicos_lectura_publica'
  ) then
    create policy "avatares_publicos_lectura_publica"
      on storage.objects for select
      to public
      using (bucket_id = 'avatares-publicos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatares_publicos_escritura_propia'
  ) then
    create policy "avatares_publicos_escritura_propia"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'avatares-publicos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatares_publicos_actualizacion_propia'
  ) then
    create policy "avatares_publicos_actualizacion_propia"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'avatares-publicos'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'avatares-publicos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatares_publicos_borrado_propio'
  ) then
    create policy "avatares_publicos_borrado_propio"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'avatares-publicos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
