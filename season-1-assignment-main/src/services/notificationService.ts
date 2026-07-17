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

  console.log(`[HR Notifier] Event: ${event_type} | Message: ${message}`);

  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
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
    console.warn('[HR Notifier] Telegram credentials (VITE_TELEGRAM_BOT_TOKEN, VITE_TELEGRAM_CHAT_ID) are missing. Skipping real delivery, logging locally.');
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
