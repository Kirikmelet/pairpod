import { createAuthenticatedRouteClient } from "@/lib/server/auth";
import { jsonError, jsonSuccess } from "@/lib/server/http";
import { createMistralChatCompletion } from "@/lib/server/mistral";

export const runtime = "nodejs";

type AiDmRequestBody = {
  message?: unknown;
  history?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  let body: AiDmRequestBody;

  try {
    body = (await request.json()) as AiDmRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const history = Array.isArray(body.history)
    ? body.history
        .filter((entry): entry is { role: "user" | "assistant"; content: string } =>
          Boolean(
            entry &&
              typeof entry === "object" &&
              ("role" in entry) &&
              (entry.role === "user" || entry.role === "assistant") &&
              ("content" in entry) &&
              typeof entry.content === "string",
          ),
        )
        .slice(-8)
    : [];

  if (!message) {
    return jsonError("message is required.", 400);
  }

  try {
    const { user } = await createAuthenticatedRouteClient(
      request,
      "app/api/ai/dm/route.ts",
    );

    if (!user) {
      return jsonError("You must be signed in to use the AI assistant.", 401);
    }

    const response = await createMistralChatCompletion({
      temperature: 0.72,
      maxTokens: 420,
      messages: [
        {
          role: "system",
          content:
            "You are PairPod's pinned DM assistant. Be concise, friendly, specific, and useful. Sound like a helpful teammate, not a corporate bot.",
        },
        ...history,
        {
          role: "user",
          content: message,
        },
      ],
    });

    return jsonSuccess({ message: response }, 201);
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : "Failed to generate AI reply.";
    return jsonError(messageText, 500);
  }
}
