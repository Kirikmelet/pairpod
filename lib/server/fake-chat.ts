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
  latestMessage?: string | null;
  recentMessages?: FakeChatContextMessage[];
  reservedNames?: string[];
  topic?: string | null;
  messageCount?: number;
  userCount?: number;
  dryRun?: boolean;
};

export type FakeChatContextMessage = {
  author: string;
  body: string;
  isAi: boolean;
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
    latestMessage: input.latestMessage,
    recentMessages: input.recentMessages ?? [],
    reservedNames: input.reservedNames ?? [],
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
  latestMessage,
  recentMessages,
  reservedNames,
  userCount,
  messageCount,
}: {
  scope: FakeChatScope;
  targetUrl: string;
  topic?: string | null;
  latestMessage?: string | null;
  recentMessages?: FakeChatContextMessage[];
  reservedNames?: string[];
  userCount: number;
  messageCount: number;
}) {
  const trimmedLatestMessage = latestMessage?.trim();
  const transcript = formatRecentTranscript(recentMessages ?? []);
  const reservedNameText = formatReservedNames(reservedNames ?? []);
  const generationSeed = randomSuffix();
  try {
    const content = await createMistralChatCompletion({
      temperature: 1.08,
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
            `Randomness seed: ${generationSeed}. Make this run noticeably different from prior runs.`,
            `Room scope: ${scope}.`,
            `Room URL: ${targetUrl}.`,
            topic?.trim() ? `Topic: ${topic.trim()}.` : "Topic: casual collaboration.",
            trimmedLatestMessage
              ? `Latest human message to respond to: ${trimmedLatestMessage}`
              : "No latest human message was provided; seed casual room activity.",
            transcript
              ? `Recent room transcript, oldest to newest:\n${transcript}`
              : "Recent room transcript: unavailable.",
            reservedNameText
              ? `Reserved names/usernames already used by humans or existing bots. Do not use these for AI users: ${reservedNameText}`
              : "No reserved names were provided.",
            "Schema: {\"users\":[{\"key\":\"short_stable_key\",\"displayName\":\"Name\",\"username\":\"lowercase_username\",\"bio\":\"short persona\"}],\"messages\":[{\"speaker\":\"matching_user_key\",\"body\":\"one concise chat message\"}]}",
            "Give every user a 2000s to early-2010s internet display name or handle, like AIM/MSN/forum/Xanga/Myspace era names. Examples of the vibe: xXPixelAngelXx, sk8rByte, neon_ninja_07, LimeWireLarry, sceneQueen42, RawrKitty99, oOAquaMuffinOo. Usernames must stay lowercase with letters, numbers, underscores, or hyphens.",
            "AI display names and usernames must be unique and must not match or closely copy any reserved name.",
            "Messages should sound era-appropriate and casual: short, lowercase is okay, occasional lol/ngl/imo/idk/brb/yknow is okay, but do not overdo it.",
            "Avoid repeating sentence openings across messages. Mix reactions, questions, tiny jokes, disagreement, and practical suggestions.",
            "Use varied punctuation and cadence: some fragments, some full sentences, some quick one-liners. Do not make every message start with lol/ngl/imo/same/wait.",
            trimmedLatestMessage
              ? "Each message must respond to the latest human message. Be relevant to what they asked, suggested, complained about, or joked about. Do not ignore it."
              : "Keep messages relevant to the room topic and recent transcript.",
            "If recent AI users spoke, later AI messages may agree, disagree, riff on, or answer those AI messages too. Maintain conversational continuity across AI and human turns.",
            "Make the users sound like different real teammates in a chat room, not like polished assistants.",
            "Never claim to be a real person. Avoid generic AI disclaimers.",
          ].join("\n"),
        },
      ],
    });

    return normalizeFakeChatPlan(parseJsonObject(content), userCount, messageCount, reservedNames ?? []);
  } catch (error) {
    console.warn("Mistral fake chat generation fell back to local text.", error);
    return buildFallbackFakeChatPlan(scope, targetUrl, topic, latestMessage, recentMessages, reservedNames, userCount, messageCount);
  }
}

function buildFallbackFakeChatPlan(
  scope: FakeChatScope,
  targetUrl: string,
  topic: string | null | undefined,
  latestMessage: string | null | undefined,
  recentMessages: FakeChatContextMessage[] | undefined,
  reservedNames: string[] | undefined,
  userCount: number,
  messageCount: number,
): FakeChatPlan {
  const seedUsers = createRetroFakeUsers(userCount, reservedNames);
  const room = scope === "global" ? "Global" : targetUrl;
  const subject = topic?.trim() || room;
  const replySubject = latestMessage?.trim();
  const lastAi = [...(recentMessages ?? [])].reverse().find((message) => message.isAi);
  const lastAny = [...(recentMessages ?? [])].reverse().find((message) => message.body.trim());
  const responseSeeds = replySubject
    ? buildContextualFallbackMessages(replySubject, room, lastAi, messageCount)
    : lastAi
      ? buildContextualFallbackMessages(lastAi.body, room, lastAny, messageCount)
    : null;
  const seedMessages = pickMany([
    `lol wait ${subject} having its own chat is actually kinda sick`,
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
    "counterpoint: a little chaos is fine if the important stuff is easy to find",
    "this would slap harder if the first action felt instant",
    "ok but can we keep it slightly cursed in a charming way",
    "i'd make the room feel alive without making it yap constantly",
    ...buildProceduralFallbackMessages(subject, room, messageCount * 4),
  ], messageCount);

  return {
    users: seedUsers,
    messages: (responseSeeds ?? seedMessages).map((body, index) => ({
      speaker: seedUsers[index % seedUsers.length]?.key ?? seedUsers[0].key,
      body,
    })),
  };
}

function buildContextualFallbackMessages(
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

  return pickMany([
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
    `i'd push back a tiny bit: "${topic}" might need context, not another button`,
    `honestly i'd test that with one confused friend and trust the face they make`,
    `that could be a fun default, as long as it doesn't hijack the room`,
    ...buildProceduralContextMessages(topic, room, previous, count * 4),
  ], count);
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

function formatRecentTranscript(messages: FakeChatContextMessage[]) {
  return messages
    .slice(-10)
    .map((message) => {
      const author = message.author.trim().slice(0, 48) || "Someone";
      const body = message.body.trim().replace(/\s+/g, " ").slice(0, 280);
      const kind = message.isAi ? "AI" : "human";
      return body ? `- ${author} (${kind}): ${body}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function formatReservedNames(names: string[]) {
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 40)
    .join(", ");
}

function createRetroFakeUsers(
  count: number,
  reservedNames: string[] = [],
): FakeChatUserPlan[] {
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
  reservedNames: string[] = [],
): FakeChatPlan {
  if (!isRecord(value)) {
    throw new Error("Mistral fake chat output was not a JSON object.");
  }

  const usedNames = new Set(reservedNames.map(normalizeReservedName).filter(Boolean));
  const users = Array.isArray(value.users)
    ? value.users.slice(0, userCount).map((user, index) => readFakeUserPlan(user, usedNames, index))
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

function readFakeUserPlan(
  value: unknown,
  usedNames: Set<string>,
  index: number,
): FakeChatUserPlan {
  if (!isRecord(value)) {
    throw new Error("Fake user entry must be an object.");
  }

  let displayName = readNonEmptyString(value.displayName, "displayName").slice(0, 80);
  let username = slugify(
    typeof value.username === "string" ? value.username : displayName,
  ).slice(0, 24);
  const displayKey = normalizeReservedName(displayName);
  const usernameKey = normalizeReservedName(username);
  if (usedNames.has(displayKey) || usedNames.has(usernameKey)) {
    const replacement = createRetroFakeUsers(1, [...usedNames])[0];
    displayName = replacement.displayName;
    username = replacement.username;
  }
  usedNames.add(normalizeReservedName(displayName));
  usedNames.add(normalizeReservedName(username));

  const key = slugify(readNonEmptyString(value.key, "key")).slice(0, 32);
  const bio =
    typeof value.bio === "string" && value.bio.trim()
      ? value.bio.trim().slice(0, 160)
      : "AI-generated chat participant";

  return {
    key: key || username || `bot_${randomSuffix()}`,
    displayName,
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

function normalizeReservedName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
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
