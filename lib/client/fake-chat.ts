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
  key: string;
  displayName: string;
  username: string;
  bio: string;
};

export async function createHumanFakeChatDirect({
  pageId,
  scope,
  title,
  messageCount = 5,
  userCount = 3,
}: FakeChatDirectInput) {
  const supabase = createClient();
  const now = new Date().toISOString();
  const usersToCreate = createRetroFakeUsers(clamp(userCount, 2, 6));

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
    console.warn("Could not create AI peer profiles; creating anonymous AI messages instead.", userError);
  }

  const createdUsers = userError ? [] : users ?? [];
  const messages = buildHumanMessages(scope, title, clamp(messageCount, 1, 10));
  const chats = buildChatRows(pageId, messages, usersToCreate, createdUsers);

  const { data: createdChats, error: chatError } = await supabase
    .from("chat")
    .insert(chats)
    .select("*")
    .returns<Tables<"chat">[]>();

  if (chatError) {
    const fallbackUserId = await getCurrentProfileIdForFallback(supabase);
    if (!fallbackUserId) {
      throw new Error(`Could not create AI messages: ${chatError.message}`);
    }

    const { data: fallbackChats, error: fallbackChatError } = await supabase
      .from("chat")
      .insert(buildChatRows(pageId, messages, usersToCreate, [], fallbackUserId))
      .select("*")
      .returns<Tables<"chat">[]>();

    if (fallbackChatError) {
      throw new Error(`Could not create AI messages: ${fallbackChatError.message}`);
    }

    return {
      users: createdUsers,
      chats: fallbackChats ?? [],
    };
  }

  return {
    users: createdUsers,
    chats: createdChats ?? [],
  };
}

function buildChatRows(
  pageId: string,
  messages: string[],
  fakeUsers: FakeUserPlan[],
  createdUsers: Tables<"users">[],
  fallbackUserId: string | null = null,
) {
  return messages.map((body, index) => {
    const fakeUser = fakeUsers[index % fakeUsers.length];
    const createdUser = createdUsers[index % createdUsers.length];
    const shouldPrefixBody = !createdUser || fallbackUserId;

    return {
      room_id: pageId,
      body: shouldPrefixBody
        ? `${fakeUser?.displayName ?? "AIMBuddy"}: ${body}`
        : body,
      user_id: createdUser?.id ?? fallbackUserId,
    };
  }) satisfies TablesInsert<"chat">[];
}

async function getCurrentProfileIdForFallback(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: byAuth } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (byAuth?.id) {
    return byAuth.id;
  }

  const { data: byId } = await supabase
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  return byId?.id ?? null;
}

function buildHumanMessages(scope: "global" | "domain", title: string, count: number) {
  const room = scope === "global" ? "Global" : title;
  const seeds = [
    `lol wait ${room} having its own chat is actually kinda sick`,
    "brb but my take is the posts need to stay chill and easy to skim",
    "ngl the tiny room vibe works better when ppl just drop quick notes",
    "imo this needs one obvious button so nobody has to hunt around",
    `ok for ${room}, i'd start with a question thread and see who bites`,
    "this is giving old forum sidebar energy in a good way",
    "lowkey the 3d room is funny but it helps make the page feel alive",
    "idk maybe keep the AI ppl useful but not TOO chatty yknow",
    "same, fewer decent msgs > a wall of random noise",
    "if someone joins later they should instantly get what happened here",
  ];

  return seeds.slice(0, count);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createRetroFakeUsers(count: number): FakeUserPlan[] {
  const used = new Set<string>();
  return Array.from({ length: count }, (_, index) => {
    let handle = buildRetroHandle();
    while (used.has(slugify(handle))) {
      handle = buildRetroHandle();
    }
    used.add(slugify(handle));

    return {
      key: `retro_${index}_${randomSuffix()}`,
      displayName: handle,
      username: slugify(handle).slice(0, 24) || `retro_peer_${index}`,
      bio: RETRO_BIOS[index % RETRO_BIOS.length],
    };
  });
}

function buildRetroHandle() {
  const prefix = sample(RETRO_PREFIXES);
  const noun = sample(RETRO_NOUNS);
  const number = Math.random() > 0.45 ? sample(RETRO_NUMBERS) : "";
  const style = Math.floor(Math.random() * 10);

  switch (style) {
    case 0:
      return `xX${prefix}${noun}Xx${number}`;
    case 1:
      return `${prefix}_${noun}_${number || sample(RETRO_NUMBERS)}`;
    case 2:
      return `${prefix}${noun}${number || sample(RETRO_NUMBERS)}`;
    case 3:
      return `${noun}.${prefix}${number || ""}`;
    case 4:
      return `${prefix}-${noun}${number || sample(RETRO_NUMBERS)}`;
    case 5:
      return `${sample(RETRO_DECORATORS)}${prefix}${noun}${sample(RETRO_DECORATORS)}${number}`;
    case 6:
      return `${prefix}${number || sample(RETRO_NUMBERS)}_${noun}`;
    case 7:
      return `${noun}${sample(["4", "x", "z"])}${prefix}${number || ""}`;
    case 8:
      return `${sample(RETRO_MOODS)}${noun}${number || sample(RETRO_NUMBERS)}`;
    default:
      return `${prefix}${sample(["Rawr", "LOL", "XP", "z"])}${noun}${number}`;
  }
}

const RETRO_PREFIXES = [
  "Aqua",
  "Astro",
  "Pixel",
  "Neon",
  "Scene",
  "Sk8r",
  "DialUp",
  "LimeWire",
  "AIM",
  "Xanga",
  "Glitch",
  "Byte",
  "Nyan",
  "Emo",
  "Kandi",
  "Myspace",
  "Napster",
  "Winamp",
  "Zune",
  "Geocities",
  "Moon",
  "Cyber",
];

const RETRO_NOUNS = [
  "Angel",
  "Bandit",
  "Bunni",
  "Ninja",
  "Wizard",
  "Raver",
  "Kid",
  "Coder",
  "Ghost",
  "Toast",
  "Robot",
  "Dream",
  "Tiger",
  "Star",
  "Kitty",
  "Punk",
  "Sparkle",
  "Wolf",
  "Vamp",
  "Skull",
  "Bean",
  "Muffin",
];

const RETRO_MOODS = ["Rawr", "Epic", "Hyper", "Sad", "Mega", "Lil", "OMG", "Rad"];
const RETRO_DECORATORS = ["xX", "Xx", "ii", "oO", "Oo", "_"];
const RETRO_NUMBERS = ["03", "07", "08", "09", "11", "12", "13", "21", "24", "42", "69", "86", "92", "99", "101", "1337"];

const RETRO_BIOS = [
  "Forum-era regular who types fast and notices weird UI stuff.",
  "Early-2010s tinkerer with too many tabs open.",
  "Old chat-room lurker who has opinions but keeps it casual.",
  "Calm debugger with suspiciously 2008 energy.",
  "Xanga/Myspace-coded product thinker.",
  "Patient helper who says lol and still gives useful notes.",
];

function sample(values: string[]) {
  return values[Math.floor(Math.random() * values.length)] ?? values[0];
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}
