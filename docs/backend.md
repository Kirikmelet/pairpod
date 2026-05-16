# Backend Setup

This project keeps backend code in `app/api/**` and `lib/server/**`. The backend uses a Supabase service-role client on the server and simple Next.js App Router route handlers.

## Environment Variables

Add these values to your local environment:

- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only service role key. Do not expose this in client code.
- `ELEVENLABS_API_KEY`: Server-only ElevenLabs API key used by `/api/audio`.
- `ELEVENLABS_VOICE_ID`: Default ElevenLabs voice ID used by `/api/audio`.

The backend reads these values at request time. Keep the service role key and ElevenLabs key out of frontend code.

## Supabase Schema

Run the SQL in `supabase/schema.sql` inside the Supabase SQL editor or through your migration workflow.

Tables:

- `users`: Lightweight user records plus stored configurations.
- `pages`: Canonical page records keyed by `normalized_url`.
- `rooms`: Shared discussion rooms attached to a page.
- `posts`: All guide, question, and chat content.
- `comments`: Replies and answers attached by `section_id` and optional `reply_id`.
- `events`: Analytics and activity events with optional links to user/page/room/post/comment.

Each table uses UUID primary keys and `created_at` timestamps. `rooms` cascade with `pages`, `posts` cascade with `rooms`, and `comments.reply_id` cascades through reply chains. Foreign keys in `events` and user links use `on delete set null`.

The SQL file is a hackathon reset script. It drops the old and new backend tables first, recreates the simplified schema, and enables RLS on every table. Writes are expected to happen through backend API routes using `SUPABASE_SERVICE_ROLE_KEY`.

## API Routes

### `GET /api/health`

Returns a basic health response.

Example response:

```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-05-16T18:00:00.000Z"
  }
}
```

### `GET /api/page?url={url}&title={title}`

- Normalizes the incoming `url`.
- Finds or creates a `pages` row by normalized URL.
- Finds or creates the default `rooms` row for that page.
- Returns:
  - `page`
  - `room`
  - `posts`
  - `comments`

### `POST /api/guides`

Expected JSON body:

```json
{
  "pageId": "uuid or omit if roomId is provided",
  "roomId": "uuid or omit if pageId is provided",
  "sectionId": "optional section",
  "header": "optional title",
  "content": "Guide body",
  "userId": "optional uuid"
}
```

Creates a `posts` row with `type = "guide"` and logs a `guide.created` event.

### `POST /api/questions`

Expected JSON body:

```json
{
  "roomId": "uuid or omit if pageId is provided",
  "pageId": "uuid or omit if roomId is provided",
  "sectionId": "optional section",
  "header": "Test question",
  "content": "What is this page about?",
  "userId": "optional uuid"
}
```

Creates a `posts` row with `type = "question"` and logs a `question.created` event.

### `POST /api/answers`

Expected JSON body:

```json
{
  "content": "Answer text",
  "postId": "optional uuid",
  "replyId": "optional uuid",
  "sectionId": "optional explicit section",
  "userId": "optional uuid"
}
```

Creates a `comments` row. If `replyId` is provided, the route reuses the parent comment's `section_id`. If `postId` is provided, the route stores the comment under `section_id = "post:{postId}"`. It logs an `answer.created` event.

### `POST /api/chat`

Expected JSON body:

```json
{
  "pageId": "uuid or omit if roomId is provided",
  "roomId": "uuid or omit if pageId is provided",
  "sectionId": "optional section",
  "message": "Chat message",
  "userId": "optional uuid"
}
```

Creates a `posts` row with `type = "chat"` and logs a `chat.message.created` event.

### `POST /api/events`

Expected JSON body:

```json
{
  "eventType": "extension.opened",
  "userId": "optional uuid",
  "pageId": "optional uuid",
  "roomId": "optional uuid",
  "postId": "optional uuid",
  "commentId": "optional uuid",
  "payload": {
    "source": "extension"
  }
}
```

Inserts directly into the `events` table.

### `POST /api/audio`

Expected JSON body:

```json
{
  "text": "Read this content aloud",
  "userId": "optional uuid",
  "pageId": "Optional uuid",
  "roomId": "Optional uuid"
}
```

This route:

- calls ElevenLabs server-side with `ELEVENLABS_API_KEY`
- uses `ELEVENLABS_VOICE_ID`
- returns `audio/mpeg`
- logs an `audio.generated` event after a successful request

## Testing

1. Add the required values to `.env.local`.
2. Re-run `supabase/schema.sql` in Supabase. This reset script drops the previous backend tables first.
3. Start the app with `npm run dev`.
4. Verify `GET /api/health`.
5. Call `GET /api/page?url=https://example.com`.
6. Confirm it returns a `page` and a default `room`.
7. Use the returned `room.id` when testing `POST /api/guides`, `POST /api/questions`, and `POST /api/chat`.
8. Use a returned post id to test `POST /api/answers`.
9. Confirm rows appear in `posts`, `comments`, and `events`.
10. Test `POST /api/audio` with a short text payload and confirm the response is `audio/mpeg`.

If a route returns `{ "ok": false, "error": "..." }`, check the server logs first. The most common failures are missing environment variables, missing Supabase tables, or invalid foreign keys.
