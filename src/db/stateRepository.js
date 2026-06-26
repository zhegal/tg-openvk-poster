import { pool } from './pool.js';

export async function getState(key) {
  const result = await pool.query('select value from app_state where key = $1', [key]);
  return result.rows[0]?.value ?? null;
}

export async function setState(key, value) {
  await pool.query(
    `
      insert into app_state (key, value, updated_at)
      values ($1, $2, now())
      on conflict (key)
      do update set value = excluded.value, updated_at = now()
    `,
    [key, String(value)],
  );
}

export async function isUpdateProcessed(updateId) {
  const result = await pool.query(
    'select 1 from processed_updates where telegram_update_id = $1',
    [updateId],
  );
  return result.rowCount > 0;
}

export async function markUpdateProcessed(updateId) {
  await pool.query(
    'insert into processed_updates (telegram_update_id) values ($1) on conflict do nothing',
    [updateId],
  );
}
