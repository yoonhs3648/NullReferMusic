-- Project 1 live capacity snapshot for server-side aggregation only.
-- The app must call music-admin-capacity instead of this RPC directly.

grant usage, create on schema public to nrm_music_rpc_owner;

create or replace function public.music_rpc_capacity_status()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with policy as (
    select
      warning_bytes,
      disable_discovery_bytes,
      write_stop_bytes,
      hard_limit_bytes
    from public.music_capacity_policy
    where policy_key = 'project1'
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
      limit 20
    ) relation
  )
  select pg_catalog.jsonb_build_object(
    'project_ref', 'bwkiaapffroyveqqjhom',
    'project_label', '프로젝트 1',
    'database_bytes', database_usage.database_bytes,
    'hard_limit_bytes', policy.hard_limit_bytes,
    'usage_ratio',
      case
        when policy.hard_limit_bytes > 0
          then database_usage.database_bytes::double precision / policy.hard_limit_bytes::double precision
        else 0
      end,
    'capacity_state',
      case
        when database_usage.database_bytes >= policy.write_stop_bytes then 'write_stopped'
        when database_usage.database_bytes >= policy.disable_discovery_bytes then 'discovery_disabled'
        when database_usage.database_bytes >= policy.warning_bytes then 'warning'
        else 'normal'
      end,
    'thresholds', pg_catalog.jsonb_build_object(
      'warning_bytes', policy.warning_bytes,
      'disable_discovery_bytes', policy.disable_discovery_bytes,
      'write_stop_bytes', policy.write_stop_bytes
    ),
    'relations', relations.value,
    'captured_at', pg_catalog.clock_timestamp()
  )
  from policy
  cross join database_usage
  cross join relations;
$$;

alter function public.music_rpc_capacity_status() owner to nrm_music_rpc_owner;
revoke create on schema public from nrm_music_rpc_owner;

revoke all on function public.music_rpc_capacity_status() from public, anon, authenticated;
grant execute on function public.music_rpc_capacity_status() to service_role;

comment on function public.music_rpc_capacity_status() is
  '프로젝트 1 실시간 DB/주요 relation 용량을 반환하는 service-role 전용 RPC';
