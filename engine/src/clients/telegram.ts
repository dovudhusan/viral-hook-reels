import { okJson, withRetry } from '../retry';
import type { Notify } from '../stages/deliver';

export function makeNotify(token: string, chatId: string): Notify {
  return text => withRetry(async () => {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
    });
    await okJson(res, 'Telegram message');
  });
}
