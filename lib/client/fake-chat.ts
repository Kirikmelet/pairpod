"use client";

import { createClient } from "@/utils/supabase/client";
import type { Tables, TablesInsert } from "@/utils/database.types";
import { DEFAULT_AVATAR_URL } from "@/lib/client/page-api";

type FakeChatDirectInput = {
  pageId: string;
  scope: "global" | "domain";
  title: string;
  messageCount?: number;
  userCount?: number;
};

type FakeUserPlan = {
  displayName: string;
  username: string;
  bio: string;
};

const PERSONAS: FakeUserPlan[] = [
  {
    displayName: "xXPixelAngelXx",
    username: "xxpixelangelxx",
    bio: "Forum-era UI tinkerer who notices edge cases early.",
  },
  {
    displayName: "sk8rByte92",
    username: "sk8rbyte92",
    bio: "Early-2010s systems-minded teammate who likes concise plans.",
  },
  {
    displayName: "neon_ninja_07",
    username: "neon_ninja_07",
    bio: "Old-school forum regular who turns vague ideas into UI.",
  },
  {
    displayName: "LimeWireLarry",
    username: "limewirelarry",
    bio: "Calm debugging presence with a suspiciously specific 2008 vibe.",
  },
  {
    displayName: "sceneQueen42",
    username: "scenequeen42",
    bio: "Xanga-coded product thinker who notices empty states.",
  },
  {
    displayName: "DialUp_Druid",
    username: "dialup_druid",
    bio: "Patient helper who treats small polish like real work.",
  },
];

export async function createHumanFakeChatDirect({
  pageId,
  scope,
  title,
  messageCount = 5,
  userCount = 3,
}: FakeChatDirectInput) {
  const supabase = createClient();
  const now = new Date().toISOString();
  const usersToCreate = PERSONAS.slice(0, clamp(userCount, 2, PERSONAS.length));

  const { data: users, error: userError } = await supabase
    .from("users")
    .insert(
      usersToCreate.map((user) => ({
        username: `${user.username}_${randomSuffix()}`,
        display_name: user.displayName,
        avatar_url: DEFAULT_AVATAR_URL,
        email: null,
        auth_user_id: null,
        updated_at: now,
        configurations: {
          kind: "ai_fake_user",
          provider: "local-human-text",
          bio: user.bio,
        },
      })) satisfies TablesInsert<"users">[],
    )
    .select("*")
    .returns<Tables<"users">[]>();

  if (userError) {
    throw new Error(`Could not create AI peers: ${userError.message}`);
  }

  const createdUsers = users ?? [];
  const messages = buildHumanMessages(scope, title, clamp(messageCount, 1, 10));
  const chats = messages.map((body, index) => ({
    room_id: pageId,
    body,
    user_id: createdUsers[index % createdUsers.length]?.id ?? null,
  })) satisfies TablesInsert<"chat">[];

  const { data: createdChats, error: chatError } = await supabase
    .from("chat")
    .insert(chats)
    .select("*")
    .returns<Tables<"chat">[]>();

  if (chatError) {
    throw new Error(`Could not create AI messages: ${chatError.message}`);
  }

  return {
    users: createdUsers,
    chats: createdChats ?? [],
  };
}

function buildHumanMessages(scope: "global" | "domain", title: string, count: number) {
  const room = scope === "global" ? "Global" : title;
  const seeds = [
    `I am looking at ${room} and the useful bit seems to be keeping the conversation close to the page context.`,
    "Small thought: the room feels better when chat, posts, and replies all point back to the same shared object.",
    "I would start with the simplest sync path, then make the fancy parts earn their keep.",
    "This is one of those features where the empty state matters almost as much as the happy path.",
    `For ${room}, I would make the next action obvious: ask, answer, or open a direct thread.`,
    "The peer-to-peer angle is neat because it makes the page feel occupied without turning it into noise.",
    "If this were my build, I would keep the AI peers clearly synthetic but still let them talk like useful teammates.",
    "Feels like the next win is making presence visible without forcing people into another dashboard.",
    "I like the direction. The rough edges are mostly around trust: who said what, when, and where it syncs.",
    "The human move here is to make the default reply sound less like a bot and more like someone reading the room.",
  ];

  return seeds.slice(0, count);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}
