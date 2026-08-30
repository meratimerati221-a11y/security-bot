/**
 * ============================================================
 * SECURITY BOT PRO
 * Cloudflare Workers + Telegram Bot API
 * ============================================================
 *
 * Required bindings:
 *
 *   BOT_TOKEN   -> Cloudflare Secret
 *   SECURITY_KV -> Cloudflare KV Namespace
 *
 * OWNER_IDS:
 *   Put your trusted Telegram numeric IDs here.
 *
 * IMPORTANT:
 *   Never put your Telegram bot token in this file.
 * ============================================================
 */

const OWNER_IDS = [
  5366147520,
  8811175958,
];

const DEFAULT_SETTINGS = {
  antiLink: true,
  antiSpam: true,
  antiForward: false,
  welcome: true,

  warnLimit: 3,
  muteMinutes: 10,

  deleteCommands: false,
  logActions: true,
};

const NORMAL_PERMISSIONS = {
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
  can_manage_topics: false,
};

const MUTED_PERMISSIONS = {
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
  can_manage_topics: false,
};

/* ============================================================
   WORKER ENTRY
   ============================================================ */

export default {
  async fetch(request, env) {
    try {
      if (request.method === "GET") {
        return new Response(
          "Security Bot PRO is online.",
          {
            status: 200,
            headers: {
              "content-type":
                "text/plain; charset=utf-8",
            },
          },
        );
      }

      if (request.method !== "POST") {
        return new Response(
          "Method Not Allowed",
          { status: 405 },
        );
      }

      if (!env.BOT_TOKEN) {
        console.error(
          "BOT_TOKEN secret is missing.",
        );

        return json(
          {
            ok: false,
            error:
              "BOT_TOKEN is not configured.",
          },
          500,
        );
      }

      const update =
        await request.json();

      await handleUpdate(
        update,
        env,
      );

      return json({
        ok: true,
      });
    } catch (error) {
      console.error(
        "Worker error:",
        error,
      );

      /*
       * Telegram should still receive a
       * successful webhook response.
       */
      return json({
        ok: true,
      });
    }
  },
};

/* ============================================================
   GENERIC HELPERS
   ============================================================ */

function json(
  data,
  status = 200,
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
      },
    },
  );
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalize(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function displayName(user) {
  return (
    user?.first_name ||
    user?.username ||
    "کاربر"
  );
}

function isOwner(userId) {
  return OWNER_IDS.includes(
    Number(userId),
  );
}

function isGroup(chat) {
  return (
    chat?.type === "group" ||
    chat?.type === "supergroup"
  );
}

/* ============================================================
   TELEGRAM API
   ============================================================ */

async function telegram(
  env,
  method,
  payload = {},
) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
      },
      body: JSON.stringify(
        payload,
      ),
    },
  );

  return response.json();
}

async function sendMessage(
  env,
  chatId,
  text,
  extra = {},
) {
  return telegram(
    env,
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...extra,
    },
  );
}

async function editMessage(
  env,
  chatId,
  messageId,
  text,
  extra = {},
) {
  return telegram(
    env,
    "editMessageText",
    {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      ...extra,
    },
  );
}

async function answerCallback(
  env,
  callbackId,
  text = "",
) {
  return telegram(
    env,
    "answerCallbackQuery",
    {
      callback_query_id:
        callbackId,
      text,
    },
  );
}

async function deleteMessage(
  env,
  chatId,
  messageId,
) {
  return telegram(
    env,
    "deleteMessage",
    {
      chat_id: chatId,
      message_id: messageId,
    },
  );
}

async function getMe(env) {
  return telegram(
    env,
    "getMe",
  );
}

async function getChat(
  env,
  chatId,
) {
  return telegram(
    env,
    "getChat",
    {
      chat_id: chatId,
    },
  );
}

async function getChatMember(
  env,
  chatId,
  userId,
) {
  return telegram(
    env,
    "getChatMember",
    {
      chat_id: chatId,
      user_id: userId,
    },
  );
}

async function getChatAdministrators(
  env,
  chatId,
) {
  return telegram(
    env,
    "getChatAdministrators",
    {
      chat_id: chatId,
    },
  );
}

async function banUser(
  env,
  chatId,
  userId,
) {
  return telegram(
    env,
    "banChatMember",
    {
      chat_id: chatId,
      user_id: userId,
    },
  );
}

async function unbanUser(
  env,
  chatId,
  userId,
) {
  return telegram(
    env,
    "unbanChatMember",
    {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: true,
    },
  );
}

async function restrictUser(
  env,
  chatId,
  userId,
  permissions,
  untilDate,
) {
  const payload = {
    chat_id: chatId,
    user_id: userId,
    permissions,
  };

  if (untilDate) {
    payload.until_date =
      untilDate;
  }

  return telegram(
    env,
    "restrictChatMember",
    payload,
  );
}

async function pinMessage(
  env,
  chatId,
  messageId,
) {
  return telegram(
    env,
    "pinChatMessage",
    {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: false,
    },
  );
}

async function unpinMessage(
  env,
  chatId,
  messageId,
) {
  return telegram(
    env,
    "unpinChatMessage",
    {
      chat_id: chatId,
      message_id: messageId,
    },
  );
}

/* ============================================================
   KV STORAGE
   ============================================================ */

function settingsKey(chatId) {
  return `settings:${chatId}`;
}

function warningKey(
  chatId,
  userId,
) {
  return `warning:${chatId}:${userId}`;
}

function spamKey(
  chatId,
  userId,
) {
  return `spam:${chatId}:${userId}`;
}

function welcomeKey(chatId) {
  return `welcome:${chatId}`;
}

async function getJSON(
  env,
  key,
  fallback,
) {
  if (!env.SECURITY_KV) {
    return structuredClone(
      fallback,
    );
  }

  const raw =
    await env.SECURITY_KV.get(
      key,
    );

  if (!raw) {
    return structuredClone(
      fallback,
    );
  }

  try {
    return JSON.parse(raw);
  } catch {
    return structuredClone(
      fallback,
    );
  }
}

async function putJSON(
  env,
  key,
  value,
  ttl,
) {
  if (!env.SECURITY_KV) {
    return;
  }

  const options =
    ttl
      ? { expirationTtl: ttl }
      : undefined;

  await env.SECURITY_KV.put(
    key,
    JSON.stringify(value),
    options,
  );
}

async function getText(
  env,
  key,
  fallback = "",
) {
  if (!env.SECURITY_KV) {
    return fallback;
  }

  return (
    (await env.SECURITY_KV.get(
      key,
    )) ?? fallback
  );
}

async function putText(
  env,
  key,
  value,
  ttl,
) {
  if (!env.SECURITY_KV) {
    return;
  }

  const options =
    ttl
      ? { expirationTtl: ttl }
      : undefined;

  await env.SECURITY_KV.put(
    key,
    String(value),
    options,
  );
}

/* ============================================================
   SETTINGS
   ============================================================ */

async function getSettings(
  env,
  chatId,
) {
  const saved =
    await getJSON(
      env,
      settingsKey(chatId),
      DEFAULT_SETTINGS,
    );

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
  };
}

async function saveSettings(
  env,
  chatId,
  settings,
) {
  await putJSON(
    env,
    settingsKey(chatId),
    {
      ...DEFAULT_SETTINGS,
      ...settings,
    },
  );
}

/* ============================================================
   SECURITY DETECTION
   ============================================================ */

function containsLink(text) {
  return /(https?:\/\/|www\.|t\.me\/|telegram\.me\/|discord\.gg\/|bit\.ly\/|tinyurl\.com\/)/i.test(
    text,
  );
}

function looksLikeSpam(text) {
  const value =
    normalize(text);

  if (!value) return false;

  const repeatedChars =
    /(.)\1{8,}/i.test(value);

  const manyMentions =
    (
      value.match(
        /@[a-zA-Z0-9_]{3,}/g,
      ) || []
    ).length >= 5;

  return (
    repeatedChars ||
    manyMentions
  );
}

async function isAdmin(
  env,
  chatId,
  userId,
) {
  if (isOwner(userId)) {
    return true;
  }

  const result =
    await getChatMember(
      env,
      chatId,
      userId,
    );

  if (!result?.ok) {
    return false;
  }

  return (
    result.result?.status ===
      "administrator" ||
    result.result?.status ===
      "creator"
  );
}

/* ============================================================
   WARNINGS
   ============================================================ */

async function getWarnings(
  env,
  chatId,
  userId,
) {
  return Number(
    await getText(
      env,
      warningKey(
        chatId,
        userId,
      ),
      "0",
    ),
  );
}

async function clearWarnings(
  env,
  chatId,
  userId,
) {
  if (!env.SECURITY_KV) {
    return;
  }

  await env.SECURITY_KV.delete(
    warningKey(
      chatId,
      userId,
    ),
  );
}

async function addWarning(
  env,
  chatId,
  userId,
  reason,
  settings,
) {
  const current =
    await getWarnings(
      env,
      chatId,
      userId,
    );

  const count =
    current + 1;

  await putText(
    env,
    warningKey(
      chatId,
      userId,
    ),
    count,
    60 * 60 * 24 * 30,
  );

  if (
    count >=
    Number(settings.warnLimit)
  ) {
    const until =
      Math.floor(
        Date.now() / 1000,
      ) +
      Number(
        settings.muteMinutes,
      ) *
        60;

    await restrictUser(
      env,
      chatId,
      userId,
      MUTED_PERMISSIONS,
      until,
    );

    await clearWarnings(
      env,
      chatId,
      userId,
    );

    await sendMessage(
      env,
      chatId,
      "🔇 <b>کاربر محدود شد</b>\n\n" +
        `دلیل: ${escapeHTML(
          reason,
        )}\n` +
        `مدت: ${settings.muteMinutes} دقیقه`,
    );

    return;
  }

  await sendMessage(
    env,
    chatId,
    "⚠️ <b>اخطار</b>\n\n" +
      `دلیل: ${escapeHTML(
        reason,
      )}\n` +
      `اخطار: ${count}/${settings.warnLimit}`,
  );
}

/* ============================================================
   ANTI SPAM
   ============================================================ */

async function registerSpam(
  env,
  chatId,
  userId,
  text,
) {
  const key =
    spamKey(
      chatId,
      userId,
    );

  let data =
    await getJSON(
      env,
      key,
      {
        messages: [],
        lastText: "",
      },
    );

  const now =
    Date.now();

  data.messages =
    (
      data.messages || []
    ).filter(
      (item) =>
        now - item.time <
        15000,
    );

  data.messages.push({
    time: now,
    text: normalize(
      text,
    ).slice(0, 300),
  });

  const recent =
    data.messages;

  const sameCount =
    recent.filter(
      (item) =>
        item.text ===
        normalize(
          text,
        ).slice(0, 300),
    ).length;

  const burst =
    recent.length >= 6;

  const obvious =
    looksLikeSpam(text);

  data.lastText =
    text.slice(0, 300);

  await putJSON(
    env,
    key,
    data,
    60,
  );

  return (
    sameCount >= 3 ||
    burst ||
    obvious
  );
}

/* ============================================================
   INLINE KEYBOARDS
   ============================================================ */

function mainKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "🛡️ امنیت",
          callback_data:
            "panel:security",
        },
        {
          text: "⚠️ اخطارها",
          callback_data:
            "panel:warnings",
        },
      ],

      [
        {
          text: "👥 کاربران",
          callback_data:
            "panel:users",
        },
        {
          text: "⚙️ تنظیمات",
          callback_data:
            "panel:settings",
        },
      ],

      [
        {
          text: "📊 وضعیت",
          callback_data:
            "panel:status",
        },
      ],

      [
        {
          text: "❓ راهنما",
          callback_data:
            "panel:help",
        },
      ],
    ],
  };
}

function backKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "⬅️ بازگشت",
          callback_data:
            "panel:main",
        },
      ],
    ],
  };
}

/* ============================================================
   OWNER PANEL
   ============================================================ */

async function sendOwnerPanel(
  env,
  chatId,
) {
  await sendMessage(
    env,
    chatId,
    "🎛️ <b>Security Bot PRO</b>\n\n" +
      "پنل مدیریت آماده است.\n\n" +
      "یکی از گزینه‌های زیر را انتخاب کن:",
    {
      reply_markup:
        mainKeyboard(),
    },
  );
}

async function sendOwnerHelp(
  env,
  chatId,
) {
  await sendMessage(
    env,
    chatId,
    "❓ <b>راهنمای Security Bot PRO</b>\n\n" +

      "🎛️ /panel — پنل مدیریت\n" +
      "🆔 /id — نمایش شناسه\n" +
      "❓ /help — راهنما\n\n" +

      "برای مدیریت گروه:\n" +
      "<code>group -1001234567890</code>\n\n" +

      "برای مدیریت کاربر:\n" +
      "<code>کاربر CHAT_ID USER_ID</code>\n\n" +

      "⚠️ ربات باید در گروه Administrator باشد.",
    {
      reply_markup:
        backKeyboard(),
    },
  );
}

/* ============================================================
   GROUP SETTINGS PANEL
   ============================================================ */

async function sendGroupSettings(
  env,
  ownerChatId,
  groupId,
) {
  const settings =
    await getSettings(
      env,
      groupId,
    );

  const chat =
    await getChat(
      env,
      groupId,
    );

  const title =
    chat?.ok
      ? chat.result?.title ||
        "گروه"
      : "گروه";

  const text =
    `⚙️ <b>${escapeHTML(
      title,
    )}</b>\n\n` +

    `🆔 <code>${groupId}</code>\n\n` +

    `🔗 حذف لینک: ${
      settings.antiLink
        ? "🟢 فعال"
        : "🔴 خاموش"
    }\n` +

    `🚨 ضد اسپم: ${
      settings.antiSpam
        ? "🟢 فعال"
        : "🔴 خاموش"
    }\n` +

    `↩️ ضد فوروارد: ${
      settings.antiForward
        ? "🟢 فعال"
        : "🔴 خاموش"
    }\n` +

    `👋 خوش‌آمد: ${
      settings.welcome
        ? "🟢 فعال"
        : "🔴 خاموش"
    }\n` +

    `⚠️ سقف اخطار: <b>${settings.warnLimit}</b>\n` +

    `🔇 مدت میوت: <b>${settings.muteMinutes}</b> دقیقه`;

  await sendMessage(
    env,
    ownerChatId,
    text,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text:
                `🔗 لینک: ${
                  settings.antiLink
                    ? "خاموش"
                    : "روشن"
                }`,
              callback_data:
                `group:link:${groupId}`,
            },
          ],

          [
            {
              text:
                `🚨 اسپم: ${
                  settings.antiSpam
                    ? "خاموش"
                    : "روشن"
                }`,
              callback_data:
                `group:spam:${groupId}`,
            },
          ],

          [
            {
              text:
                `↩️ فوروارد: ${
                  settings.antiForward
                    ? "خاموش"
                    : "روشن"
                }`,
              callback_data:
                `group:forward:${groupId}`,
            },
          ],

          [
            {
              text:
                `👋 خوش‌آمد: ${
                  settings.welcome
                    ? "خاموش"
                    : "روشن"
                }`,
              callback_data:
                `group:welcome:${groupId}`,
            },
          ],

          [
            {
              text:
                "⚠️ تغییر سقف اخطار",
              callback_data:
                `group:warn:${groupId}`,
            },
          ],

          [
            {
              text:
                "🔇 تغییر مدت میوت",
              callback_data:
                `group:mute:${groupId}`,
            },
          ],

          [
            {
              text:
                "⬅️ پنل اصلی",
              callback_data:
                "panel:main",
            },
          ],
        ],
      },
    },
  );
}

/* ============================================================
   USER MANAGEMENT
   ============================================================ */

async function sendUserActions(
  env,
  ownerChatId,
  groupId,
  userId,
) {
  const member =
    await getChatMember(
      env,
      groupId,
      userId,
    );

  const name =
    member?.ok
      ? displayName(
          member.result?.user,
        )
      : "کاربر";

  const warnings =
    await getWarnings(
      env,
      groupId,
      userId,
    );

  await sendMessage(
    env,
    ownerChatId,
    "👤 <b>مدیریت کاربر</b>\n\n" +
      `نام: <b>${escapeHTML(
        name,
      )}</b>\n` +
      `🆔 <code>${userId}</code>\n` +
      `⚠️ اخطارها: ${warnings}`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text:
                "🔇 میوت ۱۰ دقیقه",
              callback_data:
                `user:mute:${groupId}:${userId}:10`,
            },
          ],

          [
            {
              text:
                "🔇 میوت ۱ ساعت",
              callback_data:
                `user:mute:${groupId}:${userId}:60`,
            },
          ],

          [
            {
              text:
                "🔊 رفع میوت",
              callback_data:
                `user:unmute:${groupId}:${userId}`,
            },
          ],

          [
            {
              text:
                "⚠️ پاک کردن اخطارها",
              callback_data:
                `user:clearwarn:${groupId}:${userId}`,
            },
          ],

          [
            {
              text:
                "🚫 مسدود کردن",
              callback_data:
                `user:ban:${groupId}:${userId}`,
            },
          ],

          [
            {
              text:
                "✅ رفع مسدودی",
              callback_data:
                `user:unban:${groupId}:${userId}`,
            },
          ],
        ],
      },
    },
  );
}

/* ============================================================
   CALLBACK HANDLER
   ============================================================ */

async function handleCallback(
  query,
  env,
) {
  const userId =
    Number(
      query.from?.id || 0,
    );

  if (!isOwner(userId)) {
    await answerCallback(
      env,
      query.id,
      "⛔ دسترسی ندارید.",
    );

    return;
  }

  await answerCallback(
    env,
    query.id,
  );

  const message =
    query.message;

  if (!message) {
    return;
  }

  const data =
    query.data || "";

  /* MAIN */

  if (
    data ===
    "panel:main"
  ) {
    await editMessage(
      env,
      message.chat.id,
      message.message_id,
      "🎛️ <b>Security Bot PRO</b>\n\n" +
        "پنل مدیریت:",
      {
        reply_markup:
          mainKeyboard(),
      },
    );

    return;
  }

  /* SECURITY */

  if (
    data ===
    "panel:security"
  ) {
    await editMessage(
      env,
      message.chat.id,
      message.message_id,
      "🛡️ <b>مرکز امنیت</b>\n\n" +
        "🔗 ضد لینک\n" +
        "🚨 ضد اسپم\n" +
        "↩️ کنترل فوروارد\n" +
        "⚠️ سیستم اخطار\n" +
        "🔇 محدودسازی خودکار\n\n" +
        "تنظیمات هر گروه جداگانه ذخیره می‌شود.",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "⚙️ تنظیمات گروه",
                callback_data:
                  "panel:settings",
              },
            ],
            [
              {
                text:
                  "⬅️ بازگشت",
                callback_data:
                  "panel:main",
              },
            ],
          ],
        },
      },
    );

    return;
  }

  /* WARNINGS */

  if (
    data ===
    "panel:warnings"
  ) {
    await editMessage(
      env,
      message.chat.id,
      message.message_id,
      "⚠️ <b>سیستم اخطار</b>\n\n" +
        "با عبور کاربر از سقف اخطار، ربات او را برای مدت تعیین‌شده محدود می‌کند.\n\n" +
        "برای تغییر سقف، وارد تنظیمات گروه شو.",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "⚙️ تنظیمات گروه",
                callback_data:
                  "panel:settings",
              },
            ],
            [
              {
                text:
                  "⬅️ بازگشت",
                callback_data:
                  "panel:main",
              },
            ],
          ],
        },
      },
    );

    return;
  }

  /* USERS */

  if (
    data ===
    "panel:users"
  ) {
    await editMessage(
      env,
      message.chat.id,
      message.message_id,
      "👥 <b>مدیریت کاربران</b>\n\n" +
        "برای مدیریت یک کاربر، در PV ربات بنویس:\n\n" +
        "<code>کاربر CHAT_ID USER_ID</code>",
      {
        reply_markup:
          backKeyboard(),
      },
    );

    return;
  }

  /* SETTINGS */

  if (
    data ===
    "panel:settings"
  ) {
    await editMessage(
      env,
      message.chat.id,
      message.message_id,
      "⚙️ <b>تنظیمات گروه</b>\n\n" +
        "شناسه گروه را ارسال کن:\n\n" +
        "<code>group -1001234567890</code>",
      {
        reply_markup:
          backKeyboard(),
      },
    );

    return;
  }

  /* STATUS */

  if (
    data ===
    "panel:status"
  ) {
    const me =
      await getMe(env);

    await editMessage(
      env,
      message.chat.id,
      message.message_id,
      "📊 <b>وضعیت ربات</b>\n\n" +
        "🟢 Worker: فعال\n" +
        `🤖 Bot: ${
          me?.ok
            ? escapeHTML(
                "@" +
                  (
                    me.result
                      ?.username ||
                    "unknown"
                  ),
              )
            : "خطا"
        }\n` +
        `👑 Ownerها: ${OWNER_IDS.length}\n` +
        `🗄️ KV: ${
          env.SECURITY_KV
            ? "متصل"
            : "تنظیم نشده"
        }`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "🔄 بروزرسانی",
                callback_data:
                  "panel:status",
              },
            ],
            [
              {
                text:
                  "⬅️ بازگشت",
                callback_data:
                  "panel:main",
              },
            ],
          ],
        },
      },
    );

    return;
  }

  /* HELP */

  if (
    data ===
    "panel:help"
  ) {
    await editMessage(
      env,
      message.chat.id,
      message.message_id,
      "❓ <b>راهنما</b>\n\n" +
        "/panel — پنل\n" +
        "/id — شناسه\n" +
        "/help — راهنما\n\n" +
        "برای مدیریت گروه:\n" +
        "<code>group CHAT_ID</code>",
      {
        reply_markup:
          backKeyboard(),
      },
    );

    return;
  }

  /* GROUP SETTINGS */

  if (
    data.startsWith(
      "group:",
    )
  ) {
    await handleGroupCallback(
      data,
      env,
      message.chat.id,
    );

    return;
  }

  /* USER ACTIONS */

  if (
    data.startsWith(
      "user:",
    )
  ) {
    await handleUserCallback(
      data,
      env,
      message.chat.id,
    );
  }
}

/* ============================================================
   GROUP CALLBACK
   ============================================================ */

async function handleGroupCallback(
  data,
  env,
  ownerChatId,
) {
  const parts =
    data.split(":");

  const action =
    parts[1];

  const groupId =
    Number(parts[2]);

  if (
    !Number.isFinite(
      groupId,
    )
  ) {
    return;
  }

  const settings =
    await getSettings(
      env,
      groupId,
    );

  if (
    action ===
    "link"
  ) {
    settings.antiLink =
      !settings.antiLink;
  }

  if (
    action ===
    "spam"
  ) {
    settings.antiSpam =
      !settings.antiSpam;
  }

  if (
    action ===
    "forward"
  ) {
    settings.antiForward =
      !settings.antiForward;
  }

  if (
    action ===
    "welcome"
  ) {
    settings.welcome =
      !settings.welcome;
  }

  if (
    action ===
    "warn"
  ) {
    settings.warnLimit =
      settings.warnLimit >= 10
        ? 1
        : settings.warnLimit + 1;
  }

  if (
    action ===
    "mute"
  ) {
    settings.muteMinutes =
      settings.muteMinutes >= 60
        ? 5
        : settings.muteMinutes + 5;
  }

  await saveSettings(
    env,
    groupId,
    settings,
  );

  await sendGroupSettings(
    env,
    ownerChatId,
    groupId,
  );
}

/* ============================================================
   USER CALLBACK
   ============================================================ */

async function handleUserCallback(
  data,
  env,
  ownerChatId,
) {
  const parts =
    data.split(":");

  const action =
    parts[1];

  const groupId =
    Number(parts[2]);

  const userId =
    Number(parts[3]);

  const minutes =
    Number(
      parts[4] || 10,
    );

  if (
    !Number.isFinite(
      groupId,
    ) ||
    !Number.isFinite(
      userId,
    )
  ) {
    return;
  }

  /*
   * Never allow owners to be
   * automatically moderated.
   */
  if (
    isOwner(userId)
  ) {
    await sendMessage(
      env,
      ownerChatId,
      "🛡️ این User ID در لیست Ownerهاست و قابل Ban/Mute از این پنل نیست.",
    );

    return;
  }

  if (
    action ===
    "mute"
  ) {
    const until =
      Math.floor(
        Date.now() / 1000,
      ) +
      minutes * 60;

    const result =
      await restrictUser(
        env,
        groupId,
        userId,
        MUTED_PERMISSIONS,
        until,
      );

    await sendMessage(
      env,
      ownerChatId,
      result?.ok
        ? `🔇 کاربر <code>${userId}</code> برای ${minutes} دقیقه محدود شد.`
        : `❌ عملیات انجام نشد:\n<code>${escapeHTML(
            result?.description ||
              "Unknown error",
          )}</code>`,
    );

    return;
  }

  if (
    action ===
    "unmute"
  ) {
    const result =
      await restrictUser(
        env,
        groupId,
        userId,
        NORMAL_PERMISSIONS,
      );

    await sendMessage(
      env,
      ownerChatId,
      result?.ok
        ? `🔊 محدودیت کاربر <code>${userId}</code> برداشته شد.`
        : `❌ عملیات انجام نشد:\n<code>${escapeHTML(
            result?.description ||
              "Unknown error",
          )}</code>`,
    );

    return;
  }

  if (
    action ===
    "clearwarn"
  ) {
    await clearWarnings(
      env,
      groupId,
      userId,
    );

    await sendMessage(
      env,
      ownerChatId,
      `✅ اخطارهای کاربر <code>${userId}</code> پاک شد.`,
    );

    return;
  }

  if (
    action ===
    "ban"
  ) {
    const result =
      await banUser(
        env,
        groupId,
        userId,
      );

    await sendMessage(
      env,
      ownerChatId,
      result?.ok
        ? `🚫 کاربر <code>${userId}</code> مسدود شد.`
        : `❌ عملیات انجام نشد:\n<code>${escapeHTML(
            result?.description ||
              "Unknown error",
          )}</code>`,
    );

    return;
  }

  if (
    action ===
    "unban"
  ) {
    const result =
      await unbanUser(
        env,
        groupId,
        userId,
      );

    await sendMessage(
      env,
      ownerChatId,
      result?.ok
        ? `✅ مسدودی کاربر <code>${userId}</code> برداشته شد.`
        : `❌ عملیات انجام نشد:\n<code>${escapeHTML(
            result?.description ||
              "Unknown error",
          )}</code>`,
    );
  }
}

/* ============================================================
   PRIVATE CHAT
   ============================================================ */

async function handlePrivate(
  message,
  env,
) {
  const userId =
    Number(
      message.from?.id || 0,
    );

  const text =
    (
      message.text || ""
    ).trim();

  if (
    text ===
    "/id"
  ) {
    await sendMessage(
      env,
      message.chat.id,
      "🆔 User ID:\n" +
        `<code>${userId}</code>`,
    );

    return;
  }

  if (
    text ===
    "/help"
  ) {
    if (
      isOwner(userId)
    ) {
      await sendOwnerHelp(
        env,
        message.chat.id,
      );
    } else {
      await sendMessage(
        env,
        message.chat.id,
        "❓ برای استفاده از این ربات باید دسترسی لازم را داشته باشید.",
      );
    }

    return;
  }

  if (
    !isOwner(userId)
  ) {
    await sendMessage(
      env,
      message.chat.id,
      "⛔ <b>Access Denied</b>\n\n" +
        "شما Owner این ربات نیستید.",
    );

    return;
  }

  if (
    text ===
      "/start" ||
    text ===
      "/panel" ||
    text ===
      "پنل" ||
    text ===
      "مدیریت"
  ) {
    await sendOwnerPanel(
      env,
      message.chat.id,
    );

    return;
  }

  /*
   * group CHAT_ID
   */
  if (
    text.startsWith(
      "group ",
    )
  ) {
    const groupId =
      Number(
        text.split(/\s+/)[1],
      );

    if (
      !Number.isFinite(
        groupId,
      )
    ) {
      await sendMessage(
        env,
        message.chat.id,
        "❌ شناسه گروه معتبر نیست.",
      );

      return;
    }

    await sendGroupSettings(
      env,
      message.chat.id,
      groupId,
    );

    return;
  }

  /*
   * کاربر CHAT_ID USER_ID
   */
  if (
    text.startsWith(
      "کاربر ",
    )
  ) {
    const parts =
      text.split(
        /\s+/,
      );

    const groupId =
      Number(parts[1]);

    const targetUserId =
      Number(parts[2]);

    if (
      !Number.isFinite(
        groupId,
      ) ||
      !Number.isFinite(
        targetUserId,
      )
    ) {
      await sendMessage(
        env,
        message.chat.id,
        "❌ فرمت صحیح:\n\n" +
          "<code>کاربر CHAT_ID USER_ID</code>",
      );

      return;
    }

    await sendUserActions(
      env,
      message.chat.id,
      groupId,
      targetUserId,
    );

    return;
  }

  await sendOwnerPanel(
    env,
    message.chat.id,
  );
}

/* ============================================================
   GROUP MESSAGE HANDLER
   ============================================================ */

async function handleGroupMessage(
  message,
  env,
) {
  const chatId =
    message.chat.id;

  const userId =
    Number(
      message.from?.id || 0,
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
      chatId,
    );

  /*
   * Welcome
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
        escapeHTML(
          displayName(
            member,
          ),
        );

      const title =
        escapeHTML(
          message.chat
            .title ||
            "گروه",
        );

      await sendMessage(
        env,
        chatId,
        `👋 سلام ${name}\n\n` +
          `به <b>${title}</b> خوش اومدی.`,
      );
    }
  }

  /*
   * Ignore service messages.
   */

  if (
    !message.text &&
    !message.caption
  ) {
    return;
  }

  const content =
    (
      message.text ||
      message.caption ||
      ""
    ).trim();

  if (!content) {
    return;
  }

  /*
   * Admin exemption.
   */

  const admin =
    await isAdmin(
      env,
      chatId,
      userId,
    );

  if (admin) {
    return;
  }

  /*
   * Anti-link
   */

  if (
    settings.antiLink &&
    containsLink(content)
  ) {
    await deleteMessage(
      env,
      chatId,
      message.message_id,
    );

    await addWarning(
      env,
      chatId,
      userId,
      "ارسال لینک",
      settings,
    );

    return;
  }

  /*
   * Anti-forward
   */

  if (
    settings.antiForward &&
    (
      message.forward_origin ||
      message.forward_from ||
      message.forward_from_chat
    )
  ) {
    await deleteMessage(
      env,
      chatId,
      message.message_id,
    );

    await addWarning(
      env,
      chatId,
      userId,
      "فوروارد",
      settings,
    );

    return;
  }

  /*
   * Anti-spam
   */

  if (
    settings.antiSpam
  ) {
    const spam =
      await registerSpam(
        env,
        chatId,
        userId,
        content,
      );

    if (spam) {
      await deleteMessage(
        env,
        chatId,
        message.message_id,
      );

      await addWarning(
        env,
        chatId,
        userId,
        "اسپم",
        settings,
      );
    }
  }
}

/* ============================================================
   TELEGRAM MEMBERSHIP EVENT
   ============================================================ */

async function handleMyChatMember(
  update,
  env,
) {
  const chat =
    update.chat;

  const status =
    update.new_chat_member
      ?.status;

  console.log(
    "Bot membership update:",
    chat?.id,
    status,
  );

  /*
   * We intentionally do not automatically
   * change group permissions here.
   */
}

/* ============================================================
   OPTIONAL COMMAND REGISTRATION
   ============================================================ */

async function registerCommands(
  env,
) {
  return telegram(
    env,
    "setMyCommands",
    {
      commands: [
        {
          command: "start",
          description:
            "باز کردن پنل",
        },
        {
          command: "panel",
          description:
            "پنل مدیریت",
        },
        {
          command: "id",
          description:
            "نمایش شناسه",
        },
        {
          command: "help",
          description:
            "راهنما",
        },
      ],
    },
  );
}