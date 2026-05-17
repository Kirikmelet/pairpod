# PairPod

PairPod is a Next.js app plus MV3 browser extension for page-scoped chat, Reddit-style posts, DMs, profiles, and a small 3D peer room. The extension popup uses the same React app bundle as the web app and talks directly to Supabase for static-safe workflows.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the web app:

```bash
npm run dev
```

Open `http://localhost:3000`.

Build checks:

```bash
npx tsc --noEmit --pretty false
npm run build
npm run bundle:extension-popup
```

## Environment

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
MISTRAY_API_KEY=...
```

The Mistral wrapper also accepts `MISTRAL_API_KEY` and `MINSTRAL_API_KEY` as aliases, but `MISTRAY_API_KEY` is supported for the current local setup.

Optional:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
MISTRAL_MODEL=mistral-small-latest
MISTRAL_API_URL=https://api.mistral.ai/v1/chat/completions
```

`NEXT_PUBLIC_SITE_URL` is only needed when an extension build should call a running web server for server-backed endpoints. Most extension flows are direct-to-Supabase.

## Supabase

Apply `supabase/schema.sql` and the migrations in `supabase/migrations/` to the live project. Important tables:

- `pages`: one row per normalized domain/global room.
- `rooms`: post rooms for each page.
- `chat`: live chat messages. Despite the column name, `chat.room_id` references `pages.id`.
- `posts`: Reddit-style posts.
- `comments`: post replies.
- `post_votes` and `comment_votes`: one-vote-per-user tracking.
- `dm_threads`, `dm_thread_members`, `dm_messages`, `dm_thread_reads`: direct messages and unread state.
- `page_routes`: route doors for the 3D room.
- `page_presence`: online user heartbeat for 3D NPCs.
- `users`: app profiles, including `avatar_url`, `display_name`, and `clothing_url`.

Storage buckets currently used:

- `profile_pictures`: profile avatars, normalized to 128x128 PNG on upload.
- `sfx`: UI sounds such as login, logout, errors, chat, and DM notifications.
- clothing/custom texture bucket as configured by the profile/3D avatar flow.

## Extension

Build the extension popup bundle:

```bash
npm run bundle:extension-popup
```

Load the `extension/` directory as an unpacked extension in Chrome.

Notes:

- The extension action opens `popup.html`.
- The old extension-only `/login.html` flow has been removed.
- Authentication is rendered inside the popup through `HomePage`.
- Auth sessions persist through `chrome.storage.local`.
- Google sign-in uses the browser identity API.
- Email/password auth is static-safe.

## Chat And Posts

Chat messages are stored in `public.chat`. Posts stay in `public.posts`.

Global chat uses `https://global.pairpod.local/`. Domain chat normalizes to the domain root, not the full path. The UI lets users switch between global and domain rooms.

The chat page auto-seeds AI peer messages when a room is empty. It is throttled per room for 12 hours so it does not flood `public.chat`.

## AI

Server-backed AI is in:

- `lib/server/mistral.ts`
- `lib/server/fake-chat.ts`
- `app/api/ai/fake-chat/route.ts`
- `app/api/ai/dm/route.ts`

AI chat users get 2000s/early-2010s-style display names and write into `public.chat`.

DMs include a pinned `PairPod AI` assistant at `/dms/pairpod-ai-assistant`. On web, it calls `/api/ai/dm`. In the extension, it uses a local fallback unless a server-backed endpoint is configured.

## 3D Peer Room

The 3D peer room lives at `/peers` and uses Three.js. The controlled player is the current user. NPCs are other online users from `page_presence`, excluding the current user. Route doors are generated from `page_routes`, the current URL, and post section routes.

User avatars use:

- `users.avatar_url` for the head/profile image.
- `users.clothing_url` for body/clothing texture.

## Useful Commands

```bash
npm run dev
npm run build
npm run bundle:extension-popup
npm run build:extension
npm run electron:dev
npm run build:electron
npm run dist:electron
```
