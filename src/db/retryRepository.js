import { pool } from './pool.js';

export async function enqueueRetry(type, payload, runAfter) {
  await pool.query(
    'insert into retry_jobs (type, payload, run_after) values ($1, $2, $3)',
    [type, payload, runAfter],
  );
}

export async function getDueRetryJobs(limit = 5) {
  const result = await pool.query(
    `
      select id, type, payload, attempts
      from retry_jobs
      where status = 'pending' and run_after <= now()
      order by run_after asc, id asc
      limit $1
    `,
    [limit],
  );
  return result.rows;
}

export async function markRetryDone(id) {
  await pool.query(
    "update retry_jobs set status = 'done', updated_at = now() where id = $1",
    [id],
  );
}

export async function rescheduleRetry(id, attempts, runAfter, error) {
  await pool.query(
    `
      update retry_jobs
      set attempts = $2, run_after = $3, last_error = $4, updated_at = now()
      where id = $1
    `,
    [id, attempts, runAfter, error],
  );
}

export async function cancelPendingRetriesForTelegramMessages(type, telegramChatId, telegramMessageIds) {
  const result = await pool.query(
    `
      select id, payload
      from retry_jobs
      where type = $1
        and status = 'pending'
        and payload->>'telegramChatId' = $2
    `,
    [type, String(telegramChatId)],
  );

  const targetIds = new Set(telegramMessageIds.map(String));
  const retryIds = result.rows
    .filter((row) => {
      const payloadIds = row.payload.telegramMessageIds ?? [row.payload.telegramMessageId];
      return payloadIds.some((id) => targetIds.has(String(id)));
    })
    .map((row) => row.id);

  if (retryIds.length === 0) return;

  await pool.query(
    `
      update retry_jobs
      set status = 'cancelled',
          updated_at = now(),
          last_error = coalesce(last_error, 'Cancelled after mapping was saved')
      where id = any($1::bigint[])
    `,
    [retryIds],
  );
}
