begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

select is(
  (select public from storage.buckets where id = 'generated-documents'),
  false,
  'generated-documents es privado'
);

select is(
  (select file_size_limit from storage.buckets where id = 'generated-documents'),
  20971520::bigint,
  'generated-documents limita PDFs a 20 MiB'
);

select results_eq(
  $$select count(*)::int from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and (coalesce(qual, '') ilike '%generated-documents%'
             or coalesce(with_check, '') ilike '%generated-documents%')$$,
  array[0],
  'ninguna política concede acceso directo al bucket privado'
);

select * from finish();
rollback;
