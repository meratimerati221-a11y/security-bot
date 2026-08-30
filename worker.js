/*
 * ============================================================
 * TELEGRAM SECURITY / ADMIN BOT
 * Cloudflare Workers + KV
 *
 * Required:
 *   BOT_TOKEN   -> Worker Secret
 *   SECURITY_KV -> KV Namespace
 *
 * Do NOT put the bot token directly in this file.
 * ============================================================
 */

const API_BASE = "https://api.telegram.org/bot";

const DEFAULT_SETTINGS = {
  welcome: true,
  goodbye: false,

  antiLink: false,
  antiFlood: false,
  antiSpam: false,

  warnings: true,
  maxWarnings: 3,

  lockPhoto: false,
  lockVideo: false,
  lockDocument: false,
  lockSticker: false,
  lockVoice: false,
  lockForward: false,

  deleteCommands: false,

  welcomeText:
    "👋 سلام {name}\nبه {title} خوش اومدی.",

  goodbyeText:
    "👋 {name} از گروه خارج شد.",

  warningText:
    "⚠️ {name} اخطار گرفت.\nتعداد اخطار: {count}/{max}",

  antiLinkText:
    "🚫 ارسال لینک در این گروه مجاز نیست.",

  language: "fa"
};


/* ============================================================
 * RESPONSE HELPERS
 * ============================================================
 */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    }
  );
}


/* ============================================================
 * TELEGRAM API
 * ============================================================
 */

async function telegram(method, env, payload = {}) {
  if (!env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is not configured");
  }

  const response = await fetch(
    `${API_BASE}${env.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Telegram returned invalid JSON (${response.status})`
    );
  }

  if (!data.ok) {
    throw new Error(
      `Telegram API error: ${data.description || "unknown error"}`
    );
  }

  return data.result;
}


/* ============================================================
 * TELEGRAM METHODS
 * ============================================================
 */

async function sendMessage(
  env,
  chatId,
  text,
  extra = {}
) {
  return telegram(
    "sendMessage",
    env,
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...extra
    }
  );
}


async function editMessage(
  env,
  chatId,
  messageId,
  text,
  extra = {}
) {
  return telegram(
    "editMessageText",
    env,
    {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      ...extra
    }
  );
}


async function answerCallback(
  env,
  callbackId,
  text = "",
  showAlert = false
) {
  return telegram(
    "answerCallbackQuery",
    env,
    {
      callback_query_id: callbackId,
      text,
      show_alert: showAlert
    }
  );
}


async function deleteMessage(
  env,
  chatId,
  messageId
) {
  try {
    return await telegram(
      "deleteMessage",
      env,
      {
        chat_id: chatId,
        message_id: messageId
      }
    );
  } catch (error) {
    console.error(
      "deleteMessage:",
      error.message
    );

    return false;
  }
}


/* ============================================================
 * HTML ESCAPE
 * ============================================================
 */

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}


/* ============================================================
 * USER HELPERS
 * ============================================================
 */

function userName(user) {
  if (!user) {
    return "کاربر";
  }

  const first = user.first_name || "";
  const last = user.last_name || "";

  const name =
    `${first} ${last}`.trim();

  return name ||
    user.username ||
    "کاربر";
}


function displayName(user) {
  const name = userName(user);

  return escapeHTML(name);
}


function username(user) {
  if (!user?.username) {
    return "";
  }

  return `@${escapeHTML(user.username)}`;
}


/* ============================================================
 * OWNER SYSTEM
 *
 * Put numeric Telegram IDs here.
 * The example values below are placeholders.
 * ============================================================
 */

const OWNER_IDS = [
  // 123456789,
  // 987654321,
];


function isOwner(userId) {
  return OWNER_IDS.includes(
    Number(userId)
  );
}


/* ============================================================
 * KV HELPERS
 * ============================================================
 */

function requireKV(env) {
  if (!env.SECURITY_KV) {
    throw new Error(
      "SECURITY_KV binding is missing"
    );
  }

  return env.SECURITY_KV;
}


async function kvGet(
  env,
  key,
  fallback = null
) {
  const kv = requireKV(env);

  const value =
    await kv.get(key);

  if (value === null) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}


async function kvPut(
  env,
  key,
  value,
  options
) {
  const kv = requireKV(env);

  await kv.put(
    key,
    typeof value === "string"
      ? value
      : JSON.stringify(value),
    options
  );
}


async function kvDelete(
  env,
  key
) {
  const kv = requireKV(env);

  await kv.delete(key);
}


/* ============================================================
 * SETTINGS
 * ============================================================
 */

function settingsKey(chatId) {
  return `settings:${chatId}`;
}


async function getSettings(
  env,
  chatId
) {
  const stored =
    await kvGet(
      env,
      settingsKey(chatId),
      {}
    );

  return {
    ...DEFAULT_SETTINGS,
    ...(stored || {})
  };
}


async function saveSettings(
  env,
  chatId,
  settings
) {
  await kvPut(
    env,
    settingsKey(chatId),
    settings
  );

  return settings;
}


async function updateSetting(
  env,
  chatId,
  key,
  value
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  settings[key] = value;

  await saveSettings(
    env,
    chatId,
    settings
  );

  return settings;
}


/* ============================================================
 * WARNINGS
 * ============================================================
 */

function warningKey(
  chatId,
  userId
) {
  return `warnings:${chatId}:${userId}`;
}


async function getWarnings(
  env,
  chatId,
  userId
) {
  return Number(
    await kvGet(
      env,
      warningKey(chatId, userId),
      0
    )
  );
}


async function setWarnings(
  env,
  chatId,
  userId,
  count
) {
  await kvPut(
    env,
    warningKey(chatId, userId),
    Number(count)
  );
}


async function clearWarnings(
  env,
  chatId,
  userId
) {
  await kvDelete(
    env,
    warningKey(chatId, userId)
  );
}


/* ============================================================
 * FLOOD / MESSAGE CACHE
 * ============================================================
 */

function floodKey(
  chatId,
  userId
) {
  return `flood:${chatId}:${userId}`;
}


async function checkFlood(
  env,
  chatId,
  userId
) {
  const key =
    floodKey(chatId, userId);

  const now =
    Date.now();

  const history =
    await kvGet(
      env,
      key,
      []
    );

  const recent =
    Array.isArray(history)
      ? history.filter(
          timestamp =>
            now - timestamp < 10000
        )
      : [];

  recent.push(now);

  await kvPut(
    env,
    key,
    recent,
    {
      expirationTtl: 30
    }
  );

  return recent.length;
}


/* ============================================================
 * LINK DETECTION
 * ============================================================
 */

const LINK_REGEX =
  /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|bit\.ly\/|tinyurl\.com\/)/i;


function containsLink(text) {
  if (!text) {
    return false;
  }

  return LINK_REGEX.test(
    String(text)
  );
}


/* ============================================================
 * MESSAGE TYPE
 * ============================================================
 */

function messageHasPhoto(message) {
  return Array.isArray(
    message?.photo
  ) && message.photo.length > 0;
}


function messageHasVideo(message) {
  return Boolean(
    message?.video
  );
}


function messageHasDocument(message) {
  return Boolean(
    message?.document
  );
}


function messageHasSticker(message) {
  return Boolean(
    message?.sticker
  );
}


function messageHasVoice(message) {
  return Boolean(
    message?.voice
  );
}


function isForwarded(message) {
  return Boolean(
    message?.forward_origin ||
    message?.forward_from ||
    message?.forward_from_chat
  );
}


/* ============================================================
 * ADMIN CHECK
 * ============================================================
 */

async function getChatMember(
  env,
  chatId,
  userId
) {
  return telegram(
    "getChatMember",
    env,
    {
      chat_id: chatId,
      user_id: userId
    }
  );
}


async function isAdmin(
  env,
  chatId,
  userId
) {
  if (isOwner(userId)) {
    return true;
  }

  try {
    const member =
      await getChatMember(
        env,
        chatId,
        userId
      );

    return (
      member.status === "administrator" ||
      member.status === "creator"
    );
  } catch (error) {
    console.error(
      "isAdmin:",
      error.message
    );

    return false;
  }
}


async function isCreator(
  env,
  chatId,
  userId
) {
  if (isOwner(userId)) {
    return true;
  }

  try {
    const member =
      await getChatMember(
        env,
        chatId,
        userId
      );

    return (
      member.status === "creator"
    );
  } catch {
    return false;
  }
}


/* ============================================================
 * BOT PERMISSIONS
 * ============================================================
 */

async function getBotPermissions(
  env,
  chatId
) {
  try {
    const me =
      await telegram(
        "getMe",
        env
      );

    return await getChatMember(
      env,
      chatId,
      me.id
    );
  } catch (error) {
    console.error(
      "getBotPermissions:",
      error.message
    );

    return null;
  }
}


/* ============================================================
 * MODERATION
 * ============================================================
 */

async function restrictUser(
  env,
  chatId,
  userId,
  untilDate = 0
) {
  return telegram(
    "restrictChatMember",
    env,
    {
      chat_id: chatId,
      user_id: userId,
      until_date: untilDate,
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
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false,
        can_manage_topics: false
      }
    }
  );
}


async function unrestrictUser(
  env,
  chatId,
  userId
) {
  return telegram(
    "restrictChatMember",
    env,
    {
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
        can_add_web_page_previews: true,
        can_change_info: false,
        can_invite_users: true,
        can_pin_messages: false,
        can_manage_topics: false
      }
    }
  );
}


async function banUser(
  env,
  chatId,
  userId
) {
  return telegram(
    "banChatMember",
    env,
    {
      chat_id: chatId,
      user_id: userId
    }
  );
}


async function unbanUser(
  env,
  chatId,
  userId
) {
  return telegram(
    "unbanChatMember",
    env,
    {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: false
    }
  );
}


/* ============================================================
 * INLINE KEYBOARDS
 * ============================================================
 */

function mainKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "⚙️ تنظیمات گروه",
          callback_data: "panel:settings"
        }
      ],
      [
        {
          text: "🛡️ امنیت",
          callback_data: "panel:security"
        },
        {
          text: "👮 مدیریت",
          callback_data: "panel:moderation"
        }
      ],
      [
        {
          text: "⚠️ اخطارها",
          callback_data: "panel:warnings"
        },
        {
          text: "📊 آمار",
          callback_data: "panel:stats"
        }
      ],
      [
        {
          text: "❓ راهنما",
          callback_data: "panel:help"
        }
      ]
    ]
  };
}


function backKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "⬅️ بازگشت",
          callback_data: "panel:main"
        }
      ]
    ]
  };
}


function securityKeyboard(settings) {
  return {
    inline_keyboard: [
      [
        {
          text:
            `${settings.antiLink ? "🟢" : "🔴"} حذف لینک`,
          callback_data: "toggle:antiLink"
        }
      ],
      [
        {
          text:
            `${settings.antiFlood ? "🟢" : "🔴"} ضد فلود`,
          callback_data: "toggle:antiFlood"
        },
        {
          text:
            `${settings.antiSpam ? "🟢" : "🔴"} ضد اسپم`,
          callback_data: "toggle:antiSpam"
        }
      ],
      [
        {
          text:
            `${settings.lockPhoto ? "🟢" : "🔴"} قفل عکس`,
          callback_data: "toggle:lockPhoto"
        },
        {
          text:
            `${settings.lockVideo ? "🟢" : "🔴"} قفل ویدیو`,
          callback_data: "toggle:lockVideo"
        }
      ],
      [
        {
          text:
            `${settings.lockDocument ? "🟢" : "🔴"} قفل فایل`,
          callback_data: "toggle:lockDocument"
        },
        {
          text:
            `${settings.lockSticker ? "🟢" : "🔴"} قفل استیکر`,
          callback_data: "toggle:lockSticker"
        }
      ],
      [
        {
          text:
            `${settings.lockVoice ? "🟢" : "🔴"} قفل ویس`,
          callback_data: "toggle:lockVoice"
        },
        {
          text:
            `${settings.lockForward ? "🟢" : "🔴"} ضد فوروارد`,
          callback_data: "toggle:lockForward"
        }
      ],
      [
        {
          text: "⬅️ بازگشت",
          callback_data: "panel:main"
        }
      ]
    ]
  };
}


/* ============================================================
 * PANEL TEXT
 * ============================================================
 */

function mainPanelText() {
  return (
    "🤖 <b>پنل مدیریت ربات</b>\n\n" +
    "از گزینه‌های زیر بخش موردنظر را انتخاب کنید."
  );
}


function securityPanelText(settings) {
  return (
    "🛡️ <b>مرکز امنیت</b>\n\n" +
    `حذف لینک: ${settings.antiLink ? "فعال 🟢" : "غیرفعال 🔴"}\n` +
    `ضد فلود: ${settings.antiFlood ? "فعال 🟢" : "غیرفعال 🔴"}\n` +
    `ضد اسپم: ${settings.antiSpam ? "فعال 🟢" : "غیرفعال 🔴"}\n` +
    `قفل عکس: ${settings.lockPhoto ? "فعال 🟢" : "غیرفعال 🔴"}\n` +
    `قفل ویدیو: ${settings.lockVideo ? "فعال 🟢" : "غیرفعال 🔴"}\n` +
    `قفل فایل: ${settings.lockDocument ? "فعال 🟢" : "غیرفعال 🔴"}\n` +
    `قفل استیکر: ${settings.lockSticker ? "فعال 🟢" : "غیرفعال 🔴"}\n` +
    `قفل ویس: ${settings.lockVoice ? "فعال 🟢" : "غیرفعال 🔴"}\n` +
    `ضد فوروارد: ${settings.lockForward ? "فعال 🟢" : "غیرفعال 🔴"}`
  );
}


/* ============================================================
 * OWNER / ADMIN HELP
 * ============================================================
 */

async function sendOwnerHelp(
  env,
  chatId
) {
  await sendMessage(
    env,
    chatId,
    [
      "👑 <b>راهنمای مالک</b>",
      "",
      "/panel — پنل مدیریت",
      "/settings — تنظیمات",
      "/security — امنیت",
      "/stats — آمار",
      "/warn — اخطار",
      "/mute — سکوت",
      "/unmute — رفع سکوت",
      "/ban — مسدود کردن",
      "/unban — رفع مسدودی",
      "/id — شناسه کاربر",
      "",
      "برای مدیریت یک کاربر، می‌توانی روی پیام همان کاربر ریپلای کنی."
    ].join("\n"),
    {
      reply_markup: mainKeyboard()
    }
  );
}
/* ============================================================
 * PANEL HELPERS
 * ============================================================
 */

function moderationKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "🔇 سکوت کاربر",
          callback_data: "mod:mute"
        },
        {
          text: "🔊 رفع سکوت",
          callback_data: "mod:unmute"
        }
      ],
      [
        {
          text: "🚫 مسدود کردن",
          callback_data: "mod:ban"
        },
        {
          text: "✅ رفع مسدودی",
          callback_data: "mod:unban"
        }
      ],
      [
        {
          text: "⚠️ اخطار",
          callback_data: "mod:warn"
        }
      ],
      [
        {
          text: "⬅️ بازگشت",
          callback_data: "panel:main"
        }
      ]
    ]
  };
}


function warningsKeyboard(settings) {
  return {
    inline_keyboard: [
      [
        {
          text:
            `${settings.warnings ? "🟢" : "🔴"} سیستم اخطار`,
          callback_data: "toggle:warnings"
        }
      ],
      [
        {
          text: "➖ کاهش حد اخطار",
          callback_data: "warning:down"
        },
        {
          text: "➕ افزایش حد اخطار",
          callback_data: "warning:up"
        }
      ],
      [
        {
          text: "🗑️ پاک‌کردن اخطارها",
          callback_data: "warning:clear"
        }
      ],
      [
        {
          text: "⬅️ بازگشت",
          callback_data: "panel:main"
        }
      ]
    ]
  };
}


/* ============================================================
 * COMMAND NORMALIZATION
 * ============================================================
 */

function normalizeCommand(text) {
  if (!text) {
    return "";
  }

  const value =
    String(text)
      .trim()
      .toLowerCase();

  const command =
    value
      .split(/\s+/)[0]
      .split("@")[0];

  const aliases = {
    "/start": "/start",
    "start": "/start",

    "/help": "/help",
    "help": "/help",
    "راهنما": "/help",

    "/panel": "/panel",
    "panel": "/panel",
    "پنل": "/panel",

    "/settings": "/settings",
    "settings": "/settings",
    "تنظیمات": "/settings",

    "/security": "/security",
    "security": "/security",
    "امنیت": "/security",

    "/stats": "/stats",
    "stats": "/stats",
    "آمار": "/stats",

    "/id": "/id",
    "id": "/id",
    "ایدی": "/id",
    "آیدی": "/id",

    "/warn": "/warn",
    "warn": "/warn",
    "اخطار": "/warn",

    "/mute": "/mute",
    "mute": "/mute",
    "سکوت": "/mute",

    "/unmute": "/unmute",
    "unmute": "/unmute",
    "رفع_سکوت": "/unmute",

    "/ban": "/ban",
    "ban": "/ban",
    "بن": "/ban",

    "/unban": "/unban",
    "unban": "/unban",
    "رفع_بن": "/unban"
  };

  return aliases[command] || command;
}


/* ============================================================
 * START
 * ============================================================
 */

async function handleStart(
  message,
  env
) {
  const chatId =
    message.chat.id;

  const userId =
    Number(message.from?.id || 0);

  if (
    message.chat.type ===
    "private"
  ) {
    const owner =
      isOwner(userId);

    const text =
      owner
        ? [
            "👑 <b>خوش آمدی مالک</b>",
            "",
            "🤖 ربات امنیتی آماده است.",
            "",
            "از پنل زیر برای مدیریت استفاده کن."
          ].join("\n")
        : [
            "🤖 <b>ربات امنیتی</b>",
            "",
            "این ربات برای مدیریت و امنیت گروه‌ها طراحی شده است.",
            "",
            "برای مشاهده راهنما روی دکمه زیر بزن."
          ].join("\n");

    await sendMessage(
      env,
      chatId,
      text,
      {
        reply_markup:
          owner
            ? mainKeyboard()
            : {
                inline_keyboard: [
                  [
                    {
                      text: "❓ راهنما",
                      callback_data:
                        "panel:help"
                    }
                  ]
                ]
              }
      }
    );

    return;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    settings.welcome
  ) {
    const name =
      displayName(
        message.from
      );

    const title =
      escapeHTML(
        message.chat.title ||
        "گروه"
      );

    await sendMessage(
      env,
      chatId,
      `🤖 ربات امنیتی فعال شد.\n\n👋 سلام ${name}\n\nبه <b>${title}</b> خوش اومدی.`
    );
  }
}


/* ============================================================
 * PRIVATE MESSAGE
 * ============================================================
 */

async function handlePrivate(
  message,
  env
) {
  const userId =
    Number(
      message.from?.id || 0
    );

  const chatId =
    message.chat.id;

  const text =
    String(
      message.text || ""
    ).trim();

  const command =
    normalizeCommand(
      text
    );

  if (
    command === "/start"
  ) {
    await handleStart(
      message,
      env
    );

    return;
  }

  if (
    command === "/id"
  ) {
    await sendMessage(
      env,
      chatId,
      "🆔 <b>User ID</b>\n" +
      `<code>${userId}</code>`
    );

    return;
  }

  if (
    command === "/help"
  ) {
    if (
      isOwner(userId)
    ) {
      await sendOwnerHelp(
        env,
        chatId
      );
    } else {
      await sendMessage(
        env,
        chatId,
        [
          "❓ <b>راهنما</b>",
          "",
          "این ربات برای مدیریت و امنیت گروه‌ها استفاده می‌شود.",
          "",
          "اگر مالک یا مدیر گروه هستی، ربات را به گروه اضافه کن و دسترسی‌های لازم را بده."
        ].join("\n")
      );
    }

    return;
  }

  if (
    command === "/panel" ||
    command === "/settings" ||
    command === "/security"
  ) {
    if (
      !isOwner(userId)
    ) {
      await sendMessage(
        env,
        chatId,
        "⛔ دسترسی به پنل مدیریت فقط برای مالک ربات فعال است."
      );

      return;
    }

    await sendMessage(
      env,
      chatId,
      mainPanelText(),
      {
        reply_markup:
          mainKeyboard()
      }
    );

    return;
  }

  if (
    isOwner(userId) &&
    text
  ) {
    await sendMessage(
      env,
      chatId,
      "⚙️ دستور شناخته نشد.\n\nبرای مشاهده امکانات، /panel را بزن."
    );

    return;
  }
}


/* ============================================================
 * GROUP COMMAND HELPERS
 * ============================================================
 */

function getReplyUser(
  message
) {
  return (
    message.reply_to_message?.from ||
    null
  );
}


async function requireAdmin(
  message,
  env
) {
  const userId =
    Number(
      message.from?.id || 0
    );

  return isAdmin(
    env,
    message.chat.id,
    userId
  );
}


async function requireReplyUser(
  message,
  env
) {
  const target =
    getReplyUser(
      message
    );

  if (!target) {
    await sendMessage(
      env,
      message.chat.id,
      "⚠️ برای اجرای این دستور باید روی پیام کاربر ریپلای کنی."
    );

    return null;
  }

  if (
    target.is_bot
  ) {
    await sendMessage(
      env,
      message.chat.id,
      "🤖 نمی‌توانم یک ربات را مدیریت کنم."
    );

    return null;
  }

  return target;
}


/* ============================================================
 * WARNING
 * ============================================================
 */

async function issueWarning(
  message,
  env
) {
  const target =
    await requireReplyUser(
      message,
      env
    );

  if (!target) {
    return;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(target.id);

  const settings =
    await getSettings(
      env,
      chatId
    );

  const count =
    (
      await getWarnings(
        env,
        chatId,
        userId
      )
    ) + 1;

  await setWarnings(
    env,
    chatId,
    userId,
    count
  );

  const name =
    displayName(
      target
    );

  await sendMessage(
    env,
    chatId,
    [
      "⚠️ <b>اخطار</b>",
      "",
      `👤 ${name}`,
      `📊 اخطار: <b>${count}/${settings.maxWarnings}</b>`
    ].join("\n")
  );

  if (
    count >=
    settings.maxWarnings
  ) {
    try {
      await restrictUser(
        env,
        chatId,
        userId,
        Math.floor(
          Date.now() / 1000
        ) + 3600
      );

      await clearWarnings(
        env,
        chatId,
        userId
      );

      await sendMessage(
        env,
        chatId,
        `🔇 ${name} به دلیل رسیدن به سقف اخطارها، به مدت یک ساعت محدود شد.`
      );
    } catch (error) {
      console.error(
        "Automatic mute:",
        error.message
      );
    }
  }
}


/* ============================================================
 * MUTE
 * ============================================================
 */

async function muteReplyUser(
  message,
  env
) {
  const target =
    await requireReplyUser(
      message,
      env
    );

  if (!target) {
    return;
  }

  try {
    await restrictUser(
      env,
      message.chat.id,
      target.id
    );

    await sendMessage(
      env,
      message.chat.id,
      `🔇 ${displayName(target)} با موفقیت ساکت شد.`
    );
  } catch (error) {
    console.error(
      "Mute:",
      error.message
    );

    await sendMessage(
      env,
      message.chat.id,
      "❌ نتوانستم کاربر را ساکت کنم. دسترسی Restrict Members ربات را بررسی کن."
    );
  }
}


/* ============================================================
 * UNMUTE
 * ============================================================
 */

async function unmuteReplyUser(
  message,
  env
) {
  const target =
    await requireReplyUser(
      message,
      env
    );

  if (!target) {
    return;
  }

  try {
    await unrestrictUser(
      env,
      message.chat.id,
      target.id
    );

    await sendMessage(
      env,
      message.chat.id,
      `🔊 سکوت ${displayName(target)} برداشته شد.`
    );
  } catch (error) {
    console.error(
      "Unmute:",
      error.message
    );

    await sendMessage(
      env,
      message.chat.id,
      "❌ نتوانستم سکوت کاربر را بردارم."
    );
  }
}


/* ============================================================
 * BAN
 * ============================================================
 */

async function banReplyUser(
  message,
  env
) {
  const target =
    await requireReplyUser(
      message,
      env
    );

  if (!target) {
    return;
  }

  try {
    await banUser(
      env,
      message.chat.id,
      target.id
    );

    await sendMessage(
      env,
      message.chat.id,
      `🚫 ${displayName(target)} مسدود شد.`
    );
  } catch (error) {
    console.error(
      "Ban:",
      error.message
    );

    await sendMessage(
      env,
      message.chat.id,
      "❌ نتوانستم کاربر را مسدود کنم. دسترسی Ban Users ربات را بررسی کن."
    );
  }
}


/* ============================================================
 * UNBAN
 * ============================================================
 */

async function unbanReplyUser(
  message,
  env
) {
  const target =
    await requireReplyUser(
      message,
      env
    );

  if (!target) {
    return;
  }

  try {
    await unbanUser(
      env,
      message.chat.id,
      target.id
    );

    await sendMessage(
      env,
      message.chat.id,
      `✅ مسدودی ${displayName(target)} برداشته شد.`
    );
  } catch (error) {
    console.error(
      "Unban:",
      error.message
    );

    await sendMessage(
      env,
      message.chat.id,
      "❌ نتوانستم مسدودی کاربر را بردارم."
    );
  }
}


/* ============================================================
 * SECURITY MESSAGE PROCESSOR
 * ============================================================
 */

async function processSecurity(
  message,
  env,
  settings
) {
  const userId =
    Number(
      message.from?.id || 0
    );

  if (
    !userId ||
    message.from?.is_bot
  ) {
    return false;
  }

  if (
    await isAdmin(
      env,
      message.chat.id,
      userId
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const text =
    message.text ||
    message.caption ||
    "";

  if (
    settings.antiLink &&
    containsLink(text)
  ) {
    await deleteMessage(
      env,
      chatId,
      message.message_id
    );

    await sendMessage(
      env,
      chatId,
      settings.antiLinkText
    );

    return true;
  }

  if (
    settings.lockPhoto &&
    messageHasPhoto(message)
  ) {
    await deleteMessage(
      env,
      chatId,
      message.message_id
    );

    return true;
  }

  if (
    settings.lockVideo &&
    messageHasVideo(message)
  ) {
    await deleteMessage(
      env,
      chatId,
      message.message_id
    );

    return true;
  }

  if (
    settings.lockDocument &&
    messageHasDocument(message)
  ) {
    await deleteMessage(
      env,
      chatId,
      message.message_id
    );

    return true;
  }

  if (
    settings.lockSticker &&
    messageHasSticker(message)
  ) {
    await deleteMessage(
      env,
      chatId,
      message.message_id
    );

    return true;
  }

  if (
    settings.lockVoice &&
    messageHasVoice(message)
  ) {
    await deleteMessage(
      env,
      chatId,
      message.message_id
    );

    return true;
  }

  if (
    settings.lockForward &&
    isForwarded(message)
  ) {
    await deleteMessage(
      env,
      chatId,
      message.message_id
    );

    return true;
  }

  if (
    settings.antiFlood
  ) {
    const count =
      await checkFlood(
        env,
        chatId,
        userId
      );

    if (
      count >= 8
    ) {
      await deleteMessage(
        env,
        chatId,
        message.message_id
      );

      try {
        await restrictUser(
          env,
          chatId,
          userId,
          Math.floor(
            Date.now() / 1000
          ) + 60
        );
      } catch (error) {
        console.error(
          "Flood restriction:",
          error.message
        );
      }

      return true;
    }
  }

  return false;
}


/* ============================================================
 * GROUP MESSAGE
 * ============================================================
 */

async function handleGroupMessage(
  message,
  env
) {
  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id || 0
    );

  if (
    !userId ||
    message.from?.is_bot
  ) {
    return;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  /*
   * New members
   */
  if (
    message.new_chat_members
      ?.length &&
    settings.welcome
  ) {
    for (
      const member of
        message.new_chat_members
    ) {
      const name =
        displayName(
          member
        );

      const title =
        escapeHTML(
          message.chat.title ||
          "گروه"
        );

      await sendMessage(
        env,
        chatId,
        `👋 سلام ${name}\n\nبه <b>${title}</b> خوش اومدی.`
      );
    }

    return;
  }

  /*
   * Service messages
   */
  if (
    !message.text &&
    !message.caption &&
    !message.photo &&
    !message.video &&
    !message.document &&
    !message.sticker &&
    !message.voice
  ) {
    return;
  }

  /*
   * Security
   */
  const handled =
    await processSecurity(
      message,
      env,
      settings
    );

  if (
    handled
  ) {
    return;
  }

  /*
   * Commands
   */
  const text =
    String(
      message.text || ""
    ).trim();

  const command =
    normalizeCommand(
      text
    );

  /*
   * Ignore unknown non-command text
   */
  if (
    !command
  ) {
    return;
  }

  /*
   * Only admins can use moderation commands.
   */
  if (
    command === "/warn" ||
    command === "/mute" ||
    command === "/unmute" ||
    command === "/ban" ||
    command === "/unban" ||
    command === "/panel" ||
    command === "/settings" ||
    command === "/security"
  ) {
    const admin =
      await requireAdmin(
        message,
        env
      );

    if (!admin) {
      return;
    }
  }

  if (
    command === "/warn"
  ) {
    await issueWarning(
      message,
      env
    );

    return;
  }

  if (
    command === "/mute"
  ) {
    await muteReplyUser(
      message,
      env
    );

    return;
  }

  if (
    command === "/unmute"
  ) {
    await unmuteReplyUser(
      message,
      env
    );

    return;
  }

  if (
    command === "/ban"
  ) {
    await banReplyUser(
      message,
      env
    );

    return;
  }

  if (
    command === "/unban"
  ) {
    await unbanReplyUser(
      message,
      env
    );

    return;
  }

  if (
    command === "/id"
  ) {
    await sendMessage(
      env,
      chatId,
      `🆔 Chat ID:\n<code>${chatId}</code>\n\n👤 User ID:\n<code>${userId}</code>`
    );

    return;
  }

  if (
    command === "/help"
  ) {
    await sendMessage(
      env,
      chatId,
      [
        "❓ <b>راهنمای ربات</b>",
        "",
        "🛡️ /security — تنظیمات امنیتی",
        "⚙️ /settings — تنظیمات گروه",
        "⚠️ /warn — اخطار",
        "🔇 /mute — سکوت",
        "🔊 /unmute — رفع سکوت",
        "🚫 /ban — مسدود کردن",
        "✅ /unban — رفع مسدودی",
        "🆔 /id — شناسه"
      ].join("\n")
    );

    return;
  }

  if (
    command === "/panel" ||
    command === "/settings" ||
    command === "/security"
  ) {
    await sendMessage(
      env,
      chatId,
      mainPanelText(),
      {
        reply_markup:
          mainKeyboard()
      }
    );
  }
}


/* ============================================================
 * CALLBACK ROUTER
 * ============================================================
 */

async function handleUserCallback(
  callback,
  env
) {
  const data =
    callback.data || "";

  const message =
    callback.message;

  if (!message) {
    await answerCallback(
      env,
      callback.id
    );

    return;
  }

  const userId =
    Number(
      callback.from?.id || 0
    );

  const chatId =
    message.chat.id;

  /*
   * Private owner panel
   */
  if (
    String(chatId) ===
    String(callback.from?.id)
  ) {
    if (
      !isOwner(userId)
    ) {
      await answerCallback(
        env,
        callback.id,
        "⛔ دسترسی ندارید.",
        true
      );

      return;
    }
  }

  if (
    data ===
    "panel:main"
  ) {
    await editMessage(
      env,
      chatId,
      message.message_id,
      mainPanelText(),
      {
        reply_markup:
          mainKeyboard()
      }
    );

    await answerCallback(
      env,
      callback.id
    );

    return;
  }

  if (
    data ===
    "panel:security"
  ) {
    const settings =
      await getSettings(
        env,
        chatId
      );

    await editMessage(
      env,
      chatId,
      message.message_id,
      securityPanelText(
        settings
      ),
      {
        reply_markup:
          securityKeyboard(
            settings
          )
      }
    );

    await answerCallback(
      env,
      callback.id
    );

    return;
  }

  if (
    data ===
    "panel:moderation"
  ) {
    await editMessage(
      env,
      chatId,
      message.message_id,
      "👮 <b>مدیریت کاربران</b>\n\nبرای اجرای عملیات مدیریتی می‌توانی روی پیام کاربر ریپلای کنی.",
      {
        reply_markup:
          moderationKeyboard()
      }
    );

    await answerCallback(
      env,
      callback.id
    );

    return;
  }

  if (
    data ===
    "panel:warnings"
  ) {
    const settings =
      await getSettings(
        env,
        chatId
      );

    await editMessage(
      env,
      chatId,
      message.message_id,
      `⚠️ <b>سیستم اخطار</b>\n\nحد فعلی: <b>${settings.maxWarnings}</b> اخطار`,
      {
        reply_markup:
          warningsKeyboard(
            settings
          )
      }
    );

    await answerCallback(
      env,
      callback.id
    );

    return;
  }

  if (
    data ===
    "panel:help"
  ) {
    await editMessage(
      env,
      chatId,
      message.message_id,
      [
        "❓ <b>راهنمای پنل</b>",
        "",
        "🛡️ امنیت: فعال/غیرفعال کردن سیستم‌های حفاظتی",
        "👮 مدیریت: ابزارهای مدیریت کاربران",
        "⚠️ اخطارها: مدیریت Warning System",
        "📊 آمار: مشاهده آمار پایه ربات",
        "",
        "🔙 برای بازگشت از دکمه زیر استفاده کن."
      ].join("\n"),
      {
        reply_markup:
          backKeyboard()
      }
    );

    await answerCallback(
      env,
      callback.id
    );

    return;
  }

  /*
   * Toggle settings
   */
  if (
    data.startsWith(
      "toggle:"
    )
  ) {
    const key =
      data.substring(
        "toggle:".length
      );

    const allowed =
      [
        "antiLink",
        "antiFlood",
        "antiSpam",
        "lockPhoto",
        "lockVideo",
        "lockDocument",
        "lockSticker",
        "lockVoice",
        "lockForward",
        "warnings"
      ];

    if (
      !allowed.includes(key)
    ) {
      await answerCallback(
        env,
        callback.id,
        "تنظیم نامعتبر است.",
        true
      );

      return;
    }

    const admin =
      await isAdmin(
        env,
        chatId,
        userId
      );

    if (
      !admin
    ) {
      await answerCallback(
        env,
        callback.id,
        "⛔ فقط مدیران می‌توانند تنظیمات را تغییر دهند.",
        true
      );

      return;
    }

    const settings =
      await getSettings(
        env,
        chatId
      );

    settings[key] =
      !Boolean(
        settings[key]
      );

    await saveSettings(
      env,
      chatId,
      settings
    );

    await answerCallback(
      env,
      callback.id,
      settings[key]
        ? "🟢 فعال شد"
        : "🔴 غیرفعال شد"
    );

    if (
      key ===
      "antiLink" ||
      key ===
      "antiFlood" ||
      key ===
      "antiSpam" ||
      key ===
      "lockPhoto" ||
      key ===
      "lockVideo" ||
      key ===
      "lockDocument" ||
      key ===
      "lockSticker" ||
      key ===
      "lockVoice" ||
      key ===
      "lockForward"
    ) {
      await editMessage(
        env,
        chatId,
        message.message_id,
        securityPanelText(
          settings
        ),
        {
          reply_markup:
            securityKeyboard(
              settings
            )
        }
      );
    }

    return;
  }


  /* ==========================================================
   * WARNING LIMIT
   * ==========================================================
   */

  if (
    data ===
    "warning:up" ||
    data ===
    "warning:down"
  ) {
    if (
      !(await isAdmin(
        env,
        chatId,
        userId
      ))
    ) {
      await answerCallback(
        env,
        callback.id,
        "⛔ دسترسی ندارید.",
        true
      );

      return;
    }

    const settings =
      await getSettings(
        env,
        chatId
      );

    if (
      data ===
      "warning:up"
    ) {
      settings.maxWarnings =
        Math.min(
          20,
          settings.maxWarnings + 1
        );
    } else {
      settings.maxWarnings =
        Math.max(
          1,
          settings.maxWarnings - 1
        );
    }

    await saveSettings(
      env,
      chatId,
      settings
    );

    await editMessage(
      env,
      chatId,
      message.message_id,
      `⚠️ <b>سیستم اخطار</b>\n\nحد فعلی: <b>${settings.maxWarnings}</b> اخطار`,
      {
        reply_markup:
          warningsKeyboard(
            settings
          )
      }
    );

    await answerCallback(
      env,
      callback.id
    );

    return;
  }


  /*
   * Unknown callback
   */
  await answerCallback(
    env,
    callback.id,
    "این گزینه دیگر فعال نیست."
  );
}


async function handleGroupCallback(
  callback,
  env
) {
  return handleUserCallback(
    callback,
    env
  );
}


/* ============================================================
 * CALLBACK ENTRY
 * ============================================================
 */

async function handleCallback(
  callback,
  env
) {
  const message =
    callback.message;

  if (
    message?.chat?.type ===
    "private"
  ) {
    return handleUserCallback(
      callback,
      env
    );
  }

  return handleGroupCallback(
    callback,
    env
  );
}


/* ============================================================
 * MAIN UPDATE ROUTER
 *
 * THIS FUNCTION MUST EXIST.
 * It fixes the previous:
 * "handleUpdate is not defined"
 * error.
 * ============================================================
 */

async function handleUpdate(
  update,
  env
) {
  if (!update) {
    return;
  }

  /*
   * Callback query
   */
  if (
    update.callback_query
  ) {
    return handleCallback(
      update.callback_query,
      env
    );
  }

  /*
   * Bot membership changes
   */
  if (
    update.my_chat_member
  ) {
    return handleMyChatMember(
      update.my_chat_member,
      env
    );
  }

  /*
   * Messages
   */
  if (
    update.message
  ) {
    const message =
      update.message;

    if (
      message.chat?.type ===
      "private"
    ) {
      return handlePrivate(
        message,
        env
      );
    }

    return handleGroupMessage(
      message,
      env
    );
  }

  /*
   * Edited messages
   */
  if (
    update.edited_message
  ) {
    return handleGroupMessage(
      update.edited_message,
      env
    );
  }

  return;
}


/* ============================================================
 * MY CHAT MEMBER
 * ============================================================
 */

async function handleMyChatMember(
  update,
  env
) {
  const chat =
    update.chat;

  const status =
    update.new_chat_member
      ?.status;

  console.log(
    "Bot membership update:",
    chat?.id,
    status
  );

  /*
   * When bot is added to a group,
   * create default settings.
   */
  if (
    chat?.id &&
    (
      status ===
        "member" ||
      status ===
        "administrator"
    )
  ) {
    try {
      const existing =
        await kvGet(
          env,
          settingsKey(
            chat.id
          ),
          null
        );

      if (!existing) {
        await saveSettings(
          env,
          chat.id,
          {
            ...DEFAULT_SETTINGS
          }
        );
      }
    } catch (error) {
      console.error(
        "Initial settings:",
        error.message
      );
    }
  }
}


/* ============================================================
 * WORKER ENTRY
 * ============================================================
 */

export default {
  async fetch(
    request,
    env
  ) {
    /*
     * Health check
     */
    if (
      request.method ===
      "GET"
    ) {
      return new Response(
        "Telegram Security Bot is running.",
        {
          status: 200,
          headers: {
            "content-type":
              "text/plain; charset=utf-8"
          }
        }
      );
    }

    /*
     * Telegram webhook
     */
    if (
      request.method ===
      "POST"
    ) {
      try {
        const update =
          await request.json();

        await handleUpdate(
          update,
          env
        );

        return json({
          ok: true
        });
      } catch (error) {
        console.error(
          "Worker error:",
          error
        );

        /*
         * Telegram receives a successful
         * response even when an individual
         * update fails.
         */
        return json({
          ok: true
        });
      }
    }

    return new Response(
      "Method Not Allowed",
      {
        status: 405
      }
    );
  }
};