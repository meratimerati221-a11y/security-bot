const TELEGRAM_API = (token) =>
  `https://api.telegram.org/bot${token}`;

const WARN_LIMIT = 3;
const MUTE_MINUTES = 10;

// ---------- Telegram API ----------

async function telegram(token, method, body) {
  const response = await fetch(`${TELEGRAM_API(token)}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return await response.json();
}

async function sendMessage(token, chatId, text, extra = {}) {
  return telegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    ...extra
  });
}

async function deleteMessage(token, chatId, messageId) {
  return telegram(token, "deleteMessage", {
    chat_id: chatId,
    message_id: messageId
  });
}

// ---------- Admin ----------

async function isAdmin(token, chatId, userId) {
  if (!userId) return false;

  const result = await telegram(token, "getChatMember", {
    chat_id: chatId,
    user_id: userId
  });

  if (!result.ok) return false;

  return (
    result.result.status === "administrator" ||
    result.result.status === "creator"
  );
}

// ---------- Text ----------

function normalize(text) {
  if (!text) return "";

  return text
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/@\w+$/, "")
    .trim();
}

function getCommand(text) {
  const value = normalize(text);

  const commands = {
    "ربات": "bot",
    "start": "bot",

    "پنل": "panel",
    "panel": "panel",

    "راهنما": "help",
    "help": "help",

    "اخطار": "warn",
    "warn": "warn",

    "سکوت": "mute",
    "mute": "mute",

    "رفع سکوت": "unmute",
    "رفع‌سکوت": "unmute",
    "unmute": "unmute",

    "وضعیت": "status",
    "status": "status"
  };

  return commands[value] || null;
}

// ---------- Warn System ----------

async function getWarnings(env, chatId, userId) {
  const key = `warn:${chatId}:${userId}`;

  const value = await env.SECURITY_KV.get(key);

  if (!value) return 0;

  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

async function setWarnings(env, chatId, userId, count) {
  const key = `warn:${chatId}:${userId}`;

  await env.SECURITY_KV.put(key, String(count));
}

async function clearWarnings(env, chatId, userId) {
  const key = `warn:${chatId}:${userId}`;

  await env.SECURITY_KV.delete(key);
}

// ---------- Mute ----------

async function muteUser(token, chatId, userId, minutes) {
  const until = Math.floor(Date.now() / 1000) + minutes * 60;

  return telegram(token, "restrictChatMember", {
    chat_id: chatId,
    user_id: userId,
    until_date: until,
    permissions: {
      can_send_messages: false,
      can_send_audios: false,
      can_send_documents: false,
      can_send_photos: false,
      can_send_videos: false,
      can_send_video_notes: false,
      can_send_voice_notes: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false
    }
  });
}

async function unmuteUser(token, chatId, userId) {
  return telegram(token, "restrictChatMember", {
    chat_id: chatId,
    user_id: userId,
    permissions: {
      can_send_messages: true,
      can_send_audios: true,
      can_send_documents: true,
      can_send_photos: true,
      can_send_videos: true,
      can_send_video_notes: true,
      can_send_voice_notes: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true
    }
  });
}

// ---------- Links ----------

function containsLink(text) {
  if (!text) return false;

  const patterns = [
    /https?:\/\//i,
    /www\./i,
    /t\.me\//i,
    /telegram\.me\//i
  ];

  return patterns.some((pattern) => pattern.test(text));
}

// ---------- Main Handler ----------

async function handleUpdate(update, env) {
  const token = env.BOT_TOKEN;

  if (!token) {
    console.error("BOT_TOKEN is missing");
    return;
  }

  if (!update.message) return;

  const message = update.message;
  const chat = message.chat;
  const from = message.from;

  if (!chat || !from) return;

  const chatId = chat.id;
  const userId = from.id;

  const text =
    message.text ||
    message.caption ||
    "";

  // ---------- Commands ----------

  const command = getCommand(text);

  if (command) {
    const admin = await isAdmin(token, chatId, userId);

    // ربات
    if (command === "bot") {
      await sendMessage(
        token,
        chatId,
        "🛡 Security Bot فعاله و آماده محافظت از گروه است."
      );
      return;
    }

    // وضعیت
    if (command === "status") {
      await sendMessage(
        token,
        chatId,
        "🟢 وضعیت ربات: فعال\n🛡 سیستم امنیتی: فعال\n💾 سیستم اخطار: فعال"
      );
      return;
    }

    // راهنما
    if (command === "help") {
      await sendMessage(
        token,
        chatId,
        `🛡 راهنمای Security Bot

🤖 ربات
نمایش وضعیت ربات

📋 پنل
نمایش پنل مدیریت

⚠️ اخطار
روی پیام کاربر ریپلای کنید و بنویسید «اخطار»

🔇 سکوت
روی پیام کاربر ریپلای کنید و بنویسید «سکوت»

🔊 رفع سکوت
روی پیام کاربر ریپلای کنید و بنویسید «رفع سکوت»

📊 وضعیت
نمایش وضعیت سیستم`
      );
      return;
    }

    // پنل
    if (command === "panel") {
      if (!admin) {
        await sendMessage(
          token,
          chatId,
          "⛔ فقط مدیران گروه به پنل مدیریت دسترسی دارند."
        );
        return;
      }

      await sendMessage(
        token,
        chatId,
        `🛡 پنل مدیریت Security Bot

⚠️ سیستم اخطار: فعال
🔇 سیستم سکوت: فعال
🔗 ضد لینک: فعال
💾 ذخیره اخطارها: فعال

دستورات:

⚠️ اخطار
🔇 سکوت
🔊 رفع سکوت
📊 وضعیت`
      );

      return;
    }

    // دستورات مدیریتی
    if (
      command === "warn" ||
      command === "mute" ||
      command === "unmute"
    ) {
      if (!admin) {
        await sendMessage(
          token,
          chatId,
          "⛔ این دستور فقط برای مدیران گروه است."
        );
        return;
      }

      if (!message.reply_to_message) {
        await sendMessage(
          token,
          chatId,
          "⚠️ این دستور باید با ریپلای روی پیام کاربر استفاده شود."
        );
        return;
      }

      const target = message.reply_to_message.from;

      if (!target) {
        await sendMessage(
          token,
          chatId,
          "❌ کاربر موردنظر پیدا نشد."
        );
        return;
      }

      const targetIsAdmin = await isAdmin(
        token,
        chatId,
        target.id
      );

      if (targetIsAdmin) {
        await sendMessage(
          token,
          chatId,
          "⛔ نمی‌توانم روی مدیر گروه این عملیات را انجام دهم."
        );
        return;
      }

      // اخطار
      if (command === "warn") {
        let warnings = await getWarnings(
          env,
          chatId,
          target.id
        );

        warnings++;

        if (warnings >= WARN_LIMIT) {
          const muteResult = await muteUser(
            token,
            chatId,
            target.id,
            MUTE_MINUTES
          );

          if (muteResult.ok) {
            await clearWarnings(
              env,
              chatId,
              target.id
            );

            await sendMessage(
              token,
              chatId,
              `🔴 ${target.first_name || "کاربر"} به ۳ اخطار رسید و برای ${MUTE_MINUTES} دقیقه سکوت شد.`
            );
          } else {
            await sendMessage(
              token,
              chatId,
              "❌ اخطار ثبت شد، اما اجرای سکوت خودکار با خطا مواجه شد."
            );
          }

          return;
        }

        await setWarnings(
          env,
          chatId,
          target.id,
          warnings
        );

        await sendMessage(
          token,
          chatId,
          `⚠️ اخطار برای ${target.first_name || "کاربر"} ثبت شد.\n\nتعداد اخطار: ${warnings}/${WARN_LIMIT}`
        );

        return;
      }

      // سکوت
      if (command === "mute") {
        const result = await muteUser(
          token,
          chatId,
          target.id,
          MUTE_MINUTES
        );

        if (result.ok) {
          await sendMessage(
            token,
            chatId,
            `🔇 ${target.first_name || "کاربر"} برای ${MUTE_MINUTES} دقیقه سکوت شد.`
          );
        } else {
          await sendMessage(
            token,
            chatId,
            "❌ نتوانستم کاربر را سکوت کنم. مطمئن شو ربات دسترسی لازم را دارد."
          );
        }

        return;
      }

      // رفع سکوت
      if (command === "unmute") {
        const result = await unmuteUser(
          token,
          chatId,
          target.id
        );

        if (result.ok) {
          await sendMessage(
            token,
            chatId,
            `🔊 سکوت ${target.first_name || "کاربر"} برداشته شد.`
          );
        } else {
          await sendMessage(
            token,
            chatId,
            "❌ نتوانستم سکوت کاربر را بردارم."
          );
        }

        return;
      }
    }
  }

  // ---------- Anti Link ----------

  const admin = await isAdmin(token, chatId, userId);

  if (!admin && containsLink(text)) {
    await deleteMessage(
      token,
      chatId,
      message.message_id
    );

    await sendMessage(
      token,
      chatId,
      `🔗 ${from.first_name || "کاربر"}، ارسال لینک در این گروه مجاز نیست.`
    );

    return;
  }
}

// ---------- Worker ----------

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response(
        "Security Bot is running.",
        { status: 200 }
      );
    }

    try {
      const update = await request.json();

      await handleUpdate(update, env);

      return new Response("OK", {
        status: 200
      });
    } catch (error) {
      console.error("Worker error:", error);

      return new Response("OK", {
        status: 200
      });
    }
  }
};
// GitHub build trigger test