import { Xendit } from "xendit-node";
import {
  XENDIT_SECRET_KEY,
  XENDIT_CALLBACK_TOKEN,
  AI_EXTEND_PRICE,
  AI_EXTEND_BONUS,
} from "../config/index.js";
import {
  createPayment,
  getPaymentByXenditId,
  markPaymentPaid,
  addBalance,
  extendAiQuota,
} from "../db/index.js";

const xenditClient = new Xendit({ secretKey: XENDIT_SECRET_KEY });
const { Invoice } = xenditClient;

/**
 * Create a Xendit invoice for wallet top-up.
 * @param {string} userId
 * @param {number} amount - IDR
 * @returns {{ invoiceUrl: string, xenditId: string }}
 */
export async function createTopUpInvoice(userId, amount) {
  const data = {
    externalId: `lala-${userId}-${Date.now()}`,
    amount,
    description: `Top-up Lala Wallet — Rp ${amount.toLocaleString("id-ID")}`,
    currency: "IDR",
    successRedirectUrl: `https://web.telegram.org/k/#@${process.env.BOT_USERNAME}`,
    failureRedirectUrl: `https://web.telegram.org/k/#@${process.env.BOT_USERNAME}`,
  };

  let invoice;

  if (process.env.NODE_ENV === "production") {
    const response = await fetch(`https://prox.fysite.id/invoice`, {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.XENDIT_PROXY_API_KEY,
      },
      method: "POST",
      body: JSON.stringify(data),
    });
    invoice = await response.json();
  } else {
    invoice = await Invoice.createInvoice({
      data,
    });
  }

  await createPayment(userId, {
    xenditId: invoice.id,
    amount,
    type: "topup",
  });

  return { invoiceUrl: invoice.invoiceUrl, xenditId: invoice.id };
}

/**
 * Create a Xendit invoice for extending AI quota (+30 responses).
 * @param {string} userId
 * @returns {{ invoiceUrl: string, xenditId: string }}
 */
export async function createAiExtendInvoice(userId) {
  const externalId = `lala-ai-${userId}-${Date.now()}`;

  const invoice = await Invoice.createInvoice({
    data: {
      externalId,
      amount: AI_EXTEND_PRICE,
      description: `Perpanjang AI Lala +${AI_EXTEND_BONUS} respons`,
      currency: "IDR",
    },
  });

  await createPayment(userId, {
    xenditId: invoice.id,
    amount: AI_EXTEND_PRICE,
    type: "ai_extend",
  });

  return { invoiceUrl: invoice.invoiceUrl, xenditId: invoice.id };
}

/**
 * Handle Xendit payment webhook.
 * Verifies the callback token, finds the payment, and credits the user.
 *
 * @param {object} body - parsed webhook payload
 * @param {string} callbackToken - from request header x-callback-token
 * @param {object} bot - Telegraf bot instance for DM notifications
 */
export async function handleXenditWebhook(body, callbackToken, bot) {
  if (callbackToken !== XENDIT_CALLBACK_TOKEN) {
    throw new Error("Invalid Xendit callback token");
  }

  if (body.status !== "PAID") return;

  const xenditId = body.id;
  const payment = await getPaymentByXenditId(xenditId);
  if (!payment || payment.status === "PAID") return;

  await markPaymentPaid(xenditId);

  if (payment.type === "topup") {
    await addBalance(payment.userId, payment.amount);
    await bot.telegram.sendMessage(
      payment.userId,
      `✅ Top-up berhasil! Rp ${payment.amount.toLocaleString("id-ID")} sudah masuk ke dompetmu. 💰`,
    );
  } else if (payment.type === "ai_extend") {
    await extendAiQuota(payment.userId, AI_EXTEND_BONUS);
    await bot.telegram.sendMessage(
      payment.userId,
      `✅ Pembayaran berhasil! Kamu dapat +${AI_EXTEND_BONUS} respons AI dari Lala hari ini. Yuk lanjut ngobrol! 💬`,
    );
  }
}
