import { createAuthenticatedRouteClient } from "@/lib/server/auth";
import {
  createFakeChatFromMistral,
  type FakeChatScope,
} from "@/lib/server/fake-chat";
import { jsonError, jsonSuccess } from "@/lib/server/http";

export const runtime = "nodejs";

type FakeChatRequestBody = {
  scope?: unknown;
  domainUrl?: unknown;
  latestMessage?: unknown;
  recentMessages?: unknown;
  reservedNames?: unknown;
  topic?: unknown;
  userCount?: unknown;
  messageCount?: unknown;
  dryRun?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  let body: FakeChatRequestBody;

  try {
    body = (await request.json()) as FakeChatRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const scope = readScope(body.scope);
  const domainUrl =
    typeof body.domainUrl === "string" ? body.domainUrl.trim() : null;
  const latestMessage =
    typeof body.latestMessage === "string" ? body.latestMessage.trim() : null;
  const recentMessages = readRecentMessages(body.recentMessages);
  const reservedNames = readReservedNames(body.reservedNames);
  const topic = typeof body.topic === "string" ? body.topic.trim() : null;
  const userCount = readOptionalInteger(body.userCount);
  const messageCount = readOptionalInteger(body.messageCount);
  const dryRun = body.dryRun === true;

  if (!scope) {
    return jsonError('scope must be either "global" or "domain".', 400);
  }

  if (scope === "domain" && !domainUrl) {
    return jsonError("domainUrl is required when scope is domain.", 400);
  }

  try {
    const { user } = await createAuthenticatedRouteClient(
      request,
      "app/api/ai/fake-chat/route.ts",
    );

    if (!user) {
      return jsonError("You must be signed in to generate fake chat.", 401);
    }

    const data = await createFakeChatFromMistral({
      scope,
      domainUrl,
      latestMessage,
      recentMessages,
      reservedNames,
      topic,
      userCount,
      messageCount,
      dryRun,
    });

    return jsonSuccess(
      {
        scope: data.scope,
        page: data.page,
        room: data.room,
        generated: data.generated,
        users: data.users.map((fakeUser) => ({
          id: fakeUser.id,
          username: fakeUser.username,
          displayName: fakeUser.display_name,
          avatarUrl: fakeUser.avatar_url,
        })),
        chats: data.chats,
      },
      dryRun ? 200 : 201,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate fake chat.";
    return jsonError(message, 500);
  }
}

function readScope(value: unknown): FakeChatScope | null {
  return value === "global" || value === "domain" ? value : null;
}

function readOptionalInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readRecentMessages(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const body = typeof record.body === "string" ? record.body.trim() : "";
      if (!body) {
        return null;
      }

      return {
        author: typeof record.author === "string" && record.author.trim()
          ? record.author.trim().slice(0, 48)
          : "Someone",
        body: body.slice(0, 280),
        isAi: record.isAi === true,
      };
    })
    .filter((entry): entry is { author: string; body: string; isAi: boolean } => Boolean(entry))
    .slice(-10);
}

function readReservedNames(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 100);
}
