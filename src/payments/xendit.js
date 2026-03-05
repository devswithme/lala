import { Xendit } from "xendit-node";
import { XENDIT_API_KEY } from "../config/index.js";
import {
  insertPayment,
  getPaymentByXenditInvoiceId,
  setPaymentPaid,
  setPaymentExpiredByInvoiceId,
  walletAdd,
} from "../db/index.js";

export const xendit = XENDIT_API_KEY
  ? new Xendit({ secretKey: XENDIT_API_KEY })
  : null;

export async function createTopupInvoice({ userId, amount }) {
  if (!xendit) throw new Error("XENDIT_API_KEY not configured");
  const externalId = `lala:${userId}:${Date.now()}`;
  const { Invoice } = xendit;

  let invoice = null;

  const data = {
    externalId,
    amount,
    successRedirectUrl: "https://t.me/talktolala_bot",
    failureRedirectUrl: "https://t.me/talktolala_bot",
    description: `Top up saldo Lala (user ${userId})`,
  };

  if (process.env.NODE_ENV !== "production") {
    invoice = await Invoice.createInvoice({
      data,
    });
  } else {
    const data = await fetch(`https://prox.fysite.id/invoice`, {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.XENDIT_PROXY_API_KEY,
      },
      method: "POST",
      body: JSON.stringify(data),
    });
    invoice = await data.json();
  }

  await insertPayment({
    user_id: userId,
    type: "topup",
    amount,
    xendit_invoice_id: invoice.id,
    external_id: externalId,
    status: "pending",
  });

  return {
    invoiceUrl: invoice.invoiceUrl ?? invoice.invoice_url,
    invoiceId: invoice.id,
  };
}

/**
 * Handle Xendit webhook payload. Returns { statusCode, body }.
 */
export async function handleXenditWebhook(body) {
  const invoiceId = body.id;
  const status = (body.status || "").toLowerCase();

  if (!invoiceId) {
    return { statusCode: 400, body: "missing invoice id" };
  }

  if (status === "paid" || status === "settled") {
    const payment = await getPaymentByXenditInvoiceId(invoiceId);
    if (payment && payment.status !== "paid" && payment.type === "topup") {
      await setPaymentPaid(payment.id);
      await walletAdd(payment.user_id, payment.amount);
    }
  } else if (status === "expired") {
    await setPaymentExpiredByInvoiceId(invoiceId);
  }

  return { statusCode: 200, body: "ok" };
}
