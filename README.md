# Suffering Builds Character

Static roster site for the clan. No build step — plain HTML/CSS/JS, with a
password-protected owner panel for editing player profiles.

## Structure

- `index.html` — roster grid, one card per player
- `player.html` — player detail page, reads `?id=<player-id>` from the URL
- `news.html` — announcements feed, most recent first
- `schedule.html` — upcoming scrims/tournaments, past events shown greyed out
- `hall-of-fame.html` — every player's achievements in one place
- `about.html` — clan story and founding date
- `wiki.html` / `wiki-entry.html` — wiki index and individual entry view (`?slug=<slug>`)
- `threads.html` / `thread.html` — Twitter/X thread index and unrolled-thread view (`?slug=<slug>`)
- `page.html` — generic template for owner-created custom pages, reads `?slug=<slug>` from the URL
- `404.html` — themed not-found page, served automatically by Netlify
- `data/players.json` — roster data as `{ "players": [...] }`
- `data/news.json` — announcements as `{ "news": [...] }`
- `data/schedule.json` — events as `{ "events": [...] }`
- `data/about.json` — about-page content as `{ "founded", "story" }`
- `data/wiki.json` — wiki entries as `{ "entries": [...] }`
- `data/threads.json` — Twitter/X threads as `{ "threads": [...] }`
- `data/pages.json` — owner-created custom pages as `{ "pages": [...] }`
- `data/site.json` — site-wide branding/theme, nav menu, and per-page headings, applied at runtime by `js/site.js`
- `js/roster.js` / `js/player.js` / `js/news.js` / `js/schedule.js` / `js/hall-of-fame.js` / `js/about.js` / `js/wiki.js` / `js/wiki-entry.js` / `js/threads.js` / `js/thread.js` / `js/page.js` — fetch the matching JSON file and render it, shouldn't need to touch these for content updates
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

**Preferred:** log into `/admin` (see above). You'll see eight sections —
Roster, News, Schedule, About, **Wiki**, **Twitter Threads**, **Custom Pages**,
and **Site Settings**. Roster entries have a **Photo** field: upload an image
there and it replaces that player's initials avatar automatically, everywhere
on the site (including the Hall of Fame page, which is generated automatically
from each player's achievements — nothing to edit separately there). Roster
entries also have a **Country Code** field (2-letter ISO code, e.g. `US`,
`KR`, `BR`) that renders a flag next to the player's name on the roster,
player page, and Hall of Fame — leave it blank for no flag.

**Wiki** works like a mini knowledge base: each entry gets a title, optional
short summary, and body text, and lives at its own page
(`wiki-entry.html?slug=...`), listed on the `wiki.html` index.

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
- Heading and intro text for each page (Roster, News, Schedule, Hall of Fame,
  About) — e.g. add a sentence under "Roster" explaining who's on it
- **Navigation Menu** — order, labels, and visibility of every nav link

### Adding, removing, and reordering pages

**Custom Pages** (in `/admin`) is a real "add a page" tool: fill in a slug,
nav label, heading, and body text, then Publish — a brand-new page appears in
the nav bar and is live at `page.html?slug=your-slug`, no code involved.
Deleting that list entry removes the nav link and the page immediately (visiting
the old URL shows "that page doesn't exist"). This is genuinely full add/delete
for custom pages.

**Built-in pages** (Roster, News, Schedule, Hall of Fame, About, Wiki, Threads)
work a bit differently, because they're backed by real code (`roster.js`,
`news.js`, etc.), not just content — so they can't be *deleted* outright
without a developer removing files. What you *can* do from `/admin` → Site
Settings → **Navigation Menu**:
- Reorder them (drag the list items)
- Relabel them
- Uncheck **Enabled** to take a whole section offline — the nav link
  disappears AND the page itself shows "This section isn't available right
  now" instead of its normal content. This is as close to "deleting" a
  built-in page as a code-backed page can get.

Don't change the **ID** or **Path** fields on the 7 built-in entries — those
are how the site matches a nav entry to the actual page/content; changing them
breaks the enable/disable toggle for that section. You *can* add extra
brand-new entries here too, for external links (e.g. a Discord invite) — give
those any unique ID and put the full URL in Path.

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
  "achievements": "First achievement.\nSecond achievement.",
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
  "enabled": true
}
```

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

`data/pages.json` — one object per custom page in the `pages` array:

```json
{
  "slug": "sponsors",
  "label": "Sponsors",
  "heading": "Our Sponsors",
  "body": "First paragraph.\n\nSecond paragraph.",
  "enabled": true
}
```

`data/site.json`'s `navigation` array controls the nav bar (see "Adding,
removing, and reordering pages" above for the built-in-vs-custom distinction):

```json
{ "id": "roster", "label": "Roster", "path": "index.html", "enabled": true }
```

## Social link previews (Open Graph)

Every page has Open Graph / Twitter Card meta tags so links posted in Discord,
Twitter, etc. show a title, description, and image. The image currently points
at `assets/logo.svg` — that renders fine in some places (Discord) but **not
reliably everywhere** (Twitter/X doesn't support SVG previews at all). For
guaranteed compatibility, export a PNG version of the logo (ideally ~1200×630)
and swap the `og:image`/`twitter:image` `content` values in each HTML file's
`<head>` to point at it. Also worth doing once you know your final domain:
those `content` values are currently relative paths, but Open Graph technically
wants absolute URLs (e.g. `https://yoursite.netlify.app/assets/social.png`) for
maximum compatibility with link-preview crawlers.

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
