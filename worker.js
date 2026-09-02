/*
============================================================
 TELEGRAM ALL-IN-ONE ADMIN BOT
 Cloudflare Workers + KV
 PART 1 — CORE
============================================================
*/

/* =========================
   CONFIG
========================= */

const OWNER_IDS = [
  5366147520,
  8811175958
];

const API_BASE =
  "https://api.telegram.org/bot";


/* =========================
   DEFAULT SETTINGS
========================= */

const DEFAULT_SETTINGS = {
  welcome: true,
  goodbye: true,

  antiLink: false,
  antiSpam: true,
  antiFlood: true,

  lockPhoto: false,
  lockVideo: false,
  lockDocument: false,
  lockSticker: false,
  lockVoice: false,
  lockAudio: false,
  lockAnimation: false,
  lockPoll: false,
  lockLocation: false,
  lockContact: false,
  lockForward: false,

  warnings: true,
  maxWarnings: 3,

  rules: "📜 قوانین گروه هنوز تنظیم نشده است.",

  language: "fa",

  logEnabled: false
};


/* =========================
   RESPONSE
========================= */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8"
      }
    }
  );
}


/* =========================
   TELEGRAM API
========================= */

async function telegram(
  method,
  env,
  payload = {}
) {
  if (!env.BOT_TOKEN) {
    throw new Error(
      "BOT_TOKEN is missing"
    );
  }

  const response =
    await fetch(
      `${API_BASE}${env.BOT_TOKEN}/${method}`,
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json"
        },

        body:
          JSON.stringify(payload)
      }
    );

  const data =
    await response.json();

  if (!data.ok) {
    throw new Error(
      data.description ||
      "Telegram API error"
    );
  }

  return data.result;
}


/* =========================
   TELEGRAM HELPERS
========================= */

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
      callback_query_id:
        callbackId,

      text,

      show_alert:
        showAlert
    }
  );
}


/* =========================
   USER HELPERS
========================= */

function userName(user) {
  if (!user) {
    return "کاربر";
  }

  const first =
    user.first_name || "";

  const last =
    user.last_name || "";

  return (
    `${first} ${last}`.trim() ||
    user.username ||
    "کاربر"
  );
}


function escapeHTML(value) {
  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}


function displayName(user) {
  return escapeHTML(
    userName(user)
  );
}


/* =========================
   OWNER
========================= */

function isOwner(userId) {
  return OWNER_IDS.includes(
    Number(userId)
  );
}


/* =========================
   KV
========================= */

function getKV(env) {
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
  const kv =
    getKV(env);

  const value =
    await kv.get(key);

  if (
    value === null
  ) {
    return fallback;
  }

  try {
    return JSON.parse(
      value
    );
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
  const kv =
    getKV(env);

  await kv.put(
    key,

    typeof value ===
    "string"
      ? value
      : JSON.stringify(
          value
        ),

    options
  );
}


async function kvDelete(
  env,
  key
) {
  const kv =
    getKV(env);

  await kv.delete(
    key
  );
}


/* =========================
   SETTINGS
========================= */

function settingsKey(
  chatId
) {
  return (
    `settings:${chatId}`
  );
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


async function toggleSetting(
  env,
  chatId,
  setting
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  settings[setting] =
    !Boolean(
      settings[setting]
    );

  await saveSettings(
    env,
    chatId,
    settings
  );

  return settings;
}


/* =========================
   WARNINGS
========================= */

function warningKey(
  chatId,
  userId
) {
  return (
    `warning:${chatId}:${userId}`
  );
}


async function getWarnings(
  env,
  chatId,
  userId
) {
  return Number(
    await kvGet(
      env,
      warningKey(
        chatId,
        userId
      ),
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
    warningKey(
      chatId,
      userId
    ),
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
    warningKey(
      chatId,
      userId
    )
  );
}


/* =========================
   ADMIN CHECK
========================= */

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
  if (
    isOwner(userId)
  ) {
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
      member.status ===
        "administrator" ||
      member.status ===
        "creator"
    );
  } catch {
    return false;
  }
}


async function isCreator(
  env,
  chatId,
  userId
) {
  if (
    isOwner(userId)
  ) {
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
      member.status ===
      "creator"
    );
  } catch {
    return false;
  }
}


/* =========================
   REPLY USER
========================= */

function getReplyUser(
  message
) {
  return (
    message.reply_to_message
      ?.from || null
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
      "⚠️ این دستور باید با ریپلای روی پیام کاربر استفاده شود."
    );

    return null;
  }

  if (
    target.is_bot
  ) {
    await sendMessage(
      env,
      message.chat.id,
      "🤖 مدیریت ربات دیگر مجاز نیست."
    );

    return null;
  }

  return target;
}


/* =========================
   COMMAND NORMALIZER
========================= */

function normalizeCommand(
  text
) {
  if (!text) {
    return "";
  }

  const command =
    String(text)
      .trim()
      .toLowerCase()
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

    "/warn": "/warn",
    "warn": "/warn",
    "اخطار": "/warn",

    "/mute": "/mute",
    "mute": "/mute",
    "سکوت": "/mute",

    "/unmute": "/unmute",
    "unmute": "/unmute",

    "/ban": "/ban",
    "ban": "/ban",
    "بن": "/ban",

    "/unban": "/unban",
    "unban": "/unban",

    "/rules": "/rules",
    "rules": "/rules",
    "قوانین": "/rules",

    "/id": "/id",
    "id": "/id",
    "آیدی": "/id",
    "ایدی": "/id"
  };

  return (
    aliases[command] ||
    command
  );
}


/* =========================
   MESSAGE TYPES
========================= */

function hasPhoto(
  message
) {
  return Boolean(
    message?.photo?.length
  );
}


function hasVideo(
  message
) {
  return Boolean(
    message?.video
  );
}


function hasDocument(
  message
) {
  return Boolean(
    message?.document
  );
}


function hasSticker(
  message
) {
  return Boolean(
    message?.sticker
  );
}


function hasVoice(
  message
) {
  return Boolean(
    message?.voice
  );
}


function hasAudio(
  message
) {
  return Boolean(
    message?.audio
  );
}


function hasAnimation(
  message
) {
  return Boolean(
    message?.animation
  );
}


function hasPoll(
  message
) {
  return Boolean(
    message?.poll
  );
}


function hasLocation(
  message
) {
  return Boolean(
    message?.location
  );
}


function hasContact(
  message
) {
  return Boolean(
    message?.contact
  );
}


function isForwarded(
  message
) {
  return Boolean(
    message?.forward_origin ||
    message?.forward_from ||
    message?.forward_from_chat
  );
}


/* =========================
   LINK DETECTOR
========================= */

const LINK_REGEX =
  /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|bit\.ly\/|tinyurl\.com\/)/i;


function containsLink(
  text
) {
  return Boolean(
    text &&
    LINK_REGEX.test(
      String(text)
    )
  );
}


/* =========================
   MODERATION
========================= */

async function muteUser(
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
        can_send_messages:
          false,

        can_send_audios:
          false,

        can_send_documents:
          false,

        can_send_photos:
          false,

        can_send_videos:
          false,

        can_send_video_notes:
          false,

        can_send_voice_notes:
          false,

        can_send_polls:
          false,

        can_send_other_messages:
          false,

        can_add_web_page_previews:
          false,

        can_invite_users:
          false,

        can_pin_messages:
          false
      }
    }
  );
}


async function unmuteUser(
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
        can_send_messages:
          true,

        can_send_audios:
          true,

        can_send_documents:
          true,

        can_send_photos:
          true,

        can_send_videos:
          true,

        can_send_video_notes:
          true,

        can_send_voice_notes:
          true,

        can_send_polls:
          true,

        can_send_other_messages:
          true,

        can_add_web_page_previews:
          true,

        can_invite_users:
          true
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
      only_if_banned:
        false
    }
  );
}
/* ============================================================
   PART 2 — ADMIN PANEL / SETTINGS / KEYBOARDS
============================================================ */


/* =========================
   MAIN PANEL TEXT
========================= */

function mainPanelText() {
  return [
    "🤖 <b>پنل مدیریت ربات</b>",
    "",
    "به پنل مدیریت خوش آمدید.",
    "",
    "🛡️ امنیت گروه",
    "👮 مدیریت کاربران",
    "⚠️ سیستم اخطار",
    "📜 قوانین",
    "📊 آمار",
    "⚙️ تنظیمات",
    "",
    "یکی از گزینه‌های زیر را انتخاب کنید:"
  ].join("\n");
}


/* =========================
   MAIN KEYBOARD
========================= */

function mainKeyboard() {
  return {
    inline_keyboard: [
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
          text: "📜 قوانین",
          callback_data: "panel:rules"
        }
      ],
      [
        {
          text: "📊 آمار",
          callback_data: "panel:stats"
        },
        {
          text: "⚙️ تنظیمات",
          callback_data: "panel:settings"
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


/* =========================
   BACK BUTTON
========================= */

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


/* =========================
   SECURITY PANEL
========================= */

function securityPanelText(
  settings
) {
  const on =
    "🟢 فعال";

  const off =
    "🔴 خاموش";

  return [
    "🛡️ <b>پنل امنیتی</b>",
    "",
    `🔗 ضد لینک: ${settings.antiLink ? on : off}`,
    `🌊 ضد فلود: ${settings.antiFlood ? on : off}`,
    `🚫 ضد اسپم: ${settings.antiSpam ? on : off}`,
    "",
    `🖼 عکس: ${settings.lockPhoto ? on : off}`,
    `🎥 ویدیو: ${settings.lockVideo ? on : off}`,
    `📁 فایل: ${settings.lockDocument ? on : off}`,
    `🎭 استیکر: ${settings.lockSticker ? on : off}`,
    `🎤 Voice: ${settings.lockVoice ? on : off}`,
    `🎵 Audio: ${settings.lockAudio ? on : off}`,
    `🎞 GIF: ${settings.lockAnimation ? on : off}`,
    `📊 Poll: ${settings.lockPoll ? on : off}`,
    `📍 Location: ${settings.lockLocation ? on : off}`,
    `👤 Contact: ${settings.lockContact ? on : off}`,
    `🔄 Forward: ${settings.lockForward ? on : off}`
  ].join("\n");
}


/* =========================
   SECURITY KEYBOARD
========================= */

function securityKeyboard(
  settings
) {
  return {
    inline_keyboard: [
      [
        {
          text:
            `${settings.antiLink ? "🟢" : "🔴"} ضد لینک`,
          callback_data:
            "toggle:antiLink"
        },
        {
          text:
            `${settings.antiFlood ? "🟢" : "🔴"} ضد فلود`,
          callback_data:
            "toggle:antiFlood"
        }
      ],

      [
        {
          text:
            `${settings.antiSpam ? "🟢" : "🔴"} ضد اسپم`,
          callback_data:
            "toggle:antiSpam"
        }
      ],

      [
        {
          text:
            `${settings.lockPhoto ? "🟢" : "🔴"} عکس`,
          callback_data:
            "toggle:lockPhoto"
        },
        {
          text:
            `${settings.lockVideo ? "🟢" : "🔴"} ویدیو`,
          callback_data:
            "toggle:lockVideo"
        }
      ],

      [
        {
          text:
            `${settings.lockDocument ? "🟢" : "🔴"} فایل`,
          callback_data:
            "toggle:lockDocument"
        },
        {
          text:
            `${settings.lockSticker ? "🟢" : "🔴"} استیکر`,
          callback_data:
            "toggle:lockSticker"
        }
      ],

      [
        {
          text:
            `${settings.lockVoice ? "🟢" : "🔴"} Voice`,
          callback_data:
            "toggle:lockVoice"
        },
        {
          text:
            `${settings.lockAudio ? "🟢" : "🔴"} Audio`,
          callback_data:
            "toggle:lockAudio"
        }
      ],

      [
        {
          text:
            `${settings.lockAnimation ? "🟢" : "🔴"} GIF`,
          callback_data:
            "toggle:lockAnimation"
        },
        {
          text:
            `${settings.lockPoll ? "🟢" : "🔴"} Poll`,
          callback_data:
            "toggle:lockPoll"
        }
      ],

      [
        {
          text:
            `${settings.lockLocation ? "🟢" : "🔴"} Location`,
          callback_data:
            "toggle:lockLocation"
        },
        {
          text:
            `${settings.lockContact ? "🟢" : "🔴"} Contact`,
          callback_data:
            "toggle:lockContact"
        }
      ],

      [
        {
          text:
            `${settings.lockForward ? "🟢" : "🔴"} Forward`,
          callback_data:
            "toggle:lockForward"
        }
      ],

      [
        {
          text: "⬅️ بازگشت",
          callback_data:
            "panel:main"
        }
      ]
    ]
  };
}


/* =========================
   MODERATION PANEL
========================= */

function moderationPanelText() {
  return [
    "👮 <b>مدیریت کاربران</b>",
    "",
    "برای استفاده از ابزارهای مدیریت،",
    "روی پیام کاربر ریپلای کن.",
    "",
    "⚠️ ربات باید دسترسی مدیریت مناسب را داشته باشد."
  ].join("\n");
}


function moderationPanelKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "🔇 سکوت",
          callback_data: "mod:mute"
        },
        {
          text: "🔊 رفع سکوت",
          callback_data: "mod:unmute"
        }
      ],
      [
        {
          text: "🚫 مسدود",
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


/* =========================
   WARNING PANEL
========================= */

function warningsPanelText(
  settings
) {
  return [
    "⚠️ <b>سیستم اخطار</b>",
    "",
    `وضعیت: ${
      settings.warnings
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    "",
    `حد اخطار: <b>${settings.maxWarnings}</b>`,
    "",
    "پس از رسیدن کاربر به سقف اخطار،",
    "اقدام خودکار انجام می‌شود."
  ].join("\n");
}


function warningsPanelKeyboard(
  settings
) {
  return {
    inline_keyboard: [
      [
        {
          text:
            `${settings.warnings ? "🟢" : "🔴"} سیستم اخطار`,
          callback_data:
            "toggle:warnings"
        }
      ],
      [
        {
          text: "➖ کاهش",
          callback_data:
            "warning:down"
        },
        {
          text: "➕ افزایش",
          callback_data:
            "warning:up"
        }
      ],
      [
        {
          text: "🗑️ پاک‌کردن اخطار",
          callback_data:
            "warning:clear"
        }
      ],
      [
        {
          text: "⬅️ بازگشت",
          callback_data:
            "panel:main"
        }
      ]
    ]
  };
}


/* =========================
   RULES PANEL
========================= */

function rulesPanelText(
  settings
) {
  return [
    "📜 <b>قوانین گروه</b>",
    "",
    escapeHTML(
      settings.rules ||
      "قوانین تنظیم نشده است."
    )
  ].join("\n");
}


function rulesPanelKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "📜 نمایش قوانین",
          callback_data:
            "rules:show"
        }
      ],
      [
        {
          text: "⬅️ بازگشت",
          callback_data:
            "panel:main"
        }
      ]
    ]
  };
}


/* =========================
   SETTINGS PANEL
========================= */

function settingsPanelText(
  settings
) {
  return [
    "⚙️ <b>تنظیمات ربات</b>",
    "",
    `🌐 زبان: <b>${settings.language}</b>`,
    `👋 خوش‌آمدگویی: ${
      settings.welcome
        ? "🟢"
        : "🔴"
    }`,
    `🚪 خداحافظی: ${
      settings.goodbye
        ? "🟢"
        : "🔴"
    }`,
    `📝 لاگ: ${
      settings.logEnabled
        ? "🟢"
        : "🔴"
    }`
  ].join("\n");
}


function settingsPanelKeyboard(
  settings
) {
  return {
    inline_keyboard: [
      [
        {
          text:
            `${settings.welcome ? "🟢" : "🔴"} خوش‌آمدگویی`,
          callback_data:
            "toggle:welcome"
        }
      ],
      [
        {
          text:
            `${settings.goodbye ? "🟢" : "🔴"} خداحافظی`,
          callback_data:
            "toggle:goodbye"
        }
      ],
      [
        {
          text:
            `${settings.logEnabled ? "🟢" : "🔴"} لاگ`,
          callback_data:
            "toggle:logEnabled"
        }
      ],
      [
        {
          text: "⬅️ بازگشت",
          callback_data:
            "panel:main"
        }
      ]
    ]
  };
}


/* =========================
   STATS PANEL
========================= */

function statsPanelText(
  stats
) {
  return [
    "📊 <b>آمار ربات</b>",
    "",
    `👥 اعضا: <b>${stats.members}</b>`,
    `💬 پیام‌ها: <b>${stats.messages}</b>`,
    `⚠️ اخطارها: <b>${stats.warnings}</b>`,
    `🗑 پیام حذف‌شده: <b>${stats.deleted}</b>`,
    `🔇 محدودیت‌ها: <b>${stats.mutes}</b>`,
    `🚫 مسدودی‌ها: <b>${stats.bans}</b>`
  ].join("\n");
}


/* =========================
   EMPTY STATS
========================= */

function emptyStats() {
  return {
    members: 0,
    messages: 0,
    warnings: 0,
    deleted: 0,
    mutes: 0,
    bans: 0
  };
}


/* =========================
   STATS STORAGE
========================= */

function statsKey(
  chatId
) {
  return `stats:${chatId}`;
}


async function getStats(
  env,
  chatId
) {
  const stats =
    await kvGet(
      env,
      statsKey(chatId),
      null
    );

  return {
    ...emptyStats(),
    ...(stats || {})
  };
}


async function saveStats(
  env,
  chatId,
  stats
) {
  await kvPut(
    env,
    statsKey(chatId),
    stats
  );
}


async function incrementStat(
  env,
  chatId,
  field,
  amount = 1
) {
  const stats =
    await getStats(
      env,
      chatId
    );

  stats[field] =
    Number(
      stats[field] || 0
    ) + amount;

  await saveStats(
    env,
    chatId,
    stats
  );

  return stats;
}


/* =========================
   MODERATION KEYBOARD
========================= */

function moderationKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "🔇 سکوت کاربر",
          callback_data:
            "mod:mute"
        },
        {
          text: "🔊 رفع سکوت",
          callback_data:
            "mod:unmute"
        }
      ],
      [
        {
          text: "🚫 مسدود کردن",
          callback_data:
            "mod:ban"
        },
        {
          text: "✅ رفع مسدودی",
          callback_data:
            "mod:unban"
        }
      ],
      [
        {
          text: "⚠️ اخطار",
          callback_data:
            "mod:warn"
        }
      ],
      [
        {
          text: "⬅️ بازگشت",
          callback_data:
            "panel:main"
        }
      ]
    ]
  };
}


/* =========================
   OWNER HELP
========================= */

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
      "🎛 /panel — پنل مدیریت",
      "⚙️ /settings — تنظیمات",
      "🛡 /security — امنیت",
      "⚠️ /warn — اخطار",
      "🔇 /mute — سکوت",
      "🔊 /unmute — رفع سکوت",
      "🚫 /ban — مسدود کردن",
      "✅ /unban — رفع مسدودی",
      "🆔 /id — شناسه",
      "",
      "تمام ابزارهای مدیریتی از پنل Inline نیز قابل استفاده هستند."
    ].join("\n")
  );
}
/* ============================================================
   PART 3 — MODERATION ENGINE / WARN / MUTE / BAN
============================================================ */


/* =========================
   ADMIN PERMISSION
========================= */

async function ensureAdmin(
  env,
  chatId,
  userId
) {
  const allowed =
    await isAdmin(
      env,
      chatId,
      userId
    );

  if (!allowed) {
    return false;
  }

  return true;
}


/* =========================
   TARGET PROTECTION
========================= */

async function canModerateTarget(
  env,
  chatId,
  actorId,
  targetId
) {
  /*
   * Owner can moderate normally,
   * but the bot will never attempt
   * to moderate another owner.
   */

  if (
    OWNER_IDS.includes(
      Number(targetId)
    )
  ) {
    return false;
  }

  if (
    Number(actorId) ===
    Number(targetId)
  ) {
    return false;
  }

  return true;
}


/* =========================
   WARN USER
========================= */

async function warnUser(
  env,
  chatId,
  userId,
  actorId
) {
  if (
    !await ensureAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    return {
      ok: false,
      reason: "not_admin"
    };
  }

  if (
    !await canModerateTarget(
      env,
      chatId,
      actorId,
      userId
    )
  ) {
    return {
      ok: false,
      reason: "protected"
    };
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  const current =
    await getWarnings(
      env,
      chatId,
      userId
    );

  const next =
    current + 1;

  await setWarnings(
    env,
    chatId,
    userId,
    next
  );

  await incrementStat(
    env,
    chatId,
    "warnings"
  );

  const limit =
    Math.max(
      1,
      Number(
        settings.maxWarnings
      )
    );

  return {
    ok: true,
    warnings: next,
    limit
  };
}


/* =========================
   AUTOMATIC WARNING ACTION
========================= */

async function applyWarningAction(
  env,
  chatId,
  userId,
  warningCount,
  limit
) {
  if (
    warningCount <
    limit
  ) {
    return {
      action: "warning"
    };
  }

  try {
    await muteUser(
      env,
      chatId,
      userId
    );

    await incrementStat(
      env,
      chatId,
      "mutes"
    );

    return {
      action: "mute"
    };

  } catch (error) {
    console.error(
      "Warning action error:",
      error.message
    );

    return {
      action: "warning",
      error: true
    };
  }
}


/* =========================
   FORMAT WARN RESULT
========================= */

function warningResultText(
  user,
  result,
  action
) {
  const name =
    displayName(
      user
    );

  if (
    action ===
    "mute"
  ) {
    return [
      "🔇 <b>کاربر محدود شد</b>",
      "",
      `👤 ${name}`,
      `⚠️ اخطار: <b>${result.warnings}/${result.limit}</b>`,
      "",
      "حد مجاز اخطار تکمیل شد."
    ].join("\n");
  }

  return [
    "⚠️ <b>اخطار ثبت شد</b>",
    "",
    `👤 ${name}`,
    `📌 تعداد اخطار: <b>${result.warnings}/${result.limit}</b>`
  ].join("\n");
}


/* =========================
   MUTE HANDLER
========================= */

async function moderateMute(
  env,
  chatId,
  actorId,
  targetId
) {
  if (
    !await ensureAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    return {
      ok: false,
      reason: "not_admin"
    };
  }

  if (
    !await canModerateTarget(
      env,
      chatId,
      actorId,
      targetId
    )
  ) {
    return {
      ok: false,
      reason: "protected"
    };
  }

  try {
    await muteUser(
      env,
      chatId,
      targetId
    );

    await incrementStat(
      env,
      chatId,
      "mutes"
    );

    return {
      ok: true
    };

  } catch (error) {
    return {
      ok: false,
      reason: error.message
    };
  }
}


/* =========================
   UNMUTE HANDLER
========================= */

async function moderateUnmute(
  env,
  chatId,
  actorId,
  targetId
) {
  if (
    !await ensureAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    return {
      ok: false,
      reason: "not_admin"
    };
  }

  try {
    await unmuteUser(
      env,
      chatId,
      targetId
    );

    return {
      ok: true
    };

  } catch (error) {
    return {
      ok: false,
      reason: error.message
    };
  }
}


/* =========================
   BAN HANDLER
========================= */

async function moderateBan(
  env,
  chatId,
  actorId,
  targetId
) {
  if (
    !await ensureAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    return {
      ok: false,
      reason: "not_admin"
    };
  }

  if (
    !await canModerateTarget(
      env,
      chatId,
      actorId,
      targetId
    )
  ) {
    return {
      ok: false,
      reason: "protected"
    };
  }

  try {
    await banUser(
      env,
      chatId,
      targetId
    );

    await incrementStat(
      env,
      chatId,
      "bans"
    );

    return {
      ok: true
    };

  } catch (error) {
    return {
      ok: false,
      reason: error.message
    };
  }
}


/* =========================
   UNBAN HANDLER
========================= */

async function moderateUnban(
  env,
  chatId,
  actorId,
  targetId
) {
  if (
    !await ensureAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    return {
      ok: false,
      reason: "not_admin"
    };
  }

  try {
    await unbanUser(
      env,
      chatId,
      targetId
    );

    return {
      ok: true
    };

  } catch (error) {
    return {
      ok: false,
      reason: error.message
    };
  }
}


/* =========================
   MODERATION RESPONSE
========================= */

async function sendModerationResult(
  env,
  chatId,
  target,
  action,
  result
) {
  const name =
    displayName(
      target
    );

  if (!result.ok) {

    let text =
      "⛔ <b>عملیات انجام نشد.</b>";

    if (
      result.reason ===
      "not_admin"
    ) {
      text =
        "⛔ فقط مدیران گروه می‌توانند این عملیات را انجام دهند.";
    }

    if (
      result.reason ===
      "protected"
    ) {
      text =
        "🛡️ این کاربر قابل مدیریت نیست.";
    }

    await sendMessage(
      env,
      chatId,
      text
    );

    return;
  }

  const texts = {

    mute:
      `🔇 ${name} <b>ساکت شد.</b>`,

    unmute:
      `🔊 محدودیت ${name} <b>برداشته شد.</b>`,

    ban:
      `🚫 ${name} <b>مسدود شد.</b>`,

    unban:
      `✅ مسدودی ${name} <b>برداشته شد.</b>`
  };

  await sendMessage(
    env,
    chatId,
    texts[action] ||
      "✅ عملیات با موفقیت انجام شد."
  );
}


/* =========================
   CLEAR USER WARNINGS
========================= */

async function clearUserWarnings(
  env,
  chatId,
  actorId,
  targetId
) {
  if (
    !await ensureAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    return {
      ok: false,
      reason: "not_admin"
    };
  }

  await clearWarnings(
    env,
    chatId,
    targetId
  );

  return {
    ok: true
  };
}


/* =========================
   WARNING LIMIT
========================= */

async function changeWarningLimit(
  env,
  chatId,
  amount
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  const current =
    Number(
      settings.maxWarnings ||
      3
    );

  const next =
    Math.min(
      20,
      Math.max(
        1,
        current + amount
      )
    );

  settings.maxWarnings =
    next;

  await saveSettings(
    env,
    chatId,
    settings
  );

  return next;
}


/* =========================
   ADMIN COMMAND ACTION
========================= */

async function executeModerationCommand(
  env,
  message,
  command
) {
  const actorId =
    Number(
      message.from?.id ||
      0
    );

  const chatId =
    message.chat.id;

  if (
    !await ensureAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران گروه اجازه استفاده از این دستور را دارند."
    );

    return true;
  }

  const target =
    getReplyUser(
      message
    );

  if (
    !target
  ) {
    await sendMessage(
      env,
      chatId,
      "⚠️ این دستور را با ریپلای روی پیام کاربر استفاده کن."
    );

    return true;
  }

  const targetId =
    Number(
      target.id
    );

  if (
    !targetId
  ) {
    return true;
  }


  /* =====================
     MUTE
  ===================== */

  if (
    command ===
    "/mute"
  ) {
    const result =
      await moderateMute(
        env,
        chatId,
        actorId,
        targetId
      );

    await sendModerationResult(
      env,
      chatId,
      target,
      "mute",
      result
    );

    return true;
  }


  /* =====================
     UNMUTE
  ===================== */

  if (
    command ===
    "/unmute"
  ) {
    const result =
      await moderateUnmute(
        env,
        chatId,
        actorId,
        targetId
      );

    await sendModerationResult(
      env,
      chatId,
      target,
      "unmute",
      result
    );

    return true;
  }


  /* =====================
     BAN
  ===================== */

  if (
    command ===
    "/ban"
  ) {
    const result =
      await moderateBan(
        env,
        chatId,
        actorId,
        targetId
      );

    await sendModerationResult(
      env,
      chatId,
      target,
      "ban",
      result
    );

    return true;
  }


  /* =====================
     UNBAN
  ===================== */

  if (
    command ===
    "/unban"
  ) {
    const result =
      await moderateUnban(
        env,
        chatId,
        actorId,
        targetId
      );

    await sendModerationResult(
      env,
      chatId,
      target,
      "unban",
      result
    );

    return true;
  }


  /* =====================
     WARN
  ===================== */

  if (
    command ===
    "/warn"
  ) {
    const result =
      await warnUser(
        env,
        chatId,
        targetId,
        actorId
      );

    if (
      !result.ok
    ) {
      await sendMessage(
        env,
        chatId,
        result.reason ===
          "protected"
          ? "🛡️ این کاربر قابل اخطار نیست."
          : "⛔ عملیات انجام نشد."
      );

      return true;
    }

    const action =
      await applyWarningAction(
        env,
        chatId,
        targetId,
        result.warnings,
        result.limit
      );

    await sendMessage(
      env,
      chatId,
      warningResultText(
        target,
        result,
        action.action
      )
    );

    return true;
  }


  return false;
}
/* ============================================================
   PART 4 — GROUP MESSAGE ENGINE
   Anti-Link / Anti-Flood / Media Locks / Welcome
============================================================ */


/* =========================
   FLOOD STORAGE
========================= */

function floodKey(
  chatId,
  userId
) {
  return `flood:${chatId}:${userId}`;
}


async function getFloodData(
  env,
  chatId,
  userId
) {
  return await kvGet(
    env,
    floodKey(
      chatId,
      userId
    ),
    {
      count: 0,
      startedAt: Date.now()
    }
  );
}


async function saveFloodData(
  env,
  chatId,
  userId,
  data
) {
  await kvPut(
    env,
    floodKey(
      chatId,
      userId
    ),
    data,
    {
      expirationTtl: 30
    }
  );
}


/* =========================
   FLOOD CHECK
========================= */

async function checkFlood(
  env,
  chatId,
  userId
) {
  const now =
    Date.now();

  const data =
    await getFloodData(
      env,
      chatId,
      userId
    );

  /*
   * Five messages inside
   * five seconds is treated
   * as a flood event.
   */

  if (
    now -
      Number(
        data.startedAt
      ) >
      5000
  ) {
    data.count = 1;
    data.startedAt = now;

    await saveFloodData(
      env,
      chatId,
      userId,
      data
    );

    return false;
  }

  data.count =
    Number(
      data.count || 0
    ) + 1;

  await saveFloodData(
    env,
    chatId,
    userId,
    data
  );

  return (
    data.count >= 5
  );
}


/* =========================
   TEXT SPAM CHECK
========================= */

function isSpamText(
  text
) {
  if (!text) {
    return false;
  }

  const normalized =
    String(text)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  /*
   * Excessive repeated
   * characters.
   */

  if (
    /(.)\1{9,}/u.test(
      normalized
    )
  ) {
    return true;
  }

  /*
   * Excessive repeated
   * punctuation.
   */

  if (
    /[!?؟]{8,}/u.test(
      normalized
    )
  ) {
    return true;
  }

  return false;
}


/* =========================
   MEDIA LOCK CHECK
========================= */

function getLockedMediaType(
  message,
  settings
) {
  if (
    settings.lockPhoto &&
    hasPhoto(message)
  ) {
    return "عکس";
  }

  if (
    settings.lockVideo &&
    hasVideo(message)
  ) {
    return "ویدیو";
  }

  if (
    settings.lockDocument &&
    hasDocument(message)
  ) {
    return "فایل";
  }

  if (
    settings.lockSticker &&
    hasSticker(message)
  ) {
    return "استیکر";
  }

  if (
    settings.lockVoice &&
    hasVoice(message)
  ) {
    return "Voice";
  }

  if (
    settings.lockAudio &&
    hasAudio(message)
  ) {
    return "Audio";
  }

  if (
    settings.lockAnimation &&
    hasAnimation(message)
  ) {
    return "GIF";
  }

  if (
    settings.lockPoll &&
    hasPoll(message)
  ) {
    return "نظرسنجی";
  }

  if (
    settings.lockLocation &&
    hasLocation(message)
  ) {
    return "موقعیت مکانی";
  }

  if (
    settings.lockContact &&
    hasContact(message)
  ) {
    return "مخاطب";
  }

  if (
    settings.lockForward &&
    isForwarded(message)
  ) {
    return "پیام فورواردی";
  }

  return null;
}


/* =========================
   DELETE + NOTICE
========================= */

async function deleteAndNotify(
  env,
  chatId,
  messageId,
  text
) {
  await deleteMessage(
    env,
    chatId,
    messageId
  );

  await incrementStat(
    env,
    chatId,
    "deleted"
  );

  await sendMessage(
    env,
    chatId,
    text
  );
}


/* =========================
   ANTI LINK
========================= */

async function processAntiLink(
  env,
  message,
  settings
) {
  if (
    !settings.antiLink
  ) {
    return false;
  }

  const text =
    [
      message.text,
      message.caption
    ]
      .filter(Boolean)
      .join(" ");

  if (
    !containsLink(text)
  ) {
    return false;
  }

  const userId =
    Number(
      message.from?.id ||
      0
    );

  /*
   * Administrators are
   * ignored by the filter.
   */

  if (
    await isAdmin(
      env,
      message.chat.id,
      userId
    )
  ) {
    return false;
  }

  await deleteAndNotify(
    env,
    message.chat.id,
    message.message_id,
    "🔗 <b>ارسال لینک در این گروه مجاز نیست.</b>"
  );

  return true;
}


/* =========================
   MEDIA LOCKS
========================= */

async function processMediaLocks(
  env,
  message,
  settings
) {
  const type =
    getLockedMediaType(
      message,
      settings
    );

  if (!type) {
    return false;
  }

  const userId =
    Number(
      message.from?.id ||
      0
    );

  /*
   * Admins bypass media locks.
   */

  if (
    await isAdmin(
      env,
      message.chat.id,
      userId
    )
  ) {
    return false;
  }

  await deleteAndNotify(
    env,
    message.chat.id,
    message.message_id,
    `🚫 ارسال <b>${escapeHTML(type)}</b> در این گروه مجاز نیست.`
  );

  return true;
}


/* =========================
   ANTI SPAM
========================= */

async function processAntiSpam(
  env,
  message,
  settings
) {
  if (
    !settings.antiSpam
  ) {
    return false;
  }

  const text =
    message.text ||
    message.caption ||
    "";

  if (
    !isSpamText(text)
  ) {
    return false;
  }

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    await isAdmin(
      env,
      message.chat.id,
      userId
    )
  ) {
    return false;
  }

  await deleteAndNotify(
    env,
    message.chat.id,
    message.message_id,
    "🚫 <b>پیام اسپم شناسایی و حذف شد.</b>"
  );

  return true;
}


/* =========================
   ANTI FLOOD
========================= */

async function processAntiFlood(
  env,
  message,
  settings
) {
  if (
    !settings.antiFlood
  ) {
    return false;
  }

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (!userId) {
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

  const flooded =
    await checkFlood(
      env,
      message.chat.id,
      userId
    );

  if (!flooded) {
    return false;
  }

  /*
   * Delete the current
   * message and temporarily
   * restrict the user.
   */

  await deleteMessage(
    env,
    message.chat.id,
    message.message_id
  );

  try {
    await muteUser(
      env,
      message.chat.id,
      userId,
      Math.floor(
        Date.now() / 1000
      ) + 30
    );

    await incrementStat(
      env,
      message.chat.id,
      "mutes"
    );

  } catch (error) {
    console.error(
      "Anti-flood mute:",
      error.message
    );
  }

  await sendMessage(
    env,
    message.chat.id,
    "🌊 <b>ضدفlood:</b> ارسال پیام با سرعت زیاد شناسایی شد و کاربر برای مدت کوتاهی محدود شد."
  );

  return true;
}


/* =========================
   WELCOME MESSAGE
========================= */

async function processWelcome(
  env,
  message,
  settings
) {
  if (
    !settings.welcome
  ) {
    return;
  }

  const members =
    message.new_chat_members;

  if (
    !Array.isArray(
      members
    ) ||
    members.length === 0
  ) {
    return;
  }

  const title =
    escapeHTML(
      message.chat.title ||
      "گروه"
    );

  for (
    const member of members
  ) {
    if (
      member.is_bot
    ) {
      continue;
    }

    const name =
      displayName(
        member
      );

    await sendMessage(
      env,
      message.chat.id,
      [
        `👋 <b>سلام ${name}</b>`,
        "",
        `به <b>${title}</b> خوش اومدی 🌹`,
        "",
        "📜 لطفاً قوانین گروه رو رعایت کن."
      ].join("\n")
    );
  }
}


/* =========================
   GOODBYE MESSAGE
========================= */

async function processGoodbye(
  env,
  message,
  settings
) {
  if (
    !settings.goodbye
  ) {
    return;
  }

  const member =
    message.left_chat_member;

  if (
    !member ||
    member.is_bot
  ) {
    return;
  }

  const name =
    displayName(
      member
    );

  await sendMessage(
    env,
    message.chat.id,
    `👋 ${name} از گروه خارج شد.`
  );
}


/* =========================
   GROUP MESSAGE ENGINE
========================= */

async function handleGroupMessage(
  message,
  env
) {
  if (
    !message ||
    !message.chat
  ) {
    return;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  /*
   * Welcome / Goodbye
   * service messages.
   */

  const settings =
    await getSettings(
      env,
      chatId
    );

  await processWelcome(
    env,
    message,
    settings
  );

  await processGoodbye(
    env,
    message,
    settings
  );

  /*
   * Ignore messages from
   * bots.
   */

  if (
    message.from?.is_bot
  ) {
    return;
  }

  /*
   * Ignore service-only
   * messages after welcome
   * processing.
   */

  if (
    !message.text &&
    !message.caption &&
    !hasPhoto(message) &&
    !hasVideo(message) &&
    !hasDocument(message) &&
    !hasSticker(message) &&
    !hasVoice(message) &&
    !hasAudio(message) &&
    !hasAnimation(message) &&
    !hasPoll(message) &&
    !hasLocation(message) &&
    !hasContact(message)
  ) {
    return;
  }

  /*
   * Commands are handled
   * separately.
   */

  const command =
    normalizeCommand(
      message.text || ""
    );

  if (
    command.startsWith("/")
  ) {
    return;
  }

  /*
   * Security engine.
   */

  if (
    await processAntiLink(
      env,
      message,
      settings
    )
  ) {
    return;
  }

  if (
    await processMediaLocks(
      env,
      message,
      settings
    )
  ) {
    return;
  }

  if (
    await processAntiSpam(
      env,
      message,
      settings
    )
  ) {
    return;
  }

  if (
    await processAntiFlood(
      env,
      message,
      settings
    )
  ) {
    return;
  }

  /*
   * Count normal messages.
   */

  await incrementStat(
    env,
    chatId,
    "messages"
  );
}


/* =========================
   GROUP COMMAND ROUTER
========================= */

async function handleGroupCommand(
  message,
  env
) {
  if (
    !message ||
    !message.chat
  ) {
    return false;
  }

  const text =
    message.text || "";

  const command =
    normalizeCommand(
      text
    );

  if (
    !command.startsWith("/")
  ) {
    return false;
  }

  /*
   * Moderation commands.
   */

  const moderationCommands = [
    "/mute",
    "/unmute",
    "/ban",
    "/unban",
    "/warn"
  ];

  if (
    moderationCommands.includes(
      command
    )
  ) {
    return await executeModerationCommand(
      env,
      message,
      command
    );
  }

  const userId =
    Number(
      message.from?.id ||
      0
    );

  const chatId =
    message.chat.id;


  /* =====================
     PANEL
  ===================== */

  if (
    command ===
    "/panel"
  ) {
    if (
      !await isAdmin(
        env,
        chatId,
        userId
      )
    ) {
      await sendMessage(
        env,
        chatId,
        "⛔ دسترسی به پنل مدیریت ندارید."
      );

      return true;
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

    return true;
  }


  /* =====================
     SECURITY
  ===================== */

  if (
    command ===
    "/security"
  ) {
    if (
      !await isAdmin(
        env,
        chatId,
        userId
      )
    ) {
      await sendMessage(
        env,
        chatId,
        "⛔ دسترسی ندارید."
      );

      return true;
    }

    const settings =
      await getSettings(
        env,
        chatId
      );

    await sendMessage(
      env,
      chatId,
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

    return true;
  }


  /* =====================
     SETTINGS
  ===================== */

  if (
    command ===
    "/settings"
  ) {
    if (
      !await isAdmin(
        env,
        chatId,
        userId
      )
    ) {
      await sendMessage(
        env,
        chatId,
        "⛔ دسترسی ندارید."
      );

      return true;
    }

    const settings =
      await getSettings(
        env,
        chatId
      );

    await sendMessage(
      env,
      chatId,
      settingsPanelText(
        settings
      ),
      {
        reply_markup:
          settingsPanelKeyboard(
            settings
          )
      }
    );

    return true;
  }


  /* =====================
     RULES
  ===================== */

  if (
    command ===
    "/rules"
  ) {
    const settings =
      await getSettings(
        env,
        chatId
      );

    await sendMessage(
      env,
      chatId,
      rulesPanelText(
        settings
      ),
      {
        reply_markup:
          rulesPanelKeyboard()
      }
    );

    return true;
  }


  /* =====================
     ID
  ===================== */

  if (
    command ===
    "/id"
  ) {
    await sendMessage(
      env,
      chatId,
      [
        "🆔 <b>اطلاعات</b>",
        "",
        `👤 User ID: <code>${userId}</code>`,
        `💬 Chat ID: <code>${chatId}</code>`
      ].join("\n")
    );

    return true;
  }


  /* =====================
     HELP
  ===================== */

  if (
    command ===
    "/help"
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
        "❓ برای مشاهده راهنما از دستور /help استفاده کن."
      );
    }

    return true;
  }


  return false;
}
/* ============================================================
   PART 5 — CALLBACK ENGINE / INLINE PANEL ACTIONS
============================================================ */


/* =========================
   CALLBACK ACCESS CHECK
========================= */

async function callbackIsAdmin(
  env,
  callback
) {
  const userId =
    Number(
      callback.from?.id || 0
    );

  const message =
    callback.message;

  if (
    !message
  ) {
    return false;
  }

  const chatId =
    message.chat?.id;

  if (
    chatId === undefined ||
    chatId === null
  ) {
    return false;
  }

  return await isAdmin(
    env,
    chatId,
    userId
  );
}


/* =========================
   EDIT PANEL
========================= */

async function editPanel(
  env,
  callback,
  text,
  keyboard
) {
  const message =
    callback.message;

  if (
    !message
  ) {
    return;
  }

  try {
    await editMessage(
      env,
      message.chat.id,
      message.message_id,
      text,
      {
        reply_markup:
          keyboard
      }
    );
  } catch (error) {
    /*
     * Telegram can return an error
     * when the content is already
     * identical. This is harmless.
     */

    console.error(
      "editPanel:",
      error.message
    );
  }
}


/* =========================
   MAIN PANEL
========================= */

async function callbackMainPanel(
  env,
  callback
) {
  await editPanel(
    env,
    callback,
    mainPanelText(),
    mainKeyboard()
  );
}


/* =========================
   SECURITY PANEL
========================= */

async function callbackSecurityPanel(
  env,
  callback
) {
  const chatId =
    callback.message.chat.id;

  const settings =
    await getSettings(
      env,
      chatId
    );

  await editPanel(
    env,
    callback,
    securityPanelText(
      settings
    ),
    securityKeyboard(
      settings
    )
  );
}


/* =========================
   SETTINGS PANEL
========================= */

async function callbackSettingsPanel(
  env,
  callback
) {
  const chatId =
    callback.message.chat.id;

  const settings =
    await getSettings(
      env,
      chatId
    );

  await editPanel(
    env,
    callback,
    settingsPanelText(
      settings
    ),
    settingsPanelKeyboard(
      settings
    )
  );
}


/* =========================
   MODERATION PANEL
========================= */

async function callbackModerationPanel(
  env,
  callback
) {
  await editPanel(
    env,
    callback,
    moderationPanelText(),
    moderationPanelKeyboard()
  );
}


/* =========================
   WARNING PANEL
========================= */

async function callbackWarningsPanel(
  env,
  callback
) {
  const chatId =
    callback.message.chat.id;

  const settings =
    await getSettings(
      env,
      chatId
    );

  await editPanel(
    env,
    callback,
    warningsPanelText(
      settings
    ),
    warningsPanelKeyboard(
      settings
    )
  );
}


/* =========================
   RULES PANEL
========================= */

async function callbackRulesPanel(
  env,
  callback
) {
  const chatId =
    callback.message.chat.id;

  const settings =
    await getSettings(
      env,
      chatId
    );

  await editPanel(
    env,
    callback,
    rulesPanelText(
      settings
    ),
    rulesPanelKeyboard()
  );
}


/* =========================
   STATS PANEL
========================= */

async function callbackStatsPanel(
  env,
  callback
) {
  const chatId =
    callback.message.chat.id;

  const stats =
    await getStats(
      env,
      chatId
    );

  await editPanel(
    env,
    callback,
    statsPanelText(
      stats
    ),
    backKeyboard()
  );
}


/* =========================
   TOGGLE SETTING
========================= */

async function callbackToggle(
  env,
  callback,
  setting
) {
  const chatId =
    callback.message.chat.id;

  const allowedSettings = [
    "welcome",
    "goodbye",
    "logEnabled",

    "antiLink",
    "antiSpam",
    "antiFlood",

    "lockPhoto",
    "lockVideo",
    "lockDocument",
    "lockSticker",
    "lockVoice",
    "lockAudio",
    "lockAnimation",
    "lockPoll",
    "lockLocation",
    "lockContact",
    "lockForward",

    "warnings"
  ];

  if (
    !allowedSettings.includes(
      setting
    )
  ) {
    await answerCallback(
      env,
      callback.id,
      "⚠️ تنظیم نامعتبر است.",
      true
    );

    return;
  }

  const settings =
    await toggleSetting(
      env,
      chatId,
      setting
    );

  await answerCallback(
    env,
    callback.id,
    settings[setting]
      ? "🟢 فعال شد."
      : "🔴 خاموش شد."
  );

  /*
   * Refresh the correct
   * panel automatically.
   */

  const data =
    callback.data || "";

  if (
    data.includes(
      "antiLink"
    ) ||
    data.includes(
      "antiSpam"
    ) ||
    data.includes(
      "antiFlood"
    ) ||
    data.includes(
      "lock"
    )
  ) {
    await callbackSecurityPanel(
      env,
      callback
    );

    return;
  }

  if (
    data.includes(
      "welcome"
    ) ||
    data.includes(
      "goodbye"
    ) ||
    data.includes(
      "logEnabled"
    )
  ) {
    await callbackSettingsPanel(
      env,
      callback
    );

    return;
  }

  if (
    data.includes(
      "warnings"
    )
  ) {
    await callbackWarningsPanel(
      env,
      callback
    );

    return;
  }

  await callbackMainPanel(
    env,
    callback
  );
}


/* =========================
   WARNING LIMIT
========================= */

async function callbackWarningLimit(
  env,
  callback,
  amount
) {
  const chatId =
    callback.message.chat.id;

  const next =
    await changeWarningLimit(
      env,
      chatId,
      amount
    );

  await answerCallback(
    env,
    callback.id,
    `⚠️ سقف اخطار روی ${next} تنظیم شد.`
  );

  await callbackWarningsPanel(
    env,
    callback
  );
}


/* =========================
   SHOW RULES
========================= */

async function callbackShowRules(
  env,
  callback
) {
  const chatId =
    callback.message.chat.id;

  const settings =
    await getSettings(
      env,
      chatId
    );

  await answerCallback(
    env,
    callback.id
  );

  await sendMessage(
    env,
    chatId,
    [
      "📜 <b>قوانین گروه</b>",
      "",
      escapeHTML(
        settings.rules ||
        "قوانین تنظیم نشده است."
      )
    ].join("\n")
  );
}


/* =========================
   MODERATION CALLBACK
========================= */

async function callbackModerationAction(
  env,
  callback,
  action
) {
  const message =
    callback.message;

  if (
    !message
  ) {
    return;
  }

  const chatId =
    message.chat.id;

  const actorId =
    Number(
      callback.from?.id || 0
    );

  /*
   * Inline moderation buttons
   * require a reply target.
   */

  const target =
    message.reply_to_message
      ?.from;

  if (
    !target
  ) {
    await answerCallback(
      env,
      callback.id,
      "⚠️ برای مدیریت کاربر، پنل را با ریپلای روی پیام او باز کن.",
      true
    );

    return;
  }

  const targetId =
    Number(
      target.id
    );

  let result;

  if (
    action ===
    "mute"
  ) {
    result =
      await moderateMute(
        env,
        chatId,
        actorId,
        targetId
      );
  }

  else if (
    action ===
    "unmute"
  ) {
    result =
      await moderateUnmute(
        env,
        chatId,
        actorId,
        targetId
      );
  }

  else if (
    action ===
    "ban"
  ) {
    result =
      await moderateBan(
        env,
        chatId,
        actorId,
        targetId
      );
  }

  else if (
    action ===
    "unban"
  ) {
    result =
      await moderateUnban(
        env,
        chatId,
        actorId,
        targetId
      );
  }

  else if (
    action ===
    "warn"
  ) {
    result =
      await warnUser(
        env,
        chatId,
        targetId,
        actorId
      );

    if (
      result.ok
    ) {
      const warningAction =
        await applyWarningAction(
          env,
          chatId,
          targetId,
          result.warnings,
          result.limit
        );

      await sendMessage(
        env,
        chatId,
        warningResultText(
          target,
          result,
          warningAction.action
        )
      );

      await answerCallback(
        env,
        callback.id,
        "⚠️ اخطار ثبت شد."
      );

      return;
    }
  }

  else {
    await answerCallback(
      env,
      callback.id,
      "⚠️ عملیات نامعتبر است.",
      true
    );

    return;
  }

  if (
    result?.ok
  ) {
    await answerCallback(
      env,
      callback.id,
      "✅ عملیات انجام شد."
    );

    await sendModerationResult(
      env,
      chatId,
      target,
      action,
      result
    );

  } else {

    await answerCallback(
      env,
      callback.id,
      "⛔ عملیات انجام نشد.",
      true
    );
  }
}


/* =========================
   CALLBACK ROUTER
========================= */

async function handleCallbackQuery(
  callback,
  env
) {
  if (
    !callback
  ) {
    return;
  }

  const data =
    String(
      callback.data || ""
    );

  /*
   * Every callback except
   * public rules requires
   * administrator access.
   */

  const publicCallback =
    data ===
    "panel:main";

  if (
    !publicCallback
  ) {
    const allowed =
      await callbackIsAdmin(
        env,
        callback
      );

    if (!allowed) {
      await answerCallback(
        env,
        callback.id,
        "⛔ دسترسی ندارید.",
        true
      );

      return;
    }
  }

  /* =====================
     PANEL ROUTES
  ===================== */

  if (
    data ===
    "panel:main"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await callbackMainPanel(
      env,
      callback
    );

    return;
  }


  if (
    data ===
    "panel:security"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await callbackSecurityPanel(
      env,
      callback
    );

    return;
  }


  if (
    data ===
    "panel:moderation"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await callbackModerationPanel(
      env,
      callback
    );

    return;
  }


  if (
    data ===
    "panel:warnings"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await callbackWarningsPanel(
      env,
      callback
    );

    return;
  }


  if (
    data ===
    "panel:rules"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await callbackRulesPanel(
      env,
      callback
    );

    return;
  }


  if (
    data ===
    "panel:stats"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await callbackStatsPanel(
      env,
      callback
    );

    return;
  }


  if (
    data ===
    "panel:settings"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await callbackSettingsPanel(
      env,
      callback
    );

    return;
  }


  if (
    data ===
    "panel:help"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await editPanel(
      env,
      callback,
      [
        "❓ <b>راهنمای پنل</b>",
        "",
        "🛡️ امنیت: کنترل لینک، اسپم، فلود و رسانه‌ها",
        "👮 مدیریت: ابزارهای مدیریت کاربران",
        "⚠️ اخطارها: تنظیم سیستم Warning",
        "📜 قوانین: نمایش قوانین گروه",
        "📊 آمار: مشاهده آمار ذخیره‌شده",
        "⚙️ تنظیمات: Welcome، Goodbye و Log"
      ].join("\n"),
      backKeyboard()
    );

    return;
  }


  /* =====================
     SETTINGS
  ===================== */

  if (
    data.startsWith(
      "toggle:"
    )
  ) {
    const setting =
      data.substring(
        "toggle:".length
      );

    await callbackToggle(
      env,
      callback,
      setting
    );

    return;
  }


  /* =====================
     WARNING LIMIT
  ===================== */

  if (
    data ===
    "warning:up"
  ) {
    await callbackWarningLimit(
      env,
      callback,
      1
    );

    return;
  }


  if (
    data ===
    "warning:down"
  ) {
    await callbackWarningLimit(
      env,
      callback,
      -1
    );

    return;
  }


  /* =====================
     SHOW RULES
  ===================== */

  if (
    data ===
    "rules:show"
  ) {
    await callbackShowRules(
      env,
      callback
    );

    return;
  }


  /* =====================
     MODERATION
  ===================== */

  if (
    data.startsWith(
      "mod:"
    )
  ) {
    const action =
      data.substring(
        "mod:".length
      );

    await callbackModerationAction(
      env,
      callback,
      action
    );

    return;
  }


  /* =====================
     UNKNOWN CALLBACK
  ===================== */

  await answerCallback(
    env,
    callback.id,
    "⚠️ این گزینه دیگر در دسترس نیست.",
    true
  );
}
/* ============================================================
   PART 6 — INLINE GLASS PANEL / KEYBOARDS
============================================================ */


/* =========================
   BUTTON BUILDER
========================= */

function inlineButton(
  text,
  callbackData
) {
  return {
    text,
    callback_data:
      callbackData
  };
}


/* =========================
   MAIN PANEL KEYBOARD
========================= */

function mainKeyboard() {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "🛡️ امنیت",
          "panel:security"
        ),

        inlineButton(
          "👮 مدیریت",
          "panel:moderation"
        )
      ],

      [
        inlineButton(
          "⚠️ اخطارها",
          "panel:warnings"
        ),

        inlineButton(
          "⚙️ تنظیمات",
          "panel:settings"
        )
      ],

      [
        inlineButton(
          "📜 قوانین",
          "panel:rules"
        ),

        inlineButton(
          "📊 آمار",
          "panel:stats"
        )
      ],

      [
        inlineButton(
          "❓ راهنما",
          "panel:help"
        )
      ]

    ]
  };
}


/* =========================
   MAIN PANEL TEXT
========================= */

function mainPanelText() {
  return [
    "╔════════════════════╗",
    "      🤖 <b>پنل مدیریت ربات</b>",
    "╚════════════════════╝",
    "",
    "👋 به پنل مدیریت خوش اومدی.",
    "",
    "از گزینه‌های زیر می‌تونی",
    "ربات و تنظیمات گروه رو مدیریت کنی.",
    "",
    "🛡️ امنیت",
    "👮 مدیریت کاربران",
    "⚠️ سیستم اخطار",
    "⚙️ تنظیمات",
    "📜 قوانین",
    "📊 آمار گروه"
  ].join("\n");
}


/* =========================
   SECURITY KEYBOARD
========================= */

function securityKeyboard(
  settings
) {
  return {
    inline_keyboard: [

      [
        inlineButton(
          `🔗 لینک: ${
            settings.antiLink
              ? "🟢 روشن"
              : "🔴 خاموش"
          }`,
          "toggle:antiLink"
        )
      ],

      [
        inlineButton(
          `🚨 ضداسپم: ${
            settings.antiSpam
              ? "🟢 روشن"
              : "🔴 خاموش"
          }`,
          "toggle:antiSpam"
        ),

        inlineButton(
          `🌊 ضدفلود: ${
            settings.antiFlood
              ? "🟢 روشن"
              : "🔴 خاموش"
          }`,
          "toggle:antiFlood"
        )
      ],

      [
        inlineButton(
          `🖼️ عکس: ${
            settings.lockPhoto
              ? "🔒 قفل"
              : "🔓 آزاد"
          }`,
          "toggle:lockPhoto"
        ),

        inlineButton(
          `🎥 ویدیو: ${
            settings.lockVideo
              ? "🔒 قفل"
              : "🔓 آزاد"
          }`,
          "toggle:lockVideo"
        )
      ],

      [
        inlineButton(
          `📁 فایل: ${
            settings.lockDocument
              ? "🔒 قفل"
              : "🔓 آزاد"
          }`,
          "toggle:lockDocument"
        ),

        inlineButton(
          `🎭 استیکر: ${
            settings.lockSticker
              ? "🔒 قفل"
              : "🔓 آزاد"
          }`,
          "toggle:lockSticker"
        )
      ],

      [
        inlineButton(
          `🎙️ ویس: ${
            settings.lockVoice
              ? "🔒 قفل"
              : "🔓 آزاد"
          }`,
          "toggle:lockVoice"
        ),

        inlineButton(
          `🎵 آهنگ: ${
            settings.lockAudio
              ? "🔒 قفل"
              : "🔓 آزاد"
          }`,
          "toggle:lockAudio"
        )
      ],

      [
        inlineButton(
          `🎞️ GIF: ${
            settings.lockAnimation
              ? "🔒 قفل"
              : "🔓 آزاد"
          }`,
          "toggle:lockAnimation"
        ),

        inlineButton(
          `📊 نظرسنجی: ${
            settings.lockPoll
              ? "🔒 قفل"
              : "🔓 آزاد"
          }`,
          "toggle:lockPoll"
        )
      ],

      [
        inlineButton(
          `📍 موقعیت: ${
            settings.lockLocation
              ? "🔒 قفل"
              : "🔓 آزاد"
          }`,
          "toggle:lockLocation"
        ),

        inlineButton(
          `👤 مخاطب: ${
            settings.lockContact
              ? "🔒 قفل"
              : "🔓 آزاد"
          }`,
          "toggle:lockContact"
        )
      ],

      [
        inlineButton(
          `↪️ فوروارد: ${
            settings.lockForward
              ? "🔒 قفل"
              : "🔓 آزاد"
          }`,
          "toggle:lockForward"
        )
      ],

      [
        inlineButton(
          "🔙 بازگشت",
          "panel:main"
        )
      ]

    ]
  };
}


/* =========================
   SECURITY TEXT
========================= */

function securityPanelText(
  settings
) {
  return [
    "🛡️ <b>پنل امنیت گروه</b>",
    "",
    "از این قسمت می‌تونی",
    "سیستم‌های امنیتی گروه رو کنترل کنی.",
    "",
    `🔗 ضد لینک: ${
      settings.antiLink
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    `🚨 ضد اسپم: ${
      settings.antiSpam
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    `🌊 ضد فلود: ${
      settings.antiFlood
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    "",
    "🔒 قفل‌های رسانه‌ای:",
    "",
    `🖼️ عکس: ${
      settings.lockPhoto
        ? "🔒"
        : "🔓"
    }`,
    `🎥 ویدیو: ${
      settings.lockVideo
        ? "🔒"
        : "🔓"
    }`,
    `📁 فایل: ${
      settings.lockDocument
        ? "🔒"
        : "🔓"
    }`,
    `🎭 استیکر: ${
      settings.lockSticker
        ? "🔒"
        : "🔓"
    }`
  ].join("\n");
}


/* =========================
   SETTINGS KEYBOARD
========================= */

function settingsPanelKeyboard(
  settings
) {
  return {
    inline_keyboard: [

      [
        inlineButton(
          `👋 خوش‌آمدگویی: ${
            settings.welcome
              ? "🟢"
              : "🔴"
          }`,
          "toggle:welcome"
        )
      ],

      [
        inlineButton(
          `👋 پیام خروج: ${
            settings.goodbye
              ? "🟢"
              : "🔴"
          }`,
          "toggle:goodbye"
        )
      ],

      [
        inlineButton(
          `📝 ثبت گزارش: ${
            settings.logEnabled
              ? "🟢"
              : "🔴"
          }`,
          "toggle:logEnabled"
        )
      ],

      [
        inlineButton(
          "🔙 بازگشت",
          "panel:main"
        )
      ]

    ]
  };
}


/* =========================
   SETTINGS TEXT
========================= */

function settingsPanelText(
  settings
) {
  return [
    "⚙️ <b>تنظیمات ربات</b>",
    "",
    `👋 خوش‌آمدگویی: ${
      settings.welcome
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    `🚪 پیام خروج: ${
      settings.goodbye
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    `📝 ثبت گزارش: ${
      settings.logEnabled
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    "",
    "برای تغییر هر گزینه روی دکمه مربوطه بزن."
  ].join("\n");
}


/* =========================
   MODERATION KEYBOARD
========================= */

function moderationPanelKeyboard() {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "🔇 سکوت",
          "mod:mute"
        ),

        inlineButton(
          "🔊 رفع سکوت",
          "mod:unmute"
        )
      ],

      [
        inlineButton(
          "🚫 مسدود",
          "mod:ban"
        ),

        inlineButton(
          "✅ رفع مسدودی",
          "mod:unban"
        )
      ],

      [
        inlineButton(
          "⚠️ اخطار",
          "mod:warn"
        )
      ],

      [
        inlineButton(
          "🔙 بازگشت",
          "panel:main"
        )
      ]

    ]
  };
}


/* =========================
   MODERATION TEXT
========================= */

function moderationPanelText() {
  return [
    "👮 <b>پنل مدیریت کاربران</b>",
    "",
    "برای مدیریت یک کاربر:",
    "",
    "1️⃣ روی پیام کاربر ریپلای کن.",
    "2️⃣ پنل را باز کن.",
    "3️⃣ عملیات موردنظر را انتخاب کن.",
    "",
    "🔇 سکوت",
    "🔊 رفع سکوت",
    "🚫 مسدود",
    "✅ رفع مسدودی",
    "⚠️ اخطار"
  ].join("\n");
}


/* =========================
   WARNINGS KEYBOARD
========================= */

function warningsPanelKeyboard(
  settings
) {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "➕ افزایش سقف",
          "warning:up"
        ),

        inlineButton(
          "➖ کاهش سقف",
          "warning:down"
        )
      ],

      [
        inlineButton(
          `⚠️ سیستم اخطار: ${
            settings.warnings
              ? "🟢 فعال"
              : "🔴 خاموش"
          }`,
          "toggle:warnings"
        )
      ],

      [
        inlineButton(
          "🔙 بازگشت",
          "panel:main"
        )
      ]

    ]
  };
}


/* =========================
   WARNINGS TEXT
========================= */

function warningsPanelText(
  settings
) {
  return [
    "⚠️ <b>سیستم اخطار</b>",
    "",
    `وضعیت: ${
      settings.warnings
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    "",
    `حداکثر اخطار: <b>${
      Number(
        settings.maxWarnings || 3
      )
    }</b>`,
    "",
    "با رسیدن کاربر به سقف اخطار،",
    "اقدام خودکار اجرا می‌شود."
  ].join("\n");
}


/* =========================
   RULES KEYBOARD
========================= */

function rulesPanelKeyboard() {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "📜 نمایش قوانین",
          "rules:show"
        )
      ],

      [
        inlineButton(
          "🔙 بازگشت",
          "panel:main"
        )
      ]

    ]
  };
}


/* =========================
   RULES TEXT
========================= */

function rulesPanelText(
  settings
) {
  return [
    "📜 <b>قوانین گروه</b>",
    "",
    settings.rules
      ? escapeHTML(
          settings.rules
        )
      : "هنوز قانونی ثبت نشده است."
  ].join("\n");
}


/* =========================
   STATS TEXT
========================= */

function statsPanelText(
  stats
) {
  return [
    "📊 <b>آمار گروه</b>",
    "",
    `💬 پیام‌ها: <b>${
      Number(
        stats.messages || 0
      )
    }</b>`,
    `🗑️ حذف‌شده‌ها: <b>${
      Number(
        stats.deleted || 0
      )
    }</b>`,
    `⚠️ اخطارها: <b>${
      Number(
        stats.warnings || 0
      )
    }</b>`,
    `🔇 محدودیت‌ها: <b>${
      Number(
        stats.mutes || 0
      )
    }</b>`,
    `🚫 مسدودی‌ها: <b>${
      Number(
        stats.bans || 0
      )
    }</b>`
  ].join("\n");
}


/* =========================
   BACK KEYBOARD
========================= */

function backKeyboard() {
  return {
    inline_keyboard: [
      [
        inlineButton(
          "🔙 بازگشت",
          "panel:main"
        )
      ]
    ]
  };
}


/* =========================
   ENGLISH COMMAND ALIASES
========================= */

const COMMAND_ALIASES = {

  "/panel":
    [
      "/panel",
      "/پنل",
      "/menu",
      "/منو"
    ],

  "/security":
    [
      "/security",
      "/امنیت"
    ],

  "/settings":
    [
      "/settings",
      "/تنظیمات"
    ],

  "/rules":
    [
      "/rules",
      "/قوانین"
    ],

  "/help":
    [
      "/help",
      "/راهنما"
    ],

  "/id":
    [
      "/id",
      "/آیدی",
      "/شناسه"
    ],

  "/mute":
    [
      "/mute",
      "/سکوت",
      "/سایلنت"
    ],

  "/unmute":
    [
      "/unmute",
      "/رفع_سکوت"
    ],

  "/ban":
    [
      "/ban",
      "/بن",
      "/مسدود"
    ],

  "/unban":
    [
      "/unban",
      "/رفع_بن"
    ],

  "/warn":
    [
      "/warn",
      "/اخطار",
      "/هشدار"
    ]

};


/* =========================
   COMMAND NORMALIZER
========================= */

function normalizeCommand(
  text
) {
  const first =
    String(
      text || ""
    )
      .trim()
      .split(/\s+/)[0]
      .toLowerCase();

  for (
    const canonical of
      Object.keys(
        COMMAND_ALIASES
      )
  ) {

    if (
      COMMAND_ALIASES[
        canonical
      ].includes(first)
    ) {
      return canonical;
    }
  }

  return first;
}
/* ============================================================
   PART 7 — LOGGING / STATISTICS / GROUP EVENTS
============================================================ */


/* =========================
   SAFE LOG OBJECT
========================= */

function safeLogObject(
  value
) {
  try {
    return JSON.stringify(
      value,
      (
        key,
        item
      ) => {
        if (
          typeof item ===
          "bigint"
        ) {
          return item.toString();
        }

        return item;
      }
    );
  } catch {
    return String(
      value
    );
  }
}


/* =========================
   EVENT LOG
========================= */

async function logEvent(
  env,
  chatId,
  type,
  data = {}
) {
  try {
    const settings =
      await getSettings(
        env,
        chatId
      );

    if (
      settings.logEnabled ===
      false
    ) {
      return;
    }

    const key =
      `eventlog:${chatId}`;

    const existing =
      await kvGet(
        env,
        key,
        []
      );

    const event = {
      type,
      data,
      timestamp:
        Date.now()
    };

    const logs =
      Array.isArray(
        existing
      )
        ? existing
        : [];

    logs.unshift(
      event
    );

    /*
     * Keep the latest
     * 100 events.
     */

    logs.splice(
      100
    );

    await kvPut(
      env,
      key,
      logs
    );

  } catch (error) {
    console.error(
      "logEvent:",
      error.message
    );
  }
}


/* =========================
   GET EVENT LOG
========================= */

async function getEventLogs(
  env,
  chatId
) {
  const logs =
    await kvGet(
      env,
      `eventlog:${chatId}`,
      []
    );

  return Array.isArray(
    logs
  )
    ? logs
    : [];
}


/* =========================
   CLEAR EVENT LOG
========================= */

async function clearEventLogs(
  env,
  chatId
) {
  await kvPut(
    env,
    `eventlog:${chatId}`,
    []
  );

  return true;
}


/* =========================
   STATISTIC INCREMENT
========================= */

async function incrementStat(
  env,
  chatId,
  stat,
  amount = 1
) {
  const key =
    `stats:${chatId}`;

  const stats =
    await kvGet(
      env,
      key,
      {}
    );

  const current =
    Number(
      stats[stat] || 0
    );

  stats[stat] =
    current +
    Number(
      amount
    );

  stats.updatedAt =
    Date.now();

  await kvPut(
    env,
    key,
    stats
  );

  return stats;
}


/* =========================
   GET STATISTICS
========================= */

async function getStats(
  env,
  chatId
) {
  const stats =
    await kvGet(
      env,
      `stats:${chatId}`,
      {}
    );

  return {
    messages:
      Number(
        stats.messages || 0
      ),

    deleted:
      Number(
        stats.deleted || 0
      ),

    warnings:
      Number(
        stats.warnings || 0
      ),

    mutes:
      Number(
        stats.mutes || 0
      ),

    bans:
      Number(
        stats.bans || 0
      ),

    updatedAt:
      stats.updatedAt ||
      null
  };
}


/* =========================
   RESET STATISTICS
========================= */

async function resetStats(
  env,
  chatId
) {
  await kvPut(
    env,
    `stats:${chatId}`,
    {
      messages: 0,
      deleted: 0,
      warnings: 0,
      mutes: 0,
      bans: 0,
      updatedAt:
        Date.now()
    }
  );

  return true;
}


/* =========================
   MEMBER STATISTICS
========================= */

async function updateMemberStats(
  env,
  chatId,
  userId,
  type
) {
  if (!userId) {
    return;
  }

  const key =
    `memberstats:${chatId}:${userId}`;

  const stats =
    await kvGet(
      env,
      key,
      {
        messages: 0,
        warnings: 0,
        deleted: 0,
        joins: 0,
        leaves: 0
      }
    );

  if (
    typeof stats[type] !==
    "number"
  ) {
    stats[type] = 0;
  }

  stats[type]++;

  stats.updatedAt =
    Date.now();

  await kvPut(
    env,
    key,
    stats
  );
}


/* =========================
   GROUP JOIN EVENT
========================= */

async function handleJoinEvent(
  message,
  env
) {
  const members =
    message
      ?.new_chat_members;

  if (
    !Array.isArray(
      members
    )
  ) {
    return;
  }

  for (
    const member of members
  ) {
    const userId =
      Number(
        member?.id || 0
      );

    if (!userId) {
      continue;
    }

    await updateMemberStats(
      env,
      message.chat.id,
      userId,
      "joins"
    );

    await logEvent(
      env,
      message.chat.id,
      "member_join",
      {
        userId,
        name:
          displayName(
            member
          )
      }
    );
  }
}


/* =========================
   GROUP LEAVE EVENT
========================= */

async function handleLeaveEvent(
  message,
  env
) {
  const member =
    message
      ?.left_chat_member;

  if (!member) {
    return;
  }

  const userId =
    Number(
      member.id || 0
    );

  if (!userId) {
    return;
  }

  await updateMemberStats(
    env,
    message.chat.id,
    userId,
    "leaves"
  );

  await logEvent(
    env,
    message.chat.id,
    "member_leave",
    {
      userId,
      name:
        displayName(
          member
        )
    }
  );
}


/* =========================
   MESSAGE EVENT LOGGER
========================= */

async function logMessageEvent(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  const userId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return;
  }

  await updateMemberStats(
    env,
    chatId,
    userId,
    "messages"
  );
}


/* =========================
   DELETED MESSAGE STAT
========================= */

async function logDeletedMessage(
  env,
  chatId,
  userId
) {
  await incrementStat(
    env,
    chatId,
    "deleted"
  );

  await updateMemberStats(
    env,
    chatId,
    userId,
    "deleted"
  );

  await logEvent(
    env,
    chatId,
    "message_deleted",
    {
      userId
    }
  );
}


/* =========================
   WARNING EVENT
========================= */

async function logWarningEvent(
  env,
  chatId,
  userId,
  count
) {
  await logEvent(
    env,
    chatId,
    "warning",
    {
      userId,
      count
    }
  );

  await updateMemberStats(
    env,
    chatId,
    userId,
    "warnings"
  );
}


/* =========================
   MUTE EVENT
========================= */

async function logMuteEvent(
  env,
  chatId,
  userId
) {
  await logEvent(
    env,
    chatId,
    "mute",
    {
      userId
    }
  );
}


/* =========================
   BAN EVENT
========================= */

async function logBanEvent(
  env,
  chatId,
  userId
) {
  await logEvent(
    env,
    chatId,
    "ban",
    {
      userId
    }
  );
}


/* =========================
   FORMAT DATE
========================= */

function formatEventDate(
  timestamp
) {
  if (!timestamp) {
    return "نامشخص";
  }

  try {
    return new Date(
      timestamp
    ).toLocaleString(
      "fa-IR",
      {
        timeZone:
          "Asia/Tehran"
      }
    );
  } catch {
    return "نامشخص";
  }
}


/* =========================
   EVENT LOG TEXT
========================= */

function eventLogsText(
  logs
) {
  if (
    !Array.isArray(
      logs
    ) ||
    logs.length === 0
  ) {
    return [
      "📋 <b>گزارش رویدادها</b>",
      "",
      "هنوز رویدادی ثبت نشده است."
    ].join("\n");
  }

  const lines = [
    "📋 <b>آخرین رویدادها</b>",
    ""
  ];

  const limited =
    logs.slice(
      0,
      15
    );

  for (
    const event of limited
  ) {
    let title =
      "رویداد";

    if (
      event.type ===
      "member_join"
    ) {
      title =
        "👋 ورود عضو";
    }

    else if (
      event.type ===
      "member_leave"
    ) {
      title =
        "🚪 خروج عضو";
    }

    else if (
      event.type ===
      "message_deleted"
    ) {
      title =
        "🗑️ حذف پیام";
    }

    else if (
      event.type ===
      "warning"
    ) {
      title =
        "⚠️ اخطار";
    }

    else if (
      event.type ===
      "mute"
    ) {
      title =
        "🔇 محدودیت";
    }

    else if (
      event.type ===
      "ban"
    ) {
      title =
        "🚫 مسدودی";
    }

    lines.push(
      `${title} — ${formatEventDate(event.timestamp)}`
    );
  }

  return lines.join(
    "\n"
  );
}


/* =========================
   LOG PANEL KEYBOARD
========================= */

function logsPanelKeyboard() {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "🔄 بروزرسانی",
          "panel:logs"
        )
      ],

      [
        inlineButton(
          "🗑️ پاک کردن گزارش",
          "logs:clear"
        )
      ],

      [
        inlineButton(
          "🔙 بازگشت",
          "panel:main"
        )
      ]

    ]
  };
}


/* =========================
   LOG PANEL
========================= */

async function callbackLogsPanel(
  env,
  callback
) {
  const chatId =
    callback.message
      ?.chat?.id;

  if (
    !chatId
  ) {
    return;
  }

  const logs =
    await getEventLogs(
      env,
      chatId
    );

  await answerCallback(
    env,
    callback.id
  );

  await editPanel(
    env,
    callback,
    eventLogsText(
      logs
    ),
    logsPanelKeyboard()
  );
}


/* =========================
   CLEAR LOG CALLBACK
========================= */

async function callbackClearLogs(
  env,
  callback
) {
  const chatId =
    callback.message
      ?.chat?.id;

  if (
    !chatId
  ) {
    return;
  }

  await clearEventLogs(
    env,
    chatId
  );

  await answerCallback(
    env,
    callback.id,
    "🗑️ گزارش‌ها پاک شدند."
  );

  await callbackLogsPanel(
    env,
    callback
  );
}


/* =========================
   DETAILED STATISTICS
========================= */

function detailedStatsText(
  stats
) {
  return [
    "📊 <b>آمار کامل گروه</b>",
    "",
    `💬 پیام‌ها: <b>${stats.messages}</b>`,
    `🗑️ حذف‌شده‌ها: <b>${stats.deleted}</b>`,
    `⚠️ اخطارها: <b>${stats.warnings}</b>`,
    `🔇 محدودیت‌ها: <b>${stats.mutes}</b>`,
    `🚫 مسدودی‌ها: <b>${stats.bans}</b>`,
    "",
    `🕒 آخرین بروزرسانی: ${
      formatEventDate(
        stats.updatedAt
      )
    }`
  ].join("\n");
}


/* =========================
   EVENT ROUTER EXTENSION
========================= */

async function handleLogCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data || ""
    );

  if (
    data ===
    "panel:logs"
  ) {
    await callbackLogsPanel(
      env,
      callback
    );

    return true;
  }

  if (
    data ===
    "logs:clear"
  ) {
    await callbackClearLogs(
      env,
      callback
    );

    return true;
  }

  return false;
}
/* ============================================================
   PART 8 — ADVANCED ADMIN / GROUP MANAGEMENT
============================================================ */


/* =========================
   ADMIN CHECK
========================= */

async function requireAdmin(
  env,
  chatId,
  userId
) {
  const admin =
    await isAdmin(
      env,
      chatId,
      userId
    );

  if (!admin) {
    return false;
  }

  return true;
}


/* =========================
   GET TARGET USER
========================= */

function getTargetUser(
  message
) {
  if (
    message?.reply_to_message
      ?.from
  ) {
    return message
      .reply_to_message
      .from;
  }

  return null;
}


/* =========================
   TARGET USER ID
========================= */

function getTargetUserId(
  message
) {
  const user =
    getTargetUser(
      message
    );

  return Number(
    user?.id || 0
  );
}


/* =========================
   PROTECTED USER
========================= */

function isProtectedUser(
  userId
) {
  return OWNER_IDS.includes(
    Number(userId)
  );
}


/* =========================
   DELETE USER MESSAGE
========================= */

async function deleteUserMessage(
  env,
  message
) {
  if (
    !message?.chat?.id ||
    !message?.message_id
  ) {
    return false;
  }

  try {
    await deleteMessage(
      env,
      message.chat.id,
      message.message_id
    );

    await logDeletedMessage(
      env,
      message.chat.id,
      Number(
        message.from?.id || 0
      )
    );

    return true;

  } catch (error) {
    console.error(
      "deleteUserMessage:",
      error.message
    );

    return false;
  }
}


/* =========================
   PURGE REPLIED MESSAGE
========================= */

async function purgeReply(
  env,
  message
) {
  const reply =
    message
      ?.reply_to_message;

  if (!reply) {
    return false;
  }

  return await deleteUserMessage(
    env,
    reply
  );
}


/* =========================
   ADMIN ACTION CHECK
========================= */

async function validateAdminAction(
  env,
  message,
  targetId
) {
  const chatId =
    message.chat.id;

  const actorId =
    Number(
      message.from?.id || 0
    );

  if (
    !await requireAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    return {
      ok: false,
      reason: "not_admin"
    };
  }

  if (
    !targetId
  ) {
    return {
      ok: false,
      reason: "no_target"
    };
  }

  if (
    isProtectedUser(
      targetId
    )
  ) {
    return {
      ok: false,
      reason: "protected"
    };
  }

  return {
    ok: true
  };
}


/* =========================
   KICK USER
========================= */

async function kickUser(
  env,
  chatId,
  userId
) {
  /*
   * Telegram does not have a
   * separate "kick" endpoint.
   *
   * Ban followed by unban removes
   * the user while allowing them
   * to return later.
   */

  await banUser(
    env,
    chatId,
    userId
  );

  await unbanUser(
    env,
    chatId,
    userId
  );

  await logEvent(
    env,
    chatId,
    "kick",
    {
      userId
    }
  );

  return true;
}


/* =========================
   PROMOTE USER
========================= */

async function promoteUser(
  env,
  chatId,
  userId
) {
  const permissions = {
    can_manage_chat: true,
    can_delete_messages: true,
    can_manage_video_chats: true,
    can_restrict_members: true,
    can_promote_members: false,
    can_change_info: true,
    can_invite_users: true,
    can_pin_messages: true,
    can_manage_topics: true
  };

  await telegram(
    env,
    "promoteChatMember",
    {
      chat_id:
        chatId,

      user_id:
        userId,

      ...permissions
    }
  );

  await logEvent(
    env,
    chatId,
    "promote",
    {
      userId
    }
  );

  return true;
}


/* =========================
   DEMOTE USER
========================= */

async function demoteUser(
  env,
  chatId,
  userId
) {
  const permissions = {
    is_anonymous: false,
    can_manage_chat: false,
    can_delete_messages: false,
    can_manage_video_chats: false,
    can_restrict_members: false,
    can_promote_members: false,
    can_change_info: false,
    can_invite_users: false,
    can_pin_messages: false,
    can_manage_topics: false
  };

  await telegram(
    env,
    "promoteChatMember",
    {
      chat_id:
        chatId,

      user_id:
        userId,

      ...permissions
    }
  );

  await logEvent(
    env,
    chatId,
    "demote",
    {
      userId
    }
  );

  return true;
}


/* =========================
   SET GROUP TITLE
========================= */

async function setGroupTitle(
  env,
  chatId,
  title
) {
  const clean =
    String(
      title || ""
    )
      .trim()
      .slice(
        0,
        128
      );

  if (!clean) {
    return false;
  }

  await telegram(
    env,
    "setChatTitle",
    {
      chat_id:
        chatId,

      title:
        clean
    }
  );

  await logEvent(
    env,
    chatId,
    "title_changed",
    {
      title: clean
    }
  );

  return true;
}


/* =========================
   SET GROUP DESCRIPTION
========================= */

async function setGroupDescription(
  env,
  chatId,
  description
) {
  const clean =
    String(
      description || ""
    )
      .trim()
      .slice(
        0,
        255
      );

  await telegram(
    env,
    "setChatDescription",
    {
      chat_id:
        chatId,

      description:
        clean
    }
  );

  await logEvent(
    env,
    chatId,
    "description_changed"
  );

  return true;
}


/* =========================
   PIN MESSAGE
========================= */

async function pinMessage(
  env,
  chatId,
  messageId,
  silent = false
) {
  await telegram(
    env,
    "pinChatMessage",
    {
      chat_id:
        chatId,

      message_id:
        messageId,

      disable_notification:
        silent
    }
  );

  await logEvent(
    env,
    chatId,
    "message_pinned",
    {
      messageId
    }
  );

  return true;
}


/* =========================
   UNPIN MESSAGE
========================= */

async function unpinMessage(
  env,
  chatId,
  messageId
) {
  await telegram(
    env,
    "unpinChatMessage",
    {
      chat_id:
        chatId,

      message_id:
        messageId
    }
  );

  await logEvent(
    env,
    chatId,
    "message_unpinned",
    {
      messageId
    }
  );

  return true;
}


/* =========================
   GET CHAT MEMBER
========================= */

async function getChatMember(
  env,
  chatId,
  userId
) {
  return await telegram(
    env,
    "getChatMember",
    {
      chat_id:
        chatId,

      user_id:
        userId
    }
  );
}


/* =========================
   GET CHAT ADMINISTRATORS
========================= */

async function getChatAdministrators(
  env,
  chatId
) {
  return await telegram(
    env,
    "getChatAdministrators",
    {
      chat_id:
        chatId
    }
  );
}


/* =========================
   GROUP INFORMATION
========================= */

async function getGroupInfo(
  env,
  chatId
) {
  return await telegram(
    env,
    "getChat",
    {
      chat_id:
        chatId
    }
  );
}


/* =========================
   GROUP INFO TEXT
========================= */

function groupInfoText(
  chat
) {
  if (!chat) {
    return "❌ اطلاعات گروه دریافت نشد.";
  }

  return [
    "🏠 <b>اطلاعات گروه</b>",
    "",
    `📌 نام: <b>${escapeHTML(
      chat.title ||
      "بدون نام"
    )}</b>`,
    `🆔 شناسه: <code>${chat.id}</code>`,
    `📂 نوع: <b>${escapeHTML(
      chat.type ||
      "unknown"
    )}</b>`,
    chat.username
      ? `🔗 نام کاربری: @${escapeHTML(chat.username)}`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}


/* =========================
   ADMIN LIST TEXT
========================= */

function administratorsText(
  admins
) {
  if (
    !Array.isArray(
      admins
    ) ||
    admins.length === 0
  ) {
    return [
      "👮 <b>مدیران گروه</b>",
      "",
      "مدیری پیدا نشد."
    ].join("\n");
  }

  const lines = [
    "👮 <b>مدیران گروه</b>",
    ""
  ];

  for (
    const admin of admins
  ) {
    const user =
      admin.user;

    const name =
      escapeHTML(
        displayName(
          user
        )
      );

    let role =
      "مدیر";

    if (
      admin.status ===
      "creator"
    ) {
      role =
        "👑 مالک";
    }

    else if (
      admin.status ===
      "administrator"
    ) {
      role =
        "🛡️ مدیر";
    }

    lines.push(
      `${role} — ${name} — <code>${user.id}</code>`
    );
  }

  return lines.join(
    "\n"
  );
}


/* =========================
   ADMIN MANAGEMENT RESULT
========================= */

async function sendAdminActionResult(
  env,
  message,
  action
) {
  const chatId =
    message.chat.id;

  const target =
    getTargetUser(
      message
    );

  if (!target) {
    await sendMessage(
      env,
      chatId,
      "⚠️ این دستور را با ریپلای روی پیام کاربر استفاده کن."
    );

    return true;
  }

  const targetId =
    Number(
      target.id
    );

  const validation =
    await validateAdminAction(
      env,
      message,
      targetId
    );

  if (
    !validation.ok
  ) {
    const text = {

      not_admin:
        "⛔ فقط مدیران می‌توانند این عملیات را انجام دهند.",

      no_target:
        "⚠️ کاربر هدف مشخص نیست.",

      protected:
        "🛡️ این کاربر محافظت شده است."

    }[
      validation.reason
    ] ||
      "⛔ عملیات انجام نشد.";

    await sendMessage(
      env,
      chatId,
      text
    );

    return true;
  }

  try {

    if (
      action ===
      "kick"
    ) {
      await kickUser(
        env,
        chatId,
        targetId
      );
    }

    else if (
      action ===
      "promote"
    ) {
      await promoteUser(
        env,
        chatId,
        targetId
      );
    }

    else if (
      action ===
      "demote"
    ) {
      await demoteUser(
        env,
        chatId,
        targetId
      );
    }

    else {
      return false;
    }

    const messages = {

      kick:
        "👢 کاربر از گروه حذف شد.",

      promote:
        "⬆️ کاربر به مدیر ارتقا پیدا کرد.",

      demote:
        "⬇️ دسترسی مدیریتی کاربر برداشته شد."

    };

    await sendMessage(
      env,
      chatId,
      messages[action] ||
        "✅ عملیات انجام شد."
    );

    return true;

  } catch (error) {

    console.error(
      "Admin action:",
      error.message
    );

    await sendMessage(
      env,
      chatId,
      "❌ اجرای عملیات با خطا مواجه شد."
    );

    return true;
  }
}


/* =========================
   ADMIN COMMAND EXTENSION
========================= */

async function handleAdvancedAdminCommand(
  message,
  env,
  command
) {
  if (
    !message?.chat
  ) {
    return false;
  }

  if (
    command ===
    "/kick"
  ) {
    return await sendAdminActionResult(
      env,
      message,
      "kick"
    );
  }

  if (
    command ===
    "/promote"
  ) {
    return await sendAdminActionResult(
      env,
      message,
      "promote"
    );
  }

  if (
    command ===
    "/demote"
  ) {
    return await sendAdminActionResult(
      env,
      message,
      "demote"
    );
  }

  if (
    command ===
    "/admins"
  ) {
    const admins =
      await getChatAdministrators(
        env,
        message.chat.id
      );

    await sendMessage(
      env,
      message.chat.id,
      administratorsText(
        admins
      )
    );

    return true;
  }

  if (
    command ===
    "/groupinfo"
  ) {
    const chat =
      await getGroupInfo(
        env,
        message.chat.id
      );

    await sendMessage(
      env,
      message.chat.id,
      groupInfoText(
        chat
      )
    );

    return true;
  }

  if (
    command ===
    "/pin"
  ) {
    const reply =
      message.reply_to_message;

    if (!reply) {
      await sendMessage(
        env,
        message.chat.id,
        "⚠️ برای پین کردن، روی پیام موردنظر ریپلای کن."
      );

      return true;
    }

    await pinMessage(
      env,
      message.chat.id,
      reply.message_id
    );

    await sendMessage(
      env,
      message.chat.id,
      "📌 پیام پین شد."
    );

    return true;
  }

  if (
    command ===
    "/unpin"
  ) {
    const reply =
      message.reply_to_message;

    if (!reply) {
      await sendMessage(
        env,
        message.chat.id,
        "⚠️ برای برداشتن پین، روی پیام موردنظر ریپلای کن."
      );

      return true;
    }

    await unpinMessage(
      env,
      message.chat.id,
      reply.message_id
    );

    await sendMessage(
      env,
      message.chat.id,
      "📌 پین پیام برداشته شد."
    );

    return true;
  }

  if (
    command ===
    "/del"
  ) {
    const result =
      await purgeReply(
        env,
        message
      );

    await sendMessage(
      env,
      message.chat.id,
      result
        ? "🗑️ پیام حذف شد."
        : "⚠️ پیام قابل حذف پیدا نشد."
    );

    return true;
  }

  return false;
}


/* =========================
   ENGLISH + PERSIAN ALIASES
========================= */

COMMAND_ALIASES[
  "/kick"
] = [
  "/kick",
  "/اخراج",
  "/کیک"
];

COMMAND_ALIASES[
  "/promote"
] = [
  "/promote",
  "/ارتقا",
  "/مدیر"
];

COMMAND_ALIASES[
  "/demote"
] = [
  "/demote",
  "/عزل",
  "/رفع_مدیریت"
];

COMMAND_ALIASES[
  "/admins"
] = [
  "/admins",
  "/مدیران"
];

COMMAND_ALIASES[
  "/groupinfo"
] = [
  "/groupinfo",
  "/اطلاعات_گروه"
];

COMMAND_ALIASES[
  "/pin"
] = [
  "/pin",
  "/پین"
];

COMMAND_ALIASES[
  "/unpin"
] = [
  "/unpin",
  "/رفع_پین"
];

COMMAND_ALIASES[
  "/del"
] = [
  "/del",
  "/حذف"
];
/* ============================================================
   PART 9 — ANTI SPAM / ANTI FLOOD / ANTI LINK
============================================================ */


/* =========================
   FLOOD MEMORY
========================= */

async function getFloodState(
  env,
  chatId,
  userId
) {
  const key =
    `flood:${chatId}:${userId}`;

  const state =
    await kvGet(
      env,
      key,
      {
        messages: [],
        blockedUntil: 0
      }
    );

  return {
    messages:
      Array.isArray(
        state.messages
      )
        ? state.messages
        : [],

    blockedUntil:
      Number(
        state.blockedUntil || 0
      )
  };
}


/* =========================
   SAVE FLOOD STATE
========================= */

async function saveFloodState(
  env,
  chatId,
  userId,
  state
) {
  await kvPut(
    env,
    `flood:${chatId}:${userId}`,
    state
  );
}


/* =========================
   FLOOD CHECK
========================= */

async function checkFlood(
  env,
  chatId,
  userId
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    !settings.antiFlood
  ) {
    return {
      triggered: false
    };
  }

  const now =
    Date.now();

  const windowMs =
    10 * 1000;

  const limit =
    Number(
      settings.floodLimit || 6
    );

  const state =
    await getFloodState(
      env,
      chatId,
      userId
    );

  if (
    state.blockedUntil >
    now
  ) {
    return {
      triggered: true,
      reason: "blocked",
      blockedUntil:
        state.blockedUntil
    };
  }

  state.messages =
    state.messages.filter(
      timestamp =>
        now - timestamp <
        windowMs
    );

  state.messages.push(
    now
  );

  if (
    state.messages.length >
    limit
  ) {
    const muteSeconds =
      Number(
        settings.floodMuteSeconds ||
        60
      );

    state.blockedUntil =
      now +
      muteSeconds * 1000;

    state.messages = [];

    await saveFloodState(
      env,
      chatId,
      userId,
      state
    );

    return {
      triggered: true,
      reason: "flood",
      blockedUntil:
        state.blockedUntil
    };
  }

  await saveFloodState(
    env,
    chatId,
    userId,
    state
  );

  return {
    triggered: false
  };
}


/* =========================
   SPAM KEYWORDS
========================= */

const SPAM_PATTERNS = [

  /free\s+money/i,
  /free\s+gift/i,
  /claim\s+now/i,
  /click\s+here/i,
  /airdrop/i,
  /giveaway/i,
  /casino/i,
  /betting/i,
  /crypto\s+bonus/i,
  /double\s+your\s+money/i

];


/* =========================
   LINK DETECTOR
========================= */

function containsLink(
  text
) {
  if (!text) {
    return false;
  }

  const value =
    String(
      text
    );

  const patterns = [

    /https?:\/\/\S+/i,

    /www\.\S+/i,

    /t\.me\/\S+/i,

    /telegram\.me\/\S+/i,

    /(?:^|\s)@\w{4,}/i

  ];

  return patterns.some(
    pattern =>
      pattern.test(
        value
      )
  );
}


/* =========================
   SPAM DETECTOR
========================= */

function detectSpam(
  text
) {
  if (!text) {
    return false;
  }

  const value =
    String(
      text
    ).trim();

  if (!value) {
    return false;
  }

  for (
    const pattern of
      SPAM_PATTERNS
  ) {
    if (
      pattern.test(
        value
      )
    ) {
      return true;
    }
  }

  /*
   * Excessive repeated
   * characters.
   */

  if (
    /(.)\1{8,}/u.test(
      value
    )
  ) {
    return true;
  }

  /*
   * Excessive uppercase
   * Latin text.
   */

  const letters =
    value.match(
      /[A-Za-z]/g
    ) || [];

  const upper =
    value.match(
      /[A-Z]/g
    ) || [];

  if (
    letters.length >= 12 &&
    upper.length /
      letters.length >
      0.85
  ) {
    return true;
  }

  return false;
}


/* =========================
   SPAM SCORE
========================= */

function spamScore(
  message
) {
  const text =
    String(
      message?.text ||
      message?.caption ||
      ""
    );

  let score = 0;

  if (
    containsLink(
      text
    )
  ) {
    score += 2;
  }

  if (
    detectSpam(
      text
    )
  ) {
    score += 3;
  }

  if (
    text.length >
    2000
  ) {
    score += 1;
  }

  if (
    /(.)\1{10,}/u.test(
      text
    )
  ) {
    score += 2;
  }

  return score;
}


/* =========================
   SECURITY ACTION
========================= */

async function handleSecurityViolation(
  message,
  env,
  reason
) {
  const chatId =
    message?.chat?.id;

  const userId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  /*
   * Never automatically
   * punish protected users.
   */

  if (
    isProtectedUser(
      userId
    )
  ) {
    return false;
  }

  /*
   * Delete violating message.
   */

  await deleteUserMessage(
    env,
    message
  );

  /*
   * Update statistics.
   */

  await incrementStat(
    env,
    chatId,
    "deleted"
  );

  /*
   * Log security event.
   */

  await logEvent(
    env,
    chatId,
    "security_violation",
    {
      userId,
      reason
    }
  );

  return true;
}


/* =========================
   ANTI LINK
========================= */

async function handleAntiLink(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  const userId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    !settings.antiLink
  ) {
    return false;
  }

  if (
    isProtectedUser(
      userId
    )
  ) {
    return false;
  }

  /*
   * Administrators are
   * ignored by default.
   */

  try {
    if (
      await isAdmin(
        env,
        chatId,
        userId
      )
    ) {
      return false;
    }
  } catch {
    /*
     * If admin lookup fails,
     * continue safely.
     */
  }

  const text =
    message.text ||
    message.caption ||
    "";

  if (
    !containsLink(
      text
    )
  ) {
    return false;
  }

  return await handleSecurityViolation(
    message,
    env,
    "anti_link"
  );
}


/* =========================
   ANTI SPAM
========================= */

async function handleAntiSpam(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  const userId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    !settings.antiSpam
  ) {
    return false;
  }

  if (
    isProtectedUser(
      userId
    )
  ) {
    return false;
  }

  try {
    if (
      await isAdmin(
        env,
        chatId,
        userId
      )
    ) {
      return false;
    }
  } catch {
    /*
     * Safe fallback.
     */
  }

  const score =
    spamScore(
      message
    );

  const threshold =
    Number(
      settings.spamScore ||
      3
    );

  if (
    score <
    threshold
  ) {
    return false;
  }

  return await handleSecurityViolation(
    message,
    env,
    "anti_spam"
  );
}


/* =========================
   ANTI FLOOD
========================= */

async function handleAntiFlood(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  const userId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    !settings.antiFlood
  ) {
    return false;
  }

  if (
    isProtectedUser(
      userId
    )
  ) {
    return false;
  }

  try {
    if (
      await isAdmin(
        env,
        chatId,
        userId
      )
    ) {
      return false;
    }
  } catch {
    /*
     * Continue safely.
     */
  }

  const result =
    await checkFlood(
      env,
      chatId,
      userId
    );

  if (
    !result.triggered
  ) {
    return false;
  }

  await handleSecurityViolation(
    message,
    env,
    "anti_flood"
  );

  await logEvent(
    env,
    chatId,
    "flood_detected",
    {
      userId,
      blockedUntil:
        result.blockedUntil ||
        null
    }
  );

  return true;
}


/* =========================
   UNIFIED SECURITY CHECK
========================= */

async function runSecurityChecks(
  message,
  env
) {
  if (
    !message?.chat?.id ||
    !message?.from?.id
  ) {
    return {
      blocked: false,
      reason: null
    };
  }

  /*
   * Ignore bot messages.
   */

  if (
    message.from?.is_bot
  ) {
    return {
      blocked: false,
      reason: null
    };
  }

  /*
   * Anti-link first.
   */

  if (
    await handleAntiLink(
      message,
      env
    )
  ) {
    return {
      blocked: true,
      reason: "anti_link"
    };
  }

  /*
   * Anti-spam.
   */

  if (
    await handleAntiSpam(
      message,
      env
    )
  ) {
    return {
      blocked: true,
      reason: "anti_spam"
    };
  }

  /*
   * Anti-flood.
   */

  if (
    await handleAntiFlood(
      message,
      env
    )
  ) {
    return {
      blocked: true,
      reason: "anti_flood"
    };
  }

  return {
    blocked: false,
    reason: null
  };
}


/* =========================
   SECURITY SETTINGS
========================= */

async function setSecuritySetting(
  env,
  chatId,
  key,
  value
) {
  const allowed = [

    "antiLink",
    "antiSpam",
    "antiFlood",

    "floodLimit",
    "floodMuteSeconds",

    "spamScore"

  ];

  if (
    !allowed.includes(
      key
    )
  ) {
    return false;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  settings[key] =
    value;

  await saveSettings(
    env,
    chatId,
    settings
  );

  await logEvent(
    env,
    chatId,
    "security_setting_changed",
    {
      key,
      value
    }
  );

  return true;
}


/* =========================
   SECURITY STATUS TEXT
========================= */

function securityStatusText(
  settings
) {
  return [
    "🛡️ <b>وضعیت امنیتی</b>",
    "",
    `🔗 ضد لینک: ${
      settings.antiLink
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    `🚨 ضد اسپم: ${
      settings.antiSpam
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    `🌊 ضد فلود: ${
      settings.antiFlood
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    "",
    `📨 سقف فلود: <b>${
      Number(
        settings.floodLimit ||
        6
      )
    }</b> پیام`,
    `⏱️ بازه فلود: <b>۱۰</b> ثانیه`,
    `🔇 محدودیت فلود: <b>${
      Number(
        settings.floodMuteSeconds ||
        60
      )
    }</b> ثانیه`
  ].join("\n");
}
/* ============================================================
   PART 10 — WELCOME / GOODBYE / RULES SYSTEM
============================================================ */


/* =========================
   DEFAULT GROUP RULES
========================= */

const DEFAULT_RULES = [
  "1️⃣ احترام به اعضای گروه الزامی است.",
  "2️⃣ ارسال تبلیغات و لینک بدون اجازه ممنوع است.",
  "3️⃣ اسپم و ارسال پیام‌های تکراری ممنوع است.",
  "4️⃣ محتوای نامرتبط و مزاحم ارسال نکنید.",
  "5️⃣ تصمیم نهایی درباره مدیریت گروه با مدیران است."
].join("\n");


/* =========================
   WELCOME TEXT BUILDER
========================= */

function buildWelcomeText(
  member,
  chat
) {
  const name =
    escapeHTML(
      displayName(
        member
      )
    );

  const title =
    escapeHTML(
      chat?.title ||
      "گروه"
    );

  return [
    "👋 <b>خوش اومدی!</b>",
    "",
    `سلام <b>${name}</b> 🌹`,
    "",
    `به <b>${title}</b> خوش اومدی.`,
    "",
    "📜 قبل از فعالیت، قوانین گروه رو مطالعه کن.",
    "🤖 برای مشاهده راهنما می‌تونی /help رو بفرستی."
  ].join("\n");
}


/* =========================
   GOODBYE TEXT BUILDER
========================= */

function buildGoodbyeText(
  member,
  chat
) {
  const name =
    escapeHTML(
      displayName(
        member
      )
    );

  const title =
    escapeHTML(
      chat?.title ||
      "گروه"
    );

  return [
    "🚪 <b>خروج عضو</b>",
    "",
    `${name} از <b>${title}</b> خارج شد.`,
    "",
    "👋 امیدواریم دوباره ببینیمت."
  ].join("\n");
}


/* =========================
   WELCOME KEYBOARD
========================= */

function welcomeKeyboard() {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "📜 قوانین گروه",
          "rules:show"
        ),

        inlineButton(
          "❓ راهنما",
          "panel:help"
        )
      ]

    ]
  };
}


/* =========================
   HANDLE NEW MEMBERS
========================= */

async function processWelcomeMembers(
  message,
  env
) {
  const members =
    message?.new_chat_members;

  if (
    !Array.isArray(
      members
    ) ||
    members.length === 0
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    !settings.welcome
  ) {
    return false;
  }

  for (
    const member of members
  ) {
    if (
      member?.is_bot
    ) {
      continue;
    }

    await sendMessage(
      env,
      chatId,
      buildWelcomeText(
        member,
        message.chat
      ),
      welcomeKeyboard()
    );

    await logEvent(
      env,
      chatId,
      "welcome",
      {
        userId:
          Number(
            member.id
          )
      }
    );
  }

  return true;
}


/* =========================
   HANDLE LEFT MEMBER
========================= */

async function processGoodbyeMember(
  message,
  env
) {
  const member =
    message?.left_chat_member;

  if (!member) {
    return false;
  }

  if (
    member.is_bot
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    !settings.goodbye
  ) {
    return false;
  }

  await sendMessage(
    env,
    chatId,
    buildGoodbyeText(
      member,
      message.chat
    )
  );

  await logEvent(
    env,
    chatId,
    "goodbye",
    {
      userId:
        Number(
          member.id
        )
    }
  );

  return true;
}


/* =========================
   GET RULES
========================= */

async function getGroupRules(
  env,
  chatId
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  return (
    settings.rules ||
    DEFAULT_RULES
  );
}


/* =========================
   SAVE RULES
========================= */

async function saveGroupRules(
  env,
  chatId,
  rules
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  settings.rules =
    String(
      rules || ""
    )
      .trim()
      .slice(
        0,
        4000
      );

  await saveSettings(
    env,
    chatId,
    settings
  );

  await logEvent(
    env,
    chatId,
    "rules_changed"
  );

  return true;
}


/* =========================
   RULES MESSAGE
========================= */

async function sendRules(
  env,
  chatId
) {
  const rules =
    await getGroupRules(
      env,
      chatId
    );

  const text = [
    "📜 <b>قوانین گروه</b>",
    "",
    escapeHTML(
      rules
    )
  ].join("\n");

  await sendMessage(
    env,
    chatId,
    text,
    rulesPanelKeyboard()
  );
}


/* =========================
   RULES CALLBACK
========================= */

async function handleRulesCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data || ""
    );

  if (
    data !==
    "rules:show"
  ) {
    return false;
  }

  const chatId =
    callback.message
      ?.chat?.id;

  if (!chatId) {
    return true;
  }

  await answerCallback(
    env,
    callback.id
  );

  await sendRules(
    env,
    chatId
  );

  return true;
}


/* =========================
   WELCOME TOGGLE
========================= */

async function toggleWelcome(
  env,
  chatId
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  settings.welcome =
    !Boolean(
      settings.welcome
    );

  await saveSettings(
    env,
    chatId,
    settings
  );

  return settings.welcome;
}


/* =========================
   GOODBYE TOGGLE
========================= */

async function toggleGoodbye(
  env,
  chatId
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  settings.goodbye =
    !Boolean(
      settings.goodbye
    );

  await saveSettings(
    env,
    chatId,
    settings
  );

  return settings.goodbye;
}


/* =========================
   RULES COMMAND
========================= */

async function handleRulesCommand(
  message,
  env
) {
  if (
    !message?.chat?.id
  ) {
    return false;
  }

  await sendRules(
    env,
    message.chat.id
  );

  return true;
}


/* =========================
   WELCOME SETTINGS TEXT
========================= */

function welcomeSettingsText(
  settings
) {
  return [
    "👋 <b>تنظیمات خوش‌آمدگویی</b>",
    "",
    `👋 خوش‌آمدگویی: ${
      settings.welcome
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    `🚪 پیام خروج: ${
      settings.goodbye
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`
  ].join("\n");
}


/* =========================
   WELCOME SETTINGS KEYBOARD
========================= */

function welcomeSettingsKeyboard(
  settings
) {
  return {
    inline_keyboard: [

      [
        inlineButton(
          `👋 خوش‌آمدگویی ${
            settings.welcome
              ? "🟢"
              : "🔴"
          }`,
          "toggle:welcome"
        )
      ],

      [
        inlineButton(
          `🚪 پیام خروج ${
            settings.goodbye
              ? "🟢"
              : "🔴"
          }`,
          "toggle:goodbye"
        )
      ],

      [
        inlineButton(
          "📜 قوانین",
          "rules:show"
        )
      ],

      [
        inlineButton(
          "🔙 بازگشت",
          "panel:main"
        )
      ]

    ]
  };
}


/* =========================
   WELCOME CALLBACK
========================= */

async function handleWelcomeCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data || ""
    );

  const chatId =
    callback.message
      ?.chat?.id;

  if (!chatId) {
    return false;
  }

  if (
    data ===
    "toggle:welcome"
  ) {
    const enabled =
      await toggleWelcome(
        env,
        chatId
      );

    const settings =
      await getSettings(
        env,
        chatId
      );

    await answerCallback(
      env,
      callback.id,
      enabled
        ? "👋 خوش‌آمدگویی فعال شد."
        : "👋 خوش‌آمدگویی خاموش شد."
    );

    await editPanel(
      env,
      callback,
      welcomeSettingsText(
        settings
      ),
      welcomeSettingsKeyboard(
        settings
      )
    );

    return true;
  }

  if (
    data ===
    "toggle:goodbye"
  ) {
    const enabled =
      await toggleGoodbye(
        env,
        chatId
      );

    const settings =
      await getSettings(
        env,
        chatId
      );

    await answerCallback(
      env,
      callback.id,
      enabled
        ? "🚪 پیام خروج فعال شد."
        : "🚪 پیام خروج خاموش شد."
    );

    await editPanel(
      env,
      callback,
      welcomeSettingsText(
        settings
      ),
      welcomeSettingsKeyboard(
        settings
      )
    );

    return true;
  }

  return false;
}


/* =========================
   COMMAND ALIASES
========================= */

COMMAND_ALIASES[
  "/rules"
] = [
  "/rules",
  "/قوانین",
  "/قانون"
];


/* =========================
   GROUP EVENT PROCESSOR
========================= */

async function processGroupEvents(
  message,
  env
) {
  if (
    !message
  ) {
    return false;
  }

  let handled =
    false;

  if (
    Array.isArray(
      message.new_chat_members
    ) &&
    message.new_chat_members.length
  ) {
    await handleJoinEvent(
      message,
      env
    );

    await processWelcomeMembers(
      message,
      env
    );

    handled = true;
  }

  if (
    message.left_chat_member
  ) {
    await handleLeaveEvent(
      message,
      env
    );

    await processGoodbyeMember(
      message,
      env
    );

    handled = true;
  }

  return handled;
}
/* ============================================================
   PART 11 — WARNING / RESTRICTION SYSTEM
============================================================ */


/* =========================
   WARNING STORAGE
========================= */

async function getUserWarnings(
  env,
  chatId,
  userId
) {
  const key =
    `warnings:${chatId}:${userId}`;

  const data =
    await kvGet(
      env,
      key,
      {
        count: 0,
        history: []
      }
    );

  return {
    count:
      Number(
        data?.count || 0
      ),

    history:
      Array.isArray(
        data?.history
      )
        ? data.history
        : []
  };
}


/* =========================
   SAVE WARNINGS
========================= */

async function saveUserWarnings(
  env,
  chatId,
  userId,
  data
) {
  await kvPut(
    env,
    `warnings:${chatId}:${userId}`,
    data
  );
}


/* =========================
   ADD WARNING
========================= */

async function addWarning(
  env,
  chatId,
  userId,
  actorId = 0,
  reason = "بدون دلیل"
) {
  if (
    isProtectedUser(
      userId
    )
  ) {
    return {
      ok: false,
      protected: true,
      count: 0,
      limit: 0
    };
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  const data =
    await getUserWarnings(
      env,
      chatId,
      userId
    );

  data.count++;

  data.history.unshift({
    actorId:
      Number(
        actorId || 0
      ),

    reason:
      String(
        reason ||
        "بدون دلیل"
      ).slice(
        0,
        500
      ),

    timestamp:
      Date.now()
  });

  data.history =
    data.history.slice(
      0,
      50
    );

  await saveUserWarnings(
    env,
    chatId,
    userId,
    data
  );

  await incrementStat(
    env,
    chatId,
    "warnings"
  );

  await updateMemberStats(
    env,
    chatId,
    userId,
    "warnings"
  );

  await logWarningEvent(
    env,
    chatId,
    userId,
    data.count
  );

  const limit =
    Number(
      settings.maxWarnings ||
      3
    );

  return {
    ok: true,
    protected: false,
    count:
      data.count,
    limit
  };
}


/* =========================
   REMOVE WARNING
========================= */

async function removeWarning(
  env,
  chatId,
  userId
) {
  const data =
    await getUserWarnings(
      env,
      chatId,
      userId
    );

  if (
    data.count <= 0
  ) {
    return 0;
  }

  data.count--;

  await saveUserWarnings(
    env,
    chatId,
    userId,
    data
  );

  return data.count;
}


/* =========================
   RESET WARNINGS
========================= */

async function resetWarnings(
  env,
  chatId,
  userId
) {
  await saveUserWarnings(
    env,
    chatId,
    userId,
    {
      count: 0,
      history: []
    }
  );

  await logEvent(
    env,
    chatId,
    "warnings_reset",
    {
      userId
    }
  );

  return true;
}


/* =========================
   WARNING TEXT
========================= */

function warningResultText(
  result
) {
  if (
    result?.protected
  ) {
    return (
      "🛡️ این کاربر محافظت شده است و اخطار نمی‌گیرد."
    );
  }

  return [
    "⚠️ <b>اخطار ثبت شد</b>",
    "",
    `📌 تعداد اخطار: <b>${result.count}</b>`,
    `🎯 سقف اخطار: <b>${result.limit}</b>`
  ].join("\n");
}


/* =========================
   WARNING HISTORY TEXT
========================= */

function warningHistoryText(
  user,
  data
) {
  const name =
    escapeHTML(
      displayName(
        user
      )
    );

  const lines = [
    "⚠️ <b>سابقه اخطار</b>",
    "",
    `👤 کاربر: <b>${name}</b>`,
    `🆔 شناسه: <code>${user.id}</code>`,
    `📊 تعداد فعلی: <b>${data.count}</b>`,
    ""
  ];

  if (
    data.history.length ===
    0
  ) {
    lines.push(
      "📭 سابقه‌ای ثبت نشده است."
    );

    return lines.join(
      "\n"
    );
  }

  lines.push(
    "📋 آخرین اخطارها:"
  );

  for (
    const item of
      data.history.slice(
        0,
        10
      )
  ) {
    lines.push(
      `• ${escapeHTML(
        item.reason
      )} — ${formatEventDate(
        item.timestamp
      )}`
    );
  }

  return lines.join(
    "\n"
  );
}


/* =========================
   RESTRICT USER
========================= */

async function restrictUser(
  env,
  chatId,
  userId,
  untilDate = 0
) {
  if (
    isProtectedUser(
      userId
    )
  ) {
    return false;
  }

  await telegram(
    env,
    "restrictChatMember",
    {
      chat_id:
        chatId,

      user_id:
        userId,

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
        can_invite_users: true,
        can_pin_messages: false,
        can_manage_topics: false
      },

      until_date:
        Number(
          untilDate || 0
        )
    }
  );

  await incrementStat(
    env,
    chatId,
    "mutes"
  );

  await logMuteEvent(
    env,
    chatId,
    userId
  );

  return true;
}


/* =========================
   UNRESTRICT USER
========================= */

async function unrestrictUser(
  env,
  chatId,
  userId
) {
  await telegram(
    env,
    "restrictChatMember",
    {
      chat_id:
        chatId,

      user_id:
        userId,

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

  await logEvent(
    env,
    chatId,
    "unmute",
    {
      userId
    }
  );

  return true;
}


/* =========================
   TEMPORARY MUTE
========================= */

async function muteUser(
  env,
  chatId,
  userId,
  seconds
) {
  const duration =
    Math.max(
      10,
      Math.min(
        Number(
          seconds || 60
        ),
        30 * 24 * 60 * 60
      )
    );

  const untilDate =
    Math.floor(
      Date.now() /
      1000
    ) +
    duration;

  return await restrictUser(
    env,
    chatId,
    userId,
    untilDate
  );
}


/* =========================
   WARNING ACTION
========================= */

async function executeWarning(
  env,
  message,
  reason = "بدون دلیل"
) {
  const chatId =
    message?.chat?.id;

  const target =
    getTargetUser(
      message
    );

  const actorId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !target
  ) {
    return {
      ok: false,
      reason:
        "target_missing"
    };
  }

  const targetId =
    Number(
      target.id
    );

  if (
    isProtectedUser(
      targetId
    )
  ) {
    return {
      ok: false,
      protected: true
    };
  }

  if (
    actorId &&
    !await isAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    return {
      ok: false,
      reason:
        "not_admin"
    };
  }

  const result =
    await addWarning(
      env,
      chatId,
      targetId,
      actorId,
      reason
    );

  if (
    !result.ok
  ) {
    return result;
  }

  /*
   * Automatic action after
   * reaching the warning limit.
   */

  if (
    result.count >=
    result.limit
  ) {
    const settings =
      await getSettings(
        env,
        chatId
      );

    const action =
      settings.warningAction ||
      "mute";

    if (
      action ===
      "mute"
    ) {
      await muteUser(
        env,
        chatId,
        targetId,
        Number(
          settings.warningMuteSeconds ||
          3600
        )
      );
    }

    else if (
      action ===
      "ban"
    ) {
      await banUser(
        env,
        chatId,
        targetId
      );

      await incrementStat(
        env,
        chatId,
        "bans"
      );
    }

    await resetWarnings(
      env,
      chatId,
      targetId
    );
  }

  return result;
}


/* =========================
   WARNING COMMAND
========================= */

async function handleWarningCommand(
  message,
  env,
  command,
  reason = "بدون دلیل"
) {
  if (
    command !==
    "/warn"
  ) {
    return false;
  }

  const result =
    await executeWarning(
      env,
      message,
      reason
    );

  if (
    result.reason ===
    "not_admin"
  ) {
    await sendMessage(
      env,
      message.chat.id,
      "⛔ فقط مدیران می‌توانند اخطار بدهند."
    );

    return true;
  }

  if (
    result.reason ===
    "target_missing"
  ) {
    await sendMessage(
      env,
      message.chat.id,
      "⚠️ دستور اخطار باید با ریپلای روی پیام کاربر استفاده شود."
    );

    return true;
  }

  if (
    result.protected
  ) {
    await sendMessage(
      env,
      message.chat.id,
      "🛡️ این کاربر محافظت شده است."
    );

    return true;
  }

  await sendMessage(
    env,
    message.chat.id,
    warningResultText(
      result
    )
  );

  return true;
}


/* =========================
   WARNING HISTORY COMMAND
========================= */

async function handleWarningHistory(
  message,
  env
) {
  const target =
    getTargetUser(
      message
    );

  if (!target) {
    await sendMessage(
      env,
      message.chat.id,
      "⚠️ برای مشاهده سابقه، روی پیام کاربر ریپلای کن."
    );

    return true;
  }

  const data =
    await getUserWarnings(
      env,
      message.chat.id,
      Number(
        target.id
      )
    );

  await sendMessage(
    env,
    message.chat.id,
    warningHistoryText(
      target,
      data
    )
  );

  return true;
}


/* =========================
   WARNING KEYBOARD
========================= */

function warningUserKeyboard(
  userId
) {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "⚠️ اخطار",
          `userwarn:${userId}`
        )
      ],

      [
        inlineButton(
          "🔇 سکوت",
          `usermute:${userId}`
        ),

        inlineButton(
          "🔊 رفع سکوت",
          `userunmute:${userId}`
        )
      ],

      [
        inlineButton(
          "🗑️ حذف اخطارها",
          `userresetwarn:${userId}`
        )
      ]

    ]
  };
}


/* =========================
   WARNING CALLBACK
========================= */

async function handleWarningCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data || ""
    );

  const match =
    data.match(
      /^user(warn|mute|unmute|resetwarn):(-?\d+)$/
    );

  if (!match) {
    return false;
  }

  const action =
    match[1];

  const userId =
    Number(
      match[2]
    );

  const chatId =
    callback.message
      ?.chat?.id;

  const actorId =
    Number(
      callback.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return true;
  }

  if (
    !await isAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    await answerCallback(
      env,
      callback.id,
      "⛔ دسترسی ندارید."
    );

    return true;
  }

  if (
    isProtectedUser(
      userId
    )
  ) {
    await answerCallback(
      env,
      callback.id,
      "🛡️ این کاربر محافظت شده است."
    );

    return true;
  }

  try {

    if (
      action ===
      "warn"
    ) {
      const result =
        await addWarning(
          env,
          chatId,
          userId,
          actorId
        );

      await answerCallback(
        env,
        callback.id,
        `⚠️ اخطار ${result.count}/${result.limit}`
      );

      return true;
    }

    if (
      action ===
      "mute"
    ) {
      await muteUser(
        env,
        chatId,
        userId,
        3600
      );

      await answerCallback(
        env,
        callback.id,
        "🔇 کاربر یک ساعت محدود شد."
      );

      return true;
    }

    if (
      action ===
      "unmute"
    ) {
      await unrestrictUser(
        env,
        chatId,
        userId
      );

      await answerCallback(
        env,
        callback.id,
        "🔊 محدودیت کاربر برداشته شد."
      );

      return true;
    }

    if (
      action ===
      "resetwarn"
    ) {
      await resetWarnings(
        env,
        chatId,
        userId
      );

      await answerCallback(
        env,
        callback.id,
        "🗑️ اخطارهای کاربر پاک شد."
      );

      return true;
    }

  } catch (
    error
  ) {
    console.error(
      "Warning callback:",
      error.message
    );

    await answerCallback(
      env,
      callback.id,
      "❌ عملیات انجام نشد."
    );

    return true;
  }

  return false;
}


/* =========================
   COMMAND ALIASES
========================= */

COMMAND_ALIASES[
  "/warnings"
] = [
  "/warnings",
  "/اخطارها",
  "/هشدارها"
];

COMMAND_ALIASES[
  "/warnhistory"
] = [
  "/warnhistory",
  "/سابقه_اخطار",
  "/سابقه_هشدار"
];


/* =========================
   WARNING SETTINGS
========================= */

async function configureWarnings(
  env,
  chatId,
  options = {}
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    typeof options.enabled ===
    "boolean"
  ) {
    settings.warnings =
      options.enabled;
  }

  if (
    Number.isFinite(
      Number(
        options.maxWarnings
      )
    )
  ) {
    settings.maxWarnings =
      Math.max(
        1,
        Math.min(
          20,
          Number(
            options.maxWarnings
          )
        )
      );
  }

  if (
    options.action ===
    "mute" ||
    options.action ===
    "ban"
  ) {
    settings.warningAction =
      options.action;
  }

  if (
    Number.isFinite(
      Number(
        options.muteSeconds
      )
    )
  ) {
    settings.warningMuteSeconds =
      Math.max(
        10,
        Math.min(
          30 * 24 * 60 * 60,
          Number(
            options.muteSeconds
          )
        )
      );
  }

  await saveSettings(
    env,
    chatId,
    settings
  );

  return settings;
}
/* ============================================================
   PART 12 — ADMIN CONTROL PANEL
============================================================ */


/* =========================
   MAIN ADMIN PANEL
========================= */

function adminPanelKeyboard() {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "🛡️ امنیت",
          "admin:security"
        ),

        inlineButton(
          "👋 خوش‌آمدگویی",
          "admin:welcome"
        )
      ],

      [
        inlineButton(
          "⚠️ اخطارها",
          "admin:warnings"
        ),

        inlineButton(
          "👥 کاربران",
          "admin:users"
        )
      ],

      [
        inlineButton(
          "📜 قوانین",
          "admin:rules"
        ),

        inlineButton(
          "📊 آمار",
          "admin:stats"
        )
      ],

      [
        inlineButton(
          "⚙️ تنظیمات",
          "admin:settings"
        )
      ]

    ]
  };
}


/* =========================
   ADMIN PANEL TEXT
========================= */

function adminPanelText() {
  return [
    "👑 <b>پنل مدیریت ربات</b>",
    "",
    "از منوی زیر بخش موردنظر را انتخاب کنید.",
    "",
    "🛡️ امنیت گروه",
    "👋 خوش‌آمدگویی و خروج",
    "⚠️ مدیریت اخطارها",
    "👥 مدیریت کاربران",
    "📜 قوانین",
    "📊 آمار گروه",
    "⚙️ تنظیمات"
  ].join("\n");
}


/* =========================
   SECURITY PANEL
========================= */

async function showSecurityPanel(
  env,
  chatId
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  await sendMessage(
    env,
    chatId,
    securityStatusText(
      settings
    ),
    securityPanelKeyboard(
      settings
    )
  );
}


/* =========================
   SECURITY KEYBOARD
========================= */

function securityPanelKeyboard(
  settings
) {
  return {
    inline_keyboard: [

      [
        inlineButton(
          `🔗 ضد لینک ${
            settings.antiLink
              ? "🟢"
              : "🔴"
          }`,
          "security:link"
        )
      ],

      [
        inlineButton(
          `🚨 ضد اسپم ${
            settings.antiSpam
              ? "🟢"
              : "🔴"
          }`,
          "security:spam"
        ),

        inlineButton(
          `🌊 ضد فلود ${
            settings.antiFlood
              ? "🟢"
              : "🔴"
          }`,
          "security:flood"
        )
      ],

      [
        inlineButton(
          "🔙 پنل اصلی",
          "admin:main"
        )
      ]

    ]
  };
}


/* =========================
   TOGGLE SECURITY
========================= */

async function toggleSecuritySetting(
  env,
  chatId,
  key
) {
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

  await logEvent(
    env,
    chatId,
    "security_toggle",
    {
      key,
      value:
        settings[key]
    }
  );

  return settings;
}


/* =========================
   WELCOME PANEL
========================= */

async function showWelcomePanel(
  env,
  chatId
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  await sendMessage(
    env,
    chatId,
    welcomeSettingsText(
      settings
    ),
    welcomeSettingsKeyboard(
      settings
    )
  );
}


/* =========================
   WARNING PANEL
========================= */

async function showWarningPanel(
  env,
  chatId
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  const text = [
    "⚠️ <b>تنظیمات اخطار</b>",
    "",
    `📊 سقف اخطار: <b>${
      Number(
        settings.maxWarnings ||
        3
      )
    }</b>`,
    "",
    `🎯 اقدام خودکار: <b>${
      settings.warningAction ===
      "ban"
        ? "مسدود کردن"
        : "سکوت"
    }</b>`,
    "",
    `⏱️ مدت سکوت: <b>${
      Number(
        settings.warningMuteSeconds ||
        3600
      )
    }</b> ثانیه`
  ].join("\n");

  await sendMessage(
    env,
    chatId,
    text,
    warningSettingsKeyboard(
      settings
    )
  );
}


/* =========================
   WARNING SETTINGS KEYBOARD
========================= */

function warningSettingsKeyboard(
  settings
) {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "➕ سقف ۳ اخطار",
          "warning:max:3"
        ),

        inlineButton(
          "➕ سقف ۵ اخطار",
          "warning:max:5"
        )
      ],

      [
        inlineButton(
          "🔇 اقدام: سکوت",
          "warning:action:mute"
        ),

        inlineButton(
          "🚫 اقدام: مسدود",
          "warning:action:ban"
        )
      ],

      [
        inlineButton(
          "🔙 پنل اصلی",
          "admin:main"
        )
      ]

    ]
  };
}


/* =========================
   RULES PANEL
========================= */

async function showRulesAdminPanel(
  env,
  chatId
) {
  const rules =
    await getGroupRules(
      env,
      chatId
    );

  await sendMessage(
    env,
    chatId,
    [
      "📜 <b>مدیریت قوانین</b>",
      "",
      escapeHTML(
        rules
      )
    ].join("\n"),
    rulesAdminKeyboard()
  );
}


/* =========================
   RULES ADMIN KEYBOARD
========================= */

function rulesAdminKeyboard() {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "📜 مشاهده قوانین",
          "rules:show"
        )
      ],

      [
        inlineButton(
          "🔙 پنل اصلی",
          "admin:main"
        )
      ]

    ]
  };
}


/* =========================
   USER MANAGEMENT PANEL
========================= */

function userManagementText() {
  return [
    "👥 <b>مدیریت کاربران</b>",
    "",
    "برای مدیریت یک کاربر،",
    "از دستورات مدیریتی یا ریپلای روی پیام او استفاده کنید.",
    "",
    "⚠️ اخطار",
    "🔇 سکوت",
    "🔊 رفع سکوت",
    "🚫 مسدودسازی",
    "♻️ رفع مسدودیت"
  ].join("\n");
}


function userManagementKeyboard() {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "⚠️ راهنمای اخطار",
          "help:warn"
        )
      ],

      [
        inlineButton(
          "🔇 راهنمای سکوت",
          "help:mute"
        ),

        inlineButton(
          "🚫 راهنمای مسدودسازی",
          "help:ban"
        )
      ],

      [
        inlineButton(
          "🔙 پنل اصلی",
          "admin:main"
        )
      ]

    ]
  };
}


/* =========================
   STATISTICS PANEL
========================= */

async function showStatsPanel(
  env,
  chatId
) {
  const stats =
    await getChatStats(
      env,
      chatId
    );

  const text = [
    "📊 <b>آمار گروه</b>",
    "",
    `👥 اعضای ثبت‌شده: <b>${
      Number(
        stats.users || 0
      )
    }</b>`,
    `⚠️ اخطارها: <b>${
      Number(
        stats.warnings || 0
      )
    }</b>`,
    `🔇 محدودیت‌ها: <b>${
      Number(
        stats.mutes || 0
      )
    }</b>`,
    `🚫 مسدودسازی‌ها: <b>${
      Number(
        stats.bans || 0
      )
    }</b>`,
    `🗑️ پیام‌های حذف‌شده: <b>${
      Number(
        stats.deleted || 0
      )
    }</b>`,
    "",
    `🕒 آخرین بروزرسانی: <b>${
      formatEventDate(
        Date.now()
      )
    }</b>`
  ].join("\n");

  await sendMessage(
    env,
    chatId,
    text,
    statsKeyboard()
  );
}


/* =========================
   STATS KEYBOARD
========================= */

function statsKeyboard() {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "🔄 بروزرسانی",
          "admin:stats"
        )
      ],

      [
        inlineButton(
          "🔙 پنل اصلی",
          "admin:main"
        )
      ]

    ]
  };
}


/* =========================
   SETTINGS PANEL
========================= */

async function showSettingsPanel(
  env,
  chatId
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  const text = [
    "⚙️ <b>تنظیمات ربات</b>",
    "",
    `👋 خوش‌آمدگویی: ${
      settings.welcome
        ? "🟢"
        : "🔴"
    }`,
    `🚪 پیام خروج: ${
      settings.goodbye
        ? "🟢"
        : "🔴"
    }`,
    `🔗 ضد لینک: ${
      settings.antiLink
        ? "🟢"
        : "🔴"
    }`,
    `🚨 ضد اسپم: ${
      settings.antiSpam
        ? "🟢"
        : "🔴"
    }`,
    `🌊 ضد فلود: ${
      settings.antiFlood
        ? "🟢"
        : "🔴"
    }`
  ].join("\n");

  await sendMessage(
    env,
    chatId,
    text,
    settingsKeyboard()
  );
}


/* =========================
   SETTINGS KEYBOARD
========================= */

function settingsKeyboard() {
  return {
    inline_keyboard: [

      [
        inlineButton(
          "🛡️ امنیت",
          "admin:security"
        )
      ],

      [
        inlineButton(
          "👋 خوش‌آمدگویی",
          "admin:welcome"
        )
      ],

      [
        inlineButton(
          "⚠️ اخطارها",
          "admin:warnings"
        )
      ],

      [
        inlineButton(
          "🔙 پنل اصلی",
          "admin:main"
        )
      ]

    ]
  };
}


/* =========================
   ADMIN CALLBACK ROUTER
========================= */

async function handleAdminPanelCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data || ""
    );

  const chatId =
    callback.message
      ?.chat?.id;

  const userId =
    Number(
      callback.from?.id ||
      0
    );

  if (
    !chatId
  ) {
    return false;
  }

  /*
   * Admin permission check.
   */

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await answerCallback(
      env,
      callback.id,
      "⛔ فقط مدیران دسترسی دارند."
    );

    return true;
  }


  /* MAIN */

  if (
    data ===
    "admin:main"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await sendMessage(
      env,
      chatId,
      adminPanelText(),
      adminPanelKeyboard()
    );

    return true;
  }


  /* SECURITY */

  if (
    data ===
    "admin:security"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await showSecurityPanel(
      env,
      chatId
    );

    return true;
  }


  /* WELCOME */

  if (
    data ===
    "admin:welcome"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await showWelcomePanel(
      env,
      chatId
    );

    return true;
  }


  /* WARNINGS */

  if (
    data ===
    "admin:warnings"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await showWarningPanel(
      env,
      chatId
    );

    return true;
  }


  /* USERS */

  if (
    data ===
    "admin:users"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await sendMessage(
      env,
      chatId,
      userManagementText(),
      userManagementKeyboard()
    );

    return true;
  }


  /* RULES */

  if (
    data ===
    "admin:rules"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await showRulesAdminPanel(
      env,
      chatId
    );

    return true;
  }


  /* STATS */

  if (
    data ===
    "admin:stats"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await showStatsPanel(
      env,
      chatId
    );

    return true;
  }


  /* SETTINGS */

  if (
    data ===
    "admin:settings"
  ) {
    await answerCallback(
      env,
      callback.id
    );

    await showSettingsPanel(
      env,
      chatId
    );

    return true;
  }


  /* SECURITY TOGGLES */

  if (
    data ===
    "security:link"
  ) {
    const settings =
      await toggleSecuritySetting(
        env,
        chatId,
        "antiLink"
      );

    await answerCallback(
      env,
      callback.id,
      settings.antiLink
        ? "🔗 ضد لینک فعال شد."
        : "🔗 ضد لینک خاموش شد."
    );

    await showSecurityPanel(
      env,
      chatId
    );

    return true;
  }


  if (
    data ===
    "security:spam"
  ) {
    const settings =
      await toggleSecuritySetting(
        env,
        chatId,
        "antiSpam"
      );

    await answerCallback(
      env,
      callback.id,
      settings.antiSpam
        ? "🚨 ضد اسپم فعال شد."
        : "🚨 ضد اسپم خاموش شد."
    );

    await showSecurityPanel(
      env,
      chatId
    );

    return true;
  }


  if (
    data ===
    "security:flood"
  ) {
    const settings =
      await toggleSecuritySetting(
        env,
        chatId,
        "antiFlood"
      );

    await answerCallback(
      env,
      callback.id,
      settings.antiFlood
        ? "🌊 ضد فلود فعال شد."
        : "🌊 ضد فلود خاموش شد."
    );

    await showSecurityPanel(
      env,
      chatId
    );

    return true;
  }


  /* WARNING MAX */

  const maxMatch =
    data.match(
      /^warning:max:(\d+)$/
    );

  if (
    maxMatch
  ) {
    const maxWarnings =
      Number(
        maxMatch[1]
      );

    await configureWarnings(
      env,
      chatId,
      {
        maxWarnings
      }
    );

    await answerCallback(
      env,
      callback.id,
      `⚠️ سقف اخطار روی ${maxWarnings} تنظیم شد.`
    );

    await showWarningPanel(
      env,
      chatId
    );

    return true;
  }


  /* WARNING ACTION */

  const actionMatch =
    data.match(
      /^warning:action:(mute|ban)$/
    );

  if (
    actionMatch
  ) {
    await configureWarnings(
      env,
      chatId,
      {
        action:
          actionMatch[1]
      }
    );

    await answerCallback(
      env,
      callback.id,
      actionMatch[1] ===
        "ban"
        ? "🚫 اقدام خودکار: مسدودسازی"
        : "🔇 اقدام خودکار: سکوت"
    );

    await showWarningPanel(
      env,
      chatId
    );

    return true;
  }

  return false;
}


/* =========================
   ADMIN COMMAND
========================= */

async function handleAdminCommand(
  message,
  env
) {
  const text =
    String(
      message?.text ||
      ""
    )
      .trim()
      .toLowerCase();

  const commands = [

    "/admin",
    "/panel",
    "/مدیریت",
    "/پنل",
    "/پنل_مدیریت"

  ];

  if (
    !commands.includes(
      text
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند پنل مدیریت را باز کنند."
    );

    return true;
  }

  await sendMessage(
    env,
    chatId,
    adminPanelText(),
    adminPanelKeyboard()
  );

  return true;
}
/* ============================================================
   PART 13 — PERSIAN / ENGLISH COMMAND ROUTER
============================================================ */


/* =========================
   COMMAND NORMALIZER
========================= */

function normalizeCommandText(text) {
  return String(text || "")
    .trim()
    .replace(/\u200c/g, "_")
    .replace(/\s+/g, " ")
    .toLowerCase();
}


/* =========================
   COMMAND ALIAS REGISTRY
========================= */

const BOT_COMMANDS = {

  help: [
    "/help",
    "/راهنما",
    "/کمک"
  ],

  id: [
    "/id",
    "/شناسه",
    "/آیدی"
  ],

  admin: [
    "/admin",
    "/panel",
    "/مدیریت",
    "/پنل"
  ],

  rules: [
    "/rules",
    "/قوانین",
    "/قانون"
  ],

  warnings: [
    "/warnings",
    "/اخطارها",
    "/هشدارها"
  ],

  warningHistory: [
    "/warnhistory",
    "/سابقه_اخطار",
    "/سابقه_هشدار"
  ],

  warn: [
    "/warn",
    "/اخطار",
    "/هشدار"
  ],

  mute: [
    "/mute",
    "/سکوت",
    "/محدود"
  ],

  unmute: [
    "/unmute",
    "/رفع_سکوت",
    "/رفع_محدودیت"
  ],

  ban: [
    "/ban",
    "/بن",
    "/مسدود"
  ],

  unban: [
    "/unban",
    "/رفع_بن",
    "/رفع_مسدودیت"
  ],

  stats: [
    "/stats",
    "/statistics",
    "/آمار"
  ],

  settings: [
    "/settings",
    "/config",
    "/تنظیمات"
  ]

};


/* =========================
   BUILD COMMAND MAP
========================= */

function buildCommandMap() {

  const map =
    new Map();

  for (
    const [
      command,
      aliases
    ]
    of Object.entries(
      BOT_COMMANDS
    )
  ) {

    for (
      const alias
      of aliases
    ) {

      map.set(
        normalizeCommandText(
          alias
        ),
        command
      );

    }

  }

  return map;
}


const COMMAND_MAP =
  buildCommandMap();


/* =========================
   PARSE COMMAND
========================= */

function parseBotCommand(
  text
) {

  const normalized =
    normalizeCommandText(
      text
    );

  if (
    !normalized.startsWith(
      "/"
    )
  ) {
    return null;
  }

  const parts =
    normalized.split(
      /\s+/
    );

  const commandToken =
    parts.shift();

  /*
   * Telegram may send:
   *
   * /help@BotUsername
   */

  const commandWithoutBot =
    commandToken.split(
      "@"
    )[0];

  const command =
    COMMAND_MAP.get(
      commandWithoutBot
    );

  if (!command) {
    return null;
  }

  return {
    command,
    token:
      commandWithoutBot,
    args:
      parts
  };
}


/* =========================
   COMMAND ARGUMENT TEXT
========================= */

function commandArgumentsText(
  parsed
) {
  if (
    !parsed ||
    !Array.isArray(
      parsed.args
    )
  ) {
    return "";
  }

  return parsed.args
    .join(" ")
    .trim();
}


/* =========================
   PERMISSION HELPER
========================= */

async function requireAdmin(
  message,
  env
) {

  const chatId =
    message?.chat?.id;

  const userId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  if (
    isProtectedUser(
      userId
    )
  ) {
    return true;
  }

  try {

    return await isAdmin(
      env,
      chatId,
      userId
    );

  } catch (
    error
  ) {

    console.error(
      "Admin permission check:",
      error.message
    );

    return false;
  }
}


/* =========================
   MUTE COMMAND
========================= */

async function handleMuteCommand(
  message,
  env,
  parsed
) {

  if (
    parsed.command !==
    "mute"
  ) {
    return false;
  }

  if (
    !(await requireAdmin(
      message,
      env
    ))
  ) {

    await sendMessage(
      env,
      message.chat.id,
      "⛔ فقط مدیران می‌توانند کاربر را محدود کنند."
    );

    return true;
  }

  const target =
    getTargetUser(
      message
    );

  if (!target) {

    await sendMessage(
      env,
      message.chat.id,
      "⚠️ این دستور باید با ریپلای روی پیام کاربر استفاده شود."
    );

    return true;
  }

  const args =
    parsed.args || [];

  let seconds =
    Number(
      args[0] || 3600
    );

  if (
    !Number.isFinite(
      seconds
    )
  ) {
    seconds = 3600;
  }

  seconds =
    Math.max(
      10,
      Math.min(
        seconds,
        30 * 24 * 60 * 60
      )
    );

  await muteUser(
    env,
    message.chat.id,
    Number(
      target.id
    ),
    seconds
  );

  await sendMessage(
    env,
    message.chat.id,
    [
      "🔇 <b>کاربر محدود شد.</b>",
      "",
      `👤 ${escapeHTML(
        displayName(
          target
        )
      )}`,
      `⏱️ مدت: <b>${seconds}</b> ثانیه`
    ].join("\n")
  );

  return true;
}


/* =========================
   UNMUTE COMMAND
========================= */

async function handleUnmuteCommand(
  message,
  env,
  parsed
) {

  if (
    parsed.command !==
    "unmute"
  ) {
    return false;
  }

  if (
    !(await requireAdmin(
      message,
      env
    ))
  ) {

    await sendMessage(
      env,
      message.chat.id,
      "⛔ فقط مدیران می‌توانند محدودیت را بردارند."
    );

    return true;
  }

  const target =
    getTargetUser(
      message
    );

  if (!target) {

    await sendMessage(
      env,
      message.chat.id,
      "⚠️ روی پیام کاربر ریپلای کن."
    );

    return true;
  }

  await unrestrictUser(
    env,
    message.chat.id,
    Number(
      target.id
    )
  );

  await sendMessage(
    env,
    message.chat.id,
    "🔊 محدودیت کاربر برداشته شد."
  );

  return true;
}


/* =========================
   BAN COMMAND
========================= */

async function handleBanCommand(
  message,
  env,
  parsed
) {

  if (
    parsed.command !==
    "ban"
  ) {
    return false;
  }

  if (
    !(await requireAdmin(
      message,
      env
    ))
  ) {

    await sendMessage(
      env,
      message.chat.id,
      "⛔ فقط مدیران می‌توانند کاربر را مسدود کنند."
    );

    return true;
  }

  const target =
    getTargetUser(
      message
    );

  if (!target) {

    await sendMessage(
      env,
      message.chat.id,
      "⚠️ برای مسدودسازی باید روی پیام کاربر ریپلای کنی."
    );

    return true;
  }

  const targetId =
    Number(
      target.id
    );

  if (
    isProtectedUser(
      targetId
    )
  ) {

    await sendMessage(
      env,
      message.chat.id,
      "🛡️ این کاربر محافظت شده است."
    );

    return true;
  }

  await banUser(
    env,
    message.chat.id,
    targetId
  );

  await incrementStat(
    env,
    message.chat.id,
    "bans"
  );

  await logEvent(
    env,
    message.chat.id,
    "manual_ban",
    {
      userId:
        targetId,
      actorId:
        Number(
          message.from?.id ||
          0
        )
    }
  );

  await sendMessage(
    env,
    message.chat.id,
    "🚫 کاربر با موفقیت مسدود شد."
  );

  return true;
}


/* =========================
   UNBAN COMMAND
========================= */

async function handleUnbanCommand(
  message,
  env,
  parsed
) {

  if (
    parsed.command !==
    "unban"
  ) {
    return false;
  }

  if (
    !(await requireAdmin(
      message,
      env
    ))
  ) {

    await sendMessage(
      env,
      message.chat.id,
      "⛔ فقط مدیران می‌توانند مسدودیت را بردارند."
    );

    return true;
  }

  const target =
    getTargetUser(
      message
    );

  const args =
    parsed.args || [];

  const targetId =
    target
      ? Number(
          target.id
        )
      : Number(
          args[0] || 0
        );

  if (
    !targetId
  ) {

    await sendMessage(
      env,
      message.chat.id,
      "⚠️ کاربر را با ریپلای یا شناسه عددی مشخص کن."
    );

    return true;
  }

  await unbanUser(
    env,
    message.chat.id,
    targetId
  );

  await sendMessage(
    env,
    message.chat.id,
    "♻️ مسدودیت کاربر برداشته شد."
  );

  return true;
}


/* =========================
   STATS COMMAND
========================= */

async function handleStatsCommand(
  message,
  env,
  parsed
) {

  if (
    parsed.command !==
    "stats"
  ) {
    return false;
  }

  if (
    message.chat.type ===
    "private"
  ) {
    await sendMessage(
      env,
      message.chat.id,
      "📊 آمار اصلی در گروه قابل مشاهده است."
    );

    return true;
  }

  if (
    !(await requireAdmin(
      message,
      env
    ))
  ) {

    await sendMessage(
      env,
      message.chat.id,
      "⛔ فقط مدیران به آمار مدیریتی دسترسی دارند."
    );

    return true;
  }

  await showStatsPanel(
    env,
    message.chat.id
  );

  return true;
}


/* =========================
   SETTINGS COMMAND
========================= */

async function handleSettingsCommand(
  message,
  env,
  parsed
) {

  if (
    parsed.command !==
    "settings"
  ) {
    return false;
  }

  if (
    !(await requireAdmin(
      message,
      env
    ))
  ) {

    await sendMessage(
      env,
      message.chat.id,
      "⛔ فقط مدیران می‌توانند تنظیمات را تغییر دهند."
    );

    return true;
  }

  await showSettingsPanel(
    env,
    message.chat.id
  );

  return true;
}


/* =========================
   COMMAND ROUTER
========================= */

async function routeBotCommand(
  message,
  env
) {

  const parsed =
    parseBotCommand(
      message?.text
    );

  if (!parsed) {
    return false;
  }


  /* ADMIN */

  if (
    parsed.command ===
    "admin"
  ) {
    return await handleAdminCommand(
      message,
      env
    );
  }


  /* HELP */

  if (
    parsed.command ===
    "help"
  ) {

    if (
      typeof sendOwnerHelp ===
      "function" &&
      isOwner(
        Number(
          message.from?.id ||
          0
        )
      )
    ) {

      await sendOwnerHelp(
        env,
        message.chat.id
      );

    } else {

      await sendMessage(
        env,
        message.chat.id,
        [
          "🤖 <b>راهنمای ربات</b>",
          "",
          "📜 /قوانین — قوانین گروه",
          "⚠️ /اخطار — اخطار به کاربر",
          "🔇 /سکوت — محدود کردن کاربر",
          "🔊 /رفع_سکوت — رفع محدودیت",
          "🚫 /بن — مسدود کردن",
          "♻️ /رفع_بن — رفع مسدودیت",
          "📊 /آمار — آمار گروه",
          "⚙️ /تنظیمات — تنظیمات مدیریت"
        ].join("\n")
      );

    }

    return true;
  }


  /* ID */

  if (
    parsed.command ===
    "id"
  ) {

    const userId =
      Number(
        message.from?.id ||
        0
      );

    await sendMessage(
      env,
      message.chat.id,
      `🆔 شناسه شما:\n<code>${userId}</code>`
    );

    return true;
  }


  /* RULES */

  if (
    parsed.command ===
    "rules"
  ) {
    return await handleRulesCommand(
      message,
      env
    );
  }


  /* WARN */

  if (
    parsed.command ===
    "warn"
  ) {

    return await handleWarningCommand(
      message,
      env,
      "/warn",
      commandArgumentsText(
        parsed
      ) ||
      "بدون دلیل"
    );
  }


  /* WARNING HISTORY */

  if (
    parsed.command ===
    "warningHistory"
  ) {

    return await handleWarningHistory(
      message,
      env
    );
  }


  /* WARNING LIST */

  if (
    parsed.command ===
    "warnings"
  ) {

    await showWarningPanel(
      env,
      message.chat.id
    );

    return true;
  }


  /* MUTE */

  if (
    await handleMuteCommand(
      message,
      env,
      parsed
    )
  ) {
    return true;
  }


  /* UNMUTE */

  if (
    await handleUnmuteCommand(
      message,
      env,
      parsed
    )
  ) {
    return true;
  }


  /* BAN */

  if (
    await handleBanCommand(
      message,
      env,
      parsed
    )
  ) {
    return true;
  }


  /* UNBAN */

  if (
    await handleUnbanCommand(
      message,
      env,
      parsed
    )
  ) {
    return true;
  }


  /* STATS */

  if (
    await handleStatsCommand(
      message,
      env,
      parsed
    )
  ) {
    return true;
  }


  /* SETTINGS */

  if (
    await handleSettingsCommand(
      message,
      env,
      parsed
    )
  ) {
    return true;
  }

  return false;
}


/* =========================
   TEXT COMMAND FALLBACK
========================= */

async function handleNaturalCommandText(
  message,
  env
) {

  const text =
    normalizeCommandText(
      message?.text
    );

  if (!text) {
    return false;
  }

  /*
   * Persian natural-language
   * command shortcuts.
   */

  const shortcuts = {

    "راهنما":
      "/راهنما",

    "کمک":
      "/کمک",

    "قوانین":
      "/قوانین",

    "آمار":
      "/آمار",

    "مدیریت":
      "/مدیریت",

    "پنل مدیریت":
      "/مدیریت",

    "تنظیمات":
      "/تنظیمات"

  };

  const mapped =
    shortcuts[text];

  if (!mapped) {
    return false;
  }

  return await routeBotCommand(
    {
      ...message,
      text:
        mapped
    },
    env
  );
}
/* ============================================================
   PART 14 — GROUP MANAGEMENT & MODERATION
============================================================ */


/* =========================
   DELETE MESSAGE
========================= */

async function deleteMessage(
  env,
  chatId,
  messageId
) {
  if (!chatId || !messageId) {
    return false;
  }

  try {
    await telegram(
      env,
      "deleteMessage",
      {
        chat_id: chatId,
        message_id: messageId
      }
    );

    await incrementStat(
      env,
      chatId,
      "deleted"
    );

    return true;

  } catch (error) {
    console.error(
      "Delete message:",
      error.message
    );

    return false;
  }
}


/* =========================
   BAN USER
========================= */

async function banUser(
  env,
  chatId,
  userId
) {
  if (
    !chatId ||
    !userId ||
    isProtectedUser(userId)
  ) {
    return false;
  }

  try {
    await telegram(
      env,
      "banChatMember",
      {
        chat_id: chatId,
        user_id: userId,
        revoke_messages: true
      }
    );

    await logEvent(
      env,
      chatId,
      "ban",
      {
        userId
      }
    );

    return true;

  } catch (error) {
    console.error(
      "Ban user:",
      error.message
    );

    return false;
  }
}


/* =========================
   UNBAN USER
========================= */

async function unbanUser(
  env,
  chatId,
  userId
) {
  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  try {
    await telegram(
      env,
      "unbanChatMember",
      {
        chat_id: chatId,
        user_id: userId,
        only_if_banned: false
      }
    );

    await logEvent(
      env,
      chatId,
      "unban",
      {
        userId
      }
    );

    return true;

  } catch (error) {
    console.error(
      "Unban user:",
      error.message
    );

    return false;
  }
}


/* =========================
   PROMOTE USER
========================= */

async function promoteUser(
  env,
  chatId,
  userId,
  permissions = {}
) {
  if (
    !chatId ||
    !userId ||
    isProtectedUser(userId)
  ) {
    return false;
  }

  const defaults = {
    can_manage_chat: false,
    can_delete_messages: true,
    can_manage_video_chats: true,
    can_restrict_members: true,
    can_promote_members: false,
    can_change_info: false,
    can_invite_users: true,
    can_post_messages: true,
    can_edit_messages: true,
    can_pin_messages: true,
    can_manage_topics: true
  };

  try {
    await telegram(
      env,
      "promoteChatMember",
      {
        chat_id: chatId,
        user_id: userId,
        ...defaults,
        ...permissions
      }
    );

    await logEvent(
      env,
      chatId,
      "promote",
      {
        userId
      }
    );

    return true;

  } catch (error) {
    console.error(
      "Promote user:",
      error.message
    );

    return false;
  }
}


/* =========================
   DEMOTE USER
========================= */

async function demoteUser(
  env,
  chatId,
  userId
) {
  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  try {
    await telegram(
      env,
      "promoteChatMember",
      {
        chat_id: chatId,
        user_id: userId,

        can_manage_chat: false,
        can_delete_messages: false,
        can_manage_video_chats: false,
        can_restrict_members: false,
        can_promote_members: false,
        can_change_info: false,
        can_invite_users: false,
        can_post_messages: false,
        can_edit_messages: false,
        can_pin_messages: false,
        can_manage_topics: false
      }
    );

    await logEvent(
      env,
      chatId,
      "demote",
      {
        userId
      }
    );

    return true;

  } catch (error) {
    console.error(
      "Demote user:",
      error.message
    );

    return false;
  }
}


/* =========================
   GET CHAT MEMBER
========================= */

async function getChatMember(
  env,
  chatId,
  userId
) {
  if (
    !chatId ||
    !userId
  ) {
    return null;
  }

  try {
    const result =
      await telegram(
        env,
        "getChatMember",
        {
          chat_id: chatId,
          user_id: userId
        }
      );

    return result;

  } catch (error) {
    console.error(
      "Get chat member:",
      error.message
    );

    return null;
  }
}


/* =========================
   MEMBER STATUS
========================= */

async function getMemberStatus(
  env,
  chatId,
  userId
) {
  const member =
    await getChatMember(
      env,
      chatId,
      userId
    );

  return (
    member?.status ||
    "unknown"
  );
}


/* =========================
   CHECK BOT ADMIN
========================= */

async function isBotAdmin(
  env,
  chatId
) {
  const botId =
    await getBotId(
      env
    );

  if (!botId) {
    return false;
  }

  const status =
    await getMemberStatus(
      env,
      chatId,
      botId
    );

  return (
    status === "administrator" ||
    status === "creator"
  );
}


/* =========================
   SAFE MODERATION CHECK
========================= */

async function canModerate(
  env,
  chatId,
  actorId,
  targetId
) {
  if (
    !chatId ||
    !actorId ||
    !targetId
  ) {
    return false;
  }

  if (
    isProtectedUser(
      targetId
    )
  ) {
    return false;
  }

  if (
    !await isAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    return false;
  }

  if (
    !await isBotAdmin(
      env,
      chatId
    )
  ) {
    return false;
  }

  return true;
}


/* =========================
   GROUP RULES
========================= */

async function getGroupRules(
  env,
  chatId
) {
  const data =
    await kvGet(
      env,
      `rules:${chatId}`,
      ""
    );

  return String(
    data || ""
  );
}


async function saveGroupRules(
  env,
  chatId,
  rules
) {
  await kvPut(
    env,
    `rules:${chatId}`,
    String(
      rules || ""
    ).slice(
      0,
      4000
    )
  );

  await logEvent(
    env,
    chatId,
    "rules_updated"
  );

  return true;
}


/* =========================
   RULES COMMAND
========================= */

async function handleRulesCommand(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  const rules =
    await getGroupRules(
      env,
      chatId
    );

  if (!rules) {
    await sendMessage(
      env,
      chatId,
      "📜 هنوز قوانینی برای این گروه ثبت نشده است."
    );

    return true;
  }

  await sendMessage(
    env,
    chatId,
    [
      "📜 <b>قوانین گروه</b>",
      "",
      escapeHTML(
        rules
      )
    ].join("\n")
  );

  return true;
}


/* =========================
   SET RULES
========================= */

async function handleSetRulesCommand(
  message,
  env
) {
  const text =
    String(
      message?.text ||
      ""
    ).trim();

  const match =
    text.match(
      /^\/(?:setrules|تنظیم_قوانین)\s+([\s\S]+)$/i
    );

  if (!match) {
    return false;
  }

  const actorId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      message.chat.id,
      actorId
    )
  ) {
    await sendMessage(
      env,
      message.chat.id,
      "⛔ فقط مدیران می‌توانند قوانین را تغییر دهند."
    );

    return true;
  }

  await saveGroupRules(
    env,
    message.chat.id,
    match[1]
  );

  await sendMessage(
    env,
    message.chat.id,
    "✅ قوانین گروه با موفقیت ذخیره شد."
  );

  return true;
}


/* =========================
   PIN MESSAGE
========================= */

async function pinMessage(
  env,
  chatId,
  messageId,
  disableNotification = false
) {
  try {
    await telegram(
      env,
      "pinChatMessage",
      {
        chat_id: chatId,
        message_id: messageId,
        disable_notification:
          disableNotification
      }
    );

    await logEvent(
      env,
      chatId,
      "pin",
      {
        messageId
      }
    );

    return true;

  } catch (error) {
    console.error(
      "Pin message:",
      error.message
    );

    return false;
  }
}


/* =========================
   UNPIN MESSAGE
========================= */

async function unpinMessage(
  env,
  chatId,
  messageId
) {
  try {
    await telegram(
      env,
      "unpinChatMessage",
      {
        chat_id: chatId,
        message_id: messageId
      }
    );

    return true;

  } catch (error) {
    console.error(
      "Unpin message:",
      error.message
    );

    return false;
  }
}


/* =========================
   CHAT INFO
========================= */

async function getChatInfo(
  env,
  chatId
) {
  try {
    return await telegram(
      env,
      "getChat",
      {
        chat_id: chatId
      }
    );
  } catch (error) {
    console.error(
      "Get chat:",
      error.message
    );

    return null;
  }
}


/* =========================
   CHAT MEMBER COUNT
========================= */

async function getChatMemberCount(
  env,
  chatId
) {
  try {
    const count =
      await telegram(
        env,
        "getChatMemberCount",
        {
          chat_id: chatId
        }
      );

    return Number(
      count || 0
    );

  } catch (error) {
    console.error(
      "Member count:",
      error.message
    );

    return 0;
  }
}


/* =========================
   MODERATION COMMAND ROUTER
========================= */

async function routeModerationCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (!parsed) {
    return false;
  }

  if (
    parsed.command === "mute"
  ) {
    return await handleMuteCommand(
      message,
      env,
      parsed
    );
  }

  if (
    parsed.command === "unmute"
  ) {
    return await handleUnmuteCommand(
      message,
      env,
      parsed
    );
  }

  if (
    parsed.command === "ban"
  ) {
    return await handleBanCommand(
      message,
      env,
      parsed
    );
  }

  if (
    parsed.command === "unban"
  ) {
    return await handleUnbanCommand(
      message,
      env,
      parsed
    );
  }

  return false;
}
/* ============================================================
   PART 15 — GROUP EVENTS / WELCOME / GOODBYE / ACTIVITY
============================================================ */


/* =========================
   WELCOME SETTINGS
========================= */

function welcomeSettingsText(settings) {
  return [
    "👋 <b>تنظیمات خوش‌آمدگویی</b>",
    "",
    `وضعیت: ${
      settings?.welcome
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    "",
    "با استفاده از دکمه‌های زیر می‌توانی وضعیت را تغییر بدهی."
  ].join("\n");
}


function welcomeSettingsKeyboard(settings) {
  return {
    inline_keyboard: [

      [
        inlineButton(
          settings?.welcome
            ? "🔴 خاموش کردن"
            : "🟢 فعال کردن",
          "welcome:toggle"
        )
      ],

      [
        inlineButton(
          "🔙 پنل مدیریت",
          "admin:main"
        )
      ]

    ]
  };
}


/* =========================
   WELCOME MESSAGE
========================= */

async function sendWelcomeMessage(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  const members =
    message?.new_chat_members;

  if (
    !chatId ||
    !Array.isArray(members) ||
    !members.length
  ) {
    return false;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    settings?.welcome === false
  ) {
    return false;
  }

  const title =
    escapeHTML(
      message.chat?.title ||
      "گروه"
    );

  for (
    const member of members
  ) {
    const name =
      escapeHTML(
        displayName(
          member
        )
      );

    await sendMessage(
      env,
      chatId,
      [
        "👋 <b>خوش اومدی!</b>",
        "",
        `سلام <b>${name}</b> 🌹`,
        `به <b>${title}</b> خوش اومدی.`,
        "",
        "📜 حتماً قوانین گروه رو مطالعه کن."
      ].join("\n")
    );

    await registerUser(
      env,
      chatId,
      member
    );
  }

  return true;
}


/* =========================
   GOODBYE MESSAGE
========================= */

async function sendGoodbyeMessage(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  const members =
    message?.left_chat_member
      ? [
          message.left_chat_member
        ]
      : [];

  if (
    !chatId ||
    !members.length
  ) {
    return false;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    settings?.goodbye === false
  ) {
    return false;
  }

  for (
    const member of members
  ) {
    const name =
      escapeHTML(
        displayName(
          member
        )
      );

    await sendMessage(
      env,
      chatId,
      [
        "👋 <b>خداحافظ!</b>",
        "",
        `${name} از گروه خارج شد.`,
        "موفق باشی 🌹"
      ].join("\n")
    );
  }

  return true;
}


/* =========================
   USER REGISTRATION
========================= */

async function registerUser(
  env,
  chatId,
  user
) {
  if (
    !chatId ||
    !user?.id
  ) {
    return false;
  }

  const userId =
    Number(
      user.id
    );

  const key =
    `user:${chatId}:${userId}`;

  const old =
    await kvGet(
      env,
      key,
      null
    );

  const data = {
    id:
      userId,

    firstName:
      String(
        user.first_name ||
        ""
      ).slice(
        0,
        100
      ),

    lastName:
      String(
        user.last_name ||
        ""
      ).slice(
        0,
        100
      ),

    username:
      String(
        user.username ||
        ""
      ).slice(
        0,
        100
      ),

    isBot:
      Boolean(
        user.is_bot
      ),

    firstSeen:
      old?.firstSeen ||
      Date.now(),

    lastSeen:
      Date.now(),

    messages:
      Number(
        old?.messages ||
        0
      ),

    warnings:
      Number(
        old?.warnings ||
        0
      )
  };

  await kvPut(
    env,
    key,
    data
  );

  await incrementStat(
    env,
    chatId,
    "users"
  );

  return true;
}


/* =========================
   UPDATE USER ACTIVITY
========================= */

async function updateUserActivity(
  env,
  chatId,
  user
) {
  if (
    !chatId ||
    !user?.id ||
    user.is_bot
  ) {
    return false;
  }

  await registerUser(
    env,
    chatId,
    user
  );

  const key =
    `user:${chatId}:${Number(
      user.id
    )}`;

  const data =
    await kvGet(
      env,
      key,
      {}
    );

  data.messages =
    Number(
      data.messages || 0
    ) + 1;

  data.lastSeen =
    Date.now();

  await kvPut(
    env,
    key,
    data
  );

  return true;
}


/* =========================
   MEMBER STATS
========================= */

async function updateMemberStats(
  env,
  chatId,
  userId,
  field
) {
  if (
    !chatId ||
    !userId ||
    !field
  ) {
    return false;
  }

  const key =
    `user:${chatId}:${userId}`;

  const data =
    await kvGet(
      env,
      key,
      {
        id:
          Number(
            userId
          )
      }
    );

  data[field] =
    Number(
      data[field] ||
      0
    ) + 1;

  data.lastSeen =
    Date.now();

  await kvPut(
    env,
    key,
    data
  );

  return true;
}


/* =========================
   CHAT STATISTICS
========================= */

async function getChatStats(
  env,
  chatId
) {
  return await kvGet(
    env,
    `stats:${chatId}`,
    {
      users: 0,
      messages: 0,
      warnings: 0,
      mutes: 0,
      bans: 0,
      deleted: 0
    }
  );
}


/* =========================
   INCREMENT STAT
========================= */

async function incrementStat(
  env,
  chatId,
  field
) {
  if (
    !chatId ||
    !field
  ) {
    return false;
  }

  const key =
    `stats:${chatId}`;

  const stats =
    await kvGet(
      env,
      key,
      {}
    );

  stats[field] =
    Number(
      stats[field] ||
      0
    ) + 1;

  await kvPut(
    env,
    key,
    stats
  );

  return true;
}


/* =========================
   EVENT LOGGER
========================= */

async function logEvent(
  env,
  chatId,
  type,
  data = {}
) {
  if (
    !chatId ||
    !type
  ) {
    return false;
  }

  const key =
    `events:${chatId}`;

  const events =
    await kvGet(
      env,
      key,
      []
    );

  const list =
    Array.isArray(events)
      ? events
      : [];

  list.unshift({
    type:
      String(
        type
      ).slice(
        0,
        100
      ),

    data,

    timestamp:
      Date.now()
  });

  await kvPut(
    env,
    key,
    list.slice(
      0,
      200
    )
  );

  return true;
}


/* =========================
   WARNING EVENT
========================= */

async function logWarningEvent(
  env,
  chatId,
  userId,
  count
) {
  return await logEvent(
    env,
    chatId,
    "warning",
    {
      userId,
      count
    }
  );
}


/* =========================
   MUTE EVENT
========================= */

async function logMuteEvent(
  env,
  chatId,
  userId
) {
  return await logEvent(
    env,
    chatId,
    "mute",
    {
      userId
    }
  );
}


/* =========================
   ADMIN WELCOME CALLBACK
========================= */

async function handleWelcomeCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data || ""
    );

  if (
    data !==
    "welcome:toggle"
  ) {
    return false;
  }

  const chatId =
    callback.message
      ?.chat?.id;

  const userId =
    Number(
      callback.from?.id ||
      0
    );

  if (
    !chatId
  ) {
    return true;
  }

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await answerCallback(
      env,
      callback.id,
      "⛔ فقط مدیران دسترسی دارند."
    );

    return true;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  settings.welcome =
    !Boolean(
      settings.welcome
    );

  await saveSettings(
    env,
    chatId,
    settings
  );

  await answerCallback(
    env,
    callback.id,
    settings.welcome
      ? "👋 خوش‌آمدگویی فعال شد."
      : "👋 خوش‌آمدگویی خاموش شد."
  );

  await showWelcomePanel(
    env,
    chatId
  );

  return true;
}


/* =========================
   GROUP ACTIVITY HANDLER
========================= */

async function handleGroupActivity(
  message,
  env
) {
  if (
    !message?.chat?.id
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  if (
    message.from &&
    !message.from.is_bot
  ) {
    await updateUserActivity(
      env,
      chatId,
      message.from
    );
  }

  if (
    message.new_chat_members
  ) {
    await sendWelcomeMessage(
      message,
      env
    );
  }

  if (
    message.left_chat_member
  ) {
    await sendGoodbyeMessage(
      message,
      env
    );
  }

  return true;
}
/* ============================================================
   PART 16 — ANTI-SPAM / ANTI-FLOOD / MESSAGE FILTER
============================================================ */


/* =========================
   FLOOD STORAGE
========================= */

async function getFloodData(
  env,
  chatId,
  userId
) {
  return await kvGet(
    env,
    `flood:${chatId}:${userId}`,
    {
      timestamps: []
    }
  );
}


/* =========================
   SAVE FLOOD DATA
========================= */

async function saveFloodData(
  env,
  chatId,
  userId,
  data
) {
  await kvPut(
    env,
    `flood:${chatId}:${userId}`,
    data
  );
}


/* =========================
   FLOOD CHECK
========================= */

async function checkFlood(
  env,
  chatId,
  userId
) {
  const now =
    Date.now();

  const windowMs =
    8000;

  const maxMessages =
    6;

  const data =
    await getFloodData(
      env,
      chatId,
      userId
    );

  let timestamps =
    Array.isArray(
      data.timestamps
    )
      ? data.timestamps
      : [];

  timestamps =
    timestamps.filter(
      time =>
        now - time <
        windowMs
    );

  timestamps.push(
    now
  );

  await saveFloodData(
    env,
    chatId,
    userId,
    {
      timestamps
    }
  );

  return (
    timestamps.length >
    maxMessages
  );
}


/* =========================
   FLOOD ACTION
========================= */

async function handleFloodViolation(
  message,
  env
) {
  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !userId ||
    message.from?.is_bot
  ) {
    return false;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    settings.antiFlood ===
    false
  ) {
    return false;
  }

  const flooding =
    await checkFlood(
      env,
      chatId,
      userId
    );

  if (!flooding) {
    return false;
  }

  await deleteMessage(
    env,
    chatId,
    message.message_id
  );

  await muteUser(
    env,
    chatId,
    userId,
    Number(
      settings.floodMuteSeconds ||
      60
    )
  );

  await logEvent(
    env,
    chatId,
    "flood_violation",
    {
      userId
    }
  );

  return true;
}


/* =========================
   LINK DETECTION
========================= */

function containsLink(
  text
) {
  const value =
    String(
      text || ""
    );

  const patterns = [

    /https?:\/\/\S+/i,

    /www\.\S+/i,

    /t\.me\/\S+/i,

    /telegram\.me\/\S+/i,

    /discord\.gg\/\S+/i,

    /\b[a-z0-9-]+\.(com|net|org|ir|io|co|me|xyz|shop|online)\b/i

  ];

  return patterns.some(
    pattern =>
      pattern.test(
        value
      )
  );
}


/* =========================
   LINK FILTER
========================= */

async function handleLinkFilter(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  const userId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    settings.antiLink ===
    false
  ) {
    return false;
  }

  const text =
    [
      message.text,
      message.caption
    ]
      .filter(Boolean)
      .join(" ");

  if (
    !containsLink(
      text
    )
  ) {
    return false;
  }

  /*
   * Admins are ignored.
   */

  if (
    await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    return false;
  }

  await deleteMessage(
    env,
    chatId,
    message.message_id
  );

  await logEvent(
    env,
    chatId,
    "link_deleted",
    {
      userId
    }
  );

  return true;
}


/* =========================
   SPAM WORD FILTER
========================= */

function containsSpamPattern(
  text
) {
  const value =
    String(
      text || ""
    )
      .toLowerCase()
      .trim();

  if (!value) {
    return false;
  }

  const patterns = [

    /free\s+money/i,

    /free\s+gift/i,

    /click\s+here/i,

    /airdrop/i,

    /giveaway/i,

    /crypto\s+bonus/i,

    /earn\s+money/i,

    /double\s+your\s+money/i,

    /کسب\s+درآمد/i,

    /پول\s+رایگان/i,

    /جایزه\s+رایگان/i,

    /ایردراپ/i,

    /هدیه\s+رایگان/i

  ];

  return patterns.some(
    pattern =>
      pattern.test(
        value
      )
  );
}


/* =========================
   SPAM FILTER
========================= */

async function handleSpamFilter(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  const userId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId ||
    message.from?.is_bot
  ) {
    return false;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    settings.antiSpam ===
    false
  ) {
    return false;
  }

  if (
    await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    return false;
  }

  const text =
    [
      message.text,
      message.caption
    ]
      .filter(Boolean)
      .join(" ");

  if (
    !containsSpamPattern(
      text
    )
  ) {
    return false;
  }

  await deleteMessage(
    env,
    chatId,
    message.message_id
  );

  await incrementStat(
    env,
    chatId,
    "deleted"
  );

  await logEvent(
    env,
    chatId,
    "spam_deleted",
    {
      userId
    }
  );

  return true;
}


/* =========================
   REPEATED MESSAGE CHECK
========================= */

async function checkRepeatedMessage(
  env,
  chatId,
  userId,
  text
) {
  if (
    !chatId ||
    !userId ||
    !text
  ) {
    return false;
  }

  const key =
    `repeat:${chatId}:${userId}`;

  const data =
    await kvGet(
      env,
      key,
      {
        text: "",
        count: 0,
        timestamp: 0
      }
    );

  const now =
    Date.now();

  const same =
    data.text ===
      text &&
    now -
      Number(
        data.timestamp || 0
      ) <
      15000;

  const count =
    same
      ? Number(
          data.count || 0
        ) + 1
      : 1;

  await kvPut(
    env,
    key,
    {
      text,
      count,
      timestamp:
        now
    }
  );

  return count >= 4;
}


/* =========================
   REPEATED MESSAGE HANDLER
========================= */

async function handleRepeatedMessage(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  const userId =
    Number(
      message?.from?.id ||
      0
    );

  const text =
    String(
      message?.text ||
      message?.caption ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    !chatId ||
    !userId ||
    !text
  ) {
    return false;
  }

  if (
    await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    return false;
  }

  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    settings.antiSpam ===
    false
  ) {
    return false;
  }

  const repeated =
    await checkRepeatedMessage(
      env,
      chatId,
      userId,
      text
    );

  if (!repeated) {
    return false;
  }

  await deleteMessage(
    env,
    chatId,
    message.message_id
  );

  await logEvent(
    env,
    chatId,
    "repeated_message",
    {
      userId
    }
  );

  return true;
}


/* =========================
   MESSAGE FILTER PIPELINE
========================= */

async function runMessageFilters(
  message,
  env
) {
  if (
    !message?.chat?.id
  ) {
    return false;
  }

  /*
   * Never moderate protected
   * users.
   */

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    userId &&
    isProtectedUser(
      userId
    )
  ) {
    return false;
  }

  /*
   * Flood
   */

  if (
    await handleFloodViolation(
      message,
      env
    )
  ) {
    return true;
  }

  /*
   * Links
   */

  if (
    await handleLinkFilter(
      message,
      env
    )
  ) {
    return true;
  }

  /*
   * Spam patterns
   */

  if (
    await handleSpamFilter(
      message,
      env
    )
  ) {
    return true;
  }

  /*
   * Repeated messages
   */

  if (
    await handleRepeatedMessage(
      message,
      env
    )
  ) {
    return true;
  }

  return false;
}


/* =========================
   FILTER SETTINGS
========================= */

async function configureFilters(
  env,
  chatId,
  options = {}
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  if (
    typeof options.antiLink ===
    "boolean"
  ) {
    settings.antiLink =
      options.antiLink;
  }

  if (
    typeof options.antiSpam ===
    "boolean"
  ) {
    settings.antiSpam =
      options.antiSpam;
  }

  if (
    typeof options.antiFlood ===
    "boolean"
  ) {
    settings.antiFlood =
      options.antiFlood;
  }

  if (
    Number.isFinite(
      Number(
        options.floodMuteSeconds
      )
    )
  ) {
    settings.floodMuteSeconds =
      Math.max(
        10,
        Math.min(
          86400,
          Number(
            options.floodMuteSeconds
          )
        )
      );
  }

  await saveSettings(
    env,
    chatId,
    settings
  );

  return settings;
}
/* ============================================================
   PART 17 — USER PROFILE / MEMBER INFORMATION / AUDIT LOG
============================================================ */


/* =========================
   USER PROFILE
========================= */

async function getUserProfile(
  env,
  chatId,
  userId
) {
  if (
    !chatId ||
    !userId
  ) {
    return null;
  }

  const data =
    await kvGet(
      env,
      `user:${chatId}:${userId}`,
      null
    );

  if (data) {
    return data;
  }

  try {
    const member =
      await getChatMember(
        env,
        chatId,
        userId
      );

    if (!member?.user) {
      return null;
    }

    await registerUser(
      env,
      chatId,
      member.user
    );

    return await kvGet(
      env,
      `user:${chatId}:${userId}`,
      null
    );

  } catch (error) {
    console.error(
      "User profile:",
      error.message
    );

    return null;
  }
}


/* =========================
   USER PROFILE TEXT
========================= */

async function buildUserProfileText(
  env,
  chatId,
  userId
) {
  const profile =
    await getUserProfile(
      env,
      chatId,
      userId
    );

  if (!profile) {
    return "❌ اطلاعات کاربر پیدا نشد.";
  }

  const warnings =
    await getUserWarnings(
      env,
      chatId,
      userId
    );

  const status =
    await getMemberStatus(
      env,
      chatId,
      userId
    );

  const statusMap = {
    creator:
      "👑 مالک گروه",

    administrator:
      "🛡️ مدیر",

    member:
      "👤 عضو",

    restricted:
      "🔇 محدود شده",

    left:
      "🚪 خارج شده",

    kicked:
      "🚫 مسدود شده"
  };

  return [
    "👤 <b>پروفایل کاربر</b>",
    "",
    `🆔 شناسه: <code>${userId}</code>`,
    `👤 نام: <b>${escapeHTML(
      [
        profile.firstName,
        profile.lastName
      ]
        .filter(Boolean)
        .join(" ") ||
      "نامشخص"
    )}</b>`,
    profile.username
      ? `🔗 نام کاربری: @${escapeHTML(
          profile.username
        )}`
      : "🔗 نام کاربری: ندارد",
    "",
    `📌 وضعیت: <b>${
      statusMap[status] ||
      status
    }</b>`,
    `💬 پیام‌ها: <b>${
      Number(
        profile.messages || 0
      )
    }</b>`,
    `⚠️ اخطارها: <b>${
      Number(
        warnings.count || 0
      )
    }</b>`,
    "",
    `📅 اولین مشاهده: <b>${
      formatEventDate(
        profile.firstSeen
      )
    }</b>`,
    `🕒 آخرین فعالیت: <b>${
      formatEventDate(
        profile.lastSeen
      )
    }</b>`
  ].join("\n");
}


/* =========================
   USER PROFILE COMMAND
========================= */

async function handleUserProfileCommand(
  message,
  env
) {
  const text =
    normalizeCommandText(
      message?.text
    );

  const commands = [
    "/profile",
    "/user",
    "/پروفایل",
    "/کاربر",
    "/اطلاعات_کاربر"
  ];

  if (
    !commands.includes(
      text
    )
  ) {
    return false;
  }

  const target =
    getTargetUser(
      message
    );

  const userId =
    target
      ? Number(
          target.id
        )
      : Number(
          message.from?.id ||
          0
        );

  const profileText =
    await buildUserProfileText(
      env,
      message.chat.id,
      userId
    );

  await sendMessage(
    env,
    message.chat.id,
    profileText,
    target
      ? warningUserKeyboard(
          userId
        )
      : undefined
  );

  return true;
}


/* =========================
   AUDIT LOG STORAGE
========================= */

async function getAuditLog(
  env,
  chatId
) {
  const data =
    await kvGet(
      env,
      `audit:${chatId}`,
      []
    );

  return Array.isArray(
    data
  )
    ? data
    : [];
}


/* =========================
   AUDIT LOG
========================= */

async function addAuditLog(
  env,
  chatId,
  actorId,
  action,
  targetId = 0,
  details = {}
) {
  if (
    !chatId ||
    !action
  ) {
    return false;
  }

  const logs =
    await getAuditLog(
      env,
      chatId
    );

  logs.unshift({
    actorId:
      Number(
        actorId || 0
      ),

    targetId:
      Number(
        targetId || 0
      ),

    action:
      String(
        action
      ).slice(
        0,
        100
      ),

    details,

    timestamp:
      Date.now()
  });

  await kvPut(
    env,
    `audit:${chatId}`,
    logs.slice(
      0,
      500
    )
  );

  return true;
}


/* =========================
   AUDIT LOG TEXT
========================= */

function buildAuditLogText(
  logs
) {
  if (
    !Array.isArray(
      logs
    ) ||
    logs.length === 0
  ) {
    return [
      "📋 <b>گزارش مدیریتی</b>",
      "",
      "📭 هنوز رویدادی ثبت نشده است."
    ].join("\n");
  }

  const lines = [
    "📋 <b>گزارش مدیریتی</b>",
    ""
  ];

  const actionMap = {

    ban:
      "🚫 مسدودسازی",

    unban:
      "♻️ رفع مسدودیت",

    mute:
      "🔇 سکوت",

    unmute:
      "🔊 رفع سکوت",

    warning:
      "⚠️ اخطار",

    promote:
      "⬆️ ارتقای مدیر",

    demote:
      "⬇️ عزل مدیر",

    pin:
      "📌 سنجاق پیام",

    link_deleted:
      "🔗 حذف لینک",

    spam_deleted:
      "🚨 حذف اسپم",

    flood_violation:
      "🌊 تخلف فلود",

    rules_updated:
      "📜 تغییر قوانین",

    security_toggle:
      "🛡️ تغییر امنیت",

    welcome:
      "👋 خوش‌آمدگویی"
  };

  for (
    const item of logs.slice(
      0,
      20
    )
  ) {
    const label =
      actionMap[
        item.action
      ] ||
      item.action;

    lines.push(
      `• <b>${escapeHTML(
        label
      )}</b>`,
      `  👤 اجراکننده: <code>${Number(
        item.actorId || 0
      )}</code>`,
      item.targetId
        ? `  🎯 هدف: <code>${Number(
            item.targetId
          )}</code>`
        : "",
      `  🕒 ${formatEventDate(
        item.timestamp
      )}`,
      ""
    );
  }

  return lines
    .filter(Boolean)
    .join("\n");
}


/* =========================
   AUDIT COMMAND
========================= */

async function handleAuditCommand(
  message,
  env
) {
  const text =
    normalizeCommandText(
      message?.text
    );

  const commands = [
    "/audit",
    "/logs",
    "/گزارش",
    "/گزارش_مدیریتی",
    "/لاگ"
  ];

  if (
    !commands.includes(
      text
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند گزارش مدیریتی را مشاهده کنند."
    );

    return true;
  }

  const logs =
    await getAuditLog(
      env,
      chatId
    );

  await sendMessage(
    env,
    chatId,
    buildAuditLogText(
      logs
    )
  );

  return true;
}


/* =========================
   RECORD MODERATION ACTION
========================= */

async function recordModerationAction(
  env,
  chatId,
  actorId,
  action,
  targetId,
  details = {}
) {
  await addAuditLog(
    env,
    chatId,
    actorId,
    action,
    targetId,
    details
  );

  await logEvent(
    env,
    chatId,
    action,
    {
      actorId,
      targetId,
      ...details
    }
  );

  return true;
}


/* =========================
   USER STATUS COMMAND
========================= */

async function handleUserStatusCommand(
  message,
  env
) {
  const text =
    normalizeCommandText(
      message?.text
    );

  const commands = [
    "/status",
    "/وضعیت",
    "/وضعیت_کاربر"
  ];

  if (
    !commands.includes(
      text
    )
  ) {
    return false;
  }

  const target =
    getTargetUser(
      message
    );

  const userId =
    target
      ? Number(
          target.id
        )
      : Number(
          message.from?.id ||
          0
        );

  const status =
    await getMemberStatus(
      env,
      message.chat.id,
      userId
    );

  const statusText = {
    creator:
      "👑 مالک گروه",

    administrator:
      "🛡️ مدیر",

    member:
      "👤 عضو عادی",

    restricted:
      "🔇 محدود شده",

    left:
      "🚪 خارج شده",

    kicked:
      "🚫 مسدود شده"
  };

  await sendMessage(
    env,
    message.chat.id,
    [
      "📌 <b>وضعیت کاربر</b>",
      "",
      `🆔 <code>${userId}</code>`,
      `📊 وضعیت: <b>${
        statusText[status] ||
        status
      }</b>`
    ].join("\n")
  );

  return true;
}


/* =========================
   USER INFORMATION ROUTER
========================= */

async function routeUserInformation(
  message,
  env
) {
  if (
    await handleUserProfileCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleUserStatusCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleAuditCommand(
      message,
      env
    )
  ) {
    return true;
  }

  return false;
}
/* ============================================================
   PART 18 — ADVANCED GROUP SETTINGS / SECURITY PANEL
============================================================ */


/* =========================
   DEFAULT SECURITY SETTINGS
========================= */

function getDefaultSecuritySettings() {
  return {
    antiSpam: true,
    antiFlood: true,
    antiLink: true,

    welcome: true,
    goodbye: true,

    autoDeleteCommands: false,
    protectAdmins: true,

    floodMuteSeconds: 60,

    maxWarnings: 3,

    warningMuteSeconds: 300,

    logActions: true
  };
}


/* =========================
   NORMALIZE SETTINGS
========================= */

function normalizeSecuritySettings(
  settings
) {
  const defaults =
    getDefaultSecuritySettings();

  const result = {
    ...defaults,
    ...(settings || {})
  };

  result.antiSpam =
    Boolean(
      result.antiSpam
    );

  result.antiFlood =
    Boolean(
      result.antiFlood
    );

  result.antiLink =
    Boolean(
      result.antiLink
    );

  result.welcome =
    Boolean(
      result.welcome
    );

  result.goodbye =
    Boolean(
      result.goodbye
    );

  result.autoDeleteCommands =
    Boolean(
      result.autoDeleteCommands
    );

  result.protectAdmins =
    Boolean(
      result.protectAdmins
    );

  result.logActions =
    Boolean(
      result.logActions
    );

  result.floodMuteSeconds =
    Math.max(
      10,
      Math.min(
        86400,
        Number(
          result.floodMuteSeconds ||
          60
        )
      )
    );

  result.maxWarnings =
    Math.max(
      1,
      Math.min(
        20,
        Number(
          result.maxWarnings ||
          3
        )
      )
    );

  result.warningMuteSeconds =
    Math.max(
      30,
      Math.min(
        86400,
        Number(
          result.warningMuteSeconds ||
          300
        )
      )
    );

  return result;
}


/* =========================
   GET SECURITY SETTINGS
========================= */

async function getSecuritySettings(
  env,
  chatId
) {
  const settings =
    await getSettings(
      env,
      chatId
    );

  return normalizeSecuritySettings(
    settings
  );
}


/* =========================
   SAVE SECURITY SETTINGS
========================= */

async function saveSecuritySettings(
  env,
  chatId,
  settings
) {
  const normalized =
    normalizeSecuritySettings(
      settings
    );

  await saveSettings(
    env,
    chatId,
    normalized
  );

  return normalized;
}


/* =========================
   SECURITY STATUS
========================= */

function securityStatus(
  enabled
) {
  return enabled
    ? "🟢 فعال"
    : "🔴 خاموش";
}


/* =========================
   SECURITY PANEL TEXT
========================= */

function buildSecurityPanelText(
  settings
) {
  return [
    "🛡️ <b>پنل امنیت گروه</b>",
    "",
    `🚨 ضداسپم: ${securityStatus(
      settings.antiSpam
    )}`,
    `🌊 ضدفلود: ${securityStatus(
      settings.antiFlood
    )}`,
    `🔗 ضدلینک: ${securityStatus(
      settings.antiLink
    )}`,
    "",
    `👋 خوش‌آمدگویی: ${securityStatus(
      settings.welcome
    )}`,
    `🚪 خداحافظی: ${securityStatus(
      settings.goodbye
    )}`,
    "",
    `🧹 حذف خودکار دستورات: ${securityStatus(
      settings.autoDeleteCommands
    )}`,
    `🛡️ محافظت از مدیران: ${securityStatus(
      settings.protectAdmins
    )}`,
    `📋 ثبت فعالیت‌ها: ${securityStatus(
      settings.logActions
    )}`,
    "",
    `🌊 زمان سکوت ضدفلود: <b>${settings.floodMuteSeconds}</b> ثانیه`,
    `⚠️ حداکثر اخطار: <b>${settings.maxWarnings}</b>`,
    `🔇 سکوت پس از اخطار: <b>${settings.warningMuteSeconds}</b> ثانیه`
  ].join("\n");
}


/* =========================
   SECURITY PANEL KEYBOARD
========================= */

function buildSecurityPanelKeyboard(
  settings
) {
  return {
    inline_keyboard: [

      [
        inlineButton(
          `🚨 ضداسپم ${
            settings.antiSpam
              ? "🟢"
              : "🔴"
          }`,
          "security:antispam"
        ),

        inlineButton(
          `🌊 ضدفلود ${
            settings.antiFlood
              ? "🟢"
              : "🔴"
          }`,
          "security:antiflood"
        )
      ],

      [
        inlineButton(
          `🔗 ضدلینک ${
            settings.antiLink
              ? "🟢"
              : "🔴"
          }`,
          "security:antilink"
        ),

        inlineButton(
          `👋 خوش‌آمد ${
            settings.welcome
              ? "🟢"
              : "🔴"
          }`,
          "security:welcome"
        )
      ],

      [
        inlineButton(
          `🚪 خداحافظی ${
            settings.goodbye
              ? "🟢"
              : "🔴"
          }`,
          "security:goodbye"
        ),

        inlineButton(
          `🧹 حذف دستورات ${
            settings.autoDeleteCommands
              ? "🟢"
              : "🔴"
          }`,
          "security:autodelete"
        )
      ],

      [
        inlineButton(
          `🛡️ محافظت مدیر ${
            settings.protectAdmins
              ? "🟢"
              : "🔴"
          }`,
          "security:protectadmins"
        ),

        inlineButton(
          `📋 لاگ ${
            settings.logActions
              ? "🟢"
              : "🔴"
          }`,
          "security:logs"
        )
      ],

      [
        inlineButton(
          "🔄 بازنشانی تنظیمات",
          "security:reset"
        )
      ],

      [
        inlineButton(
          "🔙 پنل مدیریت",
          "admin:main"
        )
      ]
    ]
  };
}


/* =========================
   SHOW SECURITY PANEL
========================= */

async function showSecurityPanel(
  env,
  chatId
) {
  const settings =
    await getSecuritySettings(
      env,
      chatId
    );

  await sendMessage(
    env,
    chatId,
    buildSecurityPanelText(
      settings
    ),
    buildSecurityPanelKeyboard(
      settings
    )
  );

  return true;
}


/* =========================
   SECURITY TOGGLE
========================= */

async function toggleSecurityOption(
  env,
  chatId,
  field
) {
  const settings =
    await getSecuritySettings(
      env,
      chatId
    );

  if (
    typeof settings[field] !==
    "boolean"
  ) {
    return null;
  }

  settings[field] =
    !settings[field];

  await saveSecuritySettings(
    env,
    chatId,
    settings
  );

  return settings;
}


/* =========================
   SECURITY CALLBACK
========================= */

async function handleSecurityCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data ||
      ""
    );

  if (
    !data.startsWith(
      "security:"
    )
  ) {
    return false;
  }

  const chatId =
    callback.message
      ?.chat?.id;

  const userId =
    Number(
      callback.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return true;
  }

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await answerCallback(
      env,
      callback.id,
      "⛔ فقط مدیران دسترسی دارند."
    );

    return true;
  }

  const option =
    data.slice(
      "security:".length
    );

  if (
    option ===
    "reset"
  ) {
    const settings =
      getDefaultSecuritySettings();

    await saveSecuritySettings(
      env,
      chatId,
      settings
    );

    await answerCallback(
      env,
      callback.id,
      "🔄 تنظیمات به حالت پیش‌فرض برگشت."
    );

    await showSecurityPanel(
      env,
      chatId
    );

    return true;
  }

  const fieldMap = {
    antispam:
      "antiSpam",

    antiflood:
      "antiFlood",

    antilink:
      "antiLink",

    welcome:
      "welcome",

    goodbye:
      "goodbye",

    autodelete:
      "autoDeleteCommands",

    protectadmins:
      "protectAdmins",

    logs:
      "logActions"
  };

  const field =
    fieldMap[
      option
    ];

  if (!field) {
    return false;
  }

  const settings =
    await toggleSecurityOption(
      env,
      chatId,
      field
    );

  if (!settings) {
    return true;
  }

  await answerCallback(
    env,
    callback.id,
    settings[field]
      ? "🟢 قابلیت فعال شد."
      : "🔴 قابلیت خاموش شد."
  );

  await showSecurityPanel(
    env,
    chatId
  );

  await addAuditLog(
    env,
    chatId,
    userId,
    "security_toggle",
    0,
    {
      field,
      enabled:
        settings[field]
    }
  );

  return true;
}


/* =========================
   SECURITY COMMAND
========================= */

async function handleSecurityCommand(
  message,
  env
) {
  const text =
    normalizeCommandText(
      message?.text
    );

  const commands = [
    "/security",
    "/امنیت",
    "/پنل_امنیت",
    "/تنظیمات_امنیت"
  ];

  if (
    !commands.includes(
      text
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران گروه می‌توانند پنل امنیت را باز کنند."
    );

    return true;
  }

  await showSecurityPanel(
    env,
    chatId
  );

  return true;
}


/* =========================
   SETTINGS SUMMARY
========================= */

async function getSettingsSummary(
  env,
  chatId
) {
  const settings =
    await getSecuritySettings(
      env,
      chatId
    );

  return {
    antiSpam:
      settings.antiSpam,

    antiFlood:
      settings.antiFlood,

    antiLink:
      settings.antiLink,

    welcome:
      settings.welcome,

    goodbye:
      settings.goodbye,

    autoDeleteCommands:
      settings.autoDeleteCommands,

    protectAdmins:
      settings.protectAdmins,

    floodMuteSeconds:
      settings.floodMuteSeconds,

    maxWarnings:
      settings.maxWarnings,

    warningMuteSeconds:
      settings.warningMuteSeconds,

    logActions:
      settings.logActions
  };
}
/* ============================================================
   PART 19 — WARNINGS / MUTE / BAN MANAGEMENT
============================================================ */


/* =========================
   WARNING STORAGE
========================= */

async function getUserWarnings(
  env,
  chatId,
  userId
) {
  if (
    !chatId ||
    !userId
  ) {
    return {
      count: 0,
      history: []
    };
  }

  const data =
    await kvGet(
      env,
      `warnings:${chatId}:${userId}`,
      {
        count: 0,
        history: []
      }
    );

  return {
    count:
      Number(
        data?.count || 0
      ),

    history:
      Array.isArray(
        data?.history
      )
        ? data.history
        : []
  };
}


/* =========================
   SAVE WARNINGS
========================= */

async function saveUserWarnings(
  env,
  chatId,
  userId,
  data
) {
  await kvPut(
    env,
    `warnings:${chatId}:${userId}`,
    {
      count:
        Number(
          data?.count || 0
        ),

      history:
        Array.isArray(
          data?.history
        )
          ? data.history.slice(
              0,
              50
            )
          : []
    }
  );
}


/* =========================
   ADD WARNING
========================= */

async function addWarning(
  env,
  chatId,
  userId,
  actorId = 0,
  reason = ""
) {
  if (
    !chatId ||
    !userId
  ) {
    return null;
  }

  if (
    isProtectedUser(
      userId
    )
  ) {
    return null;
  }

  const warnings =
    await getUserWarnings(
      env,
      chatId,
      userId
    );

  const entry = {
    actorId:
      Number(
        actorId || 0
      ),

    reason:
      String(
        reason || "بدون دلیل"
      ).slice(
        0,
        500
      ),

    timestamp:
      Date.now()
  };

  warnings.count += 1;

  warnings.history.unshift(
    entry
  );

  await saveUserWarnings(
    env,
    chatId,
    userId,
    warnings
  );

  await updateMemberStats(
    env,
    chatId,
    userId,
    "warnings"
  );

  await incrementStat(
    env,
    chatId,
    "warnings"
  );

  await logWarningEvent(
    env,
    chatId,
    userId,
    warnings.count
  );

  await addAuditLog(
    env,
    chatId,
    actorId,
    "warning",
    userId,
    {
      reason:
        entry.reason,

      count:
        warnings.count
    }
  );

  return warnings;
}


/* =========================
   RESET WARNINGS
========================= */

async function resetWarnings(
  env,
  chatId,
  userId,
  actorId = 0
) {
  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  await saveUserWarnings(
    env,
    chatId,
    userId,
    {
      count: 0,
      history: []
    }
  );

  await addAuditLog(
    env,
    chatId,
    actorId,
    "warnings_reset",
    userId
  );

  return true;
}


/* =========================
   MUTE USER
========================= */

async function muteUser(
  env,
  chatId,
  userId,
  seconds = 300
) {
  if (
    !chatId ||
    !userId ||
    isProtectedUser(
      userId
    )
  ) {
    return false;
  }

  const duration =
    Math.max(
      10,
      Math.min(
        86400,
        Number(
          seconds || 300
        )
      )
    );

  const untilDate =
    Math.floor(
      Date.now() / 1000
    ) + duration;

  try {
    await telegram(
      env,
      "restrictChatMember",
      {
        chat_id:
          chatId,

        user_id:
          userId,

        until_date:
          untilDate,

        permissions: {
          can_send_messages:
            false,

          can_send_audios:
            false,

          can_send_documents:
            false,

          can_send_photos:
            false,

          can_send_videos:
            false,

          can_send_video_notes:
            false,

          can_send_voice_notes:
            false,

          can_send_polls:
            false,

          can_send_other_messages:
            false,

          can_add_web_page_previews:
            false,

          can_change_info:
            false,

          can_invite_users:
            false,

          can_pin_messages:
            false,

          can_manage_topics:
            false
        }
      }
    );

    await incrementStat(
      env,
      chatId,
      "mutes"
    );

    await logMuteEvent(
      env,
      chatId,
      userId
    );

    return true;

  } catch (error) {
    console.error(
      "Mute user:",
      error.message
    );

    return false;
  }
}


/* =========================
   UNMUTE USER
========================= */

async function unmuteUser(
  env,
  chatId,
  userId
) {
  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  try {
    await telegram(
      env,
      "restrictChatMember",
      {
        chat_id:
          chatId,

        user_id:
          userId,

        permissions: {
          can_send_messages:
            true,

          can_send_audios:
            true,

          can_send_documents:
            true,

          can_send_photos:
            true,

          can_send_videos:
            true,

          can_send_video_notes:
            true,

          can_send_voice_notes:
            true,

          can_send_polls:
            true,

          can_send_other_messages:
            true,

          can_add_web_page_previews:
            true,

          can_invite_users:
            true
        }
      }
    );

    return true;

  } catch (error) {
    console.error(
      "Unmute user:",
      error.message
    );

    return false;
  }
}


/* =========================
   BAN USER WITH LOG
========================= */

async function banUserWithLog(
  env,
  chatId,
  userId,
  actorId = 0,
  reason = ""
) {
  const success =
    await banUser(
      env,
      chatId,
      userId
    );

  if (!success) {
    return false;
  }

  await incrementStat(
    env,
    chatId,
    "bans"
  );

  await recordModerationAction(
    env,
    chatId,
    actorId,
    "ban",
    userId,
    {
      reason:
        String(
          reason || ""
        ).slice(
          0,
          500
        )
    }
  );

  return true;
}


/* =========================
   UNBAN USER WITH LOG
========================= */

async function unbanUserWithLog(
  env,
  chatId,
  userId,
  actorId = 0
) {
  const success =
    await unbanUser(
      env,
      chatId,
      userId
    );

  if (!success) {
    return false;
  }

  await recordModerationAction(
    env,
    chatId,
    actorId,
    "unban",
    userId
  );

  return true;
}


/* =========================
   WARN COMMAND
========================= */

async function handleWarnCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "warn",
      "اخطار",
      "هشدار"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const actorId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند اخطار بدهند."
    );

    return true;
  }

  const target =
    getTargetUser(
      message
    );

  if (!target) {
    await sendMessage(
      env,
      chatId,
      "⚠️ کاربر موردنظر را با ریپلای روی پیامش مشخص کن."
    );

    return true;
  }

  const targetId =
    Number(
      target.id
    );

  if (
    isProtectedUser(
      targetId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "🛡️ این کاربر محافظت شده است."
    );

    return true;
  }

  const reason =
    parsed.args
      ?.join(" ")
      .trim() ||
    "بدون دلیل";

  const warnings =
    await addWarning(
      env,
      chatId,
      targetId,
      actorId,
      reason
    );

  if (!warnings) {
    await sendMessage(
      env,
      chatId,
      "❌ ثبت اخطار انجام نشد."
    );

    return true;
  }

  const settings =
    await getSecuritySettings(
      env,
      chatId
    );

  let extra =
    "";

  if (
    warnings.count >=
    settings.maxWarnings
  ) {
    const muted =
      await muteUser(
        env,
        chatId,
        targetId,
        settings.warningMuteSeconds
      );

    if (muted) {
      extra =
        [
          "",
          `🔇 به دلیل رسیدن به ${settings.maxWarnings} اخطار، کاربر برای ${settings.warningMuteSeconds} ثانیه ساکت شد.`
        ].join("\n");
    }
  }

  await sendMessage(
    env,
    chatId,
    [
      "⚠️ <b>اخطار ثبت شد</b>",
      "",
      `👤 کاربر: <code>${targetId}</code>`,
      `📊 تعداد اخطار: <b>${warnings.count}</b>`,
      `📝 دلیل: ${escapeHTML(
        reason
      )}`,
      extra
    ]
      .filter(Boolean)
      .join("\n")
  );

  return true;
}


/* =========================
   CLEAR WARNINGS COMMAND
========================= */

async function handleClearWarningsCommand(
  message,
  env
) {
  const text =
    normalizeCommandText(
      message?.text
    );

  if (
    ![
      "/clearwarn",
      "/clearwarnings",
      "/حذف_اخطار",
      "/پاک_کردن_اخطار"
    ].includes(
      text
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const actorId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران دسترسی دارند."
    );

    return true;
  }

  const target =
    getTargetUser(
      message
    );

  if (!target) {
    await sendMessage(
      env,
      chatId,
      "⚠️ این دستور را با ریپلای روی پیام کاربر اجرا کن."
    );

    return true;
  }

  await resetWarnings(
    env,
    chatId,
    Number(
      target.id
    ),
    actorId
  );

  await sendMessage(
    env,
    chatId,
    "✅ تمام اخطارهای این کاربر پاک شد."
  );

  return true;
}


/* =========================
   MUTE COMMAND
========================= */

async function handleMuteCommand(
  message,
  env,
  parsed = null
) {
  const command =
    parsed ||
    parseBotCommand(
      message?.text
    );

  if (
    !command ||
    ![
      "mute",
      "سکوت",
      "ساکت"
    ].includes(
      command.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const actorId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند کاربر را ساکت کنند."
    );

    return true;
  }

  const target =
    getTargetUser(
      message
    );

  if (!target) {
    await sendMessage(
      env,
      chatId,
      "⚠️ روی پیام کاربر ریپلای کن و سپس دستور سکوت را بفرست."
    );

    return true;
  }

  const targetId =
    Number(
      target.id
    );

  if (
    isProtectedUser(
      targetId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "🛡️ این کاربر محافظت شده است."
    );

    return true;
  }

  const seconds =
    parseDuration(
      command.args?.[0]
    ) || 300;

  const success =
    await muteUser(
      env,
      chatId,
      targetId,
      seconds
    );

  if (!success) {
    await sendMessage(
      env,
      chatId,
      "❌ عملیات سکوت انجام نشد."
    );

    return true;
  }

  await recordModerationAction(
    env,
    chatId,
    actorId,
    "mute",
    targetId,
    {
      seconds
    }
  );

  await sendMessage(
    env,
    chatId,
    [
      "🔇 <b>کاربر ساکت شد</b>",
      "",
      `👤 شناسه: <code>${targetId}</code>`,
      `⏱️ مدت: <b>${seconds}</b> ثانیه`
    ].join("\n")
  );

  return true;
}


/* =========================
   UNMUTE COMMAND
========================= */

async function handleUnmuteCommand(
  message,
  env,
  parsed = null
) {
  const command =
    parsed ||
    parseBotCommand(
      message?.text
    );

  if (
    !command ||
    ![
      "unmute",
      "رفع_سکوت",
      "بازکردن_سکوت"
    ].includes(
      command.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const actorId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران دسترسی دارند."
    );

    return true;
  }

  const target =
    getTargetUser(
      message
    );

  if (!target) {
    await sendMessage(
      env,
      chatId,
      "⚠️ روی پیام کاربر ریپلای کن."
    );

    return true;
  }

  const targetId =
    Number(
      target.id
    );

  const success =
    await unmuteUser(
      env,
      chatId,
      targetId
    );

  if (!success) {
    await sendMessage(
      env,
      chatId,
      "❌ رفع سکوت انجام نشد."
    );

    return true;
  }

  await recordModerationAction(
    env,
    chatId,
    actorId,
    "unmute",
    targetId
  );

  await sendMessage(
    env,
    chatId,
    "🔊 ✅ سکوت کاربر برداشته شد."
  );

  return true;
}


/* =========================
   BAN COMMAND
========================= */

async function handleBanCommand(
  message,
  env,
  parsed = null
) {
  const command =
    parsed ||
    parseBotCommand(
      message?.text
    );

  if (
    !command ||
    ![
      "ban",
      "بن",
      "مسدود"
    ].includes(
      command.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const actorId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند کاربر را مسدود کنند."
    );

    return true;
  }

  const target =
    getTargetUser(
      message
    );

  if (!target) {
    await sendMessage(
      env,
      chatId,
      "⚠️ دستور بن را با ریپلای روی پیام کاربر اجرا کن."
    );

    return true;
  }

  const targetId =
    Number(
      target.id
    );

  if (
    isProtectedUser(
      targetId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "🛡️ امکان مسدود کردن این کاربر وجود ندارد."
    );

    return true;
  }

  const reason =
    command.args
      ?.join(" ")
      .trim() ||
    "بدون دلیل";

  const success =
    await banUserWithLog(
      env,
      chatId,
      targetId,
      actorId,
      reason
    );

  await sendMessage(
    env,
    chatId,
    success
      ? `🚫 کاربر <code>${targetId}</code> مسدود شد.\n📝 دلیل: ${escapeHTML(
          reason
        )}`
      : "❌ مسدودسازی انجام نشد."
  );

  return true;
}


/* =========================
   UNBAN COMMAND
========================= */

async function handleUnbanCommand(
  message,
  env,
  parsed = null
) {
  const command =
    parsed ||
    parseBotCommand(
      message?.text
    );

  if (
    !command ||
    ![
      "unban",
      "رفع_بن",
      "رفع_مسدودیت"
    ].includes(
      command.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const actorId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      actorId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران دسترسی دارند."
    );

    return true;
  }

  const target =
    getTargetUser(
      message
    );

  if (!target) {
    await sendMessage(
      env,
      chatId,
      "⚠️ کاربر را با ریپلای یا شناسه مشخص کن."
    );

    return true;
  }

  const targetId =
    Number(
      target.id
    );

  const success =
    await unbanUserWithLog(
      env,
      chatId,
      targetId,
      actorId
    );

  await sendMessage(
    env,
    chatId,
    success
      ? "♻️ ✅ مسدودیت کاربر برداشته شد."
      : "❌ رفع مسدودیت انجام نشد."
  );

  return true;
}
/* ============================================================
   PART 20 — WELCOME / GOODBYE / RULES / GROUP INFORMATION
============================================================ */


/* =========================
   WELCOME MESSAGE
========================= */

async function handleWelcomeMessage(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  if (
    !chatId ||
    !message?.new_chat_members?.length
  ) {
    return false;
  }

  const settings =
    await getSecuritySettings(
      env,
      chatId
    );

  if (
    !settings.welcome
  ) {
    return false;
  }

  const title =
    escapeHTML(
      message.chat.title ||
      "گروه"
    );

  for (
    const member of
      message.new_chat_members
  ) {
    const name =
      escapeHTML(
        [
          member.first_name,
          member.last_name
        ]
          .filter(Boolean)
          .join(" ") ||
        "دوست عزیز"
      );

    const username =
      member.username
        ? `@${escapeHTML(
            member.username
          )}`
        : "";

    await registerUser(
      env,
      chatId,
      member
    );

    await sendMessage(
      env,
      chatId,
      [
        `👋 <b>خوش اومدی ${name}!</b>`,
        "",
        `🎉 به <b>${title}</b> خوش اومدی.`,
        username
          ? `🔗 ${username}`
          : "",
        "",
        "📜 قبل از فعالیت، قوانین گروه رو مطالعه کن."
      ]
        .filter(Boolean)
        .join("\n")
    );

    await addAuditLog(
      env,
      chatId,
      0,
      "welcome",
      Number(
        member.id || 0
      )
    );
  }

  return true;
}


/* =========================
   GOODBYE MESSAGE
========================= */

async function handleGoodbyeMessage(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  const member =
    message?.left_chat_member;

  if (
    !chatId ||
    !member
  ) {
    return false;
  }

  const settings =
    await getSecuritySettings(
      env,
      chatId
    );

  if (
    !settings.goodbye
  ) {
    return false;
  }

  const name =
    escapeHTML(
      [
        member.first_name,
        member.last_name
      ]
        .filter(Boolean)
        .join(" ") ||
      "کاربر"
    );

  await sendMessage(
    env,
    chatId,
    [
      `👋 <b>${name}</b> از گروه خارج شد.`,
      "",
      "امیدواریم دوباره ببینیمت 🌹"
    ].join("\n")
  );

  return true;
}


/* =========================
   RULES STORAGE
========================= */

async function getGroupRules(
  env,
  chatId
) {
  const rules =
    await kvGet(
      env,
      `rules:${chatId}`,
      null
    );

  if (
    typeof rules ===
    "string"
  ) {
    return rules;
  }

  return [
    "📜 <b>قوانین گروه</b>",
    "",
    "1️⃣ احترام به سایر اعضا الزامی است.",
    "2️⃣ ارسال اسپم ممنوع است.",
    "3️⃣ ارسال لینک تبلیغاتی بدون اجازه ممنوع است.",
    "4️⃣ محتوای نامناسب ارسال نکنید.",
    "5️⃣ از ایجاد مزاحمت برای اعضا خودداری کنید."
  ].join("\n");
}


/* =========================
   SAVE RULES
========================= */

async function saveGroupRules(
  env,
  chatId,
  rules
) {
  await kvPut(
    env,
    `rules:${chatId}`,
    String(
      rules || ""
    ).slice(
      0,
      4000
    )
  );

  return true;
}


/* =========================
   RULES COMMAND
========================= */

async function handleRulesCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed
  ) {
    return false;
  }

  if (
    ![
      "rules",
      "rule",
      "قوانین",
      "قانون"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const rules =
    await getGroupRules(
      env,
      chatId
    );

  await sendMessage(
    env,
    chatId,
    rules
  );

  return true;
}


/* =========================
   SET RULES COMMAND
========================= */

async function handleSetRulesCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "setrules",
      "تنظیم_قوانین",
      "قوانین_جدید"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند قوانین را تغییر دهند."
    );

    return true;
  }

  const rules =
    parsed.args
      ?.join(" ")
      .trim();

  if (!rules) {
    await sendMessage(
      env,
      chatId,
      "⚠️ متن قوانین را بعد از دستور وارد کن."
    );

    return true;
  }

  await saveGroupRules(
    env,
    chatId,
    rules
  );

  await addAuditLog(
    env,
    chatId,
    userId,
    "rules_updated"
  );

  await sendMessage(
    env,
    chatId,
    "✅ قوانین گروه با موفقیت به‌روزرسانی شد."
  );

  return true;
}


/* =========================
   GROUP INFORMATION
========================= */

async function getGroupInformation(
  env,
  chatId
) {
  try {
    return await telegram(
      env,
      "getChat",
      {
        chat_id:
          chatId
      }
    );

  } catch (error) {
    console.error(
      "Get group information:",
      error.message
    );

    return null;
  }
}


/* =========================
   GROUP INFO TEXT
========================= */

async function buildGroupInfoText(
  env,
  chatId
) {
  const chat =
    await getGroupInformation(
      env,
      chatId
    );

  if (!chat) {
    return "❌ دریافت اطلاعات گروه ناموفق بود.";
  }

  let memberCount =
    null;

  try {
    memberCount =
      await telegram(
        env,
        "getChatMemberCount",
        {
          chat_id:
            chatId
        }
      );
  } catch {
    memberCount =
      null;
  }

  return [
    "🏠 <b>اطلاعات گروه</b>",
    "",
    `📝 نام: <b>${escapeHTML(
      chat.title ||
      "بدون نام"
    )}</b>`,
    `🆔 شناسه: <code>${chat.id}</code>`,
    `📌 نوع: <b>${escapeHTML(
      chat.type ||
      "unknown"
    )}</b>`,
    memberCount !== null
      ? `👥 اعضا: <b>${memberCount}</b>`
      : "",
    chat.username
      ? `🔗 عمومی: @${escapeHTML(
          chat.username
        )}`
      : "🔒 گروه خصوصی"
  ]
    .filter(Boolean)
    .join("\n");
}


/* =========================
   GROUP INFO COMMAND
========================= */

async function handleGroupInfoCommand(
  message,
  env
) {
  const text =
    normalizeCommandText(
      message?.text
    );

  if (
    ![
      "/groupinfo",
      "/group",
      "/گروه",
      "/اطلاعات_گروه"
    ].includes(
      text
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  await sendMessage(
    env,
    chatId,
    await buildGroupInfoText(
      env,
      chatId
    )
  );

  return true;
}


/* =========================
   WELCOME / GOODBYE ROUTER
========================= */

async function handleMemberEvents(
  message,
  env
) {
  let handled =
    false;

  if (
    message?.new_chat_members
      ?.length
  ) {
    await handleWelcomeMessage(
      message,
      env
    );

    handled =
      true;
  }

  if (
    message?.left_chat_member
  ) {
    await handleGoodbyeMessage(
      message,
      env
    );

    handled =
      true;
  }

  return handled;
}


/* =========================
   GROUP INFORMATION ROUTER
========================= */

async function routeGroupInformation(
  message,
  env
) {
  if (
    await handleRulesCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleSetRulesCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleGroupInfoCommand(
      message,
      env
    )
  ) {
    return true;
  }

  return false;
}
/* ============================================================
   PART 21 — MESSAGE TOOLS / PIN / DELETE / CLEANUP
============================================================ */


/* =========================
   DELETE MESSAGE
========================= */

async function deleteBotMessage(
  env,
  chatId,
  messageId
) {
  if (
    !chatId ||
    !messageId
  ) {
    return false;
  }

  try {
    await telegram(
      env,
      "deleteMessage",
      {
        chat_id:
          chatId,

        message_id:
          messageId
      }
    );

    return true;

  } catch (error) {
    console.error(
      "Delete message:",
      error.message
    );

    return false;
  }
}


/* =========================
   PIN MESSAGE
========================= */

async function pinGroupMessage(
  env,
  chatId,
  messageId,
  disableNotification = false
) {
  if (
    !chatId ||
    !messageId
  ) {
    return false;
  }

  try {
    await telegram(
      env,
      "pinChatMessage",
      {
        chat_id:
          chatId,

        message_id:
          messageId,

        disable_notification:
          Boolean(
            disableNotification
          )
      }
    );

    return true;

  } catch (error) {
    console.error(
      "Pin message:",
      error.message
    );

    return false;
  }
}


/* =========================
   UNPIN MESSAGE
========================= */

async function unpinGroupMessage(
  env,
  chatId,
  messageId = null
) {
  try {
    const payload = {
      chat_id:
        chatId
    };

    if (
      messageId
    ) {
      payload.message_id =
        messageId;
    }

    await telegram(
      env,
      "unpinChatMessage",
      payload
    );

    return true;

  } catch (error) {
    console.error(
      "Unpin message:",
      error.message
    );

    return false;
  }
}


/* =========================
   DELETE COMMAND
========================= */

async function handleDeleteCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "del",
      "delete",
      "حذف",
      "پاک"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند پیام حذف کنند."
    );

    return true;
  }

  const target =
    message.reply_to_message;

  if (!target) {
    await sendMessage(
      env,
      chatId,
      "⚠️ این دستور را با ریپلای روی پیام موردنظر اجرا کن."
    );

    return true;
  }

  const success =
    await deleteBotMessage(
      env,
      chatId,
      target.message_id
    );

  if (success) {
    await addAuditLog(
      env,
      chatId,
      userId,
      "message_deleted",
      Number(
        target.from?.id || 0
      )
    );
  }

  return true;
}


/* =========================
   PIN COMMAND
========================= */

async function handlePinCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "pin",
      "سنجاق",
      "پین"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند پیام سنجاق کنند."
    );

    return true;
  }

  const target =
    message.reply_to_message;

  if (!target) {
    await sendMessage(
      env,
      chatId,
      "📌 روی پیام موردنظر ریپلای کن."
    );

    return true;
  }

  const success =
    await pinGroupMessage(
      env,
      chatId,
      target.message_id,
      false
    );

  await sendMessage(
    env,
    chatId,
    success
      ? "📌 پیام با موفقیت سنجاق شد."
      : "❌ سنجاق کردن پیام انجام نشد."
  );

  if (success) {
    await addAuditLog(
      env,
      chatId,
      userId,
      "pin",
      Number(
        target.from?.id || 0
      )
    );
  }

  return true;
}


/* =========================
   UNPIN COMMAND
========================= */

async function handleUnpinCommand(
  message,
  env
) {
  const text =
    normalizeCommandText(
      message?.text
    );

  if (
    ![
      "/unpin",
      "/رفع_سنجاق",
      "/برداشتن_سنجاق"
    ].includes(
      text
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران دسترسی دارند."
    );

    return true;
  }

  const target =
    message.reply_to_message;

  const success =
    await unpinGroupMessage(
      env,
      chatId,
      target?.message_id ||
      null
    );

  await sendMessage(
    env,
    chatId,
    success
      ? "📌 سنجاق پیام برداشته شد."
      : "❌ برداشتن سنجاق انجام نشد."
  );

  return true;
}


/* =========================
   PURGE COMMAND
========================= */

async function handlePurgeCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "purge",
      "پاکسازی",
      "پاک_سازی"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند پاکسازی انجام دهند."
    );

    return true;
  }

  const count =
    Math.max(
      1,
      Math.min(
        100,
        Number(
          parsed.args?.[0] ||
          10
        )
      )
    );

  const currentMessageId =
    Number(
      message.message_id ||
      0
    );

  if (
    !currentMessageId
  ) {
    return true;
  }

  let deleted =
    0;

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const targetId =
      currentMessageId -
      i;

    const success =
      await deleteBotMessage(
        env,
        chatId,
        targetId
      );

    if (success) {
      deleted++;
    }
  }

  await addAuditLog(
    env,
    chatId,
    userId,
    "purge",
    0,
    {
      requested:
        count,

      deleted
    }
  );

  return true;
}


/* =========================
   CLEAN OLD BOT MESSAGES
========================= */

async function cleanupStoredMessages(
  env,
  chatId
) {
  const ids =
    await kvGet(
      env,
      `cleanup:${chatId}`,
      []
    );

  if (
    !Array.isArray(
      ids
    )
  ) {
    return 0;
  }

  let deleted =
    0;

  for (
    const messageId of
      ids.slice(
        0,
        100
      )
  ) {
    const success =
      await deleteBotMessage(
        env,
        chatId,
        messageId
      );

    if (success) {
      deleted++;
    }
  }

  await kvPut(
    env,
    `cleanup:${chatId}`,
    []
  );

  return deleted;
}


/* =========================
   STORE MESSAGE FOR CLEANUP
========================= */

async function rememberMessageForCleanup(
  env,
  chatId,
  messageId
) {
  if (
    !chatId ||
    !messageId
  ) {
    return false;
  }

  const ids =
    await kvGet(
      env,
      `cleanup:${chatId}`,
      []
    );

  const list =
    Array.isArray(
      ids
    )
      ? ids
      : [];

  if (
    !list.includes(
      messageId
    )
  ) {
    list.push(
      messageId
    );
  }

  await kvPut(
    env,
    `cleanup:${chatId}`,
    list.slice(
      -100
    )
  );

  return true;
}


/* =========================
   MESSAGE TOOL ROUTER
========================= */

async function routeMessageTools(
  message,
  env
) {
  if (
    await handleDeleteCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handlePinCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleUnpinCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handlePurgeCommand(
      message,
      env
    )
  ) {
    return true;
  }

  return false;
}
/* ============================================================
   PART 22 — ADVANCED ANTI-SPAM / ANTI-FLOOD
============================================================ */


/* =========================
   SPAM CONFIGURATION
========================= */

function getDefaultAntiSpamConfig() {
  return {
    enabled: true,

    floodLimit: 6,
    floodWindow: 10,

    duplicateLimit: 3,
    duplicateWindow: 30,

    maxTextLength: 4000,

    action: "mute",

    muteSeconds: 60,

    deleteSpam: true,

    warnUser: true
  };
}


/* =========================
   GET ANTI-SPAM CONFIG
========================= */

async function getAntiSpamConfig(
  env,
  chatId
) {
  const saved =
    await kvGet(
      env,
      `antispam:${chatId}`,
      null
    );

  return {
    ...getDefaultAntiSpamConfig(),
    ...(saved || {})
  };
}


/* =========================
   SAVE ANTI-SPAM CONFIG
========================= */

async function saveAntiSpamConfig(
  env,
  chatId,
  config
) {
  const defaults =
    getDefaultAntiSpamConfig();

  const normalized = {
    ...defaults,
    ...(config || {})
  };

  normalized.floodLimit =
    Math.max(
      2,
      Math.min(
        50,
        Number(
          normalized.floodLimit
        )
      )
    );

  normalized.floodWindow =
    Math.max(
      3,
      Math.min(
        120,
        Number(
          normalized.floodWindow
        )
      )
    );

  normalized.duplicateLimit =
    Math.max(
      2,
      Math.min(
        20,
        Number(
          normalized.duplicateLimit
        )
      )
    );

  normalized.duplicateWindow =
    Math.max(
      5,
      Math.min(
        300,
        Number(
          normalized.duplicateWindow
        )
      )
    );

  normalized.maxTextLength =
    Math.max(
      100,
      Math.min(
        10000,
        Number(
          normalized.maxTextLength
        )
      )
    );

  normalized.muteSeconds =
    Math.max(
      10,
      Math.min(
        86400,
        Number(
          normalized.muteSeconds
        )
      )
    );

  normalized.enabled =
    Boolean(
      normalized.enabled
    );

  normalized.deleteSpam =
    Boolean(
      normalized.deleteSpam
    );

  normalized.warnUser =
    Boolean(
      normalized.warnUser
    );

  await kvPut(
    env,
    `antispam:${chatId}`,
    normalized
  );

  return normalized;
}


/* =========================
   MESSAGE HISTORY
========================= */

async function getMessageHistory(
  env,
  chatId,
  userId
) {
  const history =
    await kvGet(
      env,
      `msg_history:${chatId}:${userId}`,
      []
    );

  return Array.isArray(
    history
  )
    ? history
    : [];
}


/* =========================
   SAVE MESSAGE HISTORY
========================= */

async function saveMessageHistory(
  env,
  chatId,
  userId,
  history
) {
  await kvPut(
    env,
    `msg_history:${chatId}:${userId}`,
    history.slice(
      -50
    )
  );
}


/* =========================
   RECORD MESSAGE
========================= */

async function recordUserMessage(
  env,
  chatId,
  userId,
  text,
  messageId
) {
  if (
    !chatId ||
    !userId
  ) {
    return;
  }

  const history =
    await getMessageHistory(
      env,
      chatId,
      userId
    );

  history.push({
    messageId:
      Number(
        messageId || 0
      ),

    text:
      String(
        text || ""
      ).slice(
        0,
        1000
      ),

    timestamp:
      Date.now()
  });

  await saveMessageHistory(
    env,
    chatId,
    userId,
    history
  );
}


/* =========================
   RECENT MESSAGE COUNT
========================= */

function countRecentMessages(
  history,
  windowSeconds
) {
  const now =
    Date.now();

  const limit =
    Number(
      windowSeconds
    ) * 1000;

  return history.filter(
    item =>
      now -
        Number(
          item.timestamp || 0
        ) <=
      limit
  );
}


/* =========================
   DUPLICATE MESSAGE CHECK
========================= */

function isDuplicateSpam(
  history,
  text,
  windowSeconds,
  duplicateLimit
) {
  const normalized =
    normalizeSpamText(
      text
    );

  if (!normalized) {
    return false;
  }

  const recent =
    countRecentMessages(
      history,
      windowSeconds
    );

  let count =
    0;

  for (
    const item of recent
  ) {
    if (
      normalizeSpamText(
        item.text
      ) ===
      normalized
    ) {
      count++;
    }
  }

  return (
    count >=
    duplicateLimit
  );
}


/* =========================
   NORMALIZE SPAM TEXT
========================= */

function normalizeSpamText(
  text
) {
  return String(
    text || ""
  )
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


/* =========================
   FLOOD DETECTION
========================= */

async function detectFlood(
  env,
  chatId,
  userId
) {
  const config =
    await getAntiSpamConfig(
      env,
      chatId
    );

  if (
    !config.enabled
  ) {
    return false;
  }

  const history =
    await getMessageHistory(
      env,
      chatId,
      userId
    );

  const recent =
    countRecentMessages(
      history,
      config.floodWindow
    );

  return (
    recent.length >=
    config.floodLimit
  );
}


/* =========================
   DUPLICATE DETECTION
========================= */

async function detectDuplicateSpam(
  env,
  chatId,
  userId,
  text
) {
  const config =
    await getAntiSpamConfig(
      env,
      chatId
    );

  if (
    !config.enabled
  ) {
    return false;
  }

  const history =
    await getMessageHistory(
      env,
      chatId,
      userId
    );

  return isDuplicateSpam(
    history,
    text,
    config.duplicateWindow,
    config.duplicateLimit
  );
}


/* =========================
   LONG MESSAGE DETECTION
========================= */

async function detectOversizedMessage(
  env,
  chatId,
  text
) {
  const config =
    await getAntiSpamConfig(
      env,
      chatId
    );

  if (
    !config.enabled
  ) {
    return false;
  }

  return (
    String(
      text || ""
    ).length >
    config.maxTextLength
  );
}


/* =========================
   SPAM ACTION
========================= */

async function performSpamAction(
  message,
  env,
  reason
) {
  const chatId =
    message?.chat?.id;

  const userId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  if (
    isProtectedUser(
      userId
    )
  ) {
    return false;
  }

  const config =
    await getAntiSpamConfig(
      env,
      chatId
    );

  if (
    config.deleteSpam &&
    message.message_id
  ) {
    await deleteBotMessage(
      env,
      chatId,
      message.message_id
    );
  }

  if (
    config.warnUser
  ) {
    await addWarning(
      env,
      chatId,
      userId,
      0,
      reason
    );
  }

  if (
    config.action ===
    "mute"
  ) {
    await muteUser(
      env,
      chatId,
      userId,
      config.muteSeconds
    );
  }

  await addAuditLog(
    env,
    chatId,
    0,
    "spam_deleted",
    userId,
    {
      reason
    }
  );

  return true;
}


/* =========================
   ANTI-SPAM PROCESSOR
========================= */

async function processAntiSpam(
  message,
  env
) {
  if (
    !message ||
    message.from?.is_bot
  ) {
    return false;
  }

  const chat =
    message.chat;

  if (
    !chat ||
    (
      chat.type !==
        "group" &&
      chat.type !==
        "supergroup"
    )
  ) {
    return false;
  }

  const chatId =
    chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (!userId) {
    return false;
  }

  if (
    isProtectedUser(
      userId
    )
  ) {
    return false;
  }

  const text =
    String(
      message.text ||
      message.caption ||
      ""
    ).trim();

  if (!text) {
    return false;
  }

  const config =
    await getAntiSpamConfig(
      env,
      chatId
    );

  if (
    !config.enabled
  ) {
    return false;
  }

  const oversized =
    await detectOversizedMessage(
      env,
      chatId,
      text
    );

  if (oversized) {
    await recordUserMessage(
      env,
      chatId,
      userId,
      text,
      message.message_id
    );

    return performSpamAction(
      message,
      env,
      "پیام بیش از حد مجاز"
    );
  }

  const duplicate =
    await detectDuplicateSpam(
      env,
      chatId,
      userId,
      text
    );

  if (duplicate) {
    await recordUserMessage(
      env,
      chatId,
      userId,
      text,
      message.message_id
    );

    return performSpamAction(
      message,
      env,
      "ارسال پیام تکراری"
    );
  }

  const history =
    await getMessageHistory(
      env,
      chatId,
      userId
    );

  const recent =
    countRecentMessages(
      history,
      config.floodWindow
    );

  if (
    recent.length >=
    config.floodLimit
  ) {
    await recordUserMessage(
      env,
      chatId,
      userId,
      text,
      message.message_id
    );

    return performSpamAction(
      message,
      env,
      "ارسال پیام‌های پشت سرهم"
    );
  }

  await recordUserMessage(
    env,
    chatId,
    userId,
    text,
    message.message_id
  );

  return false;
}


/* =========================
   ANTI-SPAM COMMAND
========================= */

async function handleAntiSpamCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "antispam",
      "ضداسپم",
      "ضد_اسپم"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند تنظیمات ضداسپم را تغییر دهند."
    );

    return true;
  }

  const config =
    await getAntiSpamConfig(
      env,
      chatId
    );

  const option =
    parsed.args?.[0];

  if (
    option ===
    "on" ||
    option ===
    "فعال"
  ) {
    config.enabled =
      true;

    await saveAntiSpamConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      "🟢 سیستم ضداسپم فعال شد."
    );

    return true;
  }

  if (
    option ===
    "off" ||
    option ===
    "خاموش"
  ) {
    config.enabled =
      false;

    await saveAntiSpamConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      "🔴 سیستم ضداسپم خاموش شد."
    );

    return true;
  }

  await sendMessage(
    env,
    chatId,
    [
      "🛡️ <b>تنظیمات ضداسپم</b>",
      "",
      `وضعیت: ${
        config.enabled
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`,
      `🌊 حد فلود: <b>${config.floodLimit}</b> پیام`,
      `⏱️ بازه فلود: <b>${config.floodWindow}</b> ثانیه`,
      `🔁 حد پیام تکراری: <b>${config.duplicateLimit}</b>`,
      `⏱️ بازه تکرار: <b>${config.duplicateWindow}</b> ثانیه`,
      `📏 حداکثر طول پیام: <b>${config.maxTextLength}</b> کاراکتر`,
      `🔇 زمان سکوت: <b>${config.muteSeconds}</b> ثانیه`
    ].join("\n")
  );

  return true;
}


/* =========================
   ANTI-SPAM ROUTER
========================= */

async function routeAntiSpam(
  message,
  env
) {
  if (
    await handleAntiSpamCommand(
      message,
      env
    )
  ) {
    return true;
  }

  return await processAntiSpam(
    message,
    env
  );
}
/* ============================================================
   PART 23 — LINK / ADVERTISEMENT / URL PROTECTION
============================================================ */


/* =========================
   LINK CONFIG
========================= */

function getDefaultLinkConfig() {
  return {
    enabled: true,

    allowTelegram: false,
    allowYouTube: true,
    allowInstagram: true,

    allowAdmins: true,

    deleteMessage: true,
    warnUser: true,

    muteOnViolation: false,
    muteSeconds: 120
  };
}


/* =========================
   GET LINK CONFIG
========================= */

async function getLinkConfig(
  env,
  chatId
) {
  const saved =
    await kvGet(
      env,
      `links:${chatId}`,
      null
    );

  return {
    ...getDefaultLinkConfig(),
    ...(saved || {})
  };
}


/* =========================
   SAVE LINK CONFIG
========================= */

async function saveLinkConfig(
  env,
  chatId,
  config
) {
  const normalized = {
    ...getDefaultLinkConfig(),
    ...(config || {})
  };

  await kvPut(
    env,
    `links:${chatId}`,
    normalized
  );

  return normalized;
}


/* =========================
   URL DETECTION
========================= */

function containsURL(
  text
) {
  if (!text) {
    return false;
  }

  const urlPattern =
    /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/)[^\s]+/i;

  return urlPattern.test(
    String(text)
  );
}


/* =========================
   EXTRACT URLS
========================= */

function extractURLs(
  text
) {
  if (!text) {
    return [];
  }

  const pattern =
    /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/)[^\s<>"']+/gi;

  return String(
    text
  ).match(
    pattern
  ) || [];
}


/* =========================
   DOMAIN EXTRACTION
========================= */

function extractDomain(
  url
) {
  try {
    let value =
      String(
        url
      ).trim();

    if (
      value.startsWith(
        "www."
      )
    ) {
      value =
        `https://${value}`;
    }

    if (
      value.startsWith(
        "t.me/"
      ) ||
      value.startsWith(
        "telegram.me/"
      )
    ) {
      value =
        `https://${value}`;
    }

    const parsed =
      new URL(
        value
      );

    return parsed.hostname
      .toLowerCase()
      .replace(
        /^www\./,
        ""
      );

  } catch {
    return "";
  }
}


/* =========================
   ALLOWED DOMAIN CHECK
========================= */

function isAllowedLinkDomain(
  domain,
  config
) {
  if (!domain) {
    return false;
  }

  if (
    config.allowTelegram &&
    (
      domain ===
        "t.me" ||
      domain ===
        "telegram.me" ||
      domain ===
        "telegram.org"
    )
  ) {
    return true;
  }

  if (
    config.allowYouTube &&
    (
      domain ===
        "youtube.com" ||
      domain ===
        "youtu.be"
    )
  ) {
    return true;
  }

  if (
    config.allowInstagram &&
    (
      domain ===
        "instagram.com"
    )
  ) {
    return true;
  }

  return false;
}


/* =========================
   CHECK LINK VIOLATION
========================= */

function findBlockedLinks(
  text,
  config
) {
  const urls =
    extractURLs(
      text
    );

  if (
    !urls.length
  ) {
    return [];
  }

  return urls.filter(
    url => {
      const domain =
        extractDomain(
          url
        );

      return !isAllowedLinkDomain(
        domain,
        config
      );
    }
  );
}


/* =========================
   LINK VIOLATION ACTION
========================= */

async function performLinkViolation(
  message,
  env,
  urls
) {
  const chatId =
    message?.chat?.id;

  const userId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  if (
    isProtectedUser(
      userId
    )
  ) {
    return false;
  }

  const config =
    await getLinkConfig(
      env,
      chatId
    );

  if (
    config.deleteMessage &&
    message.message_id
  ) {
    await deleteBotMessage(
      env,
      chatId,
      message.message_id
    );
  }

  if (
    config.warnUser
  ) {
    await addWarning(
      env,
      chatId,
      userId,
      0,
      "ارسال لینک غیرمجاز"
    );
  }

  if (
    config.muteOnViolation
  ) {
    await muteUser(
      env,
      chatId,
      userId,
      config.muteSeconds
    );
  }

  await addAuditLog(
    env,
    chatId,
    0,
    "link_deleted",
    userId,
    {
      urls:
        urls.slice(
          0,
          5
        )
    }
  );

  return true;
}


/* =========================
   LINK PROCESSOR
========================= */

async function processLinkProtection(
  message,
  env
) {
  if (
    !message ||
    message.from?.is_bot
  ) {
    return false;
  }

  const chat =
    message.chat;

  if (
    !chat ||
    (
      chat.type !==
        "group" &&
      chat.type !==
        "supergroup"
    )
  ) {
    return false;
  }

  const text =
    String(
      message.text ||
      message.caption ||
      ""
    );

  if (
    !containsURL(
      text
    )
  ) {
    return false;
  }

  const chatId =
    chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (!userId) {
    return false;
  }

  const config =
    await getLinkConfig(
      env,
      chatId
    );

  if (
    !config.enabled
  ) {
    return false;
  }

  if (
    config.allowAdmins &&
    await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    return false;
  }

  const blocked =
    findBlockedLinks(
      text,
      config
    );

  if (
    !blocked.length
  ) {
    return false;
  }

  return await performLinkViolation(
    message,
    env,
    blocked
  );
}


/* =========================
   LINK COMMAND
========================= */

async function handleLinkCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "links",
      "link",
      "antilink",
      "ضدلینک",
      "لینک",
      "تنظیم_لینک"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند تنظیمات لینک را تغییر دهند."
    );

    return true;
  }

  const config =
    await getLinkConfig(
      env,
      chatId
    );

  const option =
    parsed.args?.[0];

  if (
    option ===
      "on" ||
    option ===
      "فعال"
  ) {
    config.enabled =
      true;

    await saveLinkConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      "🟢 سیستم ضدلینک فعال شد."
    );

    return true;
  }

  if (
    option ===
      "off" ||
    option ===
      "خاموش"
  ) {
    config.enabled =
      false;

    await saveLinkConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      "🔴 سیستم ضدلینک خاموش شد."
    );

    return true;
  }

  await sendMessage(
    env,
    chatId,
    [
      "🔗 <b>تنظیمات لینک</b>",
      "",
      `وضعیت: ${
        config.enabled
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`,
      `📱 تلگرام: ${
        config.allowTelegram
          ? "🟢 مجاز"
          : "🔴 غیرمجاز"
      }`,
      `▶️ یوتیوب: ${
        config.allowYouTube
          ? "🟢 مجاز"
          : "🔴 غیرمجاز"
      }`,
      `📸 اینستاگرام: ${
        config.allowInstagram
          ? "🟢 مجاز"
          : "🔴 غیرمجاز"
      }`,
      `🛡️ مدیران مستثنی: ${
        config.allowAdmins
          ? "🟢 بله"
          : "🔴 خیر"
      }`,
      `🧹 حذف لینک: ${
        config.deleteMessage
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`,
      `⚠️ اخطار: ${
        config.warnUser
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`
    ].join("\n")
  );

  return true;
}


/* =========================
   LINK PROTECTION ROUTER
========================= */

async function routeLinkProtection(
  message,
  env
) {
  if (
    await handleLinkCommand(
      message,
      env
    )
  ) {
    return true;
  }

  return await processLinkProtection(
    message,
    env
  );
}
/* ============================================================
   PART 24 — USER REPORT / MODERATION REPORT SYSTEM
============================================================ */


/* =========================
   REPORT CONFIG
========================= */

function getDefaultReportConfig() {
  return {
    enabled: true,

    notifyAdmins: true,

    deleteReportCommand: false,

    maxReasonLength: 500,

    cooldownSeconds: 30
  };
}


/* =========================
   GET REPORT CONFIG
========================= */

async function getReportConfig(
  env,
  chatId
) {
  const saved =
    await kvGet(
      env,
      `reports_config:${chatId}`,
      null
    );

  return {
    ...getDefaultReportConfig(),
    ...(saved || {})
  };
}


/* =========================
   SAVE REPORT CONFIG
========================= */

async function saveReportConfig(
  env,
  chatId,
  config
) {
  const normalized = {
    ...getDefaultReportConfig(),
    ...(config || {})
  };

  normalized.enabled =
    Boolean(
      normalized.enabled
    );

  normalized.notifyAdmins =
    Boolean(
      normalized.notifyAdmins
    );

  normalized.deleteReportCommand =
    Boolean(
      normalized.deleteReportCommand
    );

  normalized.maxReasonLength =
    Math.max(
      50,
      Math.min(
        2000,
        Number(
          normalized.maxReasonLength ||
          500
        )
      )
    );

  normalized.cooldownSeconds =
    Math.max(
      5,
      Math.min(
        3600,
        Number(
          normalized.cooldownSeconds ||
          30
        )
      )
    );

  await kvPut(
    env,
    `reports_config:${chatId}`,
    normalized
  );

  return normalized;
}


/* =========================
   REPORT KEY
========================= */

function reportCooldownKey(
  chatId,
  userId
) {
  return `report_cooldown:${chatId}:${userId}`;
}


/* =========================
   CHECK REPORT COOLDOWN
========================= */

async function isReportOnCooldown(
  env,
  chatId,
  userId
) {
  const value =
    await kvGet(
      env,
      reportCooldownKey(
        chatId,
        userId
      ),
      null
    );

  if (!value) {
    return false;
  }

  const expires =
    Number(
      value.expiresAt || 0
    );

  if (
    expires <=
    Date.now()
  ) {
    await kvDelete(
      env,
      reportCooldownKey(
        chatId,
        userId
      )
    );

    return false;
  }

  return true;
}


/* =========================
   SET REPORT COOLDOWN
========================= */

async function setReportCooldown(
  env,
  chatId,
  userId,
  seconds
) {
  await kvPut(
    env,
    reportCooldownKey(
      chatId,
      userId
    ),
    {
      expiresAt:
        Date.now() +
        Number(
          seconds
        ) *
        1000
    }
  );
}


/* =========================
   REPORT ID
========================= */

function createReportId() {
  return [
    Date.now().toString(
      36
    ),

    Math.random()
      .toString(36)
      .slice(
        2,
        8
      )
  ].join(
    "-"
  );
}


/* =========================
   SAVE REPORT
========================= */

async function saveReport(
  env,
  chatId,
  report
) {
  const id =
    report.id;

  await kvPut(
    env,
    `report:${chatId}:${id}`,
    report
  );

  const index =
    await kvGet(
      env,
      `reports_index:${chatId}`,
      []
    );

  const list =
    Array.isArray(
      index
    )
      ? index
      : [];

  list.unshift(
    id
  );

  await kvPut(
    env,
    `reports_index:${chatId}`,
    list.slice(
      0,
      100
    )
  );

  return id;
}


/* =========================
   GET REPORT
========================= */

async function getReport(
  env,
  chatId,
  reportId
) {
  return await kvGet(
    env,
    `report:${chatId}:${reportId}`,
    null
  );
}


/* =========================
   GET REPORT LIST
========================= */

async function getReportList(
  env,
  chatId
) {
  const index =
    await kvGet(
      env,
      `reports_index:${chatId}`,
      []
    );

  if (
    !Array.isArray(
      index
    )
  ) {
    return [];
  }

  const reports = [];

  for (
    const id of
      index.slice(
        0,
        50
      )
  ) {
    const report =
      await getReport(
        env,
        chatId,
        id
      );

    if (
      report
    ) {
      reports.push(
        report
      );
    }
  }

  return reports;
}


/* =========================
   CREATE REPORT
========================= */

async function createUserReport(
  message,
  env,
  reason = ""
) {
  const chatId =
    message?.chat?.id;

  const reporterId =
    Number(
      message?.from?.id ||
      0
    );

  const target =
    message?.reply_to_message;

  if (
    !chatId ||
    !reporterId ||
    !target
  ) {
    return null;
  }

  const targetId =
    Number(
      target.from?.id ||
      0
    );

  if (
    !targetId ||
    targetId ===
      reporterId
  ) {
    return null;
  }

  const config =
    await getReportConfig(
      env,
      chatId
    );

  if (
    !config.enabled
  ) {
    return null;
  }

  if (
    await isReportOnCooldown(
      env,
      chatId,
      reporterId
    )
  ) {
    return null;
  }

  const cleanReason =
    String(
      reason ||
      "بدون دلیل"
    )
      .trim()
      .slice(
        0,
        config.maxReasonLength
      );

  const report = {
    id:
      createReportId(),

    chatId:
      Number(
        chatId
      ),

    reporterId,

    targetId,

    targetMessageId:
      Number(
        target.message_id ||
        0
      ),

    reason:
      cleanReason,

    status:
      "open",

    createdAt:
      Date.now()
  };

  await saveReport(
    env,
    chatId,
    report
  );

  await setReportCooldown(
    env,
    chatId,
    reporterId,
    config.cooldownSeconds
  );

  await incrementStat(
    env,
    chatId,
    "reports"
  );

  await addAuditLog(
    env,
    chatId,
    reporterId,
    "report_created",
    targetId,
    {
      reportId:
        report.id,

      reason:
        cleanReason
    }
  );

  return report;
}


/* =========================
   FIND ADMIN IDS
========================= */

async function getGroupAdminIds(
  env,
  chatId
) {
  try {
    const admins =
      await telegram(
        env,
        "getChatAdministrators",
        {
          chat_id:
            chatId
        }
      );

    if (
      !Array.isArray(
        admins
      )
    ) {
      return [];
    }

    return admins
      .map(
        admin =>
          Number(
            admin.user?.id ||
            0
          )
      )
      .filter(
        Boolean
      );

  } catch (error) {
    console.error(
      "Get group admins:",
      error.message
    );

    return [];
  }
}


/* =========================
   SEND REPORT TO ADMINS
========================= */

async function notifyAdminsAboutReport(
  env,
  report
) {
  const config =
    await getReportConfig(
      env,
      report.chatId
    );

  if (
    !config.notifyAdmins
  ) {
    return false;
  }

  const adminIds =
    await getGroupAdminIds(
      env,
      report.chatId
    );

  if (
    !adminIds.length
  ) {
    return false;
  }

  const text = [
    "🚨 <b>گزارش جدید</b>",
    "",
    `🆔 گزارش: <code>${escapeHTML(
      report.id
    )}</code>`,
    `👤 گزارش‌دهنده: <code>${report.reporterId}</code>`,
    `🎯 کاربر گزارش‌شده: <code>${report.targetId}</code>`,
    `💬 پیام: <code>${report.targetMessageId}</code>`,
    `📝 دلیل: ${escapeHTML(
      report.reason
    )}`,
    "",
    "⏳ وضعیت: <b>باز</b>"
  ].join(
    "\n"
  );

  for (
    const adminId of
      adminIds
  ) {
    try {
      await sendMessage(
        env,
        adminId,
        text
      );
    } catch (
      error
    ) {
      console.error(
        "Notify admin:",
        error.message
      );
    }
  }

  return true;
}


/* =========================
   REPORT COMMAND
========================= */

async function handleReportCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "report",
      "گزارش",
      "ریپورت"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chat =
    message.chat;

  if (
    !chat ||
    (
      chat.type !==
        "group" &&
      chat.type !==
        "supergroup"
    )
  ) {
    await sendMessage(
      env,
      message.chat.id,
      "⚠️ گزارش فقط داخل گروه قابل استفاده است."
    );

    return true;
  }

  const reason =
    parsed.args
      ?.join(" ")
      .trim() ||
    "بدون دلیل";

  const report =
    await createUserReport(
      message,
      env,
      reason
    );

  if (!report) {
    await sendMessage(
      env,
      chat.id,
      "⚠️ گزارش ثبت نشد. باید روی پیام کاربر ریپلای کرده باشی و ممکن است محدودیت زمانی گزارش فعال باشد."
    );

    return true;
  }

  await notifyAdminsAboutReport(
    env,
    report
  );

  await sendMessage(
    env,
    chat.id,
    [
      "✅ <b>گزارش ثبت شد.</b>",
      "",
      "👮 مدیران گروه بررسی خواهند کرد.",
      `🆔 کد گزارش: <code>${report.id}</code>`
    ].join(
      "\n"
    )
  );

  return true;
}


/* =========================
   REPORT LIST COMMAND
========================= */

async function handleReportsCommand(
  message,
  env
) {
  const text =
    normalizeCommandText(
      message?.text
    );

  if (
    ![
      "/reports",
      "/گزارشات",
      "/لیست_گزارشات"
    ].includes(
      text
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند گزارش‌ها را مشاهده کنند."
    );

    return true;
  }

  const reports =
    await getReportList(
      env,
      chatId
    );

  const openReports =
    reports.filter(
      report =>
        report.status ===
        "open"
    );

  if (
    !openReports.length
  ) {
    await sendMessage(
      env,
      chatId,
      "📭 هیچ گزارش بازی وجود ندارد."
    );

    return true;
  }

  const lines = [
    "🚨 <b>گزارش‌های باز</b>",
    ""
  ];

  for (
    const report of
      openReports.slice(
        0,
        15
      )
  ) {
    lines.push(
      `🆔 <code>${escapeHTML(
        report.id
      )}</code>`,

      `👤 گزارش‌دهنده: <code>${report.reporterId}</code>`,

      `🎯 کاربر: <code>${report.targetId}</code>`,

      `📝 دلیل: ${escapeHTML(
        report.reason
      )}`,

      ""
    );
  }

  await sendMessage(
    env,
    chatId,
    lines.join(
      "\n"
    )
  );

  return true;
}


/* =========================
   CLOSE REPORT
========================= */

async function closeReport(
  env,
  chatId,
  reportId,
  adminId
) {
  const report =
    await getReport(
      env,
      chatId,
      reportId
    );

  if (
    !report
  ) {
    return false;
  }

  report.status =
    "closed";

  report.closedBy =
    Number(
      adminId
    );

  report.closedAt =
    Date.now();

  await kvPut(
    env,
    `report:${chatId}:${reportId}`,
    report
  );

  await addAuditLog(
    env,
    chatId,
    adminId,
    "report_closed",
    report.targetId,
    {
      reportId
    }
  );

  return true;
}


/* =========================
   CLOSE REPORT COMMAND
========================= */

async function handleCloseReportCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "closereport",
      "بستن_گزارش",
      "بستن_ریپورت"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const adminId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      adminId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران دسترسی دارند."
    );

    return true;
  }

  const reportId =
    parsed.args?.[0];

  if (!reportId) {
    await sendMessage(
      env,
      chatId,
      "⚠️ کد گزارش را وارد کن."
    );

    return true;
  }

  const success =
    await closeReport(
      env,
      chatId,
      reportId,
      adminId
    );

  await sendMessage(
    env,
    chatId,
    success
      ? "✅ گزارش بسته شد."
      : "❌ گزارش پیدا نشد."
  );

  return true;
}


/* =========================
   REPORT ROUTER
========================= */

async function routeReportSystem(
  message,
  env
) {
  if (
    await handleReportCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleReportsCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleCloseReportCommand(
      message,
      env
    )
  ) {
    return true;
  }

  return false;
}
/* ============================================================
   PART 25 — ADVANCED INLINE ADMIN PANEL
   Persian + English Commands
============================================================ */


/* =========================
   ADMIN PANEL KEYBOARD
========================= */

function buildAdminPanelKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "🛡️ امنیت",
          callback_data: "panel:security"
        },
        {
          text: "⚙️ تنظیمات",
          callback_data: "panel:settings"
        }
      ],
      [
        {
          text: "📊 آمار",
          callback_data: "panel:stats"
        },
        {
          text: "🚨 گزارش‌ها",
          callback_data: "panel:reports"
        }
      ],
      [
        {
          text: "🔗 ضدلینک",
          callback_data: "panel:links"
        },
        {
          text: "🛑 ضداسپم",
          callback_data: "panel:antispam"
        }
      ],
      [
        {
          text: "🔄 بروزرسانی",
          callback_data: "panel:refresh"
        }
      ]
    ]
  };
}


/* =========================
   SECURITY KEYBOARD
========================= */

function buildSecurityKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "🛑 ضداسپم",
          callback_data: "security:antispam"
        },
        {
          text: "🔗 ضدلینک",
          callback_data: "security:links"
        }
      ],
      [
        {
          text: "👮 مدیریت اعضا",
          callback_data: "security:members"
        },
        {
          text: "🚨 گزارش‌ها",
          callback_data: "security:reports"
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


/* =========================
   SETTINGS KEYBOARD
========================= */

function buildSettingsKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "👋 خوشامدگویی",
          callback_data: "settings:welcome"
        }
      ],
      [
        {
          text: "📢 اعلان‌ها",
          callback_data: "settings:notifications"
        }
      ],
      [
        {
          text: "🧹 پاکسازی",
          callback_data: "settings:cleanup"
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


/* =========================
   SEND ADMIN PANEL
========================= */

async function sendAdminPanel(
  env,
  chatId,
  userId
) {
  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران گروه به پنل مدیریت دسترسی دارند."
    );

    return false;
  }

  const text = [
    "🛡️ <b>پنل مدیریت حرفه‌ای</b>",
    "",
    "از منوی زیر بخش موردنظر را انتخاب کن.",
    "",
    "⚙️ تنظیمات گروه",
    "🛑 سیستم‌های امنیتی",
    "📊 آمار و گزارش‌ها",
    "🔗 مدیریت لینک‌ها",
    "🚨 مدیریت گزارش کاربران"
  ].join(
    "\n"
  );

  try {
    await telegram(
      env,
      "sendMessage",
      {
        chat_id:
          chatId,

        text,

        parse_mode:
          "HTML",

        reply_markup:
          buildAdminPanelKeyboard()
      }
    );

    return true;

  } catch (error) {
    console.error(
      "Admin panel:",
      error.message
    );

    return false;
  }
}


/* =========================
   PANEL COMMAND
========================= */

async function handleAdminPanelCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "panel",
      "admin",
      "adminpanel",
      "پنل",
      "پنل_مدیریت",
      "مدیریت"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  await sendAdminPanel(
    env,
    chatId,
    userId
  );

  return true;
}


/* =========================
   SECURITY PANEL
========================= */

async function showSecurityPanel(
  env,
  chatId,
  messageId
) {
  const text = [
    "🛡️ <b>مرکز امنیت گروه</b>",
    "",
    "از این قسمت می‌توانی سیستم‌های حفاظتی گروه را مدیریت کنی.",
    "",
    "🛑 ضداسپم",
    "🔗 ضدلینک",
    "👮 مدیریت اعضا",
    "🚨 گزارش کاربران"
  ].join(
    "\n"
  );

  return await telegram(
    env,
    "editMessageText",
    {
      chat_id:
        chatId,

      message_id:
        messageId,

      text,

      parse_mode:
        "HTML",

      reply_markup:
        buildSecurityKeyboard()
    }
  );
}


/* =========================
   SETTINGS PANEL
========================= */

async function showSettingsPanel(
  env,
  chatId,
  messageId
) {
  const text = [
    "⚙️ <b>تنظیمات گروه</b>",
    "",
    "تنظیمات موردنظر را انتخاب کن."
  ].join(
    "\n"
  );

  return await telegram(
    env,
    "editMessageText",
    {
      chat_id:
        chatId,

      message_id:
        messageId,

      text,

      parse_mode:
        "HTML",

      reply_markup:
        buildSettingsKeyboard()
    }
  );
}


/* =========================
   ANTISPAM PANEL
========================= */

async function showAntispamPanel(
  env,
  chatId,
  messageId
) {
  const config =
    await getAntiSpamConfig(
      env,
      chatId
    );

  const status =
    config.enabled
      ? "🟢 فعال"
      : "🔴 خاموش";

  const text = [
    "🛑 <b>سیستم ضداسپم</b>",
    "",
    `وضعیت: ${status}`,
    "",
    `🌊 حد فلود: <b>${config.floodLimit}</b>`,
    `⏱️ بازه: <b>${config.floodWindow}</b> ثانیه`,
    `🔁 پیام تکراری: <b>${config.duplicateLimit}</b>`,
    `🔇 سکوت: <b>${config.muteSeconds}</b> ثانیه`
  ].join(
    "\n"
  );

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: config.enabled
            ? "🔴 خاموش کردن"
            : "🟢 فعال کردن",

          callback_data:
            "antispam:toggle"
        }
      ],
      [
        {
          text: "⬅️ بازگشت",
          callback_data:
            "panel:security"
        }
      ]
    ]
  };

  return await telegram(
    env,
    "editMessageText",
    {
      chat_id:
        chatId,

      message_id:
        messageId,

      text,

      parse_mode:
        "HTML",

      reply_markup:
        keyboard
    }
  );
}


/* =========================
   LINK PANEL
========================= */

async function showLinkPanel(
  env,
  chatId,
  messageId
) {
  const config =
    await getLinkConfig(
      env,
      chatId
    );

  const text = [
    "🔗 <b>مدیریت لینک</b>",
    "",
    `وضعیت: ${
      config.enabled
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    "",
    `📱 تلگرام: ${
      config.allowTelegram
        ? "🟢 مجاز"
        : "🔴 غیرمجاز"
    }`,
    `▶️ یوتیوب: ${
      config.allowYouTube
        ? "🟢 مجاز"
        : "🔴 غیرمجاز"
    }`,
    `📸 اینستاگرام: ${
      config.allowInstagram
        ? "🟢 مجاز"
        : "🔴 غیرمجاز"
    }`
  ].join(
    "\n"
  );

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: config.enabled
            ? "🔴 خاموش"
            : "🟢 فعال",

          callback_data:
            "links:toggle"
        }
      ],
      [
        {
          text: "⬅️ بازگشت",
          callback_data:
            "panel:security"
        }
      ]
    ]
  };

  return await telegram(
    env,
    "editMessageText",
    {
      chat_id:
        chatId,

      message_id:
        messageId,

      text,

      parse_mode:
        "HTML",

      reply_markup:
        keyboard
    }
  );
}


/* =========================
   REPORT PANEL
========================= */

async function showReportPanel(
  env,
  chatId,
  messageId
) {
  const reports =
    await getReportList(
      env,
      chatId
    );

  const openReports =
    reports.filter(
      report =>
        report.status ===
        "open"
    );

  const text = [
    "🚨 <b>مرکز گزارش‌ها</b>",
    "",
    `📋 گزارش‌های باز: <b>${openReports.length}</b>`,
    "",
    openReports.length
      ? "برای مشاهده جزئیات از دستور گزارش‌ها استفاده کن."
      : "📭 گزارش بازی وجود ندارد."
  ].join(
    "\n"
  );

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🔄 بروزرسانی",
          callback_data:
            "panel:reports"
        }
      ],
      [
        {
          text: "⬅️ بازگشت",
          callback_data:
            "panel:main"
        }
      ]
    ]
  };

  return await telegram(
    env,
    "editMessageText",
    {
      chat_id:
        chatId,

      message_id:
        messageId,

      text,

      parse_mode:
        "HTML",

      reply_markup:
        keyboard
    }
  );
}


/* =========================
   MAIN PANEL CALLBACK
========================= */

async function handleAdminPanelCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data ||
      ""
    );

  if (
    !data.startsWith(
      "panel:"
    ) &&
    !data.startsWith(
      "security:"
    ) &&
    !data.startsWith(
      "settings:"
    ) &&
    !data.startsWith(
      "antispam:"
    ) &&
    !data.startsWith(
      "links:"
    )
  ) {
    return false;
  }

  const chatId =
    callback.message?.chat?.id;

  const messageId =
    callback.message?.message_id;

  const userId =
    Number(
      callback.from?.id ||
      0
    );

  if (
    !chatId ||
    !messageId
  ) {
    return true;
  }

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            "⛔ فقط مدیران دسترسی دارند.",

          show_alert:
            true
        }
      );
    } catch {}

    return true;
  }


  /* =========================
     MAIN PANEL
  ========================= */

  if (
    data ===
    "panel:main"
  ) {
    await telegram(
      env,
      "editMessageText",
      {
        chat_id:
          chatId,

        message_id:
          messageId,

        text:
          [
            "🛡️ <b>پنل مدیریت حرفه‌ای</b>",
            "",
            "یک بخش را انتخاب کن."
          ].join(
            "\n"
          ),

        parse_mode:
          "HTML",

        reply_markup:
          buildAdminPanelKeyboard()
      }
    );

    return true;
  }


  /* =========================
     SECURITY
  ========================= */

  if (
    data ===
    "panel:security"
  ) {
    await showSecurityPanel(
      env,
      chatId,
      messageId
    );

    return true;
  }


  /* =========================
     SETTINGS
  ========================= */

  if (
    data ===
    "panel:settings"
  ) {
    await showSettingsPanel(
      env,
      chatId,
      messageId
    );

    return true;
  }


  /* =========================
     ANTISPAM
  ========================= */

  if (
    data ===
    "panel:antispam" ||
    data ===
    "security:antispam"
  ) {
    await showAntispamPanel(
      env,
      chatId,
      messageId
    );

    return true;
  }


  /* =========================
     LINKS
  ========================= */

  if (
    data ===
    "panel:links" ||
    data ===
    "security:links"
  ) {
    await showLinkPanel(
      env,
      chatId,
      messageId
    );

    return true;
  }


  /* =========================
     REPORTS
  ========================= */

  if (
    data ===
    "panel:reports" ||
    data ===
    "security:reports"
  ) {
    await showReportPanel(
      env,
      chatId,
      messageId
    );

    return true;
  }


  /* =========================
     ANTISPAM TOGGLE
  ========================= */

  if (
    data ===
    "antispam:toggle"
  ) {
    const config =
      await getAntiSpamConfig(
        env,
        chatId
      );

    config.enabled =
      !config.enabled;

    await saveAntiSpamConfig(
      env,
      chatId,
      config
    );

    await showAntispamPanel(
      env,
      chatId,
      messageId
    );

    return true;
  }


  /* =========================
     LINK TOGGLE
  ========================= */

  if (
    data ===
    "links:toggle"
  ) {
    const config =
      await getLinkConfig(
        env,
        chatId
      );

    config.enabled =
      !config.enabled;

    await saveLinkConfig(
      env,
      chatId,
      config
    );

    await showLinkPanel(
      env,
      chatId,
      messageId
    );

    return true;
  }


  /* =========================
     REFRESH
  ========================= */

  if (
    data ===
    "panel:refresh"
  ) {
    await telegram(
      env,
      "editMessageText",
      {
        chat_id:
          chatId,

        message_id:
          messageId,

        text:
          [
            "🔄 <b>پنل بروزرسانی شد.</b>",
            "",
            "آخرین تنظیمات گروه نمایش داده می‌شود."
          ].join(
            "\n"
          ),

        parse_mode:
          "HTML",

        reply_markup:
          buildAdminPanelKeyboard()
      }
    );

    return true;
  }


  /* =========================
     CALLBACK ANSWER
  ========================= */

  try {
    await telegram(
      env,
      "answerCallbackQuery",
      {
        callback_query_id:
          callback.id
      }
    );
  } catch {}

  return true;
}


/* =========================
   ADMIN PANEL ROUTER
========================= */

async function routeAdminPanel(
  update,
  env
) {
  if (
    update?.callback_query
  ) {
    return await handleAdminPanelCallback(
      update.callback_query,
      env
    );
  }

  const message =
    update?.message;

  if (
    message
  ) {
    return await handleAdminPanelCommand(
      message,
      env
    );
  }

  return false;
}
/* ============================================================
   PART 26 — ADVANCED MEMBER MANAGEMENT
   Persian + English Commands
============================================================ */


/* =========================
   MEMBER MANAGEMENT CONFIG
========================= */

function getDefaultMemberManagementConfig() {
  return {
    welcome: true,
    goodbye: true,
    newMemberLog: true,

    autoDeleteJoinMessage: false,
    autoDeleteLeaveMessage: false,

    protectAdmins: true
  };
}


/* =========================
   GET MEMBER CONFIG
========================= */

async function getMemberManagementConfig(
  env,
  chatId
) {
  const saved =
    await kvGet(
      env,
      `member_management:${chatId}`,
      null
    );

  return {
    ...getDefaultMemberManagementConfig(),
    ...(saved || {})
  };
}


/* =========================
   SAVE MEMBER CONFIG
========================= */

async function saveMemberManagementConfig(
  env,
  chatId,
  config
) {
  const normalized = {
    ...getDefaultMemberManagementConfig(),
    ...(config || {})
  };

  await kvPut(
    env,
    `member_management:${chatId}`,
    normalized
  );

  return normalized;
}


/* =========================
   MEMBER DISPLAY NAME
========================= */

function memberManagementName(
  user
) {
  if (!user) {
    return "کاربر";
  }

  const first =
    String(
      user.first_name || ""
    ).trim();

  const last =
    String(
      user.last_name || ""
    ).trim();

  const username =
    String(
      user.username || ""
    ).trim();

  const fullName =
    `${first} ${last}`.trim();

  if (fullName) {
    return fullName;
  }

  if (username) {
    return `@${username}`;
  }

  return String(
    user.id || "کاربر"
  );
}


/* =========================
   WELCOME NEW MEMBER
========================= */

async function sendMemberWelcome(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  if (!chatId) {
    return false;
  }

  const config =
    await getMemberManagementConfig(
      env,
      chatId
    );

  if (!config.welcome) {
    return false;
  }

  const members =
    message?.new_chat_members;

  if (
    !Array.isArray(members) ||
    !members.length
  ) {
    return false;
  }

  const chatTitle =
    String(
      message.chat.title ||
      "گروه"
    );

  for (
    const member of members
  ) {
    const name =
      escapeHTML(
        memberManagementName(
          member
        )
      );

    const title =
      escapeHTML(
        chatTitle
      );

    await sendMessage(
      env,
      chatId,
      [
        `👋 <b>خوش اومدی ${name}!</b>`,
        "",
        `به <b>${title}</b> خوش اومدی 🌹`,
        "",
        "📌 لطفاً قوانین گروه رو رعایت کن.",
        "🤖 برای مشاهده راهنمای ربات از /help استفاده کن."
      ].join(
        "\n"
      )
    );
  }

  if (
    config.autoDeleteJoinMessage &&
    message.message_id
  ) {
    await deleteBotMessage(
      env,
      chatId,
      message.message_id
    );
  }

  return true;
}


/* =========================
   GOODBYE MEMBER
========================= */

async function sendMemberGoodbye(
  message,
  env
) {
  const chatId =
    message?.chat?.id;

  if (!chatId) {
    return false;
  }

  const config =
    await getMemberManagementConfig(
      env,
      chatId
    );

  if (!config.goodbye) {
    return false;
  }

  const leftMember =
    message?.left_chat_member;

  if (!leftMember) {
    return false;
  }

  const name =
    escapeHTML(
      memberManagementName(
        leftMember
      )
    );

  const title =
    escapeHTML(
      message.chat.title ||
      "گروه"
    );

  await sendMessage(
    env,
    chatId,
    [
      `👋 ${name} از گروه خارج شد.`,
      "",
      `📍 ${title}`
    ].join(
      "\n"
    )
  );

  if (
    config.autoDeleteLeaveMessage &&
    message.message_id
  ) {
    await deleteBotMessage(
      env,
      chatId,
      message.message_id
    );
  }

  return true;
}


/* =========================
   MEMBER JOIN / LEAVE LOGGER
========================= */

async function logMemberMovement(
  message,
  env,
  type
) {
  const chatId =
    message?.chat?.id;

  if (!chatId) {
    return false;
  }

  const config =
    await getMemberManagementConfig(
      env,
      chatId
    );

  if (!config.newMemberLog) {
    return false;
  }

  const user =
    type === "join"
      ? message.new_chat_member
      : message.left_chat_member;

  if (!user) {
    return false;
  }

  const record = {
    type,

    userId:
      Number(
        user.id || 0
      ),

    name:
      memberManagementName(
        user
      ),

    timestamp:
      Date.now()
  };

  const history =
    await kvGet(
      env,
      `member_movements:${chatId}`,
      []
    );

  const list =
    Array.isArray(history)
      ? history
      : [];

  list.unshift(
    record
  );

  await kvPut(
    env,
    `member_movements:${chatId}`,
    list.slice(
      0,
      200
    )
  );

  return true;
}


/* =========================
   GET MEMBER MOVEMENTS
========================= */

async function getMemberMovements(
  env,
  chatId
) {
  const data =
    await kvGet(
      env,
      `member_movements:${chatId}`,
      []
    );

  return Array.isArray(data)
    ? data
    : [];
}


/* =========================
   MEMBER INFO
========================= */

async function getTelegramMemberInfo(
  env,
  chatId,
  userId
) {
  try {
    return await telegram(
      env,
      "getChatMember",
      {
        chat_id:
          chatId,

        user_id:
          userId
      }
    );

  } catch (error) {
    console.error(
      "Get member info:",
      error.message
    );

    return null;
  }
}


/* =========================
   MEMBER INFO COMMAND
========================= */

async function handleMemberInfoCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "member",
      "memberinfo",
      "user",
      "user_info",
      "عضو",
      "اطلاعات_عضو",
      "کاربر"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  let targetUserId =
    Number(
      message.from?.id ||
      0
    );

  if (
    message.reply_to_message
      ?.from?.id
  ) {
    targetUserId =
      Number(
        message.reply_to_message
          .from.id
      );
  }

  if (
    parsed.args?.[0]
  ) {
    const numericId =
      Number(
        parsed.args[0]
      );

    if (
      Number.isFinite(
        numericId
      ) &&
      numericId > 0
    ) {
      targetUserId =
        numericId;
    }
  }

  if (!targetUserId) {
    await sendMessage(
      env,
      chatId,
      "⚠️ کاربر موردنظر پیدا نشد."
    );

    return true;
  }

  const member =
    await getTelegramMemberInfo(
      env,
      chatId,
      targetUserId
    );

  if (!member) {
    await sendMessage(
      env,
      chatId,
      "❌ دریافت اطلاعات کاربر ناموفق بود."
    );

    return true;
  }

  const user =
    member.user || {};

  const status =
    String(
      member.status ||
      "unknown"
    );

  const statusMap = {
    creator:
      "👑 مالک گروه",

    administrator:
      "🛡️ مدیر",

    member:
      "👤 عضو",

    restricted:
      "🔒 محدود",

    left:
      "🚪 خارج‌شده",

    kicked:
      "🚫 مسدود"
  };

  const text = [
    "👤 <b>اطلاعات کاربر</b>",
    "",
    `نام: <b>${escapeHTML(
      memberManagementName(
        user
      )
    )}</b>`,
    `🆔 شناسه: <code>${Number(
      user.id || 0
    )}</code>`,
    `📛 وضعیت: ${
      statusMap[status] ||
      escapeHTML(
        status
      )
    }`,
    `🤖 ربات: ${
      user.is_bot
        ? "بله"
        : "خیر"
    }`
  ].join(
    "\n"
  );

  await sendMessage(
    env,
    chatId,
    text
  );

  return true;
}


/* =========================
   MEMBER SETTINGS COMMAND
========================= */

async function handleMemberSettingsCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "members",
      "member_settings",
      "عضوها",
      "اعضا",
      "تنظیمات_اعضا"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند تنظیمات اعضا را تغییر دهند."
    );

    return true;
  }

  const config =
    await getMemberManagementConfig(
      env,
      chatId
    );

  const option =
    parsed.args?.[0];

  if (
    option === "welcome" ||
    option === "خوشامد"
  ) {
    config.welcome =
      !config.welcome;

    await saveMemberManagementConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      `👋 خوشامدگویی ${
        config.welcome
          ? "🟢 فعال"
          : "🔴 خاموش"
      } شد.`
    );

    return true;
  }

  if (
    option === "goodbye" ||
    option === "خداحافظی"
  ) {
    config.goodbye =
      !config.goodbye;

    await saveMemberManagementConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      `👋 پیام خروج ${
        config.goodbye
          ? "🟢 فعال"
          : "🔴 خاموش"
      } شد.`
    );

    return true;
  }

  await sendMessage(
    env,
    chatId,
    [
      "👥 <b>تنظیمات اعضا</b>",
      "",
      `👋 خوشامدگویی: ${
        config.welcome
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`,
      `👋 پیام خروج: ${
        config.goodbye
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`,
      `📋 ثبت ورود و خروج: ${
        config.newMemberLog
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`,
      "",
      "برای تغییر:",
      "<code>/اعضا خوشامد</code>",
      "<code>/اعضا خداحافظی</code>"
    ].join(
      "\n"
    )
  );

  return true;
}


/* =========================
   MEMBER MOVEMENT HANDLER
========================= */

async function handleMemberMovement(
  message,
  env
) {
  if (!message) {
    return false;
  }

  let handled =
    false;

  if (
    Array.isArray(
      message.new_chat_members
    ) &&
    message.new_chat_members.length
  ) {
    await logMemberMovement(
      {
        ...message,
        new_chat_member:
          message.new_chat_members[0]
      },
      env,
      "join"
    );

    await sendMemberWelcome(
      message,
      env
    );

    handled =
      true;
  }

  if (
    message.left_chat_member
  ) {
    await logMemberMovement(
      message,
      env,
      "leave"
    );

    await sendMemberGoodbye(
      message,
      env
    );

    handled =
      true;
  }

  return handled;
}


/* =========================
   MEMBER MANAGEMENT ROUTER
========================= */

async function routeMemberManagement(
  message,
  env
) {
  if (
    await handleMemberInfoCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleMemberSettingsCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleMemberMovement(
      message,
      env
    )
  ) {
    return true;
  }

  return false;
}
/* ============================================================
   PART 27 — ADVANCED POLL / VOTING SYSTEM
   Persian + English
============================================================ */


/* =========================
   POLL CONFIG
========================= */

function getDefaultPollConfig() {
  return {
    enabled: true,

    maxOptions: 10,

    maxQuestionLength: 300,

    maxOptionLength: 100,

    allowMultipleChoice: false,

    allowChangeVote: true
  };
}


/* =========================
   GET POLL CONFIG
========================= */

async function getPollConfig(
  env,
  chatId
) {
  const saved =
    await kvGet(
      env,
      `poll_config:${chatId}`,
      null
    );

  return {
    ...getDefaultPollConfig(),
    ...(saved || {})
  };
}


/* =========================
   SAVE POLL CONFIG
========================= */

async function savePollConfig(
  env,
  chatId,
  config
) {
  const normalized = {
    ...getDefaultPollConfig(),
    ...(config || {})
  };

  normalized.maxOptions =
    Math.max(
      2,
      Math.min(
        10,
        Number(
          normalized.maxOptions || 10
        )
      )
    );

  normalized.maxQuestionLength =
    Math.max(
      20,
      Math.min(
        500,
        Number(
          normalized.maxQuestionLength || 300
        )
      )
    );

  normalized.maxOptionLength =
    Math.max(
      10,
      Math.min(
        200,
        Number(
          normalized.maxOptionLength || 100
        )
      )
    );

  normalized.enabled =
    Boolean(
      normalized.enabled
    );

  normalized.allowMultipleChoice =
    Boolean(
      normalized.allowMultipleChoice
    );

  normalized.allowChangeVote =
    Boolean(
      normalized.allowChangeVote
    );

  await kvPut(
    env,
    `poll_config:${chatId}`,
    normalized
  );

  return normalized;
}


/* =========================
   POLL ID
========================= */

function createPollId() {
  return [
    "poll",
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(
        2,
        8
      )
  ].join(
    "-"
  );
}


/* =========================
   POLL KEY
========================= */

function pollKey(
  chatId,
  pollId
) {
  return `poll:${chatId}:${pollId}`;
}


/* =========================
   POLL INDEX KEY
========================= */

function pollIndexKey(
  chatId
) {
  return `polls_index:${chatId}`;
}


/* =========================
   GET POLL
========================= */

async function getPoll(
  env,
  chatId,
  pollId
) {
  return await kvGet(
    env,
    pollKey(
      chatId,
      pollId
    ),
    null
  );
}


/* =========================
   SAVE POLL
========================= */

async function savePoll(
  env,
  chatId,
  poll
) {
  await kvPut(
    env,
    pollKey(
      chatId,
      poll.id
    ),
    poll
  );

  const index =
    await kvGet(
      env,
      pollIndexKey(
        chatId
      ),
      []
    );

  const list =
    Array.isArray(index)
      ? index
      : [];

  if (
    !list.includes(
      poll.id
    )
  ) {
    list.unshift(
      poll.id
    );
  }

  await kvPut(
    env,
    pollIndexKey(
      chatId
    ),
    list.slice(
      0,
      100
    )
  );

  return poll.id;
}


/* =========================
   GET POLL LIST
========================= */

async function getPollList(
  env,
  chatId
) {
  const index =
    await kvGet(
      env,
      pollIndexKey(
        chatId
      ),
      []
    );

  if (
    !Array.isArray(
      index
    )
  ) {
    return [];
  }

  const polls = [];

  for (
    const id of index
  ) {
    const poll =
      await getPoll(
        env,
        chatId,
        id
      );

    if (
      poll
    ) {
      polls.push(
        poll
      );
    }
  }

  return polls;
}


/* =========================
   CREATE POLL
========================= */

async function createAdvancedPoll(
  message,
  env,
  question,
  options
) {
  const chatId =
    message?.chat?.id;

  const creatorId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !creatorId
  ) {
    return null;
  }

  const config =
    await getPollConfig(
      env,
      chatId
    );

  if (
    !config.enabled
  ) {
    return null;
  }

  const cleanQuestion =
    String(
      question || ""
    )
      .trim()
      .slice(
        0,
        config.maxQuestionLength
      );

  if (
    !cleanQuestion
  ) {
    return null;
  }

  const cleanOptions =
    Array.isArray(
      options
    )
      ? options
          .map(
            option =>
              String(
                option || ""
              )
                .trim()
                .slice(
                  0,
                  config.maxOptionLength
                )
          )
          .filter(
            Boolean
          )
          .slice(
            0,
            config.maxOptions
          )
      : [];

  if (
    cleanOptions.length <
      2
  ) {
    return null;
  }

  const poll = {
    id:
      createPollId(),

    chatId:
      Number(
        chatId
      ),

    creatorId,

    question:
      cleanQuestion,

    options:
      cleanOptions.map(
        (
          text,
          index
        ) => ({
          id:
            index,

          text,

          votes:
            []
        })
      ),

    multiple:
      Boolean(
        config.allowMultipleChoice
      ),

    allowChangeVote:
      Boolean(
        config.allowChangeVote
      ),

    status:
      "open",

    createdAt:
      Date.now(),

    messageId:
      0
  };

  await savePoll(
    env,
    chatId,
    poll
  );

  await incrementStat(
    env,
    chatId,
    "polls"
  );

  await addAuditLog(
    env,
    chatId,
    creatorId,
    "poll_created",
    0,
    {
      pollId:
        poll.id
    }
  );

  return poll;
}


/* =========================
   BUILD POLL KEYBOARD
========================= */

function buildPollKeyboard(
  poll
) {
  const rows = [];

  for (
    const option of
      poll.options
  ) {
    rows.push([
      {
        text:
          `▫️ ${option.text} (${option.votes.length})`,

        callback_data:
          `pollvote:${poll.id}:${option.id}`
      }
    ]);
  }

  rows.push([
    {
      text:
        "📊 نتیجه",

      callback_data:
        `pollresults:${poll.id}`
    },
    {
      text:
        "🔒 بستن",

      callback_data:
        `pollclose:${poll.id}`
    }
  ]);

  return {
    inline_keyboard:
      rows
  };
}


/* =========================
   SEND POLL
========================= */

async function sendAdvancedPoll(
  env,
  poll
) {
  const text = [
    "📊 <b>نظرسنجی جدید</b>",
    "",
    escapeHTML(
      poll.question
    ),
    "",
    "👇 گزینه موردنظر را انتخاب کن."
  ].join(
    "\n"
  );

  try {
    const result =
      await telegram(
        env,
        "sendMessage",
        {
          chat_id:
            poll.chatId,

          text,

          parse_mode:
            "HTML",

          reply_markup:
            buildPollKeyboard(
              poll
            )
        }
      );

    if (
      result?.message_id
    ) {
      poll.messageId =
        Number(
          result.message_id
        );

      await savePoll(
        env,
        poll.chatId,
        poll
      );
    }

    return true;

  } catch (
    error
  ) {
    console.error(
      "Send poll:",
      error.message
    );

    return false;
  }
}


/* =========================
   REMOVE USER VOTE
========================= */

function removeUserVote(
  poll,
  userId
) {
  for (
    const option of
      poll.options
  ) {
    option.votes =
      option.votes.filter(
        id =>
          Number(id) !==
          Number(userId)
      );
  }
}


/* =========================
   USER HAS VOTED
========================= */

function userPollVotes(
  poll,
  userId
) {
  const result = [];

  for (
    const option of
      poll.options
  ) {
    if (
      option.votes.some(
        id =>
          Number(id) ===
          Number(userId)
      )
    ) {
      result.push(
        option.id
      );
    }
  }

  return result;
}


/* =========================
   CAST VOTE
========================= */

async function castPollVote(
  env,
  poll,
  userId,
  optionId
) {
  if (
    poll.status !==
    "open"
  ) {
    return {
      ok:
        false,

      message:
        "🔒 این نظرسنجی بسته شده است."
    };
  }

  const option =
    poll.options.find(
      item =>
        Number(
          item.id
        ) ===
        Number(
          optionId
        )
    );

  if (
    !option
  ) {
    return {
      ok:
        false,

      message:
        "❌ گزینه نامعتبر است."
    };
  }

  const previous =
    userPollVotes(
      poll,
      userId
    );

  if (
    !poll.multiple
  ) {
    removeUserVote(
      poll,
      userId
    );

    option.votes.push(
      Number(
        userId
      )
    );
  } else {
    if (
      previous.includes(
        option.id
      )
    ) {
      option.votes =
        option.votes.filter(
          id =>
            Number(id) !==
            Number(userId)
        );
    } else {
      option.votes.push(
        Number(
          userId
        )
      );
    }
  }

  await savePoll(
    env,
    poll.chatId,
    poll
  );

  return {
    ok:
      true,

    message:
      "✅ رأی شما ثبت شد."
  };
}


/* =========================
   POLL RESULTS TEXT
========================= */

function buildPollResultsText(
  poll
) {
  const total =
    poll.options.reduce(
      (
        sum,
        option
      ) =>
        sum +
        option.votes.length,
      0
    );

  const lines = [
    "📊 <b>نتیجه نظرسنجی</b>",
    "",
    escapeHTML(
      poll.question
    ),
    "",
    `👥 مجموع رأی‌ها: <b>${total}</b>`,
    ""
  ];

  for (
    const option of
      poll.options
  ) {
    const count =
      option.votes.length;

    const percent =
      total > 0
        ? Math.round(
            (
              count /
              total
            ) *
              100
          )
        : 0;

    lines.push(
      `${escapeHTML(
        option.text
      )} — <b>${count}</b> رأی (${percent}%)`
    );
  }

  lines.push(
    "",
    poll.status ===
      "open"
      ? "🟢 وضعیت: باز"
      : "🔴 وضعیت: بسته"
  );

  return lines.join(
    "\n"
  );
}


/* =========================
   UPDATE POLL MESSAGE
========================= */

async function updatePollMessage(
  env,
  poll
) {
  if (
    !poll.messageId
  ) {
    return false;
  }

  try {
    await telegram(
      env,
      "editMessageText",
      {
        chat_id:
          poll.chatId,

        message_id:
          poll.messageId,

        text:
          buildPollResultsText(
            poll
          ),

        parse_mode:
          "HTML",

        reply_markup:
          poll.status ===
          "open"
            ? buildPollKeyboard(
                poll
              )
            : {
                inline_keyboard:
                  [
                    [
                      {
                        text:
                          "📊 نتیجه نهایی",

                        callback_data:
                          `pollresults:${poll.id}`
                      }
                    ]
                  ]
              }
      }
    );

    return true;

  } catch (
    error
  ) {
    console.error(
      "Update poll:",
      error.message
    );

    return false;
  }
}


/* =========================
   CLOSE POLL
========================= */

async function closeAdvancedPoll(
  env,
  poll,
  userId
) {
  if (
    poll.status !==
    "open"
  ) {
    return false;
  }

  if (
    Number(
      poll.creatorId
    ) !==
      Number(
        userId
      ) &&
    !await isAdmin(
      env,
      poll.chatId,
      userId
    )
  ) {
    return false;
  }

  poll.status =
    "closed";

  poll.closedBy =
    Number(
      userId
    );

  poll.closedAt =
    Date.now();

  await savePoll(
    env,
    poll.chatId,
    poll
  );

  await updatePollMessage(
    env,
    poll
  );

  await addAuditLog(
    env,
    poll.chatId,
    userId,
    "poll_closed",
    0,
    {
      pollId:
        poll.id
    }
  );

  return true;
}


/* =========================
   CREATE POLL COMMAND
========================= */

async function handleCreatePollCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "poll",
      "vote",
      "نظرسنجی",
      "نظرسنجی_جدید",
      "رای_گیری"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند نظرسنجی ایجاد کنند."
    );

    return true;
  }

  const raw =
    parsed.args
      ?.join(" ")
      .trim() ||
    "";

  if (!raw) {
    await sendMessage(
      env,
      chatId,
      [
        "📊 <b>ساخت نظرسنجی</b>",
        "",
        "فرمت:",
        "<code>/نظرسنجی سوال | گزینه ۱ | گزینه ۲ | گزینه ۳</code>",
        "",
        "مثال:",
        "<code>/نظرسنجی بهترین زبان برنامه‌نویسی؟ | Python | JavaScript | C++</code>"
      ].join(
        "\n"
      )
    );

    return true;
  }

  const parts =
    raw
      .split("|")
      .map(
        item =>
          item.trim()
      )
      .filter(
        Boolean
      );

  const question =
    parts.shift();

  const options =
    parts;

  if (
    !question ||
    options.length <
      2
  ) {
    await sendMessage(
      env,
      chatId,
      "⚠️ سؤال و حداقل دو گزینه لازم است."
    );

    return true;
  }

  const poll =
    await createAdvancedPoll(
      message,
      env,
      question,
      options
    );

  if (!poll) {
    await sendMessage(
      env,
      chatId,
      "❌ ساخت نظرسنجی انجام نشد."
    );

    return true;
  }

  await sendAdvancedPoll(
    env,
    poll
  );

  return true;
}


/* =========================
   POLL CALLBACK
========================= */

async function handlePollCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data ||
      ""
    );

  if (
    !data.startsWith(
      "pollvote:"
    ) &&
    !data.startsWith(
      "pollresults:"
    ) &&
    !data.startsWith(
      "pollclose:"
    )
  ) {
    return false;
  }

  const parts =
    data.split(
      ":"
    );

  const action =
    parts[0];

  const pollId =
    parts[1];

  const optionId =
    parts[2];

  const chatId =
    callback.message?.chat?.id;

  const userId =
    Number(
      callback.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId ||
    !pollId
  ) {
    return true;
  }

  const poll =
    await getPoll(
      env,
      chatId,
      pollId
    );

  if (!poll) {
    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            "❌ نظرسنجی پیدا نشد.",

          show_alert:
            true
        }
      );
    } catch {}

    return true;
  }


  /* =========================
     VOTE
  ========================= */

  if (
    action ===
    "pollvote"
  ) {
    const result =
      await castPollVote(
        env,
        poll,
        userId,
        optionId
      );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            result.message
        }
      );
    } catch {}

    if (
      result.ok
    ) {
      await updatePollMessage(
        env,
        poll
      );
    }

    return true;
  }


  /* =========================
     RESULTS
  ========================= */

  if (
    action ===
    "pollresults"
  ) {
    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id
        }
      );
    } catch {}

    try {
      await telegram(
        env,
        "editMessageText",
        {
          chat_id:
            chatId,

          message_id:
            callback.message
              ?.message_id,

          text:
            buildPollResultsText(
              poll
            ),

          parse_mode:
            "HTML",

          reply_markup:
            poll.status ===
            "open"
              ? buildPollKeyboard(
                  poll
                )
              : {
                  inline_keyboard:
                    [
                      [
                        {
                          text:
                            "📊 نتیجه نهایی",

                          callback_data:
                            `pollresults:${poll.id}`
                        }
                      ]
                    ]
                }
        }
      );
    } catch (
      error
    ) {
      console.error(
        "Poll results:",
        error.message
      );
    }

    return true;
  }


  /* =========================
     CLOSE
  ========================= */

  if (
    action ===
    "pollclose"
  ) {
    const success =
      await closeAdvancedPoll(
        env,
        poll,
        userId
      );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            success
              ? "🔒 نظرسنجی بسته شد."
              : "⛔ فقط سازنده یا مدیر می‌تواند نظرسنجی را ببندد.",

          show_alert:
            !success
        }
      );
    } catch {}

    return true;
  }

  return true;
}


/* =========================
   POLL SETTINGS COMMAND
========================= */

async function handlePollSettingsCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "pollsettings",
      "pollconfig",
      "تنظیمات_نظرسنجی",
      "تنظیم_نظرسنجی"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران دسترسی دارند."
    );

    return true;
  }

  const config =
    await getPollConfig(
      env,
      chatId
    );

  const option =
    parsed.args?.[0];

  if (
    option ===
      "on" ||
    option ===
      "فعال"
  ) {
    config.enabled =
      true;

    await savePollConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      "🟢 سیستم نظرسنجی فعال شد."
    );

    return true;
  }

  if (
    option ===
      "off" ||
    option ===
      "خاموش"
  ) {
    config.enabled =
      false;

    await savePollConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      "🔴 سیستم نظرسنجی خاموش شد."
    );

    return true;
  }

  await sendMessage(
    env,
    chatId,
    [
      "📊 <b>تنظیمات نظرسنجی</b>",
      "",
      `وضعیت: ${
        config.enabled
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`,
      `🔢 حداکثر گزینه: <b>${config.maxOptions}</b>`,
      `✏️ حداکثر طول سؤال: <b>${config.maxQuestionLength}</b>`,
      `🔄 تغییر رأی: ${
        config.allowChangeVote
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`
    ].join(
      "\n"
    )
  );

  return true;
}


/* =========================
   POLL ROUTER
========================= */

async function routePollSystem(
  update,
  env
) {
  if (
    update?.callback_query
  ) {
    return await handlePollCallback(
      update.callback_query,
      env
    );
  }

  if (
    update?.message
  ) {
    if (
      await handleCreatePollCommand(
        update.message,
        env
      )
    ) {
      return true;
    }

    if (
      await handlePollSettingsCommand(
        update.message,
        env
      )
    ) {
      return true;
    }
  }

  return false;
}
/* ============================================================
   PART 28 — ADVANCED GROUP RULES SYSTEM
   Persian + English Commands
============================================================ */


/* =========================
   DEFAULT RULES
========================= */

function getDefaultRulesConfig() {
  return {
    enabled: true,

    title:
      "📜 قوانین گروه",

    rules: [
      "احترام به همه اعضا الزامی است.",
      "ارسال اسپم و پیام‌های تکراری ممنوع است.",
      "ارسال لینک تبلیغاتی بدون اجازه ممنوع است.",
      "مزاحمت برای اعضای دیگر ممنوع است."
    ],

    updatedAt:
      Date.now(),

    updatedBy:
      0
  };
}


/* =========================
   GET RULES
========================= */

async function getRulesConfig(
  env,
  chatId
) {
  const saved =
    await kvGet(
      env,
      `rules:${chatId}`,
      null
    );

  return {
    ...getDefaultRulesConfig(),
    ...(saved || {})
  };
}


/* =========================
   SAVE RULES
========================= */

async function saveRulesConfig(
  env,
  chatId,
  config
) {
  const normalized = {
    ...getDefaultRulesConfig(),
    ...(config || {})
  };

  normalized.enabled =
    Boolean(
      normalized.enabled
    );

  normalized.title =
    String(
      normalized.title ||
      "📜 قوانین گروه"
    )
      .trim()
      .slice(
        0,
        100
      );

  normalized.rules =
    Array.isArray(
      normalized.rules
    )
      ? normalized.rules
          .map(
            rule =>
              String(
                rule || ""
              )
                .trim()
                .slice(
                  0,
                  500
                )
          )
          .filter(
            Boolean
          )
          .slice(
            0,
            30
          )
      : [];

  normalized.updatedAt =
    Date.now();

  await kvPut(
    env,
    `rules:${chatId}`,
    normalized
  );

  return normalized;
}


/* =========================
   BUILD RULES TEXT
========================= */

function buildRulesText(
  config
) {
  const title =
    escapeHTML(
      config.title ||
      "📜 قوانین گروه"
    );

  const rules =
    Array.isArray(
      config.rules
    )
      ? config.rules
      : [];

  const lines = [
    `<b>${title}</b>`,
    ""
  ];

  if (!rules.length) {
    lines.push(
      "📭 هنوز قانونی ثبت نشده است."
    );
  } else {
    rules.forEach(
      (
        rule,
        index
      ) => {
        lines.push(
          `${index + 1}️⃣ ${escapeHTML(
            rule
          )}`
        );
      }
    );
  }

  lines.push(
    "",
    config.enabled
      ? "🟢 قوانین فعال هستند."
      : "🔴 نمایش قوانین غیرفعال است."
  );

  return lines.join(
    "\n"
  );
}


/* =========================
   RULES KEYBOARD
========================= */

function buildRulesKeyboard(
  isAdmin = false
) {
  const rows = [
    [
      {
        text:
          "📜 مشاهده قوانین",

        callback_data:
          "rules:view"
      }
    ]
  ];

  if (isAdmin) {
    rows.push([
      {
        text:
          "➕ افزودن",

        callback_data:
          "rules:add"
      },
      {
        text:
          "🗑️ حذف",

        callback_data:
          "rules:delete"
      }
    ]);

    rows.push([
      {
        text:
          "🟢/🔴 فعال/خاموش",

        callback_data:
          "rules:toggle"
      }
    ]);
  }

  rows.push([
    {
      text:
        "🔄 بروزرسانی",

      callback_data:
        "rules:refresh"
    }
  ]);

  return {
    inline_keyboard:
      rows
  };
}


/* =========================
   SHOW RULES
========================= */

async function sendRules(
  env,
  chatId
) {
  const config =
    await getRulesConfig(
      env,
      chatId
    );

  if (
    !config.enabled
  ) {
    await sendMessage(
      env,
      chatId,
      "🔴 نمایش قوانین این گروه غیرفعال است."
    );

    return false;
  }

  await telegram(
    env,
    "sendMessage",
    {
      chat_id:
        chatId,

      text:
        buildRulesText(
          config
        ),

      parse_mode:
        "HTML",

      reply_markup:
        buildRulesKeyboard(
          false
        )
    }
  );

  return true;
}


/* =========================
   RULES COMMAND
========================= */

async function handleRulesCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "rules",
      "rule",
      "قوانین",
      "قانون",
      "قانون_گروه"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  const config =
    await getRulesConfig(
      env,
      chatId
    );

  const action =
    parsed.args?.[0];

  /* =========================
     ADD RULE
  ========================= */

  if (
    action ===
      "add" ||
    action ===
      "افزودن"
  ) {
    if (
      !await isAdmin(
        env,
        chatId,
        userId
      )
    ) {
      await sendMessage(
        env,
        chatId,
        "⛔ فقط مدیران می‌توانند قانون اضافه کنند."
      );

      return true;
    }

    const rule =
      parsed.args
        .slice(1)
        .join(" ")
        .trim();

    if (!rule) {
      await sendMessage(
        env,
        chatId,
        [
          "⚠️ متن قانون را وارد کن.",
          "",
          "<code>/قوانین افزودن احترام به اعضا الزامی است</code>"
        ].join(
          "\n"
        )
      );

      return true;
    }

    if (
      config.rules.length >=
      30
    ) {
      await sendMessage(
        env,
        chatId,
        "⚠️ حداکثر ۳۰ قانون می‌توان ثبت کرد."
      );

      return true;
    }

    config.rules.push(
      rule
    );

    config.updatedBy =
      userId;

    await saveRulesConfig(
      env,
      chatId,
      config
    );

    await addAuditLog(
      env,
      chatId,
      userId,
      "rule_added",
      0,
      {
        rule
      }
    );

    await sendMessage(
      env,
      chatId,
      "✅ قانون جدید اضافه شد."
    );

    return true;
  }


  /* =========================
     DELETE RULE
  ========================= */

  if (
    action ===
      "delete" ||
    action ===
      "حذف"
  ) {
    if (
      !await isAdmin(
        env,
        chatId,
        userId
      )
    ) {
      await sendMessage(
        env,
        chatId,
        "⛔ فقط مدیران می‌توانند قوانین را حذف کنند."
      );

      return true;
    }

    const index =
      Number(
        parsed.args?.[1]
      );

    if (
      !Number.isInteger(
        index
      ) ||
      index < 1 ||
      index >
        config.rules.length
    ) {
      await sendMessage(
        env,
        chatId,
        "⚠️ شماره قانون نامعتبر است."
      );

      return true;
    }

    const removed =
      config.rules.splice(
        index - 1,
        1
      );

    config.updatedBy =
      userId;

    await saveRulesConfig(
      env,
      chatId,
      config
    );

    await addAuditLog(
      env,
      chatId,
      userId,
      "rule_deleted",
      0,
      {
        rule:
          removed[0] ||
          ""
      }
    );

    await sendMessage(
      env,
      chatId,
      "🗑️ قانون حذف شد."
    );

    return true;
  }


  /* =========================
     TOGGLE RULES
  ========================= */

  if (
    action ===
      "on" ||
    action ===
      "فعال" ||
    action ===
      "off" ||
    action ===
      "خاموش"
  ) {
    if (
      !await isAdmin(
        env,
        chatId,
        userId
      )
    ) {
      await sendMessage(
        env,
        chatId,
        "⛔ فقط مدیران می‌توانند وضعیت قوانین را تغییر دهند."
      );

      return true;
    }

    if (
      action ===
        "on" ||
      action ===
        "فعال"
    ) {
      config.enabled =
        true;
    } else {
      config.enabled =
        false;
    }

    config.updatedBy =
      userId;

    await saveRulesConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      config.enabled
        ? "🟢 قوانین فعال شد."
        : "🔴 قوانین خاموش شد."
    );

    return true;
  }


  /* =========================
     DEFAULT VIEW
  ========================= */

  await telegram(
    env,
    "sendMessage",
    {
      chat_id:
        chatId,

      text:
        buildRulesText(
          config
        ),

      parse_mode:
        "HTML",

      reply_markup:
        buildRulesKeyboard(
          await isAdmin(
            env,
            chatId,
            userId
          )
        )
    }
  );

  return true;
}


/* =========================
   RULES CALLBACK
========================= */

async function handleRulesCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data ||
      ""
    );

  if (
    !data.startsWith(
      "rules:"
    )
  ) {
    return false;
  }

  const chatId =
    callback.message
      ?.chat?.id;

  const messageId =
    callback.message
      ?.message_id;

  const userId =
    Number(
      callback.from?.id ||
      0
    );

  if (
    !chatId ||
    !messageId
  ) {
    return true;
  }

  const config =
    await getRulesConfig(
      env,
      chatId
    );

  const admin =
    await isAdmin(
      env,
      chatId,
      userId
    );


  /* =========================
     VIEW
  ========================= */

  if (
    data ===
    "rules:view"
  ) {
    await telegram(
      env,
      "editMessageText",
      {
        chat_id:
          chatId,

        message_id:
          messageId,

        text:
          buildRulesText(
            config
          ),

        parse_mode:
          "HTML",

        reply_markup:
          buildRulesKeyboard(
            admin
          )
      }
    );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id
        }
      );
    } catch {}

    return true;
  }


  /* =========================
     REFRESH
  ========================= */

  if (
    data ===
    "rules:refresh"
  ) {
    await telegram(
      env,
      "editMessageText",
      {
        chat_id:
          chatId,

        message_id:
          messageId,

        text:
          buildRulesText(
            config
          ),

        parse_mode:
          "HTML",

        reply_markup:
          buildRulesKeyboard(
            admin
          )
      }
    );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            "🔄 بروزرسانی شد."
        }
      );
    } catch {}

    return true;
  }


  /* =========================
     TOGGLE
  ========================= */

  if (
    data ===
    "rules:toggle"
  ) {
    if (!admin) {
      try {
        await telegram(
          env,
          "answerCallbackQuery",
          {
            callback_query_id:
              callback.id,

            text:
              "⛔ فقط مدیران دسترسی دارند.",

            show_alert:
              true
          }
        );
      } catch {}

      return true;
    }

    config.enabled =
      !config.enabled;

    config.updatedBy =
      userId;

    await saveRulesConfig(
      env,
      chatId,
      config
    );

    await telegram(
      env,
      "editMessageText",
      {
        chat_id:
          chatId,

        message_id:
          messageId,

        text:
          buildRulesText(
            config
          ),

        parse_mode:
          "HTML",

        reply_markup:
          buildRulesKeyboard(
            true
          )
      }
    );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            config.enabled
              ? "🟢 قوانین فعال شد."
              : "🔴 قوانین خاموش شد."
        }
      );
    } catch {}

    return true;
  }


  /* =========================
     ADD / DELETE HELP
  ========================= */

  if (
    data ===
      "rules:add" ||
    data ===
      "rules:delete"
  ) {
    if (!admin) {
      try {
        await telegram(
          env,
          "answerCallbackQuery",
          {
            callback_query_id:
              callback.id,

            text:
              "⛔ فقط مدیران دسترسی دارند.",

            show_alert:
              true
          }
        );
      } catch {}

      return true;
    }

    const text =
      data ===
      "rules:add"
        ? [
            "➕ <b>افزودن قانون</b>",
            "",
            "از دستور زیر استفاده کن:",
            "<code>/قوانین افزودن متن قانون</code>",
            "",
            "مثال:",
            "<code>/قوانین افزودن تبلیغات بدون اجازه ممنوع است</code>"
          ].join(
            "\n"
          )
        : [
            "🗑️ <b>حذف قانون</b>",
            "",
            "شماره قانون را مشخص کن:",
            "<code>/قوانین حذف 1</code>"
          ].join(
            "\n"
          );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            data ===
            "rules:add"
              ? "➕ دستور افزودن قانون نمایش داده شد."
              : "🗑️ دستور حذف قانون نمایش داده شد.",

          show_alert:
            true
        }
      );
    } catch {}

    return true;
  }

  return true;
}


/* =========================
   RULES ROUTER
========================= */

async function routeRulesSystem(
  update,
  env
) {
  if (
    update?.callback_query
  ) {
    return await handleRulesCallback(
      update.callback_query,
      env
    );
  }

  if (
    update?.message
  ) {
    return await handleRulesCommand(
      update.message,
      env
    );
  }

  return false;
}
/* ============================================================
   PART 29 — ADVANCED ANTI-LINK / ANTI-ADVERTISING SYSTEM
   Persian + English
============================================================ */


/* =========================
   DEFAULT CONFIG
========================= */

function getDefaultAntiLinkConfig() {
  return {
    enabled: true,

    deleteLinks: true,

    warnUser: true,

    maxWarnings: 3,

    muteAfterWarnings: true,

    muteSeconds: 300,

    allowTelegram: false,

    allowYouTube: true,

    allowInstagram: true,

    allowTrustedUsers: true,

    allowAdmins: true,

    customAllowedDomains: [],

    customBlockedDomains: [],

    logActions: true
  };
}


/* =========================
   GET CONFIG
========================= */

async function getLinkConfig(
  env,
  chatId
) {
  const saved =
    await kvGet(
      env,
      `link_config:${chatId}`,
      null
    );

  return {
    ...getDefaultAntiLinkConfig(),
    ...(saved || {})
  };
}


/* =========================
   SAVE CONFIG
========================= */

async function saveLinkConfig(
  env,
  chatId,
  config
) {
  const normalized = {
    ...getDefaultAntiLinkConfig(),
    ...(config || {})
  };

  normalized.enabled =
    Boolean(
      normalized.enabled
    );

  normalized.deleteLinks =
    Boolean(
      normalized.deleteLinks
    );

  normalized.warnUser =
    Boolean(
      normalized.warnUser
    );

  normalized.maxWarnings =
    Math.max(
      1,
      Math.min(
        10,
        Number(
          normalized.maxWarnings ||
          3
        )
      )
    );

  normalized.muteAfterWarnings =
    Boolean(
      normalized.muteAfterWarnings
    );

  normalized.muteSeconds =
    Math.max(
      30,
      Math.min(
        86400,
        Number(
          normalized.muteSeconds ||
          300
        )
      )
    );

  normalized.allowTelegram =
    Boolean(
      normalized.allowTelegram
    );

  normalized.allowYouTube =
    Boolean(
      normalized.allowYouTube
    );

  normalized.allowInstagram =
    Boolean(
      normalized.allowInstagram
    );

  normalized.allowTrustedUsers =
    Boolean(
      normalized.allowTrustedUsers
    );

  normalized.allowAdmins =
    Boolean(
      normalized.allowAdmins
    );

  normalized.customAllowedDomains =
    Array.isArray(
      normalized.customAllowedDomains
    )
      ? normalized.customAllowedDomains
          .map(
            domain =>
              String(
                domain || ""
              )
                .trim()
                .toLowerCase()
          )
          .filter(
            Boolean
          )
          .slice(
            0,
            50
          )
      : [];

  normalized.customBlockedDomains =
    Array.isArray(
      normalized.customBlockedDomains
    )
      ? normalized.customBlockedDomains
          .map(
            domain =>
              String(
                domain || ""
              )
                .trim()
                .toLowerCase()
          )
          .filter(
            Boolean
          )
          .slice(
            0,
            50
          )
      : [];

  normalized.logActions =
    Boolean(
      normalized.logActions
    );

  await kvPut(
    env,
    `link_config:${chatId}`,
    normalized
  );

  return normalized;
}


/* =========================
   URL EXTRACTION
========================= */

function extractUrls(
  text
) {
  const source =
    String(
      text || ""
    );

  const matches =
    source.match(
      /(?:https?:\/\/|www\.)[^\s<>"']+/gi
    );

  if (!matches) {
    return [];
  }

  return matches.map(
    url =>
      url
        .replace(
          /[),.!?;:]+$/g,
          ""
        )
  );
}


/* =========================
   DOMAIN EXTRACTION
========================= */

function extractDomain(
  url
) {
  let value =
    String(
      url || ""
    )
      .trim()
      .toLowerCase();

  if (
    !value
  ) {
    return "";
  }

  if (
    !/^https?:\/\//i.test(
      value
    )
  ) {
    value =
      `https://${value}`;
  }

  try {
    const parsed =
      new URL(
        value
      );

    return parsed.hostname
      .replace(
        /^www\./,
        ""
      );
  } catch {
    return "";
  }
}


/* =========================
   DOMAIN MATCH
========================= */

function domainMatches(
  domain,
  list
) {
  if (
    !domain ||
    !Array.isArray(
      list
    )
  ) {
    return false;
  }

  const normalized =
    String(
      domain
    )
      .toLowerCase()
      .replace(
        /^www\./,
        ""
      );

  return list.some(
    item => {
      const target =
        String(
          item || ""
        )
          .trim()
          .toLowerCase()
          .replace(
            /^www\./,
            ""
          );

      if (!target) {
        return false;
      }

      return (
        normalized ===
          target ||
        normalized.endsWith(
          `.${target}`
        )
      );
    }
  );
}


/* =========================
   KNOWN DOMAINS
========================= */

const SAFE_SOCIAL_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "facebook.com"
];

const TELEGRAM_DOMAINS = [
  "t.me",
  "telegram.me",
  "telegram.org"
];


/* =========================
   CHECK URL
========================= */

function classifyLink(
  url,
  config
) {
  const domain =
    extractDomain(
      url
    );

  if (!domain) {
    return {
      domain: "",
      allowed: false,
      reason:
        "invalid"
    };
  }

  if (
    domainMatches(
      domain,
      config.customBlockedDomains
    )
  ) {
    return {
      domain,
      allowed: false,
      reason:
        "custom_blocked"
    };
  }

  if (
    domainMatches(
      domain,
      config.customAllowedDomains
    )
  ) {
    return {
      domain,
      allowed: true,
      reason:
        "custom_allowed"
    };
  }

  if (
    domainMatches(
      domain,
      TELEGRAM_DOMAINS
    )
  ) {
    return {
      domain,

      allowed:
        config.allowTelegram,

      reason:
        "telegram"
    };
  }

  if (
    domainMatches(
      domain,
      [
        "youtube.com",
        "youtu.be"
      ]
    )
  ) {
    return {
      domain,

      allowed:
        config.allowYouTube,

      reason:
        "youtube"
    };
  }

  if (
    domainMatches(
      domain,
      [
        "instagram.com"
      ]
    )
  ) {
    return {
      domain,

      allowed:
        config.allowInstagram,

      reason:
        "instagram"
    };
  }

  return {
    domain,

    allowed:
      false,

    reason:
      "unknown"
  };
}


/* =========================
   ADVERTISEMENT KEYWORDS
========================= */

const ADVERTISEMENT_KEYWORDS = [
  "تبلیغ",
  "تبلیغات",
  "خرید",
  "فروش",
  "فالو",
  "سابسکرایب",
  "کانال",
  "عضو شو",
  "عضوگیری",
  "درآمد",
  "فروشگاه",
  "promo",
  "promotion",
  "advertisement",
  "advertising",
  "casino",
  "bet",
  "referral",
  "discount",
  "sale"
];


/* =========================
   ADVERTISEMENT CHECK
========================= */

function containsAdvertisement(
  text
) {
  const source =
    String(
      text || ""
    )
      .toLowerCase();

  return ADVERTISEMENT_KEYWORDS.some(
    keyword =>
      source.includes(
        keyword
      )
  );
}


/* =========================
   WARNING KEY
========================= */

function linkWarningKey(
  chatId,
  userId
) {
  return `link_warnings:${chatId}:${userId}`;
}


/* =========================
   GET WARNINGS
========================= */

async function getLinkWarnings(
  env,
  chatId,
  userId
) {
  const data =
    await kvGet(
      env,
      linkWarningKey(
        chatId,
        userId
      ),
      {
        count:
          0,

        updatedAt:
          Date.now()
      }
    );

  return {
    count:
      Number(
        data?.count || 0
      ),

    updatedAt:
      Number(
        data?.updatedAt ||
        Date.now()
      )
  };
}


/* =========================
   ADD WARNING
========================= */

async function addLinkWarning(
  env,
  chatId,
  userId
) {
  const current =
    await getLinkWarnings(
      env,
      chatId,
      userId
    );

  const next = {
    count:
      current.count +
      1,

    updatedAt:
      Date.now()
  };

  await kvPut(
    env,
    linkWarningKey(
      chatId,
      userId
    ),
    next
  );

  return next;
}


/* =========================
   RESET WARNINGS
========================= */

async function resetLinkWarnings(
  env,
  chatId,
  userId
) {
  await kvPut(
    env,
    linkWarningKey(
      chatId,
      userId
    ),
    {
      count:
        0,

      updatedAt:
        Date.now()
    }
  );
}


/* =========================
   TRUSTED USERS
========================= */

async function isTrustedLinkUser(
  env,
  chatId,
  userId
) {
  const trusted =
    await kvGet(
      env,
      `trusted_users:${chatId}`,
      []
    );

  if (
    !Array.isArray(
      trusted
    )
  ) {
    return false;
  }

  return trusted.some(
    id =>
      Number(id) ===
      Number(userId)
  );
}


/* =========================
   ADMIN CHECK
========================= */

async function canBypassLinkFilter(
  env,
  chatId,
  userId,
  config
) {
  if (
    config.allowAdmins &&
    await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    return true;
  }

  if (
    config.allowTrustedUsers &&
    await isTrustedLinkUser(
      env,
      chatId,
      userId
    )
  ) {
    return true;
  }

  return false;
}


/* =========================
   DELETE MESSAGE
========================= */

async function deleteLinkMessage(
  env,
  chatId,
  messageId
) {
  try {
    await telegram(
      env,
      "deleteMessage",
      {
        chat_id:
          chatId,

        message_id:
          messageId
      }
    );

    return true;

  } catch (
    error
  ) {
    console.error(
      "Delete link message:",
      error.message
    );

    return false;
  }
}


/* =========================
   MUTE USER
========================= */

async function muteLinkUser(
  env,
  chatId,
  userId,
  seconds
) {
  const until =
    Math.floor(
      Date.now() /
        1000
    ) +
    Math.max(
      30,
      Number(
        seconds ||
        300
      )
    );

  try {
    await telegram(
      env,
      "restrictChatMember",
      {
        chat_id:
          chatId,

        user_id:
          userId,

        permissions: {
          can_send_messages:
            false,

          can_send_audios:
            false,

          can_send_documents:
            false,

          can_send_photos:
            false,

          can_send_videos:
            false,

          can_send_video_notes:
            false,

          can_send_voice_notes:
            false,

          can_send_polls:
            false,

          can_send_other_messages:
            false,

          can_add_web_page_previews:
            false,

          can_change_info:
            false,

          can_invite_users:
            false,

          can_pin_messages:
            false,

          can_manage_topics:
            false
        },

        until_date:
          until,

        use_independent_chat_permissions:
          true
      }
    );

    return true;

  } catch (
    error
  ) {
    console.error(
      "Mute link user:",
      error.message
    );

    return false;
  }
}


/* =========================
   HANDLE VIOLATION
========================= */

async function handleLinkViolation(
  message,
  env,
  config,
  reason
) {
  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return false;
  }

  let deleted =
    false;

  if (
    config.deleteLinks &&
    message.message_id
  ) {
    deleted =
      await deleteLinkMessage(
        env,
        chatId,
        message.message_id
      );
  }

  const warning =
    await addLinkWarning(
      env,
      chatId,
      userId
    );

  let muted =
    false;

  if (
    config.muteAfterWarnings &&
    warning.count >=
      config.maxWarnings
  ) {
    muted =
      await muteLinkUser(
        env,
        chatId,
        userId,
        config.muteSeconds
      );

    await resetLinkWarnings(
      env,
      chatId,
      userId
    );
  }

  if (
    config.warnUser
  ) {
    const name =
      escapeHTML(
        displayName(
          message.from
        )
      );

    const warningText =
      muted
        ? [
            `🚨 <b>${name}</b>`,
            "",
            "به دلیل تکرار ارسال محتوای غیرمجاز، دسترسی ارسال پیام برای مدت کوتاهی محدود شد."
          ].join(
            "\n"
          )
        : [
            `⚠️ <b>${name}</b>`,
            "",
            "ارسال لینک یا تبلیغات در این گروه مجاز نیست.",
            "",
            `اخطار: <b>${warning.count}/${config.maxWarnings}</b>`
          ].join(
            "\n"
          );

    await sendMessage(
      env,
      chatId,
      warningText
    );
  }

  if (
    config.logActions
  ) {
    await addAuditLog(
      env,
      chatId,
      userId,
      "link_filter",
      message.message_id ||
        0,
      {
        reason,
        deleted,
        muted,
        warnings:
          warning.count
      }
    );
  }

  await incrementStat(
    env,
    chatId,
    "linkViolations"
  );

  return true;
}


/* =========================
   LINK FILTER
========================= */

async function handleAntiLinkMessage(
  message,
  env
) {
  if (
    !message ||
    !message.chat
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !userId ||
    message.from?.is_bot
  ) {
    return false;
  }

  const config =
    await getLinkConfig(
      env,
      chatId
    );

  if (
    !config.enabled
  ) {
    return false;
  }

  if (
    await canBypassLinkFilter(
      env,
      chatId,
      userId,
      config
    )
  ) {
    return false;
  }

  const text =
    [
      message.text || "",
      message.caption || ""
    ]
      .join(
        "\n"
      )
      .trim();

  if (!text) {
    return false;
  }

  const urls =
    extractUrls(
      text
    );

  if (
    urls.length
  ) {
    for (
      const url of urls
    ) {
      const result =
        classifyLink(
          url,
          config
        );

      if (
        !result.allowed
      ) {
        return await handleLinkViolation(
          message,
          env,
          config,
          `blocked_domain:${result.domain}`
        );
      }
    }
  }

  if (
    containsAdvertisement(
      text
    ) &&
    urls.length
  ) {
    return await handleLinkViolation(
      message,
      env,
      config,
      "advertisement"
    );
  }

  return false;
}


/* =========================
   LINK SETTINGS COMMAND
========================= */

async function handleLinkSettingsCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "links",
      "link",
      "antilink",
      "linkfilter",
      "ضدلینک",
      "لینک",
      "تنظیمات_لینک"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند تنظیمات ضدلینک را تغییر دهند."
    );

    return true;
  }

  const config =
    await getLinkConfig(
      env,
      chatId
    );

  const action =
    parsed.args?.[0];

  if (
    action ===
      "on" ||
    action ===
      "فعال"
  ) {
    config.enabled =
      true;

    await saveLinkConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      "🟢 ضدلینک فعال شد."
    );

    return true;
  }

  if (
    action ===
      "off" ||
    action ===
      "خاموش"
  ) {
    config.enabled =
      false;

    await saveLinkConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      "🔴 ضدلینک خاموش شد."
    );

    return true;
  }

  if (
    action ===
      "telegram"
  ) {
    config.allowTelegram =
      !config.allowTelegram;

    await saveLinkConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      config.allowTelegram
        ? "🟢 لینک تلگرام مجاز شد."
        : "🔴 لینک تلگرام مسدود شد."
    );

    return true;
  }

  if (
    action ===
      "youtube"
  ) {
    config.allowYouTube =
      !config.allowYouTube;

    await saveLinkConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      config.allowYouTube
        ? "🟢 لینک یوتیوب مجاز شد."
        : "🔴 لینک یوتیوب مسدود شد."
    );

    return true;
  }

  if (
    action ===
      "instagram"
  ) {
    config.allowInstagram =
      !config.allowInstagram;

    await saveLinkConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      config.allowInstagram
        ? "🟢 لینک اینستاگرام مجاز شد."
        : "🔴 لینک اینستاگرام مسدود شد."
    );

    return true;
  }

  await sendMessage(
    env,
    chatId,
    [
      "🔗 <b>تنظیمات ضدلینک</b>",
      "",
      `وضعیت: ${
        config.enabled
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`,
      `Telegram: ${
        config.allowTelegram
          ? "🟢"
          : "🔴"
      }`,
      `YouTube: ${
        config.allowYouTube
          ? "🟢"
          : "🔴"
      }`,
      `Instagram: ${
        config.allowInstagram
          ? "🟢"
          : "🔴"
      }`,
      "",
      "دستورات:",
      "<code>/ضدلینک فعال</code>",
      "<code>/ضدلینک خاموش</code>",
      "<code>/ضدلینک telegram</code>",
      "<code>/ضدلینک youtube</code>",
      "<code>/ضدلینک instagram</code>"
    ].join(
      "\n"
    )
  );

  return true;
}


/* =========================
   TRUSTED USER COMMAND
========================= */

async function handleTrustedLinkUserCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "trusted",
      "trust",
      "کاربر_مطمئن",
      "اعتماد"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const adminId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      adminId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران دسترسی دارند."
    );

    return true;
  }

  let targetId =
    Number(
      message.reply_to_message
        ?.from?.id ||
      0
    );

  if (
    parsed.args?.[0]
  ) {
    const numeric =
      Number(
        parsed.args[0]
      );

    if (
      Number.isFinite(
        numeric
      ) &&
      numeric > 0
    ) {
      targetId =
        numeric;
    }
  }

  if (
    !targetId
  ) {
    await sendMessage(
      env,
      chatId,
      "⚠️ روی پیام کاربر ریپلای کن یا User ID را وارد کن."
    );

    return true;
  }

  const list =
    await kvGet(
      env,
      `trusted_users:${chatId}`,
      []
    );

  const trusted =
    Array.isArray(
      list
    )
      ? list
      : [];

  const exists =
    trusted.some(
      id =>
        Number(id) ===
        Number(targetId)
    );

  if (
    exists
  ) {
    await sendMessage(
      env,
      chatId,
      "ℹ️ این کاربر از قبل در لیست کاربران مطمئن است."
    );

    return true;
  }

  trusted.push(
    targetId
  );

  await kvPut(
    env,
    `trusted_users:${chatId}`,
    trusted.slice(
      0,
      500
    )
  );

  await sendMessage(
    env,
    chatId,
    `✅ کاربر <code>${targetId}</code> به لیست کاربران مطمئن اضافه شد.`
  );

  return true;
}


/* =========================
   REMOVE TRUSTED USER
========================= */

async function handleUntrustedLinkUserCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "untrusted",
      "untrust",
      "حذف_اعتماد",
      "حذف_کاربر_مطمئن"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const adminId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      adminId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران دسترسی دارند."
    );

    return true;
  }

  let targetId =
    Number(
      message.reply_to_message
        ?.from?.id ||
      0
    );

  if (
    parsed.args?.[0]
  ) {
    const numeric =
      Number(
        parsed.args[0]
      );

    if (
      Number.isFinite(
        numeric
      ) &&
      numeric > 0
    ) {
      targetId =
        numeric;
    }
  }

  if (
    !targetId
  ) {
    await sendMessage(
      env,
      chatId,
      "⚠️ User ID را وارد کن یا روی پیام کاربر ریپلای کن."
    );

    return true;
  }

  const list =
    await kvGet(
      env,
      `trusted_users:${chatId}`,
      []
    );

  const trusted =
    Array.isArray(
      list
    )
      ? list
      : [];

  const filtered =
    trusted.filter(
      id =>
        Number(id) !==
        Number(targetId)
    );

  await kvPut(
    env,
    `trusted_users:${chatId}`,
    filtered
  );

  await sendMessage(
    env,
    chatId,
    `🗑️ کاربر <code>${targetId}</code> از لیست کاربران مطمئن حذف شد.`
  );

  return true;
}


/* =========================
   ANTI-LINK ROUTER
========================= */

async function routeAntiLinkSystem(
  message,
  env
) {
  if (
    await handleLinkSettingsCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleTrustedLinkUserCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleUntrustedLinkUserCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleAntiLinkMessage(
      message,
      env
    )
  ) {
    return true;
  }

  return false;
}
/* ============================================================
   PART 30 — ADVANCED ANTI-SPAM / FLOOD PROTECTION
============================================================ */

const ANTI_SPAM_DEFAULTS = {
  enabled: true,

  windowSeconds: 10,

  maxMessages: 6,

  maxRepeatedMessages: 3,

  maxWarnings: 3,

  muteSeconds: 300,

  deleteSpam: true,

  warnUser: true,

  ignoreAdmins: true,

  logActions: true
};


/* =========================
   CONFIG
========================= */

async function getAntiSpamConfig(
  env,
  chatId
) {
  const saved =
    await kvGet(
      env,
      `antispam:${chatId}`,
      null
    );

  return {
    ...ANTI_SPAM_DEFAULTS,
    ...(saved || {})
  };
}


async function saveAntiSpamConfig(
  env,
  chatId,
  config
) {
  const normalized = {
    ...ANTI_SPAM_DEFAULTS,
    ...(config || {})
  };

  normalized.enabled =
    Boolean(
      normalized.enabled
    );

  normalized.windowSeconds =
    Math.max(
      3,
      Math.min(
        60,
        Number(
          normalized.windowSeconds ||
          10
        )
      )
    );

  normalized.maxMessages =
    Math.max(
      2,
      Math.min(
        30,
        Number(
          normalized.maxMessages ||
          6
        )
      )
    );

  normalized.maxRepeatedMessages =
    Math.max(
      2,
      Math.min(
        10,
        Number(
          normalized.maxRepeatedMessages ||
          3
        )
      )
    );

  normalized.maxWarnings =
    Math.max(
      1,
      Math.min(
        10,
        Number(
          normalized.maxWarnings ||
          3
        )
      )
    );

  normalized.muteSeconds =
    Math.max(
      30,
      Math.min(
        86400,
        Number(
          normalized.muteSeconds ||
          300
        )
      )
    );

  normalized.deleteSpam =
    Boolean(
      normalized.deleteSpam
    );

  normalized.warnUser =
    Boolean(
      normalized.warnUser
    );

  normalized.ignoreAdmins =
    Boolean(
      normalized.ignoreAdmins
    );

  normalized.logActions =
    Boolean(
      normalized.logActions
    );

  await kvPut(
    env,
    `antispam:${chatId}`,
    normalized
  );

  return normalized;
}


/* =========================
   USER MESSAGE HISTORY
========================= */

function spamHistoryKey(
  chatId,
  userId
) {
  return `spam_history:${chatId}:${userId}`;
}


async function getSpamHistory(
  env,
  chatId,
  userId
) {
  const history =
    await kvGet(
      env,
      spamHistoryKey(
        chatId,
        userId
      ),
      []
    );

  return Array.isArray(
    history
  )
    ? history
    : [];
}


async function saveSpamHistory(
  env,
  chatId,
  userId,
  history
) {
  await kvPut(
    env,
    spamHistoryKey(
      chatId,
      userId
    ),
    history.slice(
      -30
    )
  );
}


/* =========================
   NORMALIZE MESSAGE
========================= */

function normalizeSpamText(
  text
) {
  return String(
    text || ""
  )
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    )
    .replace(
      /(.)\1{5,}/g,
      "$1$1"
    )
    .trim()
    .slice(
      0,
      1000
    );
}


/* =========================
   HASH SIMPLE TEXT
========================= */

async function simpleTextHash(
  text
) {
  const encoder =
    new TextEncoder();

  const data =
    encoder.encode(
      String(
        text || ""
      )
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array
    .from(
      new Uint8Array(
        digest
      )
    )
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(
            2,
            "0"
          )
    )
    .join("");
}


/* =========================
   USER WARNING
========================= */

function spamWarningKey(
  chatId,
  userId
) {
  return `spam_warnings:${chatId}:${userId}`;
}


async function getSpamWarnings(
  env,
  chatId,
  userId
) {
  const value =
    await kvGet(
      env,
      spamWarningKey(
        chatId,
        userId
      ),
      {
        count: 0
      }
    );

  return {
    count:
      Number(
        value?.count ||
        0
      )
  };
}


async function addSpamWarning(
  env,
  chatId,
  userId
) {
  const current =
    await getSpamWarnings(
      env,
      chatId,
      userId
    );

  const next = {
    count:
      current.count +
      1
  };

  await kvPut(
    env,
    spamWarningKey(
      chatId,
      userId
    ),
    next
  );

  return next;
}


async function resetSpamWarnings(
  env,
  chatId,
  userId
) {
  await kvPut(
    env,
    spamWarningKey(
      chatId,
      userId
    ),
    {
      count: 0
    }
  );
}


/* =========================
   SPAM ANALYSIS
========================= */

async function analyzeSpamMessage(
  message,
  env,
  config
) {
  const chatId =
    message?.chat?.id;

  const userId =
    Number(
      message?.from?.id ||
      0
    );

  if (
    !chatId ||
    !userId
  ) {
    return {
      spam: false,
      reason: ""
    };
  }

  const text =
    normalizeSpamText(
      [
        message.text ||
          "",
        message.caption ||
          ""
      ].join(
        "\n"
      )
    );

  const now =
    Date.now();

  const windowMs =
    config.windowSeconds *
    1000;

  let history =
    await getSpamHistory(
      env,
      chatId,
      userId
    );

  history =
    history.filter(
      item =>
        now -
          Number(
            item.time || 0
          ) <=
        windowMs
    );

  const hash =
    await simpleTextHash(
      text
    );

  const sameCount =
    history.filter(
      item =>
        item.hash ===
        hash
    ).length;

  history.push({
    time: now,
    hash
  });

  await saveSpamHistory(
    env,
    chatId,
    userId,
    history
  );

  if (
    history.length >
    config.maxMessages
  ) {
    return {
      spam: true,
      reason:
        "message_flood"
    };
  }

  if (
    text &&
    sameCount >=
      config.maxRepeatedMessages
  ) {
    return {
      spam: true,
      reason:
        "repeated_message"
    };
  }

  return {
    spam: false,
    reason: ""
  };
}


/* =========================
   HANDLE SPAM
========================= */

async function handleSpamViolation(
  message,
  env,
  config,
  reason
) {
  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  let deleted =
    false;

  if (
    config.deleteSpam &&
    message.message_id
  ) {
    deleted =
      await deleteLinkMessage(
        env,
        chatId,
        message.message_id
      );
  }

  const warning =
    await addSpamWarning(
      env,
      chatId,
      userId
    );

  let muted =
    false;

  if (
    warning.count >=
      config.maxWarnings
  ) {
    muted =
      await muteLinkUser(
        env,
        chatId,
        userId,
        config.muteSeconds
      );

    await resetSpamWarnings(
      env,
      chatId,
      userId
    );
  }

  if (
    config.warnUser
  ) {
    const name =
      escapeHTML(
        displayName(
          message.from
        )
      );

    const warningText =
      muted
        ? [
            `🚨 <b>${name}</b>`,
            "",
            "به دلیل ارسال مکرر پیام، دسترسی ارسال پیام شما موقتاً محدود شد."
          ].join(
            "\n"
          )
        : [
            `⚠️ <b>${name}</b>`,
            "",
            "ارسال پیام‌های پشت‌سرهم یا تکراری مجاز نیست.",
            "",
            `اخطار: <b>${warning.count}/${config.maxWarnings}</b>`
          ].join(
            "\n"
          );

    await sendMessage(
      env,
      chatId,
      warningText
    );
  }

  if (
    config.logActions
  ) {
    await addAuditLog(
      env,
      chatId,
      userId,
      "anti_spam",
      message.message_id ||
        0,
      {
        reason,
        deleted,
        muted,
        warnings:
          warning.count
      }
    );
  }

  await incrementStat(
    env,
    chatId,
    "spamViolations"
  );

  return true;
}


/* =========================
   MAIN ANTI-SPAM HANDLER
========================= */

async function handleAntiSpamMessage(
  message,
  env
) {
  if (
    !message?.chat ||
    !message?.from
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from.id ||
      0
    );

  if (
    !userId ||
    message.from.is_bot
  ) {
    return false;
  }

  const config =
    await getAntiSpamConfig(
      env,
      chatId
    );

  if (
    !config.enabled
  ) {
    return false;
  }

  if (
    config.ignoreAdmins &&
    await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    return false;
  }

  const result =
    await analyzeSpamMessage(
      message,
      env,
      config
    );

  if (
    !result.spam
  ) {
    return false;
  }

  return await handleSpamViolation(
    message,
    env,
    config,
    result.reason
  );
}


/* =========================
   ANTI-SPAM SETTINGS
========================= */

async function handleAntiSpamCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "antispam",
      "spam",
      "ضداسپم",
      "ضد_اسپم",
      "اسپم"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند تنظیمات ضداسپم را تغییر دهند."
    );

    return true;
  }

  const config =
    await getAntiSpamConfig(
      env,
      chatId
    );

  const action =
    parsed.args?.[0];

  /* ON */

  if (
    action ===
      "on" ||
    action ===
      "فعال"
  ) {
    config.enabled =
      true;

    await saveAntiSpamConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      "🟢 سیستم ضداسپم فعال شد."
    );

    return true;
  }

  /* OFF */

  if (
    action ===
      "off" ||
    action ===
      "خاموش"
  ) {
    config.enabled =
      false;

    await saveAntiSpamConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      "🔴 سیستم ضداسپم خاموش شد."
    );

    return true;
  }

  /* STATUS */

  await sendMessage(
    env,
    chatId,
    [
      "🛡️ <b>سیستم ضداسپم</b>",
      "",
      `وضعیت: ${
        config.enabled
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`,
      `حداکثر پیام: <b>${config.maxMessages}</b>`,
      `بازه زمانی: <b>${config.windowSeconds}</b> ثانیه`,
      `تکرار مجاز: <b>${config.maxRepeatedMessages}</b>`,
      `حداکثر اخطار: <b>${config.maxWarnings}</b>`,
      `محدودیت: <b>${config.muteSeconds}</b> ثانیه`,
      "",
      "دستورات:",
      "<code>/ضداسپم فعال</code>",
      "<code>/ضداسپم خاموش</code>"
    ].join(
      "\n"
    )
  );

  return true;
}


/* =========================
   ROUTER
========================= */

async function routeAntiSpamSystem(
  message,
  env
) {
  if (
    await handleAntiSpamCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleAntiSpamMessage(
      message,
      env
    )
  ) {
    return true;
  }

  return false;
}
/* ============================================================
   PART 31 — ADVANCED WELCOME & GOODBYE SYSTEM
============================================================ */


/* =========================
   DEFAULT CONFIG
========================= */

function getDefaultWelcomeConfig() {
  return {
    welcomeEnabled: true,
    goodbyeEnabled: true,

    deletePreviousWelcome: false,

    welcomeText:
      "👋 سلام {name}!\n\nبه {group} خوش اومدی 🌹",

    goodbyeText:
      "👋 {name} از گروه خارج شد.",

    showUserId: false,
    showUsername: true,

    mentionUser: true,

    sendRulesButton: true,

    autoDeleteSeconds: 0
  };
}


/* =========================
   GET CONFIG
========================= */

async function getWelcomeConfig(
  env,
  chatId
) {
  const saved =
    await kvGet(
      env,
      `welcome_config:${chatId}`,
      null
    );

  return {
    ...getDefaultWelcomeConfig(),
    ...(saved || {})
  };
}


/* =========================
   SAVE CONFIG
========================= */

async function saveWelcomeConfig(
  env,
  chatId,
  config
) {
  const normalized = {
    ...getDefaultWelcomeConfig(),
    ...(config || {})
  };

  normalized.welcomeEnabled =
    Boolean(
      normalized.welcomeEnabled
    );

  normalized.goodbyeEnabled =
    Boolean(
      normalized.goodbyeEnabled
    );

  normalized.deletePreviousWelcome =
    Boolean(
      normalized.deletePreviousWelcome
    );

  normalized.showUserId =
    Boolean(
      normalized.showUserId
    );

  normalized.showUsername =
    Boolean(
      normalized.showUsername
    );

  normalized.mentionUser =
    Boolean(
      normalized.mentionUser
    );

  normalized.sendRulesButton =
    Boolean(
      normalized.sendRulesButton
    );

  normalized.welcomeText =
    String(
      normalized.welcomeText ||
      ""
    )
      .slice(
        0,
        1000
      );

  normalized.goodbyeText =
    String(
      normalized.goodbyeText ||
      ""
    )
      .slice(
        0,
        1000
      );

  normalized.autoDeleteSeconds =
    Math.max(
      0,
      Math.min(
        86400,
        Number(
          normalized.autoDeleteSeconds ||
          0
        )
      )
    );

  await kvPut(
    env,
    `welcome_config:${chatId}`,
    normalized
  );

  return normalized;
}


/* =========================
   TEMPLATE VARIABLES
========================= */

function buildWelcomeVariables(
  user,
  chat
) {
  const firstName =
    String(
      user?.first_name ||
      ""
    ).trim();

  const lastName =
    String(
      user?.last_name ||
      ""
    ).trim();

  const fullName =
    `${firstName} ${lastName}`
      .trim() ||
      "کاربر";

  const username =
    user?.username
      ? `@${user.username}`
      : "ندارد";

  return {
    name:
      escapeHTML(
        fullName
      ),

    first_name:
      escapeHTML(
        firstName ||
        "کاربر"
      ),

    last_name:
      escapeHTML(
        lastName
      ),

    username:
      escapeHTML(
        username
      ),

    user_id:
      String(
        user?.id ||
        ""
      ),

    group:
      escapeHTML(
        chat?.title ||
        "گروه"
      ),

    chat_id:
      String(
        chat?.id ||
        ""
      )
  };
}


/* =========================
   APPLY TEMPLATE
========================= */

function applyWelcomeTemplate(
  template,
  variables
) {
  let result =
    String(
      template ||
      ""
    );

  for (
    const [
      key,
      value
    ] of Object.entries(
      variables
    )
  ) {
    result =
      result.replaceAll(
        `{${key}}`,
        value
      );
  }

  return result;
}


/* =========================
   USER MENTION
========================= */

function buildUserMention(
  user,
  config
) {
  if (
    !config.mentionUser ||
    !user?.id
  ) {
    return escapeHTML(
      user?.first_name ||
      "کاربر"
    );
  }

  const name =
    escapeHTML(
      [
        user.first_name,
        user.last_name
      ]
        .filter(
          Boolean
        )
        .join(" ") ||
        "کاربر"
    );

  return `<a href="tg://user?id=${Number(
    user.id
  )}">${name}</a>`;
}


/* =========================
   WELCOME KEY
========================= */

function welcomeMessageKey(
  chatId
) {
  return `last_welcome:${chatId}`;
}


/* =========================
   SAVE LAST WELCOME
========================= */

async function saveLastWelcomeMessage(
  env,
  chatId,
  messageId
) {
  await kvPut(
    env,
    welcomeMessageKey(
      chatId
    ),
    {
      messageId:
        Number(
          messageId
        ),

      updatedAt:
        Date.now()
    }
  );
}


/* =========================
   DELETE PREVIOUS WELCOME
========================= */

async function deletePreviousWelcome(
  env,
  chatId
) {
  const previous =
    await kvGet(
      env,
      welcomeMessageKey(
        chatId
      ),
      null
    );

  if (
    !previous?.messageId
  ) {
    return false;
  }

  try {
    await telegram(
      env,
      "deleteMessage",
      {
        chat_id:
          chatId,

        message_id:
          previous.messageId
      }
    );

    return true;

  } catch {
    return false;
  }
}


/* =========================
   WELCOME KEYBOARD
========================= */

function buildWelcomeKeyboard(
  config
) {
  if (
    !config.sendRulesButton
  ) {
    return undefined;
  }

  return {
    inline_keyboard: [
      [
        {
          text:
            "📜 قوانین گروه",

          callback_data:
            "rules:view"
        }
      ]
    ]
  };
}


/* =========================
   SEND WELCOME
========================= */

async function sendWelcomeMessage(
  env,
  message,
  user,
  config
) {
  const chatId =
    message.chat.id;

  if (
    config.deletePreviousWelcome
  ) {
    await deletePreviousWelcome(
      env,
      chatId
    );
  }

  const variables =
    buildWelcomeVariables(
      user,
      message.chat
    );

  let text =
    applyWelcomeTemplate(
      config.welcomeText,
      variables
    );

  if (
    config.mentionUser
  ) {
    const mention =
      buildUserMention(
        user,
        config
      );

    text =
      text.replace(
        /\{mention\}/g,
        mention
      );
  }

  if (
    config.showUsername &&
    user?.username
  ) {
    text +=
      `\n\n👤 ${escapeHTML(
        `@${user.username}`
      )}`;
  }

  if (
    config.showUserId &&
    user?.id
  ) {
    text +=
      `\n🆔 <code>${Number(
        user.id
      )}</code>`;
  }

  try {
    const result =
      await telegram(
        env,
        "sendMessage",
        {
          chat_id:
            chatId,

          text,

          parse_mode:
            "HTML",

          reply_markup:
            buildWelcomeKeyboard(
              config
            )
        }
      );

    const sentMessageId =
      result?.result
        ?.message_id;

    if (
      sentMessageId
    ) {
      await saveLastWelcomeMessage(
        env,
        chatId,
        sentMessageId
      );

      if (
        config.autoDeleteSeconds >
        0
      ) {
        try {
          await scheduleDeleteMessage(
            env,
            chatId,
            sentMessageId,
            config.autoDeleteSeconds
          );
        } catch (
          error
        ) {
          console.error(
            "Welcome auto delete:",
            error.message
          );
        }
      }
    }

    return true;

  } catch (
    error
  ) {
    console.error(
      "Welcome message:",
      error.message
    );

    return false;
  }
}


/* =========================
   SEND GOODBYE
========================= */

async function sendGoodbyeMessage(
  env,
  message,
  user,
  config
) {
  const chatId =
    message.chat.id;

  const variables =
    buildWelcomeVariables(
      user,
      message.chat
    );

  let text =
    applyWelcomeTemplate(
      config.goodbyeText,
      variables
    );

  if (
    config.mentionUser
  ) {
    const mention =
      buildUserMention(
        user,
        config
      );

    text =
      text.replace(
        /\{mention\}/g,
        mention
      );
  }

  if (
    config.showUsername &&
    user?.username
  ) {
    text +=
      `\n\n👤 ${escapeHTML(
        `@${user.username}`
      )}`;
  }

  if (
    config.showUserId &&
    user?.id
  ) {
    text +=
      `\n🆔 <code>${Number(
        user.id
      )}</code>`;
  }

  try {
    await sendMessage(
      env,
      chatId,
      text
    );

    return true;

  } catch (
    error
  ) {
    console.error(
      "Goodbye message:",
      error.message
    );

    return false;
  }
}


/* =========================
   HANDLE NEW MEMBERS
========================= */

async function handleAdvancedWelcome(
  message,
  env
) {
  if (
    !message?.new_chat_members
      ?.length
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const config =
    await getWelcomeConfig(
      env,
      chatId
    );

  if (
    !config.welcomeEnabled
  ) {
    return false;
  }

  for (
    const user of
      message.new_chat_members
  ) {
    if (
      user?.is_bot
    ) {
      continue;
    }

    await sendWelcomeMessage(
      env,
      message,
      user,
      config
    );
  }

  await incrementStat(
    env,
    chatId,
    "welcomes"
  );

  return true;
}


/* =========================
   HANDLE LEFT MEMBERS
========================= */

async function handleAdvancedGoodbye(
  message,
  env
) {
  const member =
    message?.left_chat_member;

  if (
    !member
  ) {
    return false;
  }

  if (
    member.is_bot
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const config =
    await getWelcomeConfig(
      env,
      chatId
    );

  if (
    !config.goodbyeEnabled
  ) {
    return false;
  }

  await sendGoodbyeMessage(
    env,
    message,
    member,
    config
  );

  await incrementStat(
    env,
    chatId,
    "goodbyes"
  );

  return true;
}


/* =========================
   WELCOME SETTINGS COMMAND
========================= */

async function handleWelcomeCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "welcome",
      "goodbye",
      "greeting",
      "خوشامد",
      "خوشامدگویی",
      "ورود",
      "خروج"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند تنظیمات خوشامدگویی را تغییر دهند."
    );

    return true;
  }

  const config =
    await getWelcomeConfig(
      env,
      chatId
    );

  const command =
    parsed.command;

  const action =
    parsed.args?.[0];

  /* =========================
     WELCOME ON/OFF
  ========================= */

  if (
    command ===
      "welcome" ||
    command ===
      "خوشامد" ||
    command ===
      "خوشامدگویی" ||
    command ===
      "ورود"
  ) {
    if (
      action ===
        "on" ||
      action ===
        "فعال"
    ) {
      config.welcomeEnabled =
        true;

      await saveWelcomeConfig(
        env,
        chatId,
        config
      );

      await sendMessage(
        env,
        chatId,
        "🟢 خوشامدگویی فعال شد."
      );

      return true;
    }

    if (
      action ===
        "off" ||
      action ===
        "خاموش"
    ) {
      config.welcomeEnabled =
        false;

      await saveWelcomeConfig(
        env,
        chatId,
        config
      );

      await sendMessage(
        env,
        chatId,
        "🔴 خوشامدگویی خاموش شد."
      );

      return true;
    }
  }


  /* =========================
     GOODBYE ON/OFF
  ========================= */

  if (
    command ===
      "goodbye" ||
    command ===
      "خروج"
  ) {
    if (
      action ===
        "on" ||
      action ===
        "فعال"
    ) {
      config.goodbyeEnabled =
        true;

      await saveWelcomeConfig(
        env,
        chatId,
        config
      );

      await sendMessage(
        env,
        chatId,
        "🟢 پیام خروج فعال شد."
      );

      return true;
    }

    if (
      action ===
        "off" ||
      action ===
        "خاموش"
    ) {
      config.goodbyeEnabled =
        false;

      await saveWelcomeConfig(
        env,
        chatId,
        config
      );

      await sendMessage(
        env,
        chatId,
        "🔴 پیام خروج خاموش شد."
      );

      return true;
    }
  }


  /* =========================
     STATUS
  ========================= */

  await sendMessage(
    env,
    chatId,
    [
      "👋 <b>سیستم خوشامدگویی</b>",
      "",
      `ورود: ${
        config.welcomeEnabled
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`,
      `خروج: ${
        config.goodbyeEnabled
          ? "🟢 فعال"
          : "🔴 خاموش"
      }`,
      `دکمه قوانین: ${
        config.sendRulesButton
          ? "🟢"
          : "🔴"
      }`,
      `نمایش Username: ${
        config.showUsername
          ? "🟢"
          : "🔴"
      }`,
      `نمایش ID: ${
        config.showUserId
          ? "🟢"
          : "🔴"
      }`,
      "",
      "نمونه دستورات:",
      "<code>/welcome on</code>",
      "<code>/welcome off</code>",
      "<code>/goodbye on</code>",
      "<code>/goodbye off</code>"
    ].join(
      "\n"
    )
  );

  return true;
}


/* =========================
   MAIN ROUTER
========================= */

async function routeWelcomeSystem(
  message,
  env
) {
  if (
    await handleWelcomeCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleAdvancedWelcome(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleAdvancedGoodbye(
      message,
      env
    )
  ) {
    return true;
  }

  return false;
}
/* ============================================================
   PART 32 — UNIFIED ADMIN PANEL
============================================================ */


/* =========================
   ADMIN PANEL TEXT
========================= */

function buildAdminPanelText(
  config
) {
  return [
    "🎛️ <b>پنل مدیریت ربات</b>",
    "",
    "از دکمه‌های زیر برای مدیریت گروه استفاده کن.",
    "",
    `🛡️ ضداسپم: ${
      config.antispam
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    `🔗 ضدلینک: ${
      config.antilink
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    `👋 خوشامدگویی: ${
      config.welcome
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`,
    `📜 قوانین: ${
      config.rules
        ? "🟢 فعال"
        : "🔴 خاموش"
    }`
  ].join(
    "\n"
  );
}


/* =========================
   PANEL KEYBOARD
========================= */

function buildAdminPanelKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text:
            "🛡️ ضداسپم",

          callback_data:
            "admin:antispam"
        },
        {
          text:
            "🔗 ضدلینک",

          callback_data:
            "admin:antilink"
        }
      ],

      [
        {
          text:
            "👋 خوشامدگویی",

          callback_data:
            "admin:welcome"
        },
        {
          text:
            "📜 قوانین",

          callback_data:
            "admin:rules"
        }
      ],

      [
        {
          text:
            "📊 آمار",

          callback_data:
            "admin:stats"
        },

        {
          text:
            "🔄 بروزرسانی",

          callback_data:
            "admin:refresh"
        }
      ]
    ]
  };
}


/* =========================
   GET PANEL STATUS
========================= */

async function getAdminPanelStatus(
  env,
  chatId
) {
  const antispam =
    await getAntiSpamConfig(
      env,
      chatId
    );

  const antilink =
    await getLinkConfig(
      env,
      chatId
    );

  const welcome =
    await getWelcomeConfig(
      env,
      chatId
    );

  const rules =
    await getRulesConfig(
      env,
      chatId
    );

  return {
    antispam:
      Boolean(
        antispam.enabled
      ),

    antilink:
      Boolean(
        antilink.enabled
      ),

    welcome:
      Boolean(
        welcome.welcomeEnabled
      ),

    rules:
      Boolean(
        rules.enabled
      )
  };
}


/* =========================
   SHOW ADMIN PANEL
========================= */

async function showAdminPanel(
  env,
  chatId,
  messageId = null
) {
  const status =
    await getAdminPanelStatus(
      env,
      chatId
    );

  const payload = {
    chat_id:
      chatId,

    text:
      buildAdminPanelText(
        status
      ),

    parse_mode:
      "HTML",

    reply_markup:
      buildAdminPanelKeyboard()
  };

  if (
    messageId
  ) {
    payload.message_id =
      messageId;

    try {
      await telegram(
        env,
        "editMessageText",
        payload
      );

      return true;

    } catch {
      return false;
    }
  }

  await telegram(
    env,
    "sendMessage",
    payload
  );

  return true;
}


/* =========================
   ADMIN PANEL COMMAND
========================= */

async function handleAdminPanelCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "panel",
      "admin",
      "adminpanel",
      "مدیریت",
      "پنل",
      "پنل_مدیریت"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند پنل مدیریت را باز کنند."
    );

    return true;
  }

  await showAdminPanel(
    env,
    chatId
  );

  return true;
}


/* =========================
   ADMIN CALLBACK
========================= */

async function handleAdminPanelCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data ||
      ""
    );

  if (
    !data.startsWith(
      "admin:"
    )
  ) {
    return false;
  }

  const chatId =
    callback.message
      ?.chat?.id;

  const messageId =
    callback.message
      ?.message_id;

  const userId =
    Number(
      callback.from?.id ||
      0
    );

  if (
    !chatId ||
    !messageId
  ) {
    return true;
  }

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            "⛔ فقط مدیران دسترسی دارند.",

          show_alert:
            true
        }
      );
    } catch {}

    return true;
  }


  /* =========================
     REFRESH
  ========================= */

  if (
    data ===
    "admin:refresh"
  ) {
    await showAdminPanel(
      env,
      chatId,
      messageId
    );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            "🔄 پنل بروزرسانی شد."
        }
      );
    } catch {}

    return true;
  }


  /* =========================
     ANTISPAM
  ========================= */

  if (
    data ===
    "admin:antispam"
  ) {
    const config =
      await getAntiSpamConfig(
        env,
        chatId
      );

    config.enabled =
      !config.enabled;

    await saveAntiSpamConfig(
      env,
      chatId,
      config
    );

    await showAdminPanel(
      env,
      chatId,
      messageId
    );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            config.enabled
              ? "🟢 ضداسپم فعال شد."
              : "🔴 ضداسپم خاموش شد."
        }
      );
    } catch {}

    return true;
  }


  /* =========================
     ANTILINK
  ========================= */

  if (
    data ===
    "admin:antilink"
  ) {
    const config =
      await getLinkConfig(
        env,
        chatId
      );

    config.enabled =
      !config.enabled;

    await saveLinkConfig(
      env,
      chatId,
      config
    );

    await showAdminPanel(
      env,
      chatId,
      messageId
    );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            config.enabled
              ? "🟢 ضدلینک فعال شد."
              : "🔴 ضدلینک خاموش شد."
        }
      );
    } catch {}

    return true;
  }


  /* =========================
     WELCOME
  ========================= */

  if (
    data ===
    "admin:welcome"
  ) {
    const config =
      await getWelcomeConfig(
        env,
        chatId
      );

    config.welcomeEnabled =
      !config.welcomeEnabled;

    await saveWelcomeConfig(
      env,
      chatId,
      config
    );

    await showAdminPanel(
      env,
      chatId,
      messageId
    );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            config.welcomeEnabled
              ? "🟢 خوشامدگویی فعال شد."
              : "🔴 خوشامدگویی خاموش شد."
        }
      );
    } catch {}

    return true;
  }


  /* =========================
     RULES
  ========================= */

  if (
    data ===
    "admin:rules"
  ) {
    const config =
      await getRulesConfig(
        env,
        chatId
      );

    config.enabled =
      !config.enabled;

    await saveRulesConfig(
      env,
      chatId,
      config
    );

    await showAdminPanel(
      env,
      chatId,
      messageId
    );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            config.enabled
              ? "🟢 قوانین فعال شد."
              : "🔴 قوانین خاموش شد."
        }
      );
    } catch {}

    return true;
  }


  /* =========================
     STATS
  ========================= */

  if (
    data ===
    "admin:stats"
  ) {
    const stats =
      await getChatStats(
        env,
        chatId
      );

    const text = [
      "📊 <b>آمار گروه</b>",
      "",
      `👥 اعضای جدید: <b>${
        Number(
          stats?.welcomes ||
          0
        )
      }</b>`,
      `🚪 خروج‌ها: <b>${
        Number(
          stats?.goodbyes ||
          0
        )
      }</b>`,
      `🔗 تخلفات لینک: <b>${
        Number(
          stats?.linkViolations ||
          0
        )
      }</b>`,
      `🛡️ تخلفات اسپم: <b>${
        Number(
          stats?.spamViolations ||
          0
        )
      }</b>`
    ].join(
      "\n"
    );

    try {
      await telegram(
        env,
        "editMessageText",
        {
          chat_id:
            chatId,

          message_id:
            messageId,

          text,

          parse_mode:
            "HTML",

          reply_markup: {
            inline_keyboard: [
              [
                {
                  text:
                    "⬅️ برگشت",

                  callback_data:
                    "admin:refresh"
                }
              ]
            ]
          }
        }
      );
    } catch {}

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id
        }
      );
    } catch {}

    return true;
  }

  return true;
}


/* =========================
   ADMIN PANEL ROUTER
========================= */

async function routeAdminPanelSystem(
  update,
  env
) {
  if (
    update?.callback_query
  ) {
    return await handleAdminPanelCallback(
      update.callback_query,
      env
    );
  }

  if (
    update?.message
  ) {
    return await handleAdminPanelCommand(
      update.message,
      env
    );
  }

  return false;
}
/* ============================================================
   PART 33 — ADVANCED GROUP RULES SYSTEM
============================================================ */


/* =========================
   DEFAULT RULES
========================= */

function getDefaultRulesConfig() {
  return {
    enabled: true,

    text:
      "📜 <b>قوانین گروه</b>\n\n" +
      "1️⃣ احترام به اعضای گروه الزامی است.\n" +
      "2️⃣ ارسال تبلیغات و اسپم ممنوع است.\n" +
      "3️⃣ ارسال لینک بدون اجازه ممنوع است.\n" +
      "4️⃣ محتوای نامناسب و مزاحمت برای اعضا ممنوع است.\n" +
      "5️⃣ تصمیم نهایی مدیریت گروه لازم‌الاجراست.",

    showButton: true,

    buttonText:
      "📜 مشاهده قوانین"
  };
}


/* =========================
   GET RULES CONFIG
========================= */

async function getRulesConfig(
  env,
  chatId
) {
  const saved =
    await kvGet(
      env,
      `rules_config:${chatId}`,
      null
    );

  return {
    ...getDefaultRulesConfig(),
    ...(saved || {})
  };
}


/* =========================
   SAVE RULES CONFIG
========================= */

async function saveRulesConfig(
  env,
  chatId,
  config
) {
  const normalized = {
    ...getDefaultRulesConfig(),
    ...(config || {})
  };

  normalized.enabled =
    Boolean(
      normalized.enabled
    );

  normalized.showButton =
    Boolean(
      normalized.showButton
    );

  normalized.text =
    String(
      normalized.text ||
      ""
    )
      .slice(
        0,
        4000
      );

  normalized.buttonText =
    String(
      normalized.buttonText ||
      "📜 مشاهده قوانین"
    )
      .slice(
        0,
        100
      );

  await kvPut(
    env,
    `rules_config:${chatId}`,
    normalized
  );

  return normalized;
}


/* =========================
   RULES KEYBOARD
========================= */

function buildRulesKeyboard(
  config
) {
  if (
    !config.showButton
  ) {
    return undefined;
  }

  return {
    inline_keyboard: [
      [
        {
          text:
            config.buttonText,

          callback_data:
            "rules:view"
        }
      ]
    ]
  };
}


/* =========================
   SHOW RULES
========================= */

async function showGroupRules(
  env,
  chatId,
  editMessageId = null
) {
  const config =
    await getRulesConfig(
      env,
      chatId
    );

  if (
    !config.enabled
  ) {
    const text =
      "ℹ️ قوانین این گروه هنوز فعال نشده است.";

    if (
      editMessageId
    ) {
      try {
        await telegram(
          env,
          "editMessageText",
          {
            chat_id:
              chatId,

            message_id:
              editMessageId,

            text,

            parse_mode:
              "HTML",

            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text:
                      "⬅️ برگشت",

                    callback_data:
                      "rules:back"
                  }
                ]
              ]
            }
          }
        );

        return true;

      } catch {
        return false;
      }
    }

    await sendMessage(
      env,
      chatId,
      text
    );

    return true;
  }

  if (
    editMessageId
  ) {
    try {
      await telegram(
        env,
        "editMessageText",
        {
          chat_id:
            chatId,

          message_id:
            editMessageId,

          text:
            config.text,

          parse_mode:
            "HTML",

          reply_markup: {
            inline_keyboard: [
              [
                {
                  text:
                    "⬅️ برگشت",

                  callback_data:
                    "rules:back"
                }
              ]
            ]
          }
        }
      );

      return true;

    } catch {
      return false;
    }
  }

  try {
    await telegram(
      env,
      "sendMessage",
      {
        chat_id:
          chatId,

        text:
          config.text,

        parse_mode:
          "HTML",

        reply_markup:
          buildRulesKeyboard(
            config
          )
      }
    );

    return true;

  } catch (
    error
  ) {
    console.error(
      "Show rules:",
      error.message
    );

    return false;
  }
}


/* =========================
   RULES COMMAND
========================= */

async function handleRulesCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "rules",
      "rule",
      "قوانین",
      "قانون",
      "قوانین_گروه"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  await showGroupRules(
    env,
    chatId
  );

  return true;
}


/* =========================
   SET RULES COMMAND
========================= */

async function handleSetRulesCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "setrules",
      "setrule",
      "تنظیم_قوانین",
      "تغییر_قوانین"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند قوانین را تغییر دهند."
    );

    return true;
  }

  const newText =
    parsed.args
      ?.join(" ")
      .trim();

  if (
    !newText
  ) {
    await sendMessage(
      env,
      chatId,
      [
        "⚠️ متن قوانین را وارد کن.",
        "",
        "مثال:",
        "<code>/setrules احترام به اعضا الزامی است.</code>"
      ].join(
        "\n"
      )
    );

    return true;
  }

  const config =
    await getRulesConfig(
      env,
      chatId
    );

  config.text =
    `📜 <b>قوانین گروه</b>\n\n${escapeHTML(
      newText
    )}`;

  config.enabled =
    true;

  await saveRulesConfig(
    env,
    chatId,
    config
  );

  await sendMessage(
    env,
    chatId,
    "✅ قوانین گروه با موفقیت بروزرسانی شد."
  );

  return true;
}


/* =========================
   RULES ON/OFF
========================= */

async function handleRulesToggleCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "ruleson",
      "rulesoff",
      "قوانین_فعال",
      "قوانین_خاموش"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران دسترسی دارند."
    );

    return true;
  }

  const config =
    await getRulesConfig(
      env,
      chatId
    );

  if (
    [
      "ruleson",
      "قوانین_فعال"
    ].includes(
      parsed.command
    )
  ) {
    config.enabled =
      true;

    await saveRulesConfig(
      env,
      chatId,
      config
    );

    await sendMessage(
      env,
      chatId,
      "🟢 سیستم قوانین فعال شد."
    );

    return true;
  }

  config.enabled =
    false;

  await saveRulesConfig(
    env,
    chatId,
    config
  );

  await sendMessage(
    env,
    chatId,
    "🔴 سیستم قوانین خاموش شد."
  );

  return true;
}


/* =========================
   RULES CALLBACK
========================= */

async function handleRulesCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data ||
      ""
    );

  if (
    !data.startsWith(
      "rules:"
    )
  ) {
    return false;
  }

  const chatId =
    callback.message
      ?.chat?.id;

  const messageId =
    callback.message
      ?.message_id;

  if (
    !chatId ||
    !messageId
  ) {
    return true;
  }

  if (
    data ===
    "rules:view"
  ) {
    await showGroupRules(
      env,
      chatId,
      messageId
    );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            "📜 قوانین گروه"
        }
      );
    } catch {}

    return true;
  }

  if (
    data ===
    "rules:back"
  ) {
    const config =
      await getRulesConfig(
        env,
        chatId
      );

    try {
      await telegram(
        env,
        "editMessageText",
        {
          chat_id:
            chatId,

          message_id:
            messageId,

          text:
            "📜 برای مشاهده قوانین روی دکمه زیر بزن.",

          parse_mode:
            "HTML",

          reply_markup:
            buildRulesKeyboard(
              config
            )
        }
      );
    } catch {}

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id
        }
      );
    } catch {}

    return true;
  }

  return true;
}


/* =========================
   RULES ROUTER
========================= */

async function routeRulesSystem(
  update,
  env
) {
  if (
    update?.callback_query
  ) {
    return await handleRulesCallback(
      update.callback_query,
      env
    );
  }

  const message =
    update?.message;

  if (
    !message
  ) {
    return false;
  }

  if (
    await handleSetRulesCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleRulesToggleCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleRulesCommand(
      message,
      env
    )
  ) {
    return true;
  }

  return false;
}
/* ============================================================
   PART 34 — GROUP STATISTICS & REPORTING SYSTEM
============================================================ */


/* =========================
   DEFAULT STATS
========================= */

function getDefaultChatStats() {
  return {
    messages: 0,
    users: 0,

    welcomes: 0,
    goodbyes: 0,

    linkViolations: 0,
    spamViolations: 0,

    warnings: 0,
    mutes: 0,
    bans: 0,

    deletedMessages: 0,

    commands: 0,

    startedAt: Date.now(),
    updatedAt: Date.now()
  };
}


/* =========================
   GET STATS
========================= */

async function getChatStats(
  env,
  chatId
) {
  const saved =
    await kvGet(
      env,
      `chat_stats:${chatId}`,
      null
    );

  return {
    ...getDefaultChatStats(),
    ...(saved || {})
  };
}


/* =========================
   SAVE STATS
========================= */

async function saveChatStats(
  env,
  chatId,
  stats
) {
  const normalized = {
    ...getDefaultChatStats(),
    ...(stats || {}),

    updatedAt:
      Date.now()
  };

  await kvPut(
    env,
    `chat_stats:${chatId}`,
    normalized
  );

  return normalized;
}


/* =========================
   INCREMENT STAT
========================= */

async function incrementStat(
  env,
  chatId,
  statName,
  amount = 1
) {
  const stats =
    await getChatStats(
      env,
      chatId
    );

  const current =
    Number(
      stats[statName] ||
      0
    );

  stats[statName] =
    Math.max(
      0,
      current +
        Number(
          amount || 1
        )
    );

  stats.updatedAt =
    Date.now();

  await saveChatStats(
    env,
    chatId,
    stats
  );

  return stats[statName];
}


/* =========================
   RESET STATS
========================= */

async function resetChatStats(
  env,
  chatId
) {
  const fresh =
    getDefaultChatStats();

  await saveChatStats(
    env,
    chatId,
    fresh
  );

  return fresh;
}


/* =========================
   FORMAT DURATION
========================= */

function formatStatsDuration(
  milliseconds
) {
  const totalSeconds =
    Math.max(
      0,
      Math.floor(
        Number(
          milliseconds || 0
        ) / 1000
      )
    );

  const days =
    Math.floor(
      totalSeconds /
        86400
    );

  const hours =
    Math.floor(
      (totalSeconds %
        86400) /
        3600
    );

  const minutes =
    Math.floor(
      (totalSeconds %
        3600) /
        60
    );

  const parts = [];

  if (
    days
  ) {
    parts.push(
      `${days} روز`
    );
  }

  if (
    hours
  ) {
    parts.push(
      `${hours} ساعت`
    );
  }

  if (
    minutes ||
    !parts.length
  ) {
    parts.push(
      `${minutes} دقیقه`
    );
  }

  return parts.join(
    " و "
  );
}


/* =========================
   BUILD STATS TEXT
========================= */

function buildChatStatsText(
  stats,
  chat
) {
  const title =
    escapeHTML(
      chat?.title ||
      "گروه"
    );

  const uptime =
    formatStatsDuration(
      Date.now() -
        Number(
          stats.startedAt ||
          Date.now()
        )
    );

  return [
    "📊 <b>گزارش آماری گروه</b>",
    "",
    `🏠 گروه: <b>${title}</b>`,
    "",
    "📨 <b>فعالیت</b>",
    `💬 پیام‌ها: <b>${Number(
      stats.messages || 0
    )}</b>`,
    `🤖 دستورات: <b>${Number(
      stats.commands || 0
    )}</b>`,
    "",
    "👥 <b>اعضا</b>",
    `👋 ورود: <b>${Number(
      stats.welcomes || 0
    )}</b>`,
    `🚪 خروج: <b>${Number(
      stats.goodbyes || 0
    )}</b>`,
    "",
    "🛡️ <b>امنیت</b>",
    `🔗 تخلف لینک: <b>${Number(
      stats.linkViolations || 0
    )}</b>`,
    `🚫 تخلف اسپم: <b>${Number(
      stats.spamViolations || 0
    )}</b>`,
    `⚠️ اخطارها: <b>${Number(
      stats.warnings || 0
    )}</b>`,
    `🔇 میوت‌ها: <b>${Number(
      stats.mutes || 0
    )}</b>`,
    `🚷 بن‌ها: <b>${Number(
      stats.bans || 0
    )}</b>`,
    `🗑️ پیام حذف‌شده: <b>${Number(
      stats.deletedMessages || 0
    )}</b>`,
    "",
    `⏱️ مدت فعالیت سیستم: <b>${uptime}</b>`
  ].join(
    "\n"
  );
}


/* =========================
   STATS KEYBOARD
========================= */

function buildStatsKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text:
            "🔄 بروزرسانی",

          callback_data:
            "stats:refresh"
        }
      ],

      [
        {
          text:
            "⬅️ پنل مدیریت",

          callback_data:
            "admin:refresh"
        }
      ]
    ]
  };
}


/* =========================
   SHOW STATS
========================= */

async function showChatStats(
  env,
  chatId,
  messageId = null
) {
  const stats =
    await getChatStats(
      env,
      chatId
    );

  let chat = null;

  try {
    const result =
      await telegram(
        env,
        "getChat",
        {
          chat_id:
            chatId
        }
      );

    chat =
      result?.result ||
      null;

  } catch (
    error
  ) {
    console.error(
      "Get chat:",
      error.message
    );
  }

  const payload = {
    chat_id:
      chatId,

    text:
      buildChatStatsText(
        stats,
        chat
      ),

    parse_mode:
      "HTML",

    reply_markup:
      buildStatsKeyboard()
  };

  if (
    messageId
  ) {
    payload.message_id =
      messageId;

    try {
      await telegram(
        env,
        "editMessageText",
        payload
      );

      return true;

    } catch {
      return false;
    }
  }

  try {
    await telegram(
      env,
      "sendMessage",
      payload
    );

    return true;

  } catch (
    error
  ) {
    console.error(
      "Show stats:",
      error.message
    );

    return false;
  }
}


/* =========================
   STATS COMMAND
========================= */

async function handleStatsCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "stats",
      "stat",
      "statistics",
      "آمار",
      "گزارش",
      "آمار_گروه"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند آمار گروه را مشاهده کنند."
    );

    return true;
  }

  await incrementStat(
    env,
    chatId,
    "commands"
  );

  await showChatStats(
    env,
    chatId
  );

  return true;
}


/* =========================
   RESET COMMAND
========================= */

async function handleStatsResetCommand(
  message,
  env
) {
  const parsed =
    parseBotCommand(
      message?.text
    );

  if (
    !parsed ||
    ![
      "resetstats",
      "resetstat",
      "ریست_آمار",
      "پاک_کردن_آمار"
    ].includes(
      parsed.command
    )
  ) {
    return false;
  }

  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id ||
      0
    );

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    await sendMessage(
      env,
      chatId,
      "⛔ فقط مدیران می‌توانند آمار را ریست کنند."
    );

    return true;
  }

  await resetChatStats(
    env,
    chatId
  );

  await sendMessage(
    env,
    chatId,
    "♻️ آمار گروه با موفقیت ریست شد."
  );

  return true;
}


/* =========================
   STATS CALLBACK
========================= */

async function handleStatsCallback(
  callback,
  env
) {
  const data =
    String(
      callback?.data ||
      ""
    );

  if (
    !data.startsWith(
      "stats:"
    )
  ) {
    return false;
  }

  const chatId =
    callback.message
      ?.chat?.id;

  const messageId =
    callback.message
      ?.message_id;

  const userId =
    Number(
      callback.from?.id ||
      0
    );

  if (
    !chatId ||
    !messageId
  ) {
    return true;
  }

  if (
    !await isAdmin(
      env,
      chatId,
      userId
    )
  ) {
    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            "⛔ فقط مدیران دسترسی دارند.",

          show_alert:
            true
        }
      );
    } catch {}

    return true;
  }

  if (
    data ===
    "stats:refresh"
  ) {
    await showChatStats(
      env,
      chatId,
      messageId
    );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id:
            callback.id,

          text:
            "🔄 آمار بروزرسانی شد."
        }
      );
    } catch {}

    return true;
  }

  return true;
}


/* =========================
   STATS ROUTER
========================= */

async function routeStatsSystem(
  update,
  env
) {
  if (
    update?.callback_query
  ) {
    return await handleStatsCallback(
      update.callback_query,
      env
    );
  }

  const message =
    update?.message;

  if (
    !message
  ) {
    return false;
  }

  if (
    await handleStatsResetCommand(
      message,
      env
    )
  ) {
    return true;
  }

  if (
    await handleStatsCommand(
      message,
      env
    )
  ) {
    return true;
  }

  return false;
}
/* ============================================================
   PART 35 — FINAL UPDATE ROUTER & SYSTEM INTEGRATION
============================================================ */


/* =========================
   SAFE ERROR MESSAGE
========================= */

function getSafeErrorMessage(
  error
) {
  if (
    !error
  ) {
    return "Unknown error";
  }

  return String(
    error.message ||
    error ||
    "Unknown error"
  ).slice(
    0,
    500
  );
}


/* =========================
   SAFE HANDLER
========================= */

async function runBotHandler(
  name,
  handler,
  update,
  env
) {
  try {
    return await handler(
      update,
      env
    );

  } catch (
    error
  ) {
    console.error(
      `[${name}]`,
      getSafeErrorMessage(
        error
      )
    );

    return false;
  }
}


/* =========================
   CALLBACK ROUTER
========================= */

async function routeCallbackQuery(
  update,
  env
) {
  if (!update?.callback_query) {
    return false;
  }

  const callback = update.callback_query;
  let data = String(callback.data || "");

  if (data.startsWith("v5:")) {
    try { return await v5RouteCallback(env, callback); }
    catch (error) { console.error("V5 callback layer:", getSafeErrorMessage(error)); return true; }
  }

  /*
   * This is the single callback entry point.  Older parts of the
   * worker use several callback namespaces, so normalize legacy
   * aliases here instead of leaving buttons to the unknown-callback
   * branch.  No existing handler is removed.
   */
  const aliases = {
    "admin:main": "panel:main",
    "admin:security": "panel:security",
    "admin:settings": "panel:settings",
    "admin:warnings": "panel:warnings",
    "admin:rules": "panel:rules",
    "admin:stats": "panel:stats",
    "admin:refresh": "panel:refresh",
    "admin:antispam": "panel:antispam",
    "admin:antilink": "panel:links",
    "security:members": "panel:moderation",
    "security:reports": "panel:reports",
    "security:links": "security:antilink"
  };

  data = aliases[data] || data;

  try {
    /* Poll buttons have their own complete state machine. */
    if (
      data.startsWith("pollvote:") ||
      data.startsWith("pollresults:") ||
      data.startsWith("pollclose:")
    ) {
      return await runBotHandler(
        "Poll Callback",
        handlePollCallback,
        { ...callback, data },
        env
      );
    }

    /* Advanced panel aliases and link/antispam controls must run
       before the legacy core router, because the legacy router
       intentionally treats these newer panel routes as unknown. */
    if (
      data.startsWith("admin:") ||
      data.startsWith("antispam:") ||
      data.startsWith("links:") ||
      data === "panel:antispam" ||
      data === "panel:links" ||
      data === "panel:reports" ||
      data === "panel:refresh"
    ) {
      const result = await runBotHandler(
        "Admin Callback",
        handleAdminPanelCallback,
        { ...callback, data },
        env
      );
      if (result !== false) return true;
    }

    /* Core panel, moderation, warning and toggle callbacks. */
    if (
      data.startsWith("panel:") ||
      data.startsWith("toggle:") ||
      data.startsWith("warning:") ||
      data.startsWith("mod:")
    ) {
      const result = await runBotHandler(
        "Core Callback",
        handleCallbackQuery,
        { ...callback, data },
        env
      );
      if (result !== false) return true;
    }

    /* Security panel has its own settings store. */
    if (data.startsWith("security:")) {
      const result = await runBotHandler(
        "Security Callback",
        handleSecurityCallback,
        { ...callback, data },
        env
      );
      if (result !== false) return true;
    }

    /* Welcome/goodbye toggles from the legacy settings panel. */
    if (
      data === "settings:welcome" ||
      data === "settings:notifications" ||
      data === "settings:cleanup"
    ) {
      const chatId = callback.message?.chat?.id;
      if (!chatId) return true;

      await answerCallback(env, callback.id);

      if (data === "settings:welcome") {
        await showWelcomePanel(env, chatId);
        return true;
      }

      if (data === "settings:notifications") {
        await callbackLogsPanel(env, callback);
        return true;
      }

      await sendMessage(
        env,
        chatId,
        [
          "🧹 <b>مدیریت پاکسازی</b>",
          "",
          "برای پاکسازی پیام‌های ثبت‌شده از دستور پاکسازی استفاده کنید."
        ].join("\n"),
        backKeyboard()
      );
      return true;
    }

    /* Complete rules/statistics handlers. */
    if (data.startsWith("rules:")) {
      const result = await runBotHandler(
        "Rules Callback",
        handleRulesCallback,
        { ...callback, data },
        env
      );
      if (result !== false) return true;
    }

    if (data.startsWith("stats:")) {
      const result = await runBotHandler(
        "Stats Callback",
        handleStatsCallback,
        { ...callback, data },
        env
      );
      if (result !== false) return true;
    }

    /* Legacy log callbacks, when present. */
    const logResult = await runBotHandler(
      "Log Callback",
      handleLogCallback,
      { ...callback, data },
      env
    );
    if (logResult !== false) return true;

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id: callback.id,
          text: "⚠️ این گزینه در نسخه فعلی پشتیبانی نمی‌شود.",
          show_alert: true
        }
      );
    } catch {}

    return true;
  } catch (error) {
    console.error(
      "Callback router:",
      getSafeErrorMessage(error)
    );

    try {
      await telegram(
        env,
        "answerCallbackQuery",
        {
          callback_query_id: callback.id,
          text: "❌ اجرای این گزینه با خطا مواجه شد.",
          show_alert: true
        }
      );
    } catch {}

    return true;
  }
}

/* =========================
   MESSAGE ROUTER
========================= */

async function routeMessage(
  update,
  env
) {
  const message =
    update?.message;

  if (
    !message
  ) {
    return false;
  }


  /*
   * Ignore messages generated
   * by the bot itself.
   */

  if (
    message.from?.is_bot
  ) {
    return false;
  }


  try {
    if (await v5StateMessage(env, message)) return true;
    if (await v5RouteMessage(env, message)) return true;
  } catch (error) {
    console.error("V5 message layer:", getSafeErrorMessage(error));
  }

  if (message.chat?.type === "group" || message.chat?.type === "supergroup") {
    try {
      const ids = await kvGet(env, `v5:messages:${message.chat.id}`, []) || [];
      if (message.message_id) { ids.push(Number(message.message_id)); await kvPut(env, `v5:messages:${message.chat.id}`, ids.slice(-500)); }
    } catch {}
  }

  const chatType =
    message.chat?.type;


  /* ==========================================================
     PRIVATE CHAT
  ========================================================== */

  if (
    chatType ===
      "private"
  ) {
    return await runBotHandler(
      "Private Handler",
      handlePrivate,
      message,
      env
    );
  }


  /* ==========================================================
     GROUP / SUPERGROUP
  ========================================================== */

  if (
    chatType ===
      "group" ||
    chatType ===
      "supergroup"
  ) {

    /*
     * Keep group statistics updated.
     */

    try {
      await incrementStat(
        env,
        message.chat.id,
        "messages"
      );
    } catch (
      error
    ) {
      console.error(
        "Message stats:",
        getSafeErrorMessage(
          error
        )
      );
    }


    /*
     * Admin panel commands.
     */

    if (
      await runBotHandler(
        "Admin Panel",
        handleAdminPanelCommand,
        message,
        env
      )
    ) {
      return true;
    }


    /*
     * Rules system.
     */

    if (
      await runBotHandler(
        "Rules",
        async (
          msg,
          runtimeEnv
        ) =>
          routeRulesSystem(
            {
              message:
                msg
            },
            runtimeEnv
          ),
        message,
        env
      )
    ) {
      return true;
    }


    /*
     * Anti-spam.
     *
     * Run before normal message
     * processing so spam can be
     * stopped early.
     */

    if (
      await runBotHandler(
        "Anti Spam",
        async (
          msg,
          runtimeEnv
        ) =>
          handleAntiSpamMessage(
            msg,
            runtimeEnv
          ),
        message,
        env
      )
    ) {
      return true;
    }


    /*
     * Anti-link.
     *
     * Only run if the function
     * exists in the previous
     * sections.
     */

    if (
      typeof
        handleAntiLinkMessage ===
        "function"
    ) {
      if (
        await runBotHandler(
          "Anti Link",
          async (
            msg,
            runtimeEnv
          ) =>
            handleAntiLinkMessage(
              msg,
              runtimeEnv
            ),
          message,
          env
        )
      ) {
        return true;
      }
    }


    /*
     * Welcome / Goodbye.
     *
     * Service messages are handled
     * by this system.
     */

    if (
      message.new_chat_members
        ?.length ||
      message.left_chat_member
    ) {

      if (
        await runBotHandler(
          "Welcome System",
          async (
            msg,
            runtimeEnv
          ) =>
            routeWelcomeSystem(
              {
                message:
                  msg
              },
              runtimeEnv
            ),
          message,
          env
        )
      ) {
        return true;
      }
    }


    /*
     * Normal group message.
     */

    if (
      typeof
        handleGroupMessage ===
        "function"
    ) {
      return await runBotHandler(
        "Group Message",
        handleGroupMessage,
        message,
        env
      );
    }

    return false;
  }


  return false;
}


/* =========================
   MY CHAT MEMBER ROUTER
========================= */

async function routeMyChatMember(
  update,
  env
) {
  if (
    !update?.my_chat_member
  ) {
    return false;
  }

  if (
    typeof
      handleMyChatMember !==
      "function"
  ) {
    return false;
  }

  return await runBotHandler(
    "My Chat Member",
    async (
      currentUpdate,
      runtimeEnv
    ) =>
      handleMyChatMember(
        currentUpdate,
        runtimeEnv
      ),
    update.my_chat_member,
    env
  );
}


/* =========================
   FINAL UPDATE ROUTER
========================= */

async function routeUpdate(
  update,
  env
) {
  if (
    !update ||
    typeof update !==
      "object"
  ) {
    return false;
  }


  /*
   * 1 — Callback queries
   */

  if (
    update.callback_query
  ) {
    return await routeCallbackQuery(
      update,
      env
    );
  }


  /*
   * 2 — Bot membership updates
   */

  if (
    update.my_chat_member
  ) {
    return await routeMyChatMember(
      update,
      env
    );
  }


  /*
   * 3 — Normal messages
   */

  if (
    update.message
  ) {
    return await routeMessage(
      update,
      env
    );
  }


  return false;
}


/* ============================================================
   FINAL WEBHOOK ENTRY
============================================================ */

async function handleWebhookUpdate(
  request,
  env
) {
  let update;

  try {

    update =
      await request.json();

  } catch (
    error
  ) {
    console.error(
      "Invalid webhook JSON:",
      getSafeErrorMessage(
        error
      )
    );

    return new Response(
      "Bad Request",
      {
        status: 400
      }
    );
  }


  /*
   * Process update.
   *
   * Errors are contained so
   * Telegram does not receive
   * an unnecessary server crash.
   */

  try {

    await routeUpdate(
      update,
      env
    );

  } catch (
    error
  ) {
    console.error(
      "Webhook processing:",
      getSafeErrorMessage(
        error
      )
    );
  }


  /*
   * Telegram expects a quick
   * successful response.
   */

  return new Response(
    "OK",
    {
      status: 200,
      headers: {
        "Content-Type":
          "text/plain; charset=UTF-8"
      }
    }
  );
}


/* ============================================================
   FINAL CLOUDFLARE WORKER EXPORT
============================================================ */


/* ============================================================
   V5 EXTENSION — REQUESTED FEATURES
   Additive layer: does not replace existing handlers.
============================================================ */

const V5_FEATURE_DEFAULTS = {
  botCall: true,
  contentLocks: true,
  badWords: true,
  ownerAdminFlow: true,
  games: true,
  pinCommand: true,
  ownerManagement: true,
  groupLock: true,
  userPermissions: true,
  dailyReport: true,
  professionalStats: true,
  cleanup: true,
  obsceneDetection: false
};

function v5OwnerKey(userId) { return `v5:owner:${Number(userId)}`; }
function v5FeatureKey() { return `v5:features`; }
function v5BadWordsKey(chatId) { return `v5:badwords:${chatId}`; }
function v5UserKey(chatId,userId) { return `v5:user:${chatId}:${userId}`; }
function v5UsersKey(chatId) { return `v5:users:${chatId}`; }
function v5StateKey(chatId,userId) { return `v5:state:${chatId}:${userId}`; }
function v5MuteKey(chatId,userId) { return `v5:mute:${chatId}:${userId}`; }
function v5UserPermKey(chatId,userId) { return `v5:uperm:${chatId}:${userId}`; }
function v5DayKey(chatId,userId,date) { return `v5:day:${chatId}:${userId}:${date}`; }
function v5FeatureChatKey(chatId) { return `v5:chatfeatures:${chatId}`; }

async function v5IsOwner(env,userId) {
  const id=Number(userId||0);
  if (isOwner(id)) return true;
  return Boolean(await kvGet(env,v5OwnerKey(id),false));
}

async function v5GetFeatures(env) {
  return {...V5_FEATURE_DEFAULTS,...(await kvGet(env,v5FeatureKey(),{} )||{})};
}
async function v5SaveFeatures(env,x) { return kvPut(env,v5FeatureKey(),{...V5_FEATURE_DEFAULTS,...x}); }
async function v5GetChatFeatures(env,chatId) {
  const global=await v5GetFeatures(env); const local=await kvGet(env,v5FeatureChatKey(chatId),{})||{};
  return {...V5_FEATURE_DEFAULTS,...global,...local};
}
async function v5SaveChatFeatures(env,chatId,x) { return kvPut(env,v5FeatureChatKey(chatId),{...V5_FEATURE_DEFAULTS,...x}); }

function v5Name(u) { return userName(u||{}) || `کاربر ${Number(u?.id||0)}`; }
function v5UserLabel(u) {
  const n=escapeHTML(v5Name(u));
  const un=u?.username ? ` @${escapeHTML(u.username)}` : '';
  return `${n}${un}`;
}
function v5ExactCommand(text) {
  return String(text||'').trim().replace(/^\/+/,'').split(/\s+/)[0].toLowerCase();
}
function v5FullText(text) { return String(text||'').trim().replace(/^\/+/,'').replace(/\s+/g,' ').toLowerCase(); }
function v5ReplyUser(message) { return message?.reply_to_message?.from || null; }

async function v5GetUserStats(env,chatId,user) {
  const id=Number(user?.id||0); if(!id) return null;
  return {...{
    userId:id,name:v5Name(user),username:user?.username||'',messages:0,voice:0,photo:0,video:0,
    document:0,gif:0,forward:0,poll:0,location:0,contact:0,audio:0,warnings:0,mutes:0,bans:0,badWords:0,lastSeen:0
  },...(await kvGet(env,v5UserKey(chatId,id),{})||{})};
}
async function v5SaveUserStats(env,chatId,st) { await kvPut(env,v5UserKey(chatId,st.userId),st); }
async function v5GetUserPerm(env,chatId,userId) {
  return {can_send_messages:true,can_send_gif:true,can_send_video:true,can_send_file:true,can_send_voice:true,can_send_audio:true,can_send_video_chat:true,intervalSeconds:0,...(await kvGet(env,v5UserPermKey(chatId,userId),{})||{})};
}
async function v5SaveUserPerm(env,chatId,userId,perm) { return kvPut(env,v5UserPermKey(chatId,userId),perm); }
async function v5UserPermissionCheck(env,message) {
  if(!message?.chat?.id || !message.from?.id) return false;
  if(await isAdmin(env,message.chat.id,Number(message.from.id))) return false;
  const p=await v5GetUserPerm(env,message.chat.id,message.from.id);
  if(p.can_send_messages===false) { await deleteMessage(env,message.chat.id,message.message_id); return true; }
  let blocked=false;
  if(hasAnimation(message)&&p.can_send_gif===false) blocked=true;
  if(hasVideo(message)&&p.can_send_video===false) blocked=true;
  if(hasDocument(message)&&p.can_send_file===false) blocked=true;
  if(hasVoice(message)&&p.can_send_voice===false) blocked=true;
  if(hasAudio(message)&&p.can_send_audio===false) blocked=true;
  if(blocked){ await deleteMessage(env,message.chat.id,message.message_id); await sendMessage(env,message.chat.id,`⚠️ <b>${v5UserLabel(message.from)}</b> ارسال این نوع محتوا برای شما مجاز نیست.`); return true; }
  if(Number(p.intervalSeconds||0)>0){ const key=`v5:interval:${message.chat.id}:${message.from.id}`; const last=Number(await kvGet(env,key,0)); if(Date.now()-last<p.intervalSeconds*1000){await deleteMessage(env,message.chat.id,message.message_id);await sendMessage(env,message.chat.id,`⏱️ <b>${v5UserLabel(message.from)}</b> رعایت فاصله زمانی پیام الزامی است.`);return true;} await kvPut(env,key,Date.now(),{expirationTtl:Math.max(60,p.intervalSeconds+30)}); }
  return false;
}

async function v5TouchUser(env,chatId,user,message) {
  if(!user?.id) return;
  const st=await v5GetUserStats(env,chatId,user);
  st.name=v5Name(user); st.username=user.username||st.username||''; st.messages++;
  st.lastSeen=Date.now();
  const tehran=new Date(Date.now()+3.5*3600000); const day=tehran.toISOString().slice(0,10);
  const dayKey=v5DayKey(chatId,user.id,day); const dayCount=Number(await kvGet(env,dayKey,0))+1; await kvPut(env,dayKey,dayCount,{expirationTtl:60*60*24*45});
  if(hasVoice(message)) st.voice++;
  if(hasPhoto(message)) st.photo++;
  if(hasVideo(message)) st.video++;
  if(hasDocument(message)) st.document++;
  if(hasAnimation(message)) st.gif++;
  if(hasAudio(message)) st.audio++;
  if(hasPoll(message)) st.poll++;
  if(message?.location) st.location++;
  if(message?.contact) st.contact++;
  if(message?.forward_origin || message?.forward_from || message?.forward_from_chat) st.forward++;
  await v5SaveUserStats(env,chatId,st);
  const ids=await kvGet(env,v5UsersKey(chatId),[])||[];
  if(!ids.includes(Number(user.id))) { ids.push(Number(user.id)); await kvPut(env,v5UsersKey(chatId),ids.slice(-5000)); }
}
async function v5AllUsers(env,chatId) {
  const ids=await kvGet(env,v5UsersKey(chatId),[])||[]; const out=[];
  for(const id of ids) { const st=await kvGet(env,v5UserKey(chatId,id),null); if(st) out.push(st); }
  return out.sort((a,b)=>Number(b.messages||0)-Number(a.messages||0));
}

function v5MessageKind(message) {
  if(hasPhoto(message)) return ['عکس','lockPhoto'];
  if(hasVideo(message)) return ['ویدیو','lockVideo'];
  if(hasDocument(message)) return ['فایل','lockDocument'];
  if(hasSticker(message)) return ['استیکر','lockSticker'];
  if(hasVoice(message)) return ['ویس','lockVoice'];
  if(hasAudio(message)) return ['موزیک','lockAudio'];
  if(hasAnimation(message)) return ['GIF','lockAnimation'];
  if(hasPoll(message)) return ['نظرسنجی','lockPoll'];
  if(message?.location) return ['موقعیت','lockLocation'];
  if(message?.contact) return ['مخاطب','lockContact'];
  if(message?.forward_origin || message?.forward_from || message?.forward_from_chat) return ['فوروارد','lockForward'];
  const text=message?.text||message?.caption||'';
  if(containsURL(text)) return ['لینک','antiLink'];
  return null;
}

async function v5Warn(env,chatId,user,reason) {
  const st=await v5GetUserStats(env,chatId,user); st.warnings++;
  await v5SaveUserStats(env,chatId,st);
  const text=`⚠️ <b>اخطار امنیتی</b>\n\n👤 کاربر: <b>${v5UserLabel(user)}</b>\n🚫 مورد: <b>${escapeHTML(reason)}</b>\n\nاین مورد برخلاف قوانین گروه است.`;
  await sendMessage(env,chatId,text);
}
async function v5Mute(env,chatId,userId,seconds) {
  const until=Math.floor(Date.now()/1000)+seconds;
  await muteUser(env,chatId,userId,until);
  await kvPut(env,v5MuteKey(chatId,userId),until,{expirationTtl:Math.max(seconds,60)});
}
async function v5Ban(env,chatId,userId) { await banUser(env,chatId,userId); const st=await v5GetUserStats(env,chatId,{id:userId}); st.bans++; await v5SaveUserStats(env,chatId,st); }

async function v5ContentLock(env,message) {
  if(!message?.chat?.id || !message.from?.id) return false;
  const features=await v5GetChatFeatures(env,message.chat.id);
  if(!features.contentLocks) return false;
  if(await isAdmin(env,message.chat.id,Number(message.from.id))) return false;
  const kind=v5MessageKind(message); if(!kind) return false;
  const [label,key]=kind;
  const settings=await getSettings(env,message.chat.id);
  const locked=key==='antiLink' ? Boolean(settings.antiLink || (await getLinkConfig(env,message.chat.id)).enabled) : Boolean(settings[key]);
  if(!locked) return false;
  await deleteMessage(env,message.chat.id,message.message_id);
  await v5Warn(env,message.chat.id,message.from,label);
  return true;
}

function v5BotCallText() {
  const a=['⚡ پرقدرت آماده به کارم','👀 همین دور ورا هستم','🔔 گوش به زنگم','🤖 ربات فعال و آماده به کار هست.'];
  return a[Math.floor(Math.random()*a.length)]+"\n\n🧩 برای ورود به پنل، کلمه <b>پنل</b> را تایپ کنید.";
}
async function v5BotCall(env,message) {
  const text=String(message?.text||'').trim();
  if(text!=='ربات') return false;
  const f=await v5GetChatFeatures(env,message.chat.id); if(!f.botCall) return false;
  await sendMessage(env,message.chat.id,v5BotCallText(),{reply_to_message_id:message.message_id}); return true;
}

function v5OwnerPanelKeyboard(features) {
  const labels={
    botCall:'🤖 واکنش به ربات',contentLocks:'🔒 قفل محتوا',badWords:'🚫 کلمات ممنوعه',ownerAdminFlow:'👑 افزودن مدیر',
    games:'🎮 بازی‌ها',pinCommand:'📌 سنجاق',ownerManagement:'👑 مدیریت مالکان',groupLock:'🔐 قفل گپ',userPermissions:'👤 اختیارات کاربران',
    dailyReport:'🌅 گزارش روزانه',professionalStats:'📊 آمار حرفه‌ای',cleanup:'🧹 پاکسازی',obsceneDetection:'🖼️ تشخیص محتوای نامناسب'
  };
  const keys=Object.keys(labels), rows=[];
  for(let i=0;i<keys.length;i+=2){ const row=[]; for(const k of keys.slice(i,i+2)) row.push({text:`${features[k]?'🟢':'🔴'} ${labels[k]}`,callback_data:`v5:ft:${k}`}); rows.push(row); }
  rows.push([{text:'⬅️ برگشت',callback_data:'v5:back'}]); return {inline_keyboard:rows};
}
async function v5OwnerPanel(env,chatId,messageId=null) {
  const f=await v5GetFeatures(env);
  const text='👑 <b>مرکز قابلیت‌های مالک ربات</b>\n\nاز این قسمت قابلیت‌های جدید را فعال یا غیرفعال کنید.';
  const payload={chat_id:chatId,text,parse_mode:'HTML',reply_markup:v5OwnerPanelKeyboard(f)};
  if(messageId) { payload.message_id=messageId; try { await telegram('editMessageText',env,payload); return true; } catch{} }
  await telegram('sendMessage',env,payload); return true;
}

async function v5BadWords(env,chatId,userId) {
  if(!(await v5IsOwner(env,userId))) return false;
  await kvPut(env,v5StateKey(chatId,userId),{type:'badwords_add'});
  await sendMessage(env,chatId,'🚫 <b>کلمات ممنوعه</b>\n\nکلمات ممنوعه را در پاسخ به همین پیام ارسال کنید.\nهر کلمه را در یک خط بنویسید؛ برای پایان، دکمه «تمام» را بزنید.',{reply_markup:{inline_keyboard:[[{text:'✅ تمام',callback_data:'v5:badwords:done'}],[{text:'⬅️ برگشت',callback_data:'v5:back'}]]}});
  return true;
}
async function v5AddBadWordsText(env,message) {
  if(!await v5IsOwner(env,message.from?.id)) return false;
  const state=await kvGet(env,v5StateKey(message.chat.id,message.from.id),null); if(state?.type!=='badwords_add') return false;
  if(message.reply_to_message) {
    const words=String(message.text||'').split(/\n|,/).map(x=>x.trim().toLowerCase()).filter(Boolean);
    const old=await kvGet(env,v5BadWordsKey(message.chat.id),[])||[];
    await kvPut(env,v5BadWordsKey(message.chat.id),Array.from(new Set([...old,...words])).slice(0,500));
    return true;
  }
  return false;
}
async function v5CheckBadWord(env,message) {
  if(!message?.text || !message.chat?.id) return false;
  const f=await v5GetChatFeatures(env,message.chat.id); if(!f.badWords) return false;
  if(await isAdmin(env,message.chat.id,Number(message.from?.id||0))) return false;
  const words=await kvGet(env,v5BadWordsKey(message.chat.id),[])||[]; const low=String(message.text).toLowerCase();
  const hit=words.find(w=>w && low.includes(w)); if(!hit) return false;
  await deleteMessage(env,message.chat.id,message.message_id);
  const st=await v5GetUserStats(env,message.chat.id,message.from); st.badWords++; await v5SaveUserStats(env,message.chat.id,st);
  const warnings=Number(st.badWords||0);
  if(warnings>=4) await v5Ban(env,message.chat.id,message.from.id); else await v5Mute(env,message.chat.id,message.from.id,120);
  await sendMessage(env,message.chat.id,`🚫 <b>کاربر ${v5UserLabel(message.from)}</b> شما به دلیل فرستادن کلمات ممنوعه به مدت ۲ دقیقه سکوت داده شدید.\n\n📌 تخلف: <b>${escapeHTML(hit)}</b>\n⚠️ شماره تخلف: <b>${warnings}</b>` ,{reply_markup:{inline_keyboard:[[{text:'👁️ نمایش پیام',callback_data:`v5:bad:show:${message.chat.id}:${message.message_id}`}],[{text:'🔊 لغو سکوت کاربر',callback_data:`v5:bad:unmute:${message.from.id}`}],[{text:'⏱️ تنظیم مدت سکوت',callback_data:`v5:bad:mute:${message.from.id}`},{text:'🚫 بن کاربر',callback_data:`v5:bad:ban:${message.from.id}`}],[{text:'⬅️ برگشت',callback_data:'v5:back'}]]}});
  for(const owner of OWNER_IDS) { try { await sendMessage(env,owner,`🚨 <b>هشدار امنیتی</b>\n\nکاربر <b>${v5UserLabel(message.from)}</b> کلمه <b>${escapeHTML(hit)}</b> را در گروه <b>${escapeHTML(message.chat.title||'گروه')}</b> ارسال کرد.\n🤖 اقدام خودکار: ${warnings>=4?'بن':'سکوت ۲ دقیقه‌ای'}.`); } catch{} }
  return true;
}

async function v5AddAdminStart(env,message,target) {
  if(!(await v5IsOwner(env,message.from?.id))) return false;
  await kvPut(env,v5StateKey(message.chat.id,message.from.id),{type:'add_admin',targetId:Number(target.id),target});
  const st=await v5GetUserStats(env,message.chat.id,target); const all=await v5AllUsers(env,message.chat.id); const rank=all.findIndex(x=>Number(x.userId)===Number(target.id))+1;
  await sendMessage(env,message.chat.id,`👑 <b>افزودن مدیر جدید</b>\n\n👤 نام: <b>${v5UserLabel(target)}</b>\n🆔 آیدی: <code>${target.id}</code>\n💬 تعداد چت: <b>${st.messages}</b>\n🏆 رتبه چت: <b>${rank>0?rank:'ثبت نشده'}</b>\n\nآیا از افزودن <b>${v5UserLabel(target)}</b> به عنوان مدیر گپ <b>${escapeHTML(message.chat.title||'گروه')}</b> مطمئن هستید؟\n\nبا ارسال «آره» یا «خیر» در پاسخ به همین پیام انتخاب کنید.`); return true;
}
function v5AdminPermKeyboard(perms) {
 const items=[['can_change_info','تغییرات اطلاعات گروه'],['can_delete_messages','حذف پیام'],['can_restrict_members','محروم کردن کاربران'],['can_invite_users','دعوت کاربران از طریق لینک'],['can_pin_messages','سنجاق کردن پیام‌ها'],['can_manage_topics','ویرایش برچسب اعضا'],['can_manage_video_chats','مدیریت پخش زنده‌ها'],['can_promote_members','افزودن مدیران جدید'],['is_anonymous','ناشناس ماندن']]; const rows=[];
 for(let i=0;i<items.length;i+=2) rows.push(items.slice(i,i+2).map(([k,t])=>({text:`${perms[k]?'🟢':'🔴'} ${t}`,callback_data:`v5:perm:${k}`})));
 rows.push([{text:'👑 افزودن مدیر',callback_data:'v5:perm:confirm'},{text:'❌ لغو',callback_data:'v5:perm:cancel'}],[{text:'⬅️ برگشت',callback_data:'v5:back'}]); return {inline_keyboard:rows};
}
async function v5AdminPerms(env,messageId,chatId,ownerId,state) { const perms={can_change_info:false,can_delete_messages:true,can_restrict_members:true,can_invite_users:true,can_pin_messages:true,can_manage_topics:false,can_manage_video_chats:true,can_promote_members:false,is_anonymous:false,...(state.perms||{})}; state.perms=perms; await kvPut(env,v5StateKey(chatId,ownerId),state); await editMessage(env,chatId,messageId,'👑 <b>اختیارات مدیر را تعیین کنید</b>\n\n🟢 فعال | 🔴 غیرفعال\n\nپس از انتخاب اختیارات، «افزودن مدیر» را بزنید.',{reply_markup:v5AdminPermKeyboard(perms)}); }

async function v5Promote(env,chatId,targetId,perms) { await telegram('promoteChatMember',env,{chat_id:chatId,user_id:targetId,...perms}); }

async function v5UserPanel(env,message,target) {
 if(!(await v5IsOwner(env,message.from?.id))) return false;
 const st=await v5GetUserStats(env,message.chat.id,target), all=await v5AllUsers(env,message.chat.id); const rank=all.findIndex(x=>Number(x.userId)===Number(target.id))+1;
 let member=null; try{member=await getChatMember(env,message.chat.id,target.id);}catch{}
 const status=member?.status||'unknown'; const mute=await kvGet(env,v5MuteKey(message.chat.id,target.id),0); const muted=Number(mute)>Math.floor(Date.now()/1000);
 const text=`👤 <b>اطلاعات و اختیارات کاربر</b>\n\n${v5UserLabel(target)}\n🆔 <code>${target.id}</code>\n💬 چت: <b>${st.messages}</b>\n🏆 رتبه: <b>${rank||'—'}</b>\n⚠️ اخطار: <b>${st.warnings}</b>\n🔇 سکوت: <b>${st.mutes}</b>\n🚫 بن: <b>${st.bans}</b>\n🚫 کلمات ممنوعه: <b>${st.badWords}</b>\n👑 وضعیت: <b>${status}</b>\n${muted?'🔇 وضعیت فعلی: <b>سکوت</b>':'🔊 وضعیت فعلی: <b>آزاد</b>'}`;
 const kb={inline_keyboard:[[{text:'🔇 سکوت کاربر',callback_data:`v5:user:mute:${target.id}`},{text:'🚫 بن کاربر',callback_data:`v5:user:ban:${target.id}`}],[{text:'👑 افزودن کاربر به عنوان مدیر',callback_data:`v5:user:admin:${target.id}`}],[{text:'⚙️ صفحه بعد',callback_data:`v5:uperm:${target.id}:page2`}],[{text:'⬅️ برگشت',callback_data:'v5:back'}]]}; await sendMessage(env,message.chat.id,text,{reply_markup:kb}); return true;
}

async function v5GroupStats(env,chatId) {
 const users=await v5AllUsers(env,chatId); const stats=await getChatStats(env,chatId); let title='گروه'; try{const c=await telegram('getChat',env,{chat_id:chatId}); title=c.title||title;}catch{}
 const sum=k=>users.reduce((a,u)=>a+Number(u[k]||0),0); const active=users.filter(u=>Date.now()-Number(u.lastSeen||0)<7*86400000); const inactive=users.filter(u=>Date.now()-Number(u.lastSeen||0)>=7*86400000);
 const top=users.slice(0,5).map((u,i)=>`${i+1}. ${escapeHTML(u.name)} — <b>${u.messages}</b> چت`).join('\n')||'—';
 const rules=(await getRulesConfig(env,chatId)).enabled ? '🟢 قوانین فعال' : '🔴 قوانین خاموش';
 return `📊 <b>آمار حرفه‌ای گپ ${escapeHTML(title)}</b>\n\n🤖 <b>ربات امنیتی</b>\n\n${rules}\n👥 اعضای ثبت‌شده: <b>${users.length}</b>\n🟢 فعالان اخیر: <b>${active.length}</b>\n🔴 کم‌فعال/غیرفعال: <b>${inactive.length}</b>\n\n💬 کل چت‌ها: <b>${sum('messages')}</b>\n🎤 ویس: <b>${sum('voice')}</b>\n🖼️ عکس: <b>${sum('photo')}</b>\n🎬 ویدیو: <b>${sum('video')}</b>\n📁 فایل: <b>${sum('document')}</b>\n🎞️ GIF: <b>${sum('gif')}</b>\n🎵 موزیک: <b>${sum('audio')}</b>\n↪️ فوروارد: <b>${sum('forward')}</b>\n📊 نظرسنجی: <b>${sum('poll')}</b>\n📍 موقعیت: <b>${sum('location')}</b>\n👤 مخاطب: <b>${sum('contact')}</b>\n\n🏆 <b>۵ نفر فعال‌تر</b>\n${top}\n\n🛡️ تخلفات لینک: <b>${Number(stats.linkViolations||0)}</b>\n🚨 تخلفات اسپم: <b>${Number(stats.spamViolations||0)}</b>`;
}
async function v5MyStats(env,message,target) { const st=await v5GetUserStats(env,message.chat.id,target), all=await v5AllUsers(env,message.chat.id); const rank=all.findIndex(x=>Number(x.userId)===Number(target.id))+1; return `👤 <b>آمار من</b>\n\n🏷️ نام: <b>${v5UserLabel(target)}</b>\n🆔 آیدی: <code>${target.id}</code>\n📛 نام کاربری: <b>${escapeHTML(target.username?`@${target.username}`:'ندارد')}</b>\n🏠 گپ: <b>${escapeHTML(message.chat.title||'گروه')}</b>\n💬 تعداد چت: <b>${st.messages}</b>\n🏆 رتبه چت: <b>${rank||'—'}</b>\n🎤 ویس: <b>${st.voice}</b> | 🎬 ویدیو: <b>${st.video}</b> | 🖼️ عکس: <b>${st.photo}</b>\n📁 فایل: <b>${st.document}</b> | 🎞️ GIF: <b>${st.gif}</b> | ↪️ فوروارد: <b>${st.forward}</b>`; }

async function v5LinkMenu(env,message) {
  const full=v5FullText(message.text); if(full!=='لینک') return false;
  if(!await isAdmin(env,message.chat.id,message.from.id)) return false;
  await sendMessage(env,message.chat.id,'🔗 <b>نوع لینک را انتخاب کنید</b>\n\nکدام نوع لینک را می‌خواهید دریافت کنید؟',{reply_markup:{inline_keyboard:[[{text:'🔗 دریافت لینک گپ',callback_data:'v5:link:group'},{text:'⏳ دریافت لینک یک‌بار مصرف',callback_data:'v5:link:once'}],[{text:'⬅️ برگشت',callback_data:'v5:back'}]]}}); return true;
}

async function v5PinCommand(env,message) { if(v5ExactCommand(message.text)!=='سنجاق') return false; if(!message.reply_to_message) return false; if(!await isAdmin(env,message.chat.id,message.from.id)) return false; await telegram('pinChatMessage',env,{chat_id:message.chat.id,message_id:message.reply_to_message.message_id,disable_notification:false}); await sendMessage(env,message.chat.id,'📌 <b>پیام با موفقیت سنجاق شد.</b>'); return true; }
async function v5GroupLock(env,message,open) { if(!(await v5IsOwner(env,message.from.id))) return false; await telegram('setChatPermissions',env,{chat_id:message.chat.id,permissions:open?{can_send_messages:true,can_send_audios:true,can_send_documents:true,can_send_photos:true,can_send_videos:true,can_send_video_notes:true,can_send_voice_notes:true,can_send_polls:true,can_send_other_messages:true,can_add_web_page_previews:true,can_invite_users:true}:{can_send_messages:false,can_send_audios:false,can_send_documents:false,can_send_photos:false,can_send_videos:false,can_send_video_notes:false,can_send_voice_notes:false,can_send_polls:false,can_send_other_messages:false,can_add_web_page_previews:false}}); await sendMessage(env,message.chat.id,open?'🔓 <b>گپ باز شد.</b>':'🔐 <b>گپ بسته شد.</b>'); return true; }
async function v5Cleanup(env,message) { if(!(await v5IsOwner(env,message.from.id))) return false; const cmd=v5ExactCommand(message.text); if(!['پاکسازی','پاکسازی_گپ','پاکسازی_گروه'].includes(cmd)) return false; await sendMessage(env,message.chat.id,'🧹 <b>مالک، نوع پاکسازی گروه را انتخاب کنید.</b>',{reply_markup:{inline_keyboard:[[{text:'🧹 پاکسازی کلی گپ',callback_data:'v5:clean:all'},{text:'🎯 پاکسازی دلخواه',callback_data:'v5:clean:custom'}],[{text:'⬅️ برگشت',callback_data:'v5:back'}]]}}); return true; }

async function v5GameMenu(env,message){ if(v5ExactCommand(message.text)!=='بازی') return false; const f=await v5GetChatFeatures(env,message.chat.id); if(!f.games)return false; await sendMessage(env,message.chat.id,'🎮 <b>مرکز بازی‌ها</b>\n\nبازی موردنظر را انتخاب کنید.',{reply_markup:{inline_keyboard:[[{text:'⭕ دوز',callback_data:'v5:game:ttt'}],[{text:'🪙 شیر یا خط',callback_data:'v5:game:coin'}],[{text:'🎲 تاس',callback_data:'v5:game:dice'}],[{text:'⬅️ برگشت',callback_data:'v5:back'}]]}}); return true; }

async function v5DailyReport(env,chatId) {
 const now=new Date(Date.now()+3.5*3600000); const prev=new Date(now.getTime()-86400000); const day=prev.toISOString().slice(0,10);
 const users=await v5AllUsers(env,chatId); const rows=[]; let total=0; for(const u of users){const n=Number(await kvGet(env,v5DayKey(chatId,u.userId,day),0)); total+=n; if(n) rows.push({name:u.name,messages:n});} rows.sort((a,b)=>b.messages-a.messages); const top=rows.slice(0,5).map((u,i)=>`${i+1}. ${escapeHTML(u.name)} — <b>${u.messages}</b> چت`).join('\n')||'—'; const date=prev.toLocaleDateString('fa-IR'); const weekday=prev.toLocaleDateString('fa-IR',{weekday:'long'}); await sendMessage(env,chatId,`🌅 <b>گزارش صبحگاهی گروه</b>\n\n📅 تاریخ: <b>${date}</b>\n🗓️ روز: <b>${weekday}</b>\n\n💬 کل چت‌های روز قبل: <b>${total}</b>\n\n🏆 <b>فعال‌ترین اعضای روز قبل</b>\n${top}\n\n☀️ صبح بخیر؛ روز خوبی داشته باشید. 🤖`);
}

async function v5RouteMessage(env,message) {
 const chatId=message?.chat?.id, uid=Number(message?.from?.id||0); if(!chatId||!uid) return false;
 if(await v5AddBadWordsText(env,message)) return true;
 if(message.chat.type==='private') {
   if(await v5IsOwner(env,uid) && ['پنل','قابلیت‌ها','قابلیت_ها'].includes(v5ExactCommand(message.text))) { await v5OwnerPanel(env,chatId); return true; }
   return false;
 }
 if(!['group','supergroup'].includes(message.chat.type)) return false;
 await v5TouchUser(env,chatId,message.from,message);
 try { const chats=await kvGet(env,"v5:daily_chats",[])||[]; if(!chats.includes(Number(chatId))){chats.push(Number(chatId)); await kvPut(env,"v5:daily_chats",chats.slice(-500));} } catch {}
 if(await v5UserPermissionCheck(env,message)) return true;
 if(await v5BotCall(env,message)) return true;
 if(await v5CheckBadWord(env,message)) return true;
 if(await v5LinkMenu(env,message)) return true;
 if(await v5PinCommand(env,message)) return true;
 const c=v5ExactCommand(message.text);
 const full=v5FullText(message.text);
 if(c==='آمار' || c==='آمار_گپ' || c==='آمارگپ') { await sendMessage(env,chatId,await v5GroupStats(env,chatId),{reply_markup:{inline_keyboard:[[{text:'🔄 بروزرسانی',callback_data:'v5:stats:refresh'}],[{text:'⬅️ برگشت',callback_data:'v5:back'}]]}}); return true; }
 if(c==='آمارم' || c==='آمار_من') { await sendMessage(env,chatId,await v5MyStats(env,message,message.from),{reply_markup:{inline_keyboard:[[{text:'⬅️ برگشت',callback_data:'v5:back'}]]}}); return true; }
 if(full==='افزودن به مالک روبات' || full==='افزودن به مالک ربات' || c==='افزودن_به_مالک_روبات' || c==='افزودن_به_مالک_ربات') { const target=v5ReplyUser(message); if(target && await v5IsOwner(env,uid)){ await kvPut(env,v5StateKey(chatId,uid),{type:'add_owner',target}); await sendMessage(env,chatId,`👑 آیا از انتخاب <b>${v5UserLabel(target)}</b> به عنوان مالک ربات اطمینان دارید؟

برای تأیید «آره» و برای لغو «خیر» را در پاسخ به همین پیام ارسال کنید.`); return true; } }
 if(full==='قفل گپ' || full==='قفل_گپ') return v5GroupLock(env,message,false);
 if(full==='گپ باز' || full==='گپ_باز') return v5GroupLock(env,message,true);
 if(full==='پاکسازی' || full==='پاکسازی گپ' || full==='پاکسازی گروه' || full==='پاکسازی_گپ' || full==='پاکسازی_گروه') return v5Cleanup(env,message);
 if(c==='بازی') return v5GameMenu(env,message);
 if(full==='کلمات ممنوعه' || full==='کلمات_ممنوعه') return v5BadWords(env,chatId,uid);
 if((c==='اضافه_کردن_ادمین'||c==='افزودن_ادمین'||c==='افزودن_مدیر'||c==='مدیر') && v5ReplyUser(message)) return v5AddAdminStart(env,message,v5ReplyUser(message));
 if(c==='اختیارات' && v5ReplyUser(message)) return v5UserPanel(env,message,v5ReplyUser(message));
 if(c==='ربات' && message.text?.trim()==='ربات') return v5BotCall(env,message);
 if(await v5ContentLock(env,message)) return true;
 return false;
}

async function v5RouteCallback(env,callback) {
 const data=String(callback?.data||''); if(!data.startsWith('v5:')) return false;
 const uid=Number(callback.from?.id||0), chatId=callback.message?.chat?.id, mid=callback.message?.message_id;
 if(!chatId) return true;
 if(!(await v5IsOwner(env,uid)) && !['v5:back','v5:game:coin','v5:game:dice','v5:game:ttt'].includes(data)) { await answerCallback(env,callback.id,'⛔ فقط مالکان ربات دسترسی دارند.',true); return true; }
 await answerCallback(env,callback.id).catch(()=>{});
 if(data==='v5:back') { if(await v5IsOwner(env,uid)) await v5OwnerPanel(env,chatId,mid); return true; }
 if(data.startsWith('v5:ft:')) { const k=data.slice(6); const f=await v5GetFeatures(env); if(k in f) f[k]=!f[k]; await v5SaveFeatures(env,f); await v5OwnerPanel(env,chatId,mid); return true; }
 if(data==='v5:badwords:done') { await kvDelete(env,v5StateKey(chatId,uid)); await sendMessage(env,chatId,'✅ <b>کلمات ممنوعه با موفقیت ذخیره شدند.</b>'); return true; }
 if(data==='v5:stats:refresh') { await editMessage(env,chatId,mid,await v5GroupStats(env,chatId),{reply_markup:{inline_keyboard:[[{text:'🔄 بروزرسانی',callback_data:'v5:stats:refresh'}],[{text:'⬅️ برگشت',callback_data:'v5:back'}]]}}); return true; }
 if(data.startsWith('v5:perm:')) { const st=await kvGet(env,v5StateKey(chatId,uid),null); if(!st?.targetId)return true; if(data==='v5:perm:confirm'){ await v5Promote(env,chatId,st.targetId,st.perms||{}); await kvDelete(env,v5StateKey(chatId,uid)); await sendMessage(env,chatId,`👑 <b>${v5UserLabel(st.target)}</b> با اختیارات تعیین‌شده به مدیر گروه اضافه شد.`); return true;} if(data==='v5:perm:cancel'){await kvDelete(env,v5StateKey(chatId,uid));await sendMessage(env,chatId,'❌ <b>افزودن مدیر لغو شد.</b>');return true;} const k=data.slice(9); st.perms={...(st.perms||{}),[k]:!Boolean(st.perms?.[k])}; await kvPut(env,v5StateKey(chatId,uid),st); await v5AdminPerms(env,mid,chatId,uid,st); return true; }
 if(data.startsWith('v5:uperm:')) { const parts=data.split(':'); const targetId=Number(parts[2]); const action=parts[3]; const p=await v5GetUserPerm(env,chatId,targetId); if(action==='page2'){ await editMessage(env,chatId,mid,`👤 <b>اختیارات صفحه دوم</b>

⏱️ فاصله پیام: <b>${p.intervalSeconds||0}</b> ثانیه`,{reply_markup:{inline_keyboard:[[{text:`${p.can_send_messages?'🟢':'🔴'} ارسال چت`,callback_data:`v5:uperm:${targetId}:can_send_messages`}],[{text:`${p.can_send_gif?'🟢':'🔴'} ارسال GIF`,callback_data:`v5:uperm:${targetId}:can_send_gif`},{text:`${p.can_send_video?'🟢':'🔴'} ارسال ویدیو`,callback_data:`v5:uperm:${targetId}:can_send_video`}],[{text:`${p.can_send_file?'🟢':'🔴'} ارسال فایل`,callback_data:`v5:uperm:${targetId}:can_send_file`},{text:`${p.can_send_voice?'🟢':'🔴'} ارسال ویس`,callback_data:`v5:uperm:${targetId}:can_send_voice`}],[{text:`${p.can_send_audio?'🟢':'🔴'} ارسال موزیک`,callback_data:`v5:uperm:${targetId}:can_send_audio`},{text:`${p.can_send_video_chat?'🟢':'🔴'} ارسال پخش زنده`,callback_data:`v5:uperm:${targetId}:can_send_video_chat`}],[{text:'⏱️ بدون محدودیت زمانی',callback_data:`v5:uperm:${targetId}:interval:0`},{text:'⏱️ هر ۵ دقیقه',callback_data:`v5:uperm:${targetId}:interval:300`}],[{text:'⬅️ برگشت',callback_data:'v5:back'}]]}}); return true; } if(action==='interval'){p.intervalSeconds=Number(parts[4]||0);} else if(action in p){p[action]=!Boolean(p[action]);} await v5SaveUserPerm(env,chatId,targetId,p); return true; }
 if(data.startsWith('v5:user:')) { const parts=data.split(':'); const action=parts[2], targetId=Number(parts[3]); if(action==='mute'){await v5Mute(env,chatId,targetId,120);await sendMessage(env,chatId,'🔇 <b>کاربر به مدت ۲ دقیقه سکوت شد.</b>');return true;} if(action==='ban'){await v5Ban(env,chatId,targetId);await sendMessage(env,chatId,'🚫 <b>کاربر از گروه اخراج شد.</b>');return true;} if(action==='admin'){const target={id:targetId,first_name:'کاربر'};const st={type:'add_admin',targetId,target,perms:{}};await kvPut(env,v5StateKey(chatId,uid),st);await v5AdminPerms(env,mid,chatId,uid,st);return true;} }
 if(data.startsWith('v5:bad:')) { const parts=data.split(':'); const action=parts[2], targetId=Number(parts[3]); if(action==='unmute'){await unmuteUser(env,chatId,targetId);await sendMessage(env,chatId,'🔊 <b>سکوت کاربر لغو شد.</b>');return true;} if(action==='mute'){await sendMessage(env,chatId,'⏱️ <b>مدت سکوت را انتخاب کنید.</b>',{reply_markup:{inline_keyboard:[[{text:'۱۰ دقیقه',callback_data:`v5:bad:mt:${targetId}:10`},{text:'۲۰ دقیقه',callback_data:`v5:bad:mt:${targetId}:20`}],[{text:'سکوت دائم',callback_data:`v5:bad:perm:${targetId}`}],[{text:'⬅️ برگشت',callback_data:'v5:back'}]]}});return true;} if(action==='mt'){const mins=Number(parts[4]||10);await v5Mute(env,chatId,targetId,mins*60);await sendMessage(env,chatId,`⏱️ <b>سکوت کاربر برای ${mins} دقیقه تنظیم شد.</b>`);return true;} if(action==='perm'){await muteUser(env,chatId,targetId,0);await sendMessage(env,chatId,'🔇 <b>سکوت دائم اعمال شد.</b>');return true;} if(action==='ban'){await v5Ban(env,chatId,targetId);await sendMessage(env,chatId,'🚫 <b>کاربر به علت استفاده از کلمات ممنوعه از گپ اخراج شد.</b>');return true;} return true; }
 if(data.startsWith('v5:clean:')) { const a=data.slice(9); if(a==='all'){await sendMessage(env,chatId,'⚠️ <b>آیا اطمینان از حذف پیام‌های ثبت‌شده گپ دارید؟</b>\n\nبرای حذف <code>y</code> و برای لغو <code>n</code> را در پاسخ همین پیام بفرستید.'); await kvPut(env,v5StateKey(chatId,uid),{type:'clean_all'});return true;} if(a==='custom'){await sendMessage(env,chatId,'🎯 <b>تعداد پیام‌های قابل حذف را در پاسخ همین پنل وارد کنید.</b>');await kvPut(env,v5StateKey(chatId,uid),{type:'clean_custom'});return true;} }
 if(data.startsWith('v5:game:')) { const g=data.slice(8); if(g==='coin'){await sendMessage(env,chatId,Math.random()<.5?'🪙 <b>شیر</b>':'🪙 <b>خط</b>');return true;} if(g==='dice'){await sendMessage(env,chatId,`🎲 <b>نتیجه تاس: ${1+Math.floor(Math.random()*6)}</b>`);return true;} if(g==='ttt'){await sendMessage(env,chatId,'⭕ <b>دوز</b>\n\nنسخه بازی تعاملی دوز در مرحله بعد قابل توسعه است.',{reply_markup:{inline_keyboard:[[{text:'⬅️ برگشت',callback_data:'v5:back'}]]}});return true;} }
 return true;
}

async function v5StateMessage(env,message) {
 if(!await v5IsOwner(env,message.from?.id)) return false;
 const st=await kvGet(env,v5StateKey(message.chat.id,message.from.id),null); if(!st)return false;
 const text=String(message.text||'').trim().toLowerCase();
 if(st.type==='add_owner' && message.reply_to_message && ['آره','اره','بله'].includes(text)){ const target=st.target; await kvPut(env,v5OwnerKey(target.id),true); await kvDelete(env,v5StateKey(message.chat.id,message.from.id)); await sendMessage(env,message.chat.id,`👑 <b>${v5UserLabel(target)}</b> با موفقیت به مالکان ربات اضافه شد.`); return true; }
 if(st.type==='add_owner' && message.reply_to_message && ['خیر','نه'].includes(text)){ await kvDelete(env,v5StateKey(message.chat.id,message.from.id)); await sendMessage(env,message.chat.id,'⛔ <b>اتوماسیون و افزودن مالک جدید به ربات متوقف شد.</b>'); return true; }
 if(st.type==='add_admin' && message.reply_to_message && ['آره','اره','بله'].includes(text)){ await v5AdminPerms(env,message.message_id,message.chat.id,message.from.id,st); return true; }
 if(st.type==='add_admin' && message.reply_to_message && ['خیر','نه'].includes(text)){await kvDelete(env,v5StateKey(message.chat.id,message.from.id));await sendMessage(env,message.chat.id,'❌ <b>افزودن مدیر لغو شد.</b>');return true;}
 if(st.type==='clean_all' && message.reply_to_message && text==='y'){ await kvDelete(env,v5StateKey(message.chat.id,message.from.id)); await sendMessage(env,message.chat.id,'🧹 <b>پاکسازی پیام‌های ثبت‌شده آغاز شد...</b>'); const ids=await kvGet(env,`v5:messages:${message.chat.id}`,[])||[]; let n=0; for(const id of ids){if(await deleteMessage(env,message.chat.id,id))n++;} await kvPut(env,`v5:messages:${message.chat.id}`,[]); await sendMessage(env,message.chat.id,`✅ <b>تمام پیام‌های قابل حذف حذف شدند.</b>\n🗑️ تعداد حذف‌شده: <b>${n}</b>`);return true; }
 if(st.type==='clean_all' && message.reply_to_message && text==='n'){await kvDelete(env,v5StateKey(message.chat.id,message.from.id));await sendMessage(env,message.chat.id,'❌ <b>پاکسازی لغو شد.</b>');return true;}
 if(st.type==='clean_custom' && message.reply_to_message && /^\d+$/.test(text)){ const n=Math.min(500,Number(text));await kvDelete(env,v5StateKey(message.chat.id,message.from.id));const ids=await kvGet(env,`v5:messages:${message.chat.id}`,[])||[];let done=0;for(const id of ids.slice(-n)){if(await deleteMessage(env,message.chat.id,id))done++;}await sendMessage(env,message.chat.id,`✅ <b>پاکسازی انجام شد.</b>\n🗑️ حذف‌شده: <b>${done}</b>`);return true;}
 return false;
}

export default {

  async scheduled(event, env, ctx) {
    try {
      if (event?.cron) {
        const chats = await kvGet(env, "v5:daily_chats", []) || [];
        for (const chatId of chats) await v5DailyReport(env, chatId);
      }
    } catch (error) { console.error("V5 scheduled:", getSafeErrorMessage(error)); }
  },

  async fetch(
    request,
    env,
    ctx
  ) {

    const url =
      new URL(
        request.url
      );


    /*
     * Health check
     */

    if (
      request.method ===
        "GET" &&
      (
        url.pathname ===
          "/" ||
        url.pathname ===
          "/health"
      )
    ) {
      return new Response(
        "Telegram Bot is running.",
        {
          status: 200,
          headers: {
            "Content-Type":
              "text/plain; charset=UTF-8"
          }
        }
      );
    }


    /*
     * Webhook endpoint
     */

    if (
      request.method ===
        "POST"
    ) {
      return await handleWebhookUpdate(
        request,
        env
      );
    }


    /*
     * Unsupported methods
     */

    return new Response(
      "Method Not Allowed",
      {
        status: 405,
        headers: {
          Allow:
            "GET, POST"
        }
      }
    );
  }
};