# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, no-build admin panel for a Pilates studio (챌린지필라테스) to manage members, class schedules, attendance, session passes, revenue, workout logs, and blog drafts. Plain HTML/CSS/vanilla JS on the frontend, Supabase (Postgres + Auth + RLS) as the entire backend — no server code in this repo.

## Commands

Run the app locally:

```bash
python3 -m http.server 8421
```

Then open `http://localhost:8421/admin/login.html`. This matches the `.claude/launch.json` dev-server config (name: `챌린지필라테스관리`).

There is no build step, bundler, package.json, linter, or test suite — it's plain script tags loading vanilla JS files directly.

### Database changes

There is no migration runner. `schema.sql` is the original base schema (already applied); every `migration_*.sql` file at the repo root is a one-off, hand-run change applied manually and sequentially in the Supabase SQL Editor after that. `schema.sql` is **not** kept in sync with the migrations — e.g. `classes` gained `class_date`, `cancelled`, `completed`, and `member_id` entirely through migration files, so read schema.sql + all migration_*.sql together to know the real current schema.

To add a schema change: create a new `migration_<description>.sql` file at the repo root (alter/create statements only) rather than editing `schema.sql`.

## Architecture

### Auth & authorization model

Supabase Auth handles login; a `profiles` row (created on first login, see `admin/login.html`) holds the actual app role: `owner` (원장) or `instructor` (강사). There is no admin UI to promote a user to owner — it's done once via a commented-out SQL statement at the bottom of `schema.sql`, run manually.

Every admin page except `login.html` follows the same boilerplate at the top of its script:

```html
<script src=".../supabase-js@2/dist/umd/supabase.js"></script>
<script src="js/supabaseClient.js"></script>
<script src="js/auth.js"></script>
<script src="js/<page>.js"></script>
```

and every page script starts with:

```js
const auth = await guardPage({ ownerOnly: false });
if (!auth) return;
```

`guardPage()` (`admin/js/auth.js`) redirects to `login.html` if there's no session, fetches the caller's `profiles` row, tags `<body>` with `role-owner` or `role-instructor`, and (if `ownerOnly`) bounces non-owners back to the dashboard. `admin/css/admin.css` then does the actual gating in pure CSS: anything with class `owner-only` is `display: none` unless the body has `role-owner`. There's no server-side check for this beyond RLS on the tables themselves — the CSS/JS gating is UX only, the Postgres row-level-security policies in `schema.sql` are the real access boundary (e.g. `payments` has no policy at all for instructors, so revenue is invisible to them even if they inspect network requests).

`admin/js/auth.js` also holds small cross-page utilities used everywhere: `formatCurrency`, `formatTime`, `todayStr`, `remainingBadgeClass`, `DAY_LABELS`, `highlightActiveNav`.

### Supabase client

`admin/js/supabaseClient.js` creates a single global `window.sb` from a hardcoded `SUPABASE_URL` / `SUPABASE_ANON_KEY` (this is a static site with an anon key gated by RLS, not a secret). If those placeholders are unset it replaces `document.body` with a setup-instructions message instead of letting the rest of the page's JS throw.

### Domain model (see `schema.sql` + migrations for full detail)

- `members` — a client of the studio; `status` is `active` / `trial` / `withdrawn` (added via `migration_member_status.sql`).
- `session_passes` — a purchased block of sessions (`total_sessions`/`remaining_sessions`) belonging to a member. No price info here by design (see below).
- `payments` — the actual revenue ledger (amount, method, date), owner-only via RLS.
- `classes` — one row per scheduled session on the calendar (not a recurring template): `class_date` + `start_time`/`end_time`, optionally linked to a `member_id` (1:1 personal training) and an `instructor_id`. A class with no `member_id` is a personal/blocked-time entry tracked via its own `completed` flag instead of attendance. `cancelled` and `completed` are independent booleans layered on later.
- `attendance` — checking a member into a `class` **atomically decrements** `session_passes.remaining_sessions` via the `handle_attendance_insert` trigger (and restores it on delete via `handle_attendance_delete`), rather than the client updating the count directly. Always insert/delete `attendance` rows to change remaining sessions — never update `session_passes.remaining_sessions` directly, or the two will drift.
- `todos`, `workout_logs`, `blog_drafts` — simpler standalone tables added later, each with its own migration file.

Money (`payments`, and by extension amounts) is intentionally kept out of `session_passes`/`classes` so instructors can see schedules and remaining counts without seeing revenue — preserve that separation when touching these tables.

### `admin/js/schedule.js` — the core/most complex screen

This is the largest file and the one most likely to need touching. Key things to know before editing it:

- **"Session number" (n회차) is computed client-side, not stored.** `computeSessionNumbers()` walks each member's classes (already sorted by `class_date`, `start_time`), skips cancelled ones, and numbers them starting from `pass.total_sessions - pass.remaining_sessions - checkedCount` — i.e. it backs into the count using the member's current pass state plus how many of their classes already have an `attendance` row. This is order-dependent on `allClasses` staying sorted.
- Week/month calendar views (`renderWeekView` / `renderMonthView`) both re-render from the same in-memory `allClasses`/`attendanceByClassId`/`membersById` state and both call `bindScheduleActions()` afterward to rebind delegated click handlers — if you add a new interactive element to a class card, wire it up there.
- A trial-class booking (`is_trial` checkbox) creates a brand-new `members` row with `status: 'trial'` inline as part of submitting the class form, then uses that new member's id.
- A class with no member assigned uses a "완료" (completed) checkbox instead of the attendance/session-pass flow entirely — don't assume every `classes` row has a member.

### Page-per-feature convention

Every admin section is a static `admin/<name>.html` + `admin/js/<name>.js` pair sharing `admin/css/admin.css` and the sidebar nav in `admin/index.html`. New sections should follow the existing pair layout and add a matching link to the sidebar nav (and to `owner-only` if it should be hidden from instructors) rather than introducing client-side routing.

### `admin/blog.html` / `blog.js`

Manages `blog_drafts` rows (auto-generated elsewhere, e.g. a scheduled job — the `blog_drafts_anon_insert` RLS policy exists specifically so an unauthenticated scheduled task can insert `status: 'draft'` rows). Staff review/edit/copy the draft text here, then paste it manually into Naver Blog's own editor themselves — there is no Naver API integration in this repo; "게시완료" just flips `status` to `published` after the fact as a manual acknowledgement, it doesn't actually publish anything.
