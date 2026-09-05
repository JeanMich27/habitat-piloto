begin;
select plan(6);

select is(
  (select public from storage.buckets where id = 'logos-publicos'),
  true,
  'el bucket de logos es público'
);

select is(
  (select file_size_limit from storage.buckets where id = 'logos-publicos'),
  5242880::bigint,
  'el bucket limita cada logo a 5 MB'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'logos_publicos_%'),
  4,
  'existen las cuatro políticas canónicas del bucket'
);

select alike(
  (select with_check from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'logos_publicos_escritura_broker'),
  '%mi_agencia_id%',
  'la escritura queda limitada a la agencia de la sesión'
);

select alike(
  (select with_check from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'logos_publicos_escritura_broker'),
  '%es_broker%',
  'sólo el broker puede insertar logos'
);

select alike(
  (select qual from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'logos_publicos_actualizacion_broker'),
  '%mi_agencia_id%',
  'un broker no puede actualizar el logo de otra agencia'
);

select * from finish();
rollback;
