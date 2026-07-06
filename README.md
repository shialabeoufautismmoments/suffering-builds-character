# Hone

Static roster site for the clan. No build step — plain HTML/CSS/JS, with a
password-protected owner panel for editing player profiles.

## Structure

- `index.html` — **home page**: hero welcome banner, latest-news teaser, and quick-link tiles to every enabled section (auto-generated from the nav menu)
- `roster.html` — roster grid, one card per player (this used to be at `index.html` — moved when the home page was added)
- `player.html` — player detail page, reads `?id=<player-id>` from the URL
- `news.html` — announcements feed, most recent first
- `schedule.html` — upcoming scrims/tournaments, past events shown greyed out
- `staff.html` — leadership/staff members (players flagged **Staff Member?** in Roster)
- `about.html` — clan story and founding date
- `wiki.html` / `wiki-entry.html` — wiki index and individual entry view (`?slug=<slug>`)
- `threads.html` / `thread.html` — Twitter/X thread index and unrolled-thread view (`?slug=<slug>`)
- `roadmap.html` — planned/in-progress/completed milestones
- `coaching.html` — coaching testimonials (star rating, quote, optional PDF report)
- `page.html` — generic template for owner-created custom pages, reads `?slug=<slug>` from the URL
- `404.html` — themed not-found page, served automatically by Netlify
- `data/players.json` — roster data as `{ "players": [...] }`
- `data/news.json` — announcements as `{ "news": [...] }`
- `data/schedule.json` — events as `{ "events": [...] }`
- `data/about.json` — about-page content as `{ "founded", "story" }`
- `data/wiki.json` — wiki entries as `{ "entries": [...] }`
- `data/threads.json` — Twitter/X threads as `{ "threads": [...] }`
- `data/roadmap.json` — roadmap milestones as `{ "items": [...] }`
- `data/testimonials.json` — coaching testimonials as `{ "testimonials": [...] }`
- `data/pages.json` — owner-created custom pages as `{ "pages": [...] }`
- `data/site.json` — site-wide branding/theme, nav menu, and per-page headings, applied at runtime by `js/site.js`
- `js/home.js` / `js/roster.js` / `js/player.js` / `js/news.js` / `js/schedule.js` / `js/staff.js` / `js/about.js` / `js/wiki.js` / `js/wiki-entry.js` / `js/threads.js` / `js/thread.js` / `js/roadmap.js` / `js/coaching.js` / `js/page.js` — fetch the matching JSON file and render it, shouldn't need to touch these for content updates
- `js/site.js` — reads `data/site.json` and `data/pages.json` on every page and applies site name, tagline, logo, accent colors, page heading/intro, footer extras, and builds the nav menu
- `js/auth.js` — wires up the "Owner Login" link and Netlify Identity
- `css/style.css` — theme (dark, blood-red accents, matches the mascot logo)
- `assets/logo.svg` — the mascot logo, recreated as SVG so it stays crisp at any size
- `admin/` — the owner panel (Decap CMS). This is what makes editing possible without touching code.

## How the owner login works

There's no server for this site, so "login" is handled by **Netlify Identity**
(auth) + **Git Gateway** (lets the logged-in owner commit changes) + **Decap CMS**
(the actual edit-a-player form at `/admin`). Only people you explicitly invite
can log in. Editing a player in the panel commits the change to `data/players.json`
in your GitHub repo, which triggers a normal Netlify redeploy — live in under a minute.

This requires the site to be deployed via a **GitHub repo connected to Netlify**
(drag-and-drop deploy won't support editing, since there's no repo for Git Gateway
to commit to). One-time setup:

1. **Push this project to GitHub.**
   ```
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin <your-new-empty-repo-url>
   git push -u origin main
   ```
2. **Connect it to Netlify:** Netlify dashboard → **Add new site → Import an
   existing project** → pick the repo. Build command: leave blank. Publish
   directory: `.`
3. **Enable Identity:** in your new Netlify site → **Site configuration →
   Identity → Enable Identity**.
4. **Lock it to invite-only:** Identity → **Registration preferences → Invite
   only** (so nobody else can self-register as owner).
5. **Enable Git Gateway:** Identity → **Services → Git Gateway → Enable Git
   Gateway**. This is what lets the CMS commit on your behalf.
6. **Invite yourself:** Identity tab → **Invite users** → enter your email.
   You'll get an email to set a password.
7. Once your site is live, go to `https://<your-site>.netlify.app/admin/` (or
   click **Owner Login** in the site footer, then follow the redirect) and log
   in with that email/password. You'll see a form-based editor for the roster.

Nobody else can reach `/admin` and do anything — Git Gateway rejects commits
from anyone who isn't a logged-in Identity user, and you controlled who got
invited in step 6.

### If the admin panel won't fully load

(Note: Netlify announced deprecating Identity in Feb 2025, then reversed that
decision in Feb 2026 after developer pushback — it's an actively supported
feature again, not abandoned. So a stuck admin panel is almost always a setup
issue, not a dead platform.) Check, in order:

1. Open `/admin` on your **live Netlify URL**, not a local server — Git Gateway
   only works against a real deployed site, since it talks to Netlify's own
   Identity/Git Gateway API for that specific site.
2. Open the browser console (F12 → Console tab) while on `/admin` and look for
   red errors — that error text is the fastest way to pin down the exact cause.
3. Confirm all of steps 3–6 above are actually done: Identity enabled, Git
   Gateway enabled (not just Identity), and you accepted the invite email
   (your account should show as "Active" under Identity → the users list, not
   "Invited").
4. Try a hard refresh (Ctrl+Shift+R) — the CMS is loaded fresh from a CDN each
   time, so a stale cached copy can cause partial loads.

If you hit this, tell me the exact console error and I can usually pin down
the fix from there.

## Editing content

**Preferred:** log into `/admin` (see above). You'll see ten sections —
Roster, News, Schedule, About, **Wiki**, **Twitter Threads**, **Roadmap**,
**Coaching / Testimonials**, **Custom Pages**, and **Site Settings**. Roster entries have a **Photo** field: upload an image
there and it replaces that player's initials avatar automatically, everywhere
on the site. Roster entries also have a **Staff Member?** checkbox — check it
to include that player on the Staff page (`staff.html`), which shows their
photo, name/flag, role, and full bio; and a **Country Code** field
(2-letter ISO code, e.g. `US`, `KR`, `BR`) that renders a flag next to the
player's name on the roster, player page, and Staff page — leave it blank for
no flag. There's also a **YouTube Videos** field (same one-per-line plain text
pattern as Tweet URLs below): paste any number of YouTube video URLs, one per
line, and they embed as responsive players on that player's page under their
achievements. Leave blank for no videos.

**Home** (`index.html`) isn't its own CMS section — its welcome heading/intro
text come from Site Settings → Page Headings & Intros → **Home Page**, same
as every other built-in page. Its quick-link tiles and news teaser are
generated automatically (from the Navigation Menu and the two most recent
News entries), so there's nothing else to configure there.

**Wiki** works like a mini knowledge base: each entry gets a title, optional
short summary, and body text, and lives at its own page
(`wiki-entry.html?slug=...`), listed on the `wiki.html` index. Wiki entries
and Custom Pages both also have a **PDF Attachment** field — upload a PDF and
it's embedded inline (viewable right on the page) below the body text, with a
"Download PDF" link underneath. Leave it blank for no attachment.

**Twitter Threads** "unrolls" a thread without needing any Twitter/X API
access or developer account: paste each tweet's URL from the thread, **one
per line**, into the **Tweet URLs** box (a plain text box, not a repeatable
list — see note below on why), and the thread page renders each one as an
official embedded tweet (via Twitter's public widget), stacked to look like a
continuous unrolled thread. This only works for tweets that are still public
— if the original is deleted or the account is private, that one embed will
fall back to a plain link. There's no way to auto-discover an entire thread
from just the first tweet's URL without a Twitter Developer API key (which
has its own setup and possible costs) — ask if you want that upgraded later.

*Why plain text instead of a repeatable list:* Decap CMS (the admin panel
software) has a real bug where a list field nested inside another list item
doesn't render an "Add" button correctly — since every Thread (and every
Roster player) is itself one item in a list, a second-level list for Tweet
URLs / Achievements hit that bug and effectively capped at one entry no
matter how it was configured. A plain multi-line text box sidesteps the bug
entirely and is just as easy to use — one line per item.

**Roadmap** is a simple ordered list of milestones — each one has a Title,
an optional Target (e.g. "Q3 2026", loose text, not a strict date), a Status
(Planned / In Progress / Completed, shown as a colored pill), and an optional
Description. Drag items in the admin list to reorder them — that order is
exactly what's shown on the page. This one's a plain list-of-objects (not
nested inside another list), so it doesn't hit the bug above and the normal
Add/reorder/delete controls all work.

**Coaching / Testimonials** has two independent lists, both shown on
`coaching.html`:

- **Coaches** — feature a roster member as a bookable coach. Enter their
  **Player ID** (must exactly match that player's ID field in Roster, e.g.
  `psev`), write a **Coaching Description** (separate from their roster bio —
  this is specifically about what they coach), and add their **Cal.com
  Booking URL**. The card automatically pulls that player's photo, name, flag,
  role, and game from Roster — nothing to re-enter — and the whole card links
  out to their Cal.com page in a new tab. If a Player ID doesn't match anyone
  in Roster, that entry is silently skipped on the live site (logged to the
  browser console) rather than showing a broken card.
- **Testimonials** — Name, optional Role/Context (e.g. "Diamond → Masters in
  3 months"), a Quote, an optional 1–5 star Rating, and an optional PDF
  Attachment (e.g. a written coaching session report).

Both are plain list-of-objects (siblings in the same file, not nested inside
each other), same safe pattern as Roadmap and Site Settings' Navigation Menu
+ Social Links, so Add/reorder work normally.

**Site Settings** is the "customize almost anything" panel — it controls things
that used to be hardcoded in the HTML/CSS:

- Site name and tagline (shown in the header, footer, and page `<title>`)
- A custom logo image (upload one to replace the default mascot SVG; leave
  blank to keep it)
- Primary accent color and glow/highlight accent color (recolors cards,
  buttons, borders, and glows site-wide)
- A footer note (an extra line shown in the footer, e.g. a slogan or contact
  email)
- Social/contact links (any number of label+URL pairs, shown in the footer)
- A Discord Server ID, which shows a live member widget in the footer of
  every page (see "Discord widget" below)
- Heading and intro text for each page (Roster, News, Schedule, Staff,
  About) — e.g. add a sentence under "Roster" explaining who's on it
- **Navigation Menu** — order, labels, and visibility of every nav link

On screens narrower than 720px, the nav bar collapses into a hamburger button
(☰) that toggles a full-width dropdown menu — this is automatic and not
something Site Settings controls.

### Adding, removing, and reordering pages

**Custom Pages** (in `/admin`) is a real "add a page" tool: fill in a slug,
nav label, heading, and body text, then Publish — a brand-new page appears in
the nav bar and is live at `page.html?slug=your-slug`, no code involved.
Deleting that list entry removes the nav link and the page immediately (visiting
the old URL shows "that page doesn't exist"). This is genuinely full add/delete
for custom pages.

**Built-in pages** (Home, Roster, News, Schedule, Staff, About, Wiki, Threads,
Roadmap, Coaching) work a bit differently, because they're backed by real code (`roster.js`,
`news.js`, etc.), not just content — so they can't be *deleted* outright
without a developer removing files. What you *can* do from `/admin` → Site
Settings → **Navigation Menu**:
- Reorder them (drag the list items)
- Relabel them
- Uncheck **Enabled** to take a whole section offline — the nav link
  disappears AND the page itself shows "This section isn't available right
  now" instead of its normal content. This is as close to "deleting" a
  built-in page as a code-backed page can get.

Don't change the **ID** or **Path** fields on the 10 built-in entries — those
are how the site matches a nav entry to the actual page/content; changing them
breaks the enable/disable toggle for that section. You *can* add extra
brand-new entries here too, for external links (e.g. a Discord invite) — give
those any unique ID and put the full URL in Path.

### Discord widget

A live Discord widget (member count, who's online) can show in the footer of
every page. To turn it on:

1. In Discord: your server → **Server Settings → Widget** → enable
   **"Enable Server Widget"**
2. Copy the **Server ID** shown on that same screen
3. In `/admin` → **Site Settings** → paste it into **Discord Server ID**,
   then Publish

Leave the field blank to hide the widget entirely (that's the default — it
won't show up until you fill this in). No per-member settings are involved,
just the one server-side toggle in step 1.

**Manual alternative:** edit the JSON files directly and commit/push.

`data/players.json` — one object per player in the `players` array:

```json
{
  "id": "unique-slug",
  "name": "Real \"Handle\" Name",
  "game": "Game Title",
  "role": "Role",
  "rank": "Current Rank",
  "joined": "2025-01-01",
  "accent": "#8b0000",
  "photo": "assets/uploads/example.jpg",
  "bio": "Short bio.",
  "isStaff": true,
  "achievements": "First achievement.\nSecond achievement.",
  "youtubeVideos": "https://youtu.be/dQw4w9WgXcQ\nhttps://youtu.be/anotherOne",
  "socials": { "twitch": "https://...", "twitter": "https://...", "pyvno": "https://pyvno.xyz/..." }
}
```

`achievements` is a single string, one achievement per line (not an array) — the
admin form shows it as a plain text box for that reason (see note below).

`id` is used in the URL (`player.html?id=unique-slug`) — keep it lowercase with
no spaces. `photo` is optional — omit it to keep the initials avatar.

`data/news.json` — one object per announcement in the `news` array:

```json
{ "date": "2026-07-01", "title": "Headline", "body": "The announcement text." }
```

`data/schedule.json` — one object per event in the `events` array:

```json
{
  "date": "2026-07-12",
  "time": "7:00 PM ET",
  "title": "Scrim vs Rival Clan",
  "game": "Valorant",
  "notes": "Optional details.",
  "link": "https://twitch.tv/..."
}
```

`time`, `game`, `notes`, and `link` are all optional.

`data/about.json` — a single object, not an array:

```json
{
  "founded": "2023-06-15",
  "story": "The clan's story, one or more sentences."
}
```

`data/wiki.json` — one object per entry in the `entries` array:

```json
{
  "slug": "map-callouts",
  "title": "Map Callouts",
  "summary": "Shorthand names for common map positions.",
  "body": "First paragraph.\n\nSecond paragraph.",
  "pdf": "assets/uploads/example.pdf",
  "enabled": true
}
```

`pdf` is optional — a path to an uploaded PDF (same `assets/uploads/` folder
as photos), embedded inline below the body with a download link. Omit it for
no attachment. `data/pages.json` custom pages support the same `pdf` field.

`data/threads.json` — one object per thread in the `threads` array:

```json
{
  "slug": "my-big-thread",
  "title": "Our Regional LAN Recap",
  "tweetUrls": "https://twitter.com/user/status/111\nhttps://twitter.com/user/status/222",
  "enabled": true
}
```

`tweetUrls` is a single string, one URL per line (not an array) — same reason
as `achievements` above.

`data/roadmap.json` — one object per milestone in the `items` array, in
display order:

```json
{
  "title": "Regional LAN qualifier run",
  "target": "Q4 2026",
  "status": "Planned",
  "description": "Optional details."
}
```

`status` is one of `"Planned"`, `"In Progress"`, or `"Completed"`. `target`
and `description` are both optional.

`data/testimonials.json` has two top-level arrays, `coaches` and
`testimonials`:

```json
{
  "coaches": [
    {
      "playerId": "psev",
      "description": "Focuses on hitscan fundamentals and VOD review.",
      "calLink": "https://cal.com/psev/coaching-session",
      "enabled": true
    }
  ],
  "testimonials": [
    {
      "name": "Jake M.",
      "role": "Diamond to Masters in 3 months",
      "quote": "The VOD reviews alone were worth it.",
      "rating": "5",
      "pdf": "assets/uploads/example-report.pdf",
      "enabled": true
    }
  ]
}
```

For `coaches`: `playerId` must match a real player's `id` in
`data/players.json` — that player's photo/name/country/role/game get pulled
in automatically. For `testimonials`: `role`, `rating`, and `pdf` are all
optional. `rating` is a string `"1"`–`"5"`.

`data/pages.json` — one object per custom page in the `pages` array:

```json
{
  "slug": "sponsors",
  "label": "Sponsors",
  "heading": "Our Sponsors",
  "body": "First paragraph.\n\nSecond paragraph.",
  "pdf": "assets/uploads/example.pdf",
  "enabled": true
}
```

`data/site.json`'s `navigation` array controls the nav bar (see "Adding,
removing, and reordering pages" above for the built-in-vs-custom distinction):

```json
{ "id": "home", "label": "Home", "path": "index.html", "enabled": true }
```

`data/site.json`'s `discordServerId` is a plain string — see "Discord widget"
above for where to find it. Leave it `""` to hide the widget.

## Social link previews (Open Graph)

Every page has Open Graph / Twitter Card meta tags so links posted in Discord,
Twitter, etc. show a title, description, and image.

**Deliberate split from the visible site branding:** the site itself displays
as "Hone" (header, footer, page titles — all driven by `data/site.json` via
`js/site.js`), but every page's `og:title` / `twitter:title` / `og:site_name`
are hardcoded to always say **"Suffering Builds Character"**, uniformly
across every page, regardless of which page it is. This is intentional — link
previews should keep showing the old name/logo even though the on-site brand
changed. Unlike the rest of the site's branding, these are **not** wired up
to Site Settings — they're static text in each HTML file's `<head>`, so
changing them means editing the `og:title`/`twitter:title`/`og:site_name`
lines directly in every `*.html` file (the per-page `og:description` /
`twitter:description` / `<meta name="description">` are still page-specific
and safe to edit individually).

The image points at `assets/logo.svg` — that renders fine in some places
(Discord) but **not reliably everywhere** (Twitter/X doesn't support SVG
previews at all). For guaranteed compatibility, export a PNG version of the
logo (ideally ~1200×630) and swap the `og:image`/`twitter:image` `content`
values in each HTML file's `<head>` to point at it. Also worth doing once you
know your final domain: those `content` values are currently relative paths,
but Open Graph technically wants absolute URLs (e.g.
`https://yoursite.netlify.app/assets/social.png`) for maximum compatibility
with link-preview crawlers.

Note: `player.html` shows the same generic preview for every player (no
per-player title/image), since there's no server rendering here — the page
fetches player data client-side, after most crawlers have already read the tags.

## Local preview

The pages now fetch `data/players.json`, which browsers block over `file://`.
Run a tiny local server instead of opening `index.html` directly:

```
npx serve .
```

## Deploying to Netlify

Because the owner panel needs Git Gateway, this site needs the **Git-based**
deploy path (see the numbered setup above) rather than drag-and-drop. If you
ever decide you don't want the login/editing feature, drag-and-drop at
[app.netlify.com/drop](https://app.netlify.com/drop) still works fine for the
public roster pages — you'd just go back to editing `data/players.json` by hand.

`netlify.toml` is already configured with `publish = "."` so Netlify won't need
any extra build settings.
