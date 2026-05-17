"use client";

import { createClient } from "@/utils/supabase/client";
import type { Tables, TablesInsert } from "@/utils/database.types";
import { DEFAULT_AVATAR_URL } from "@/lib/client/page-api";

type FakeChatDirectInput = {
  pageId: string;
  scope: "global" | "domain";
  title: string;
  latestMessage?: string | null;
  recentMessages?: FakeChatContextMessage[];
  reservedNames?: string[];
  messageCount?: number;
  userCount?: number;
};

type FakeChatContextMessage = {
  author: string;
  body: string;
  isAi: boolean;
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
  latestMessage,
  recentMessages = [],
  reservedNames = [],
  messageCount = 5,
  userCount = 3,
}: FakeChatDirectInput) {
  const supabase = createClient();
  const now = new Date().toISOString();
  const usersToCreate = createRetroFakeUsers(clamp(userCount, 2, 6), reservedNames);

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
  const messages = buildHumanMessages(
    scope,
    title,
    clamp(messageCount, 1, 10),
    latestMessage,
    recentMessages,
  );
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

function buildHumanMessages(
  scope: "global" | "domain",
  title: string,
  count: number,
  latestMessage?: string | null,
  recentMessages: FakeChatContextMessage[] = [],
) {
  const room = scope === "global" ? "Global" : title;
  const replySubject = latestMessage?.trim();
  const lastAi = [...recentMessages].reverse().find((message) => message.isAi);
  const lastAny = [...recentMessages].reverse().find((message) => message.body.trim());
  if (replySubject) {
    return buildContextualMessages(replySubject, room, lastAi, count);
  }
  if (lastAi) {
    return buildContextualMessages(lastAi.body, room, lastAny, count);
  }

  return pickMany([
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
    "wait did anyone else have flashbacks to phpbb sidebars or is that just me",
    "tiny take: fewer buttons, stronger labels, everybody wins",
    `for ${room}, i'd pin the useful bit and let the rest be messy chat`,
    "lol the best version is like a forum thread and an aim room had a baby",
    "i'm weirdly into it, just needs less ceremony around posting",
    "honestly if replies feel fast this whole thing gets way stickier",
    "not to be dramatic but the room needs one obvious 'what happened' summary",
    "the vibe is good, just don't let it become dashboard soup",
    ...buildProceduralFallbackMessages(room, room, count * 4),
  ], count);
}

function buildContextualMessages(
  latestMessage: string,
  room: string,
  previous?: FakeChatContextMessage,
  count = 5,
) {
  const topic = latestMessage.length > 84
    ? `${latestMessage.slice(0, 81)}...`
    : latestMessage;
  const previousText = previous?.body
    ? ` and ${previous.author} was just saying "${previous.body.slice(0, 64)}"`
    : "";

  const callbacks = [
    `lol yeah, on "${topic}"${previousText} — i'd keep that thread going and test the obvious path first`,
    `ngl that makes sense for ${room}. i'd check whether it breaks in the extension and web app separately`,
    `imo the key bit is "${topic}" — if that part feels good, the rest can be polished after`,
    `same, i'd turn that into one tiny task so it doesn't sprawl`,
    `wait that's actually a good point. ${room} should react to that without making you refresh`,
    `lol i read "${topic}" as basically a flow problem, not a content problem`,
    `i'd try the tiniest version first: one action, one result, no mystery meat`,
    `real talk, if "${topic}" is the pain point then the ui should answer that immediately`,
    `kinda agree, but i'd watch for the part where ${room} gets too noisy`,
    `that sounds fixable tbh. make it obvious, then make it cute after`,
    `same energy as old forum mods saying "search first" but like, friendlier`,
    `if ${previous?.author ?? "someone"} is right, the next move is probably less chrome and more signal`,
    ...buildProceduralContextMessages(topic, room, previous, count * 4),
  ];

  return pickMany(callbacks, count);
}

function buildProceduralFallbackMessages(subject: string, room: string, count: number) {
  return Array.from({ length: count }, () => {
    const opener = sample(FALLBACK_OPENERS);
    const action = sample(FALLBACK_ACTIONS);
    const object = sample(FALLBACK_OBJECTS);
    const closer = sample(FALLBACK_CLOSERS);
    const target = Math.random() > 0.45 ? room : subject;
    return `${opener} ${action} ${object} for ${target}${closer}`;
  });
}

function buildProceduralContextMessages(
  topic: string,
  room: string,
  previous: FakeChatContextMessage | undefined,
  count: number,
) {
  return Array.from({ length: count }, () => {
    const opener = sample(CONTEXT_OPENERS);
    const angle = sample(CONTEXT_ANGLES);
    const closer = sample(CONTEXT_CLOSERS);
    const previousNudge =
      previous && Math.random() > 0.55
        ? ` also ${previous.author} kinda set that up already`
        : "";
    return `${opener} "${topic}" ${angle} in ${room}${previousNudge}${closer}`;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createRetroFakeUsers(count: number, reservedNames: string[] = []): FakeUserPlan[] {
  const used = new Set(reservedNames.map(normalizeReservedName).filter(Boolean));
  return Array.from({ length: count }, (_, index) => {
    let handle = buildRetroHandle();
    while (used.has(normalizeReservedName(handle))) {
      handle = buildRetroHandle();
    }
    used.add(normalizeReservedName(handle));

    return {
      key: `retro_${index}_${randomSuffix()}`,
      displayName: handle,
      username: slugify(handle).slice(0, 24) || `retro_peer_${index}`,
      bio: RETRO_BIOS[index % RETRO_BIOS.length],
    };
  });
}

function normalizeReservedName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
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

const FALLBACK_OPENERS = [
  "lowkey",
  "tiny thought:",
  "ok hear me out,",
  "not gonna lie,",
  "my forum-brain says",
  "quick vibe check:",
  "imo",
  "lol honestly",
];

const FALLBACK_ACTIONS = [
  "make",
  "keep",
  "try",
  "ship",
  "pin",
  "simplify",
  "test",
  "rename",
];

const FALLBACK_OBJECTS = [
  "the first action obvious",
  "the reply flow snappier",
  "one weird little status line",
  "the useful posts easier to skim",
  "the room history less buried",
  "the chat a little more human",
  "the buttons less mysterious",
  "the empty state less sad",
];

const FALLBACK_CLOSERS = [
  "",
  " and call it a day",
  " before adding more stuff",
  " so ppl don't bounce",
  " like it's 2009 but usable",
  " tbh",
  " yknow?",
];

const CONTEXT_OPENERS = [
  "yeah,",
  "hmm,",
  "i'd read",
  "the way i see",
  "wild take but",
  "same-ish,",
  "counterpoint:",
  "that sounds like",
];

const CONTEXT_ANGLES = [
  "as a navigation problem",
  "as a trust issue",
  "as a speed bump",
  "as the thing users will notice first",
  "as something that needs one clear next step",
  "as a reason to trim the ui",
  "as a reason to make the chat react faster",
  "as a tiny polish pass, not a whole rewrite",
];

const CONTEXT_CLOSERS = [
  "",
  " imo",
  " lol",
  " if that makes sense",
  " before it gets too dashboard-y",
  " and then watch what breaks",
  " with one friend testing it",
];

function sample(values: string[]) {
  return values[Math.floor(Math.random() * values.length)] ?? values[0];
}

function pickMany(values: string[], count: number) {
  const remaining = [...values];
  const picked: string[] = [];

  while (picked.length < count && remaining.length > 0) {
    const index = Math.floor(Math.random() * remaining.length);
    const [value] = remaining.splice(index, 1);
    if (value) {
      picked.push(value);
    }
  }

  return picked;
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
