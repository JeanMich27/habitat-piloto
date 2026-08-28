-- Logos públicos del micrositio. Antes de esta migración Configuración guardaba
-- un data: URL en agencias.logo_url: servía como vista previa local, pero el
-- micrositio lo descartaba correctamente porque sólo admite https://.
--
-- Convención de ruta: {agencia_id}/logo.{ext}. Sólo el broker de esa misma
-- agencia puede escribir; la lectura es pública porque el micrositio no exige
-- sesión.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos-publicos', 'logos-publicos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'logos_publicos_lectura_publica'
  ) then
    create policy "logos_publicos_lectura_publica"
      on storage.objects for select
      to public
      using (bucket_id = 'logos-publicos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'logos_publicos_escritura_broker'
  ) then
    create policy "logos_publicos_escritura_broker"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'logos-publicos'
        and (storage.foldername(name))[1] = (select public.mi_agencia_id())
        and (select public.es_broker())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'logos_publicos_actualizacion_broker'
  ) then
    create policy "logos_publicos_actualizacion_broker"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'logos-publicos'
        and (storage.foldername(name))[1] = (select public.mi_agencia_id())
        and (select public.es_broker())
      )
      with check (
        bucket_id = 'logos-publicos'
        and (storage.foldername(name))[1] = (select public.mi_agencia_id())
        and (select public.es_broker())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'logos_publicos_borrado_broker'
  ) then
    create policy "logos_publicos_borrado_broker"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'logos-publicos'
        and (storage.foldername(name))[1] = (select public.mi_agencia_id())
        and (select public.es_broker())
      );
  end if;
end $$;
