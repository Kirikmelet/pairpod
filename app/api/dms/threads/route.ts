import {
  AuthRequiredError,
  NotFoundError,
  ValidationError,
  createOrGetDirectThread,
  listCurrentUserDmThreads,
} from "@/lib/server/dms";
import { jsonError, jsonSuccess } from "@/lib/server/http";

type CreateThreadRequestBody = {
  recipientUserId?: unknown;
};

export async function GET(request: Request): Promise<Response> {
  try {
    const threads = await listCurrentUserDmThreads(request);
    return jsonSuccess(threads);
  } catch (error) {
    return toDmErrorResponse(error, "Failed to load DM threads.");
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: CreateThreadRequestBody;

  try {
    body = (await request.json()) as CreateThreadRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  try {
    const recipientUserId =
      typeof body.recipientUserId === "string" ? body.recipientUserId : "";
    const thread = await createOrGetDirectThread(request, recipientUserId);
    return jsonSuccess(thread, 201);
  } catch (error) {
    return toDmErrorResponse(error, "Failed to create DM thread.");
  }
}

function toDmErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof AuthRequiredError) {
    return jsonError(error.message, 401);
  }

  if (error instanceof ValidationError) {
    return jsonError(error.message, 400);
  }

  if (error instanceof NotFoundError) {
    return jsonError(error.message, 404);
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return jsonError(message, 500);
}
