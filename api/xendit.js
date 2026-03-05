/**
 * Vercel serverless entry for Xendit webhook.
 * Set Xendit webhook to: https://your-domain.vercel.app/api/xendit
 */
import "dotenv/config";
import { handleXenditWebhook } from "../src/payments/xendit.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const body = req.body ?? {};
    const { statusCode, body: resBody } = await handleXenditWebhook(body);
    res.status(statusCode).send(resBody);
  } catch (err) {
    console.error("Vercel Xendit Handler Error:", err);
    if (!res.headersSent) {
      res.status(200).send("Error Handled");
    }
  }
}
