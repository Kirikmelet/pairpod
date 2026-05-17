import { cookies } from "next/headers";
import { jsonError, jsonSuccess } from "@/lib/server/http";
import { createClient } from "@/utils/supabase/server";

export async function GET(): Promise<Response> {
  const supabase = createClient(await cookies());
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return jsonError("You must be signed in to view your profile.", 401);
  }

  return jsonSuccess({
    id: data.user.id,
    email: data.user.email ?? null,
    username: null,
    needsUsername: false,
  });
}

export async function POST(): Promise<Response> {
  return jsonError("Profile setup is no longer required.", 410);
}
