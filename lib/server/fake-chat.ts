import "server-only";

import { createChatMessage, type CreatedChat } from "@/lib/server/discussions";
import { logEvent } from "@/lib/server/helpers/logEvent";
import { normalizeUrl } from "@/lib/server/helpers/normalizeUrl";
import {
  findOrCreateDefaultRoom,
  findOrCreatePage,
  type PageRow,
  type RoomRow,
} from "@/lib/server/pages";
import { DEFAULT_AVATAR_URL } from "@/lib/server/profile";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { createMistralChatCompletion } from "@/lib/server/mistral";
import type { Tables, TablesInsert } from "@/utils/database.types";

export type FakeChatScope = "global" | "domain";

export type CreateFakeChatInput = {
  scope: FakeChatScope;
  domainUrl?: string | null;
  topic?: string | null;
  messageCount?: number;
  userCount?: number;
  dryRun?: boolean;
};

export type FakeChatUserPlan = {
  key: string;
  displayName: string;
  username: string;
  bio: string;
};

export type FakeChatMessagePlan = {
  speaker: string;
  body: string;
};

export type FakeChatPlan = {
  users: FakeChatUserPlan[];
  messages: FakeChatMessagePlan[];
};

export type FakeChatResult = {
  scope: FakeChatScope;
  page: PageRow;
  room: RoomRow;
  generated: FakeChatPlan;
  users: Tables<"users">[];
  chats: CreatedChat[];
};

const GLOBAL_ROOM_URL = "https://global.pairpod.local/";
const MAX_FAKE_USERS = 6;
const MAX_FAKE_MESSAGES = 12;

export async function createFakeChatFromMistral(
  input: CreateFakeChatInput,
): Promise<FakeChatResult> {
  const scope = input.scope;
  const url = resolveTargetUrl(scope, input.domainUrl);
  const page = await findOrCreatePage(url);
  const room = await findOrCreateDefaultRoom(page.id);
  const generated = await generateFakeChatPlan({
    scope,
    targetUrl: page.normalized_url,
    topic: input.topic,
    userCount: clampInt(input.userCount, 2, MAX_FAKE_USERS, 3),
    messageCount: clampInt(input.messageCount, 1, MAX_FAKE_MESSAGES, 5),
  });

  if (input.dryRun) {
    return {
      scope,
      page,
      room,
      generated,
      users: [],
      chats: [],
    };
  }

  const users = await createFakeUsers(generated.users);
  const usersByKey = new Map(
    generated.users.map((plannedUser, index) => [
      plannedUser.key,
      users[index],
    ]),
  );
  const chats: CreatedChat[] = [];

  for (const message of generated.messages) {
    const fakeUser = usersByKey.get(message.speaker) ?? users[0] ?? null;
    const chat = await createChatMessage({
      pageId: page.id,
      userId: fakeUser?.id ?? null,
      content: message.body,
    });

    chats.push(chat);

    await logEvent({
      eventType: "ai.fake_chat.message.created",
      pageId: page.id,
      roomId: room.id,
      userId: fakeUser?.id ?? null,
      payload: {
        chatId: chat.chat_id,
        provider: "mistral",
        scope,
        speaker: message.speaker,
      },
    });
  }

  return {
    scope,
    page,
    room,
    generated,
    users,
    chats,
  };
}

async function generateFakeChatPlan({
  scope,
  targetUrl,
  topic,
  userCount,
  messageCount,
}: {
  scope: FakeChatScope;
  targetUrl: string;
  topic?: string | null;
  userCount: number;
  messageCount: number;
}) {
  try {
    const content = await createMistralChatCompletion({
      temperature: 0.85,
      maxTokens: 1000,
      messages: [
        {
          role: "system",
          content:
            "You generate compact JSON for a fake but plausible chat room. Return JSON only, no Markdown. Write like helpful humans, not like a corporate assistant.",
        },
        {
          role: "user",
          content: [
            `Create ${userCount} fake chat users and ${messageCount} chat messages.`,
            `Room scope: ${scope}.`,
            `Room URL: ${targetUrl}.`,
            topic?.trim() ? `Topic: ${topic.trim()}.` : "Topic: casual collaboration.",
            "Schema: {\"users\":[{\"key\":\"short_stable_key\",\"displayName\":\"Name\",\"username\":\"lowercase_username\",\"bio\":\"short persona\"}],\"messages\":[{\"speaker\":\"matching_user_key\",\"body\":\"one concise chat message\"}]}",
            "Give every user a 2000s to early-2010s internet display name or handle, like AIM/MSN/forum/Xanga era names. Examples of the vibe: xXPixelAngelXx, sk8rByte, neon_ninja_07, LimeWireLarry, sceneQueen42. Usernames must stay lowercase with letters, numbers, underscores, or hyphens.",
            "Messages should sound like different real teammates: specific, casual, short, and a little opinionated.",
            "Never claim to be a real person. Avoid generic AI disclaimers.",
          ].join("\n"),
        },
      ],
    });

    return normalizeFakeChatPlan(parseJsonObject(content), userCount, messageCount);
  } catch (error) {
    console.warn("Mistral fake chat generation fell back to local text.", error);
    return buildFallbackFakeChatPlan(scope, targetUrl, topic, userCount, messageCount);
  }
}

function buildFallbackFakeChatPlan(
  scope: FakeChatScope,
  targetUrl: string,
  topic: string | null | undefined,
  userCount: number,
  messageCount: number,
): FakeChatPlan {
  const seedUsers: FakeChatUserPlan[] = [
    {
      key: "pixel_angel",
      displayName: "xXPixelAngelXx",
      username: "xxpixelangelxx",
      bio: "Forum-era UI tinkerer who spots edge cases.",
    },
    {
      key: "sk8r_byte",
      displayName: "sk8rByte92",
      username: "sk8rbyte92",
      bio: "Early-2010s systems nerd with a taste for concise plans.",
    },
    {
      key: "neon_ninja",
      displayName: "neon_ninja_07",
      username: "neon_ninja_07",
      bio: "Old-school forum regular who cares about flow.",
    },
    {
      key: "limewire_larry",
      displayName: "LimeWireLarry",
      username: "limewirelarry",
      bio: "Calm debugger with a suspiciously specific 2008 vibe.",
    },
    {
      key: "scene_queen",
      displayName: "sceneQueen42",
      username: "scenequeen42",
      bio: "Xanga-coded product thinker who notices empty states.",
    },
    {
      key: "dialup_druid",
      displayName: "DialUp_Druid",
      username: "dialup_druid",
      bio: "Patient helper who treats small polish like real work.",
    },
  ].slice(0, userCount);
  const room = scope === "global" ? "Global" : targetUrl;
  const subject = topic?.trim() || room;
  const seedMessages = [
    `I am reading ${subject} as a shared room, not just a link. That makes the chat feel way more useful.`,
    "The next nice touch is making replies feel anchored, so people can skim without losing the thread.",
    "I would keep the fake peers clearly synthetic, but let them talk like teammates who actually looked at the page.",
    "This works best when the first message gives people something concrete to react to.",
    `For ${room}, I would nudge users toward asking a question or opening a small DM when the thread gets specific.`,
    "The UI should probably show presence without making it feel like a full dashboard.",
    "Tiny opinion: fewer, better messages beats a flood of fake activity.",
    "The strongest version is when AI peers seed the room, then get out of the way once humans arrive.",
  ];

  return {
    users: seedUsers,
    messages: seedMessages.slice(0, messageCount).map((body, index) => ({
      speaker: seedUsers[index % seedUsers.length]?.key ?? seedUsers[0].key,
      body,
    })),
  };
}

async function createFakeUsers(users: FakeChatUserPlan[]) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const rows: Array<TablesInsert<"users">> = users.map((user) => ({
    username: buildUniqueBotUsername(user.username),
    display_name: user.displayName,
    avatar_url: DEFAULT_AVATAR_URL,
    email: null,
    auth_user_id: null,
    updated_at: now,
    configurations: {
      kind: "ai_fake_user",
      provider: "mistral",
      personaKey: user.key,
      bio: user.bio,
    },
  }));

  const { data, error } = await supabase
    .from("users")
    .insert(rows)
    .select("*")
    .returns<Tables<"users">[]>();

  if (error) {
    throw new Error(`Failed to create fake users: ${error.message}`);
  }

  return data ?? [];
}

function resolveTargetUrl(scope: FakeChatScope, domainUrl?: string | null) {
  if (scope === "global") {
    return GLOBAL_ROOM_URL;
  }

  if (!domainUrl?.trim()) {
    throw new Error("domainUrl is required for domain fake chat.");
  }

  return normalizeUrl(domainUrl);
}

function normalizeFakeChatPlan(
  value: unknown,
  userCount: number,
  messageCount: number,
): FakeChatPlan {
  if (!isRecord(value)) {
    throw new Error("Mistral fake chat output was not a JSON object.");
  }

  const users = Array.isArray(value.users)
    ? value.users.slice(0, userCount).map(readFakeUserPlan)
    : [];

  if (users.length === 0) {
    throw new Error("Mistral fake chat output did not include users.");
  }

  const userKeys = new Set(users.map((user) => user.key));
  const messages = Array.isArray(value.messages)
    ? value.messages
        .slice(0, messageCount)
        .map((message) => readFakeMessagePlan(message, userKeys))
    : [];

  if (messages.length === 0) {
    throw new Error("Mistral fake chat output did not include messages.");
  }

  return { users, messages };
}

function readFakeUserPlan(value: unknown): FakeChatUserPlan {
  if (!isRecord(value)) {
    throw new Error("Fake user entry must be an object.");
  }

  const displayName = readNonEmptyString(value.displayName, "displayName");
  const key = slugify(readNonEmptyString(value.key, "key")).slice(0, 32);
  const username = slugify(
    typeof value.username === "string" ? value.username : displayName,
  ).slice(0, 24);
  const bio =
    typeof value.bio === "string" && value.bio.trim()
      ? value.bio.trim().slice(0, 160)
      : "AI-generated chat participant";

  return {
    key: key || username || `bot_${randomSuffix()}`,
    displayName: displayName.slice(0, 80),
    username: username || `bot_${randomSuffix()}`,
    bio,
  };
}

function readFakeMessagePlan(
  value: unknown,
  userKeys: Set<string>,
): FakeChatMessagePlan {
  if (!isRecord(value)) {
    throw new Error("Fake message entry must be an object.");
  }

  const requestedSpeaker = slugify(readNonEmptyString(value.speaker, "speaker"));
  const speaker = userKeys.has(requestedSpeaker)
    ? requestedSpeaker
    : [...userKeys][0];
  const body = readNonEmptyString(value.body, "body").slice(0, 500);

  return { speaker, body };
}

function parseJsonObject(content: string) {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fencedMatch?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(jsonText.slice(start, end + 1)) as unknown;
    }
    throw new Error("Mistral fake chat output was not valid JSON.");
  }
}

function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function readNonEmptyString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Fake chat field ${field} must be a non-empty string.`);
  }

  return value.trim();
}

function buildUniqueBotUsername(username: string) {
  const base = slugify(username).slice(0, 18) || "pairpod_bot";
  return `${base}_${randomSuffix()}`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
