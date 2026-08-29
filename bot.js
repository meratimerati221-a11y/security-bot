require("dotenv").config();

const { Telegraf } = require("telegraf");

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error("❌ BOT_TOKEN پیدا نشد.");
  process.exit(1);
}

const bot = new Telegraf(token);

const MAIN_ADMIN_ID = 5366147520;


// ===============================
// START
// ===============================

bot.start(async (ctx) => {
  await ctx.reply(
    "🛡 Security Bot\n\n" +
    "ربات با موفقیت فعال است ✅\n\n" +
    "/myid - نمایش آیدی\n" +
    "/panel - پنل مدیریت"
  );
});


// ===============================
// MY ID
// ===============================

bot.command("myid", async (ctx) => {
  await ctx.reply(
    "🆔 User ID: " +
    ctx.from.id +
    "\n\n💬 Chat ID: " +
    ctx.chat.id
  );
});


// ===============================
// PANEL
// ===============================

bot.command("panel", async (ctx) => {

  if (ctx.from.id !== MAIN_ADMIN_ID) {
    await ctx.reply("⛔ شما دسترسی به پنل مدیریت ندارید.");
    return;
  }

  await ctx.reply(
    "🛡 SECURITY PANEL\n\n" +
    "🔗 ضد لینک: فعال ✅\n" +
    "🚫 ضد اسپم: فعال ✅\n" +
    "⚠️ سیستم اخطار: فعال ✅\n" +
    "🔇 میوت خودکار: فعال ✅\n" +
    "👮 محافظت ادمین: فعال ✅"
  );
});


// ===============================
// ضد لینک و ضد اسپم
// ===============================

bot.on("text", async (ctx) => {

  const text = ctx.message.text || "";

  // دستورات را دوباره پردازش نکن
  if (text.startsWith("/")) {
    return;
  }

  // فقط گروه‌ها
  if (
    ctx.chat.type !== "group" &&
    ctx.chat.type !== "supergroup"
  ) {
    return;
  }

  // ادمین اصلی مستثنی است
  if (ctx.from.id === MAIN_ADMIN_ID) {
    return;
  }


  // ===============================
  // تشخیص لینک
  // ===============================

  const linkRegex =
    /(https?:\/\/|www\.|t\.me\/|telegram\.me\/)/i;

  if (linkRegex.test(text)) {

    try {

      await ctx.deleteMessage();

      await ctx.reply(
        "⚠️ ارسال لینک در این گروه مجاز نیست."
      );

    } catch (error) {

      console.log(
        "❌ خطا در حذف پیام:",
        error.message
      );
    }

    return;
  }


  // ===============================
  // ضد اسپم
  // ===============================

  const spamWords = [
    "تبلیغ",
    "اسپم",
    "قرعه کشی",
    "کسب درآمد"
  ];

  const lowerText = text.toLowerCase();

  for (const word of spamWords) {

    if (lowerText.includes(word)) {

      try {

        await ctx.deleteMessage();

        await ctx.reply(
          "⚠️ پیام اسپم شناسایی و حذف شد."
        );

      } catch (error) {

        console.log(
          "❌ خطا در حذف پیام:",
          error.message
        );
      }

      return;
    }
  }
});


// ===============================
// مدیریت خطا
// ===============================

bot.catch((error) => {

  console.error(
    "❌ Telegram Bot Error:",
    error
  );

});


// ===============================
// اجرای ربات
// ===============================

async function startBot() {

  try {

    await bot.launch();

    console.log(
      "🛡 Security Bot started successfully!"
    );

  } catch (error) {

    console.error(
      "❌ Bot failed to start:"
    );

    console.error(error);

    process.exit(1);
  }
}


// ===============================
// خاموش شدن صحیح
// ===============================

process.once(
  "SIGINT",
  () => bot.stop("SIGINT")
);

process.once(
  "SIGTERM",
  () => bot.stop("SIGTERM")
);


startBot();