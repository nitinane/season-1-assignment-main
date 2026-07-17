/**
 * Agent 9 — HR Notifier Service
 * 
 * Exposes a reusable `notify_hr(hr_user_id, event_type, message)` function.
 *   - Sends a short Telegram message to the HR user using the configured Telegram bot.
 *   - Logs the attempt in the `notifications_log` table with the delivery status (delivered: true/false).
 */

import { supabase } from '../lib/supabase';

// Environment variables for Telegram Bot API
const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID || '';

/**
 * Reusable function to notify HR via Telegram Bot and log the attempt.
 * 
 * @param hr_user_id  The UUID of the authenticated HR user
 * @param event_type  The event name (e.g. 'jd_created', 'application_ingested', etc.)
 * @param message     A short descriptive text about the event
 */
export async function notify_hr(
  hr_user_id: string,
  event_type: string,
  message: string
): Promise<boolean> {
  let delivered = false;
  let chat_id = TELEGRAM_CHAT_ID;

  console.log(`[HR Notifier] Event: ${event_type} | Message: ${message}`);

  // Retrieve chat ID from DB
  try {
    const { data: hrUser } = await supabase
      .from('hr_users')
      .select('telegram_chat_id')
      .eq('auth_user_id', hr_user_id)
      .maybeSingle();

    if (hrUser?.telegram_chat_id) {
      chat_id = hrUser.telegram_chat_id;
    }
  } catch (dbLookupErr) {
    console.warn('[HR Notifier] Failed to look up telegram_chat_id from DB:', dbLookupErr);
  }

  if (TELEGRAM_BOT_TOKEN && chat_id) {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chat_id,
          text: `🔔 *HireFlow AI Notification*\n\n*Event:* ${event_type.replace(/_/g, ' ').toUpperCase()}\n*Message:* ${message}`,
          parse_mode: 'Markdown',
        }),
      });

      delivered = response.ok;
      if (!delivered) {
        console.warn(`[HR Notifier] Telegram returned non-ok status: ${response.statusText}`);
      }
    } catch (err) {
      console.error('[HR Notifier] Failed to send Telegram message:', err);
    }
  } else {
    console.warn('[HR Notifier] Telegram credentials (bot token / chat ID) are missing. Skipping real delivery, logging locally.');
  }

  // Log to database notifications_log table
  try {
    const { error } = await supabase.from('notifications_log').insert({
      hr_user_id,
      event_type,
      message,
      delivered,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[HR Notifier] Failed to log notification in DB:', error.message);
    }
  } catch (dbErr) {
    console.error('[HR Notifier] Database logging error:', dbErr);
  }

  return delivered;
}

/**
 * Polls Telegram getUpdates API to find a message matching the user's ID or email,
 * and links their chat ID in the database.
 */
export async function pollAndLinkTelegramChatId(
  authUserId: string,
  email: string
): Promise<{ success: boolean; chat_id?: string; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { success: false, error: 'Telegram Bot Token is not configured.' };
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Telegram API returned non-ok status: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.ok) {
      throw new Error(`Telegram error: ${data.description}`);
    }

    const updates = data.result || [];
    let foundChatId: string | null = null;

    const matchTermId = authUserId.toLowerCase();
    const matchTermEmail = email.toLowerCase();

    for (const update of updates) {
      const msg = update.message || update.edited_message;
      if (!msg || !msg.text) continue;

      const text = msg.text.toLowerCase();
      if (text.includes(matchTermId) || text.includes(matchTermEmail)) {
        foundChatId = String(msg.chat.id);
        break;
      }
    }

    if (foundChatId) {
      const { error } = await supabase
        .from('hr_users')
        .update({ telegram_chat_id: foundChatId })
        .eq('auth_user_id', authUserId);

      if (error) {
        throw new Error(`Database update failed: ${error.message}`);
      }

      return { success: true, chat_id: foundChatId };
    }

    return {
      success: false,
      error: 'No matching message found in recent updates. Please send a message containing your email or user ID to the Telegram bot, then try again.'
    };
  } catch (err: any) {
    console.error('[HR Notifier] pollAndLinkTelegramChatId error:', err);
    return { success: false, error: err.message || String(err) };
  }
}
