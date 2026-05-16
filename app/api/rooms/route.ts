import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { TablesInsert } from "@/utils/database.types";

export async function GET(request: Request) {
  const pageId = new URL(request.url).searchParams.get("page_id");
  if (!pageId) {
    return NextResponse.json({ error: "page_id is required" }, { status: 400 });
  }

  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("page_id", pageId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rooms: data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const pageId = body.page_id as string | undefined;

  if (!pageId) {
    return NextResponse.json({ error: "page_id is required" }, { status: 400 });
  }

  const supabase = createClient(await cookies());
  const payload: TablesInsert<"rooms"> = {
    page_id: pageId,
    max_users: body.max_users,
    configurations: body.configurations,
  };
  const { data, error } = await supabase
    .from("rooms")
    .insert([payload] as never)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ room: data }, { status: 201 });
}
