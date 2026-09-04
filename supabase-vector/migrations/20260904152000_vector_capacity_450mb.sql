-- Project 2 capacity: 450 MiB collection-stop threshold, all public tables, no write-stop UX.

create or replace function public.vector_rpc_capacity_status()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with limits as (
    select
      (449::bigint * 1024 * 1024) as warning_bytes,
      (450::bigint * 1024 * 1024) as disable_discovery_bytes,
      (499::bigint * 1024 * 1024) as write_stop_bytes,
      (500::bigint * 1024 * 1024) as hard_limit_bytes
  ),
  database_usage as (
    select pg_catalog.pg_database_size(pg_catalog.current_database())::bigint as database_bytes
  ),
  relations as (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'schema_name', relation.schema_name,
          'relation_name', relation.relation_name,
          'total_bytes', relation.total_bytes,
          'table_bytes', relation.table_bytes,
          'index_bytes', relation.index_bytes
        )
        order by relation.total_bytes desc, relation.relation_name
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        namespace.nspname as schema_name,
        relation.relname as relation_name,
        pg_catalog.pg_total_relation_size(relation.oid)::bigint as total_bytes,
        pg_catalog.pg_table_size(relation.oid)::bigint as table_bytes,
        pg_catalog.pg_indexes_size(relation.oid)::bigint as index_bytes
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relkind in ('r', 'm')
      order by pg_catalog.pg_total_relation_size(relation.oid) desc, relation.relname
    ) relation
  )
  select pg_catalog.jsonb_build_object(
    'project_ref', 'eyzutsvsqxsxhjgydgoz',
    'project_label', '프로젝트 2',
    'database_bytes', database_usage.database_bytes,
    'hard_limit_bytes', limits.hard_limit_bytes,
    'usage_ratio',
      database_usage.database_bytes::double precision / limits.hard_limit_bytes::double precision,
    'capacity_state',
      case
        when database_usage.database_bytes >= limits.disable_discovery_bytes then 'discovery_disabled'
        else 'normal'
      end,
    'thresholds', pg_catalog.jsonb_build_object(
      'warning_bytes', limits.warning_bytes,
      'disable_discovery_bytes', limits.disable_discovery_bytes,
      'write_stop_bytes', limits.write_stop_bytes
    ),
    'relations', relations.value,
    'captured_at', pg_catalog.clock_timestamp()
  )
  from limits
  cross join database_usage
  cross join relations;
$$;

alter function public.vector_rpc_capacity_status() owner to nrm_vector_rpc_owner;
revoke all on function public.vector_rpc_capacity_status() from public, anon, authenticated;
grant execute on function public.vector_rpc_capacity_status() to service_role;

comment on function public.vector_rpc_capacity_status() is
  '프로젝트 2 실시간 DB/전체 public 테이블 용량. 450MiB 이상이면 discovery_disabled.';
