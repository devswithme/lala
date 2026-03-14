import OpenAI from "openai";
import { OPENROUTER_API_KEY } from "../config/index.js";

export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://lala.bot",
    "X-Title": "Lala",
  },
});
