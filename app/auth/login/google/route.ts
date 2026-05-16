import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthCallbackUrl } from "@/utils/auth-redirect";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const next = requestUrl.searchParams.get("next") ?? "/";

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getAuthCallbackUrl(origin, next),
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    return NextResponse.redirect(
      `${origin}/?error=auth&message=${encodeURIComponent(error.message)}`,
    );
  }

  if (data.url) {
    return NextResponse.redirect(data.url);
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
