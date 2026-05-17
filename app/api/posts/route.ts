import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveAuthenticatedProfileIdOrFallback } from "@/lib/server/profile";
import { createClient } from "@/utils/supabase/server";
import type { TablesInsert } from "@/utils/database.types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("room_id");
  const since = searchParams.get("since");

  if (!roomId) {
    return NextResponse.json({ error: "room_id is required" }, { status: 400 });
  }

  const supabase = createClient(await cookies());
  let query = supabase
    .from("posts")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (since) {
    query = query.gt("created_at", since);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ posts: data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const roomId = body.room_id as string | undefined;
  const content = body.content as string | undefined;
  const resolvedUserId = await resolveAuthenticatedProfileIdOrFallback(
    (body.user_id as string | undefined) ?? null,
  );

  if (!roomId || !content) {
    return NextResponse.json(
      { error: "room_id and content are required" },
      { status: 400 },
    );
  }

  const supabase = createClient(await cookies());
  const payload: TablesInsert<"posts"> = {
    room_id: roomId,
    content,
    type: (body.type as string | undefined) ?? "message",
    user_id: resolvedUserId,
    header: (body.header as string | undefined) ?? null,
    section_id: (body.section_id as string | undefined) ?? null,
  };
  const { data, error } = await supabase
    .from("posts")
    .insert([payload] as never)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ post: data }, { status: 201 });
}
