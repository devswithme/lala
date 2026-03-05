import { OpenRouter } from "@openrouter/sdk";
import { OPENROUTER_API_KEY, AI_MODEL } from "../config/index.js";

export const ai = OPENROUTER_API_KEY
  ? new OpenRouter({ apiKey: OPENROUTER_API_KEY })
  : null;

export async function chat(messages, options = {}) {
  if (!ai) throw new Error("OPENROUTER_API_KEY not configured");
  return ai.chat.send({
    chatGenerationParams: {
      model: options.model ?? AI_MODEL,
      maxTokens: options.maxTokens,
      messages,
    },
  });
}
