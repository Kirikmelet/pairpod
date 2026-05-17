import "server-only";

type MistralRole = "system" | "user" | "assistant";

export type MistralMessage = {
  role: MistralRole;
  content: string;
};

export type MistralChatCompletionInput = {
  messages: MistralMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
};

type MistralChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

const DEFAULT_MISTRAL_API_URL =
  "https://api.mistral.ai/v1/chat/completions";
const DEFAULT_MISTRAL_MODEL = "mistral-small-latest";

export async function createMistralChatCompletion({
  messages,
  temperature = 0.7,
  maxTokens = 900,
  model = readMistralModel(),
}: MistralChatCompletionInput) {
  const apiKey =
    process.env.MISTRAL_API_KEY?.trim() ||
    process.env.MISTRAY_API_KEY?.trim() ||
    process.env.MINSTRAL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing env var MISTRAL_API_KEY, MISTRAY_API_KEY, or MINSTRAL_API_KEY");
  }

  const response = await fetch(readMistralApiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Mistral request failed (${response.status}): ${
        errorText || response.statusText
      }`,
    );
  }

  const payload = (await response.json()) as MistralChatCompletionResponse;
  const content = readAssistantContent(payload);

  if (!content) {
    throw new Error("Mistral response did not include assistant content.");
  }

  return content;
}

function readMistralApiUrl() {
  return process.env.MISTRAL_API_URL?.trim() || DEFAULT_MISTRAL_API_URL;
}

function readMistralModel() {
  return process.env.MISTRAL_MODEL?.trim() || DEFAULT_MISTRAL_MODEL;
}

function readAssistantContent(payload: MistralChatCompletionResponse) {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" || !part.type ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}
