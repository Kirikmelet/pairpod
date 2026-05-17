import {
  AuthRequiredError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  createThreadMessage,
  listThreadMessages,
} from "@/lib/server/dms";
import { jsonError, jsonSuccess } from "@/lib/server/http";

type RouteContext = {
  params: Promise<{
    threadId: string;
  }>;
};

type CreateMessageRequestBody = {
  content?: unknown;
};

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { threadId } = await context.params;

  try {
    const messages = await listThreadMessages(request, threadId);
    return jsonSuccess(messages);
  } catch (error) {
    return toDmErrorResponse(error, "Failed to load DM messages.");
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { threadId } = await context.params;
  let body: CreateMessageRequestBody;

  try {
    body = (await request.json()) as CreateMessageRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  try {
    const content = typeof body.content === "string" ? body.content : "";
    const message = await createThreadMessage(request, threadId, content);
    return jsonSuccess(message, 201);
  } catch (error) {
    return toDmErrorResponse(error, "Failed to create DM message.");
  }
}

function toDmErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof AuthRequiredError) {
    return jsonError(error.message, 401);
  }

  if (error instanceof ValidationError) {
    return jsonError(error.message, 400);
  }

  if (error instanceof ForbiddenError) {
    return jsonError(error.message, 403);
  }

  if (error instanceof NotFoundError) {
    return jsonError(error.message, 404);
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return jsonError(message, 500);
}
