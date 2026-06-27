import { pool } from './pool.js';

export async function findPostMapping(telegramChatId, telegramMessageId) {
  const result = await pool.query(
    `
      select *
      from post_mappings
      where telegram_chat_id = $1 and telegram_message_id = $2
    `,
    [String(telegramChatId), telegramMessageId],
  );
  return result.rows[0] ?? null;
}

export async function savePostMapping({ telegramChatId, telegramMessageId, openvkOwnerId, openvkPostId, text }) {
  await pool.query(
    `
      insert into post_mappings (
        telegram_chat_id,
        telegram_message_id,
        openvk_owner_id,
        openvk_post_id,
        text,
        updated_at
      )
      values ($1, $2, $3, $4, $5, now())
      on conflict (telegram_chat_id, telegram_message_id)
      do update set
        openvk_owner_id = excluded.openvk_owner_id,
        openvk_post_id = excluded.openvk_post_id,
        text = excluded.text,
        updated_at = now()
    `,
    [String(telegramChatId), telegramMessageId, openvkOwnerId, openvkPostId, text ?? null],
  );
}

export async function savePostMappings({ telegramChatId, telegramMessageIds, openvkOwnerId, openvkPostId, text }) {
  for (const telegramMessageId of telegramMessageIds) {
    await savePostMapping({
      telegramChatId,
      telegramMessageId,
      openvkOwnerId,
      openvkPostId,
      text,
    });
  }
}
