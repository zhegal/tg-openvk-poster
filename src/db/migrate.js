import { pool } from './pool.js';

export async function migrate() {
  await pool.query(`
    create table if not exists app_state (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    );

    create table if not exists processed_updates (
      telegram_update_id bigint primary key,
      processed_at timestamptz not null default now()
    );

    create table if not exists retry_jobs (
      id bigserial primary key,
      type text not null,
      payload jsonb not null,
      status text not null default 'pending',
      attempts integer not null default 0,
      run_after timestamptz not null,
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists retry_jobs_pending_idx
      on retry_jobs (run_after)
      where status = 'pending';

    create table if not exists post_mappings (
      telegram_chat_id text not null,
      telegram_message_id bigint not null,
      openvk_owner_id integer not null,
      openvk_post_id bigint not null,
      text text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (telegram_chat_id, telegram_message_id)
    );

    alter table post_mappings
      alter column text drop not null;
  `);
}
