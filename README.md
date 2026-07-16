# Hone

Static roster site for the clan. No build step — plain HTML/CSS/JS, with a
password-protected owner panel for editing player profiles.

## Structure

- `index.html` — **home page**: hero welcome banner, latest-news teaser, and quick-link tiles to every enabled section (auto-generated from the nav menu)
- `roster.html` — roster grid, one card per player (this used to be at `index.html` — moved when the home page was added)
- `player.html` — player detail page, reads `?id=<player-id>` from the URL
- `news.html` — announcements feed, most recent first
- `staff.html` — leadership/staff members (players flagged **Staff Member?** in Roster)
- `about.html` — clan story and founding date
- `partners.html` — partner/sponsor logo grid, each card optionally links out to the partner's site
- `wiki.html` / `wiki-entry.html` — wiki index and individual entry view (`?slug=<slug>`)
- `vod-reviews.html` — public VOD review write-ups, each card links out to a Google Doc
- `threads.html` / `thread.html` — Twitter/X thread index and unrolled-thread view (`?slug=<slug>`)
- `roadmap.html` — planned/in-progress/completed milestones
- `coaching.html` — bookable coaches (linking to their Cal.com page) and coaching testimonials
- `player-spotlights.html` / `player-spotlight.html` — public case-study index and individual player spotlight view (`?slug=<slug>`)
- `team-coaching.html` — pricing packages for teams/orgs, separate from individual coaching
- `reading.html` / `notes.html` — book list (cover, region-aware Amazon link, summary) and per-book notes view (`?slug=<slug>`)
- `page.html` — generic template for owner-created custom pages, reads `?slug=<slug>` from the URL
- `404.html` — themed not-found page, served automatically by Netlify
- `data/players.json` — roster data as `{ "players": [...] }`
- `data/news.json` — announcements as `{ "news": [...] }`
- `data/about.json` — about-page content as `{ "founded", "story" }`
- `data/partners.json` — partners/sponsors as `{ "partners": [...] }`
- `data/wiki.json` — wiki entries as `{ "entries": [...] }`
- `data/vod-reviews.json` — VOD reviews as `{ "reviews": [...] }`
- `data/threads.json` — Twitter/X threads as `{ "threads": [...] }`
- `data/roadmap.json` — roadmap milestones as `{ "items": [...] }`
- `data/testimonials.json` — bookable coaches + testimonials as `{ "coaches": [...], "testimonials": [...] }`
- `data/spotlights.json` — player spotlights as `{ "spotlights": [...] }`
- `data/team-coaching.json` — team coaching pricing packages as `{ "tagline", "contactLabel", "contactUrl", "packages": [...] }`
- `data/books.json` — reading list as `{ "books": [...] }`
- `data/pages.json` — owner-created custom pages as `{ "pages": [...] }`
- `data/site.json` — site-wide branding/theme, nav menu, and per-page headings, applied at runtime by `js/site.js`
- `js/home.js` / `js/roster.js` / `js/player.js` / `js/news.js` / `js/staff.js` / `js/about.js` / `js/partners.js` / `js/wiki.js` / `js/wiki-entry.js` / `js/vod-reviews.js` / `js/threads.js` / `js/thread.js` / `js/roadmap.js` / `js/coaching.js` / `js/player-spotlights.js` / `js/player-spotlight.js` / `js/team-coaching.js` / `js/reading.js` / `js/notes.js` / `js/page.js` — fetch the matching JSON file and render it, shouldn't need to touch these for content updates
- `js/site.js` — reads `data/site.json` and `data/pages.json` on every page and applies site name, tagline, logo, accent colors, page heading/intro, footer extras, builds the nav menu, and wires up the header search
- `js/auth.js` — wires up the "Owner Login" link and Netlify Identity
- `css/style.css` — theme (dark, blood-red accents, matches the mascot logo)
- `assets/logo.svg` — the mascot logo, recreated as SVG so it stays crisp at any size
- `admin/` — the owner panel (Decap CMS). This is what makes editing possible without touching code.
- `sitemap.xml` / `robots.txt` — lists the 15 top-level section pages for search engines. Static, hand-maintained — see "Search & discoverability" below.

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

**Preferred:** log into `/admin` (see above). You'll see sections for
Roster, News, About, **Partners**, **Wiki**, **VOD Reviews**,
**Twitter Threads**, **Roadmap**, **Coaching / Testimonials**,
**Player Spotlights**, **Reading**, **Custom Pages**, and **Site Settings**.
Roster entries have a **Photo**
field: upload an image there and it replaces that player's initials avatar
automatically, everywhere on the site. Roster entries also have a **Staff
Member?** checkbox — check it to include that player on the Staff page
(`staff.html`), which shows their photo, name/flag, role, and full bio; and a
**Country Code** field (2-letter ISO code, e.g. `US`, `KR`, `BR`) that
renders a flag next to the player's name on the roster, player page, and
Staff page — leave it blank for no flag. There's also a **YouTube Videos**
field (same one-per-line plain text pattern as Tweet URLs below): paste any
number of YouTube video URLs, one per line, and they embed as responsive
players on that player's page below their bio. Leave blank for no videos.
Player profiles used to have an **Achievements** field that showed as a list
on the player page — that display was removed by request, but the field
itself is still in the CMS schema (harmless, just unused) in case it's wanted
back later.

**Home** (`index.html`) isn't its own CMS section — its welcome heading/intro
text come from Site Settings → Page Headings & Intros → **Home Page**, same
as every other built-in page. Its quick-link tiles and news teaser are
generated automatically (from the Navigation Menu and the two most recent
News entries), so there's nothing else to configure there.

**Wiki** works like a mini knowledge base: each entry gets a title, optional
short summary, and body text, and lives at its own page
(`wiki-entry.html?slug=...`), listed on the `wiki.html` index. The **Body**
field is a full markdown editor (headings, bold/italic, links, lists, quotes,
code, and images via the toolbar's image button — it uses the same
`assets/uploads/` media library as every other image field) — the page
renders it with [marked](https://github.com/markedjs/marked) (loaded via CDN
in `wiki-entry.html`) into styled HTML (`.markdown-body` in `css/style.css`).
Wiki entries and Custom Pages both also have a **PDF Attachment** field —
upload a PDF and it's embedded inline (viewable right on the page) below the
body text, with a "Download PDF" link underneath. Leave it blank for no
attachment.

Each wiki entry also has an optional **Category** field (plain text — type
whatever name you want, e.g. "Movement" or "Aim Training"). There's no
separate place to pre-define categories: the `wiki.html` index reads whatever
category names are actually in use across entries and builds filter tabs
from them automatically (alphabetical, with an "Uncategorized" tab last if
any entries have no category set). Reuse the exact same name (case-sensitive)
across entries to group them under the same tab. Filtering happens client-side
— no reload. If only zero or one category is in use, the tab row is hidden
since there's nothing to filter.

**VOD Reviews** is a simple public list at `vod-reviews.html`: each entry is
a title, optional player/team reviewed, optional date, optional short
summary, and a **Google Doc Link**. Cards on the list page link straight out
to the doc in a new tab — nothing is embedded inline, so there's no
"publish to web" step. The doc just needs its sharing setting on **"Anyone
with the link can view"**, or visitors hit a permission wall when they click
through.

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
  this is specifically about what they coach), optionally add **Pricing**
  (one price per line, e.g. `$30 / 30 min` then `$50 / 60 min` on the next
  line — shown as small pill tags under the description; leave blank to hide
  pricing on that card), and add their **Cal.com Booking URL**. The card
  automatically pulls that player's photo, name, flag, role, and game from
  Roster — nothing to re-enter — and the whole card links out to their
  Cal.com page in a new tab. If a Player ID doesn't match anyone in Roster,
  that entry is silently skipped on the live site (logged to the browser
  console) rather than showing a broken card.
- **Testimonials** — Name, optional Role/Context (e.g. "Diamond → Masters in
  3 months"), a Quote, an optional 1–5 star Rating, and an optional PDF
  Attachment (e.g. a written coaching session report).

Both are plain list-of-objects (siblings in the same file, not nested inside
each other), same safe pattern as Roadmap and Site Settings' Navigation Menu
+ Social Links, so Add/reorder work normally.

**Player Spotlights** (`player-spotlights.html` / `player-spotlight.html`) is
a public case-study page per player — nested under the Coaching dropdown in
the nav. Each entry has a Slug, Player Name, optional Photo (falls back to
initials, same as Roster/Staff), optional Summary (short teaser on the index
card), a **Notes** field, and an optional **Document**. Notes is a full
markdown editor, same as Wiki's Body field — write the case-study narrative
and use the toolbar's image button to embed before/after screenshots right
where they're relevant in the text, instead of managing a separate photo
gallery field. Document is a single optional PDF, embedded inline with a
download link (same pattern as Wiki's PDF Attachment) — for more than one
document, just link the others from inside the Notes text. **This page is
public** — get the player's OK before posting their name, screenshots, or
progress details.

**Team Coaching** (`team-coaching.html`) is a pricing/sales page for teams
and orgs buying coaching for a whole roster, deliberately separate from the
**Coaching** page (which is for individual players booking their own 1-on-1
sessions with a specific coach) — nested under the same Coaching dropdown in
the nav. There's a page-level **Tagline** (short pitch under the heading) and
a general **Contact Button** (label + URL — point it at Discord, a
`mailto:` link, or a form), plus a **Packages** list where each entry is one
pricing tier: Name, Price, an optional one-line Tagline, **Features** (same
one-per-line plain-text pattern as Achievements/Tweet URLs — shown as a
checklist), a **Featured?** toggle that visually highlights that tier as
recommended, and its own optional CTA Label/URL. If a package's CTA URL is
left blank, its button falls back to the page's general Contact Button
instead — so you can give one or two packages their own direct booking link
while the rest funnel into "contact us for a quote." Packages without an
enabled CTA (no package URL and no page-level Contact URL) render as a
disabled-looking button rather than a dead link.

**Reading** (`reading.html`) is a book list — each entry has a Slug, Title,
optional Author, optional Cover Image, optional Amazon Link, optional
Summary, and optional Notes. A few things worth knowing:

- **Amazon Link** — paste any Amazon product URL (any country domain, e.g. a
  `.com` or `.co.uk` link). When a visitor clicks "Buy on Amazon," the site
  extracts the product's ASIN from whatever URL you pasted and rebuilds the
  link pointing at *their* local Amazon storefront, guessed from their
  **browser's language setting** (`navigator.language`). This is a
  free, no-signup heuristic, not true location detection — a US visitor whose
  browser is set to French would get routed to amazon.fr. For guaranteed
  accuracy you'd need Amazon's own Associates "OneLink" product (a separate
  signup on Amazon's side) or a paid IP-geolocation service; ask if you want
  that wired in later. If the pasted URL doesn't contain a recognizable ASIN,
  the link is used exactly as pasted (no rewriting).
- **Notes** — if filled in, a "Notes →" link appears on the book's card,
  leading to its own page at `notes.html?slug=<slug>` showing that text
  (separate paragraphs with a blank line). Leave Notes blank and the link
  disappears entirely — no dead/empty notes pages.
- **Cover Image** is optional — leave it blank and the card shows a plain
  placeholder (the book title's first letter) instead of a broken image.

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
- Heading and intro text for each page (Roster, News, Staff,
  About) — e.g. add a sentence under "Roster" explaining who's on it
- **Navigation Menu** — order, labels, visibility, *and grouping into hover
  dropdowns* for every nav link (see below)

### Nav dropdowns (mega-menu)

The top nav bar isn't a flat list of every page — related pages are grouped
under a handful of top-level buttons that reveal the rest on hover (or on
tap, on mobile, where dropdowns just show as an indented list instead of a
hover popup). This is controlled entirely by each item's **Parent Group(s)**
field in Site Settings → Navigation Menu:

- Leave **Parent Group(s)** blank → the item is its own top-level nav button.
- Put another item's **ID** in **Parent Group(s)** → this item becomes a
  dropdown entry under that item instead of appearing at the top level
  itself. Comma-separate multiple IDs (e.g. `home,about`) to nest the same
  item under more than one dropdown at once — Roster does exactly this by
  default, appearing under both Home and About.
- A top-level item automatically gets a hover dropdown arrow (▾) if anything
  lists its ID as a parent. No children = no dropdown, just a plain link
  (Coaching, by default).
- A top-level item can also have **no Path** at all — it renders as
  plain (unclickable) text that exists purely to host a dropdown. Information
  is set up this way by default: it isn't a real page, it's just a label for
  the Wiki/Threads/Roadmap/Reading dropdown.
- If a page shown inside a dropdown is the current page, its *parent*
  button is also highlighted as active (both Home and About light up when
  viewing the Roster page, since Roster is nested under both).

Default grouping out of the box: **Home** → Roster, News · **About**
→ Roster, Staff, Partners · **Coaching** → Player Spotlights, Team Coaching ·
**Information** → Wiki, VOD Reviews, Threads, Roadmap, Reading.

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

**Built-in pages** (Home, Roster, News, Staff, About, Partners, Wiki,
VOD Reviews, Threads, Roadmap, Coaching, Player Spotlights, Team Coaching, Reading) work a bit differently, because they're backed by real code (`roster.js`,
`news.js`, etc.), not just content — so they can't be *deleted* outright
without a developer removing files. What you *can* do from `/admin` → Site
Settings → **Navigation Menu**:
- Reorder them (drag the list items)
- Relabel them
- Uncheck **Enabled** to take a whole section offline — the nav link
  disappears AND the page itself shows "This section isn't available right
  now" instead of its normal content. This is as close to "deleting" a
  built-in page as a code-backed page can get.

Don't change the **ID** or **Path** fields on the 12 built-in nav entries
(the 11 real pages plus the label-only "Information" entry) — those
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

`data/about.json` — a single object, not an array:

```json
{
  "founded": "2023-06-15",
  "story": "The clan's story, one or more sentences."
}
```

`data/partners.json` — one object per entry in the `partners` array:

```json
{
  "name": "Example Gear Co.",
  "logo": "assets/uploads/example-logo.png",
  "url": "https://example.com",
  "description": "Official peripherals partner.",
  "enabled": true
}
```

`logo` is optional — falls back to a plain text card with the partner's name
if left blank. `url` is optional — if set, the whole card links out to it in
a new tab; if left blank, the card is just static (not clickable).

`data/wiki.json` — one object per entry in the `entries` array:

```json
{
  "slug": "map-callouts",
  "title": "Map Callouts",
  "category": "Game Sense",
  "summary": "Shorthand names for common map positions.",
  "body": "## First paragraph\n\nSecond paragraph with **bold** and a [link](https://example.com).",
  "pdf": "assets/uploads/example.pdf",
  "enabled": true
}
```

`body` is markdown, rendered client-side with `marked` — headings, bold/italic,
links, lists, blockquotes, and code blocks all work.

`data/spotlights.json` — one object per entry in the `spotlights` array:

```json
{
  "slug": "peanut-aim-arc",
  "playerName": "Peanut",
  "photo": "assets/uploads/peanut.jpg",
  "summary": "Diamond 2 to Masters in 6 weeks.",
  "notes": "## Week 1\n\nStarting point.\n\n![Week 1 stats](assets/uploads/peanut-week1.png)\n\n## Week 6\n\nAfter six weeks of focused tracking work...",
  "document": "assets/uploads/peanut-training-plan.pdf",
  "enabled": true
}
```

`notes` is markdown, same as `wiki.json`'s `body` — screenshots get embedded
directly in the text via standard markdown image syntax (the CMS's image
toolbar button inserts this for you). `photo` and `document` are both
optional.

`data/team-coaching.json` — a single object, not a list of entries:

```json
{
  "tagline": "Get your whole roster coached together.",
  "contactLabel": "Contact us for a custom quote",
  "contactUrl": "mailto:hello@sufferingbuildscharacter.com",
  "packages": [
    {
      "name": "Starter",
      "price": "$400/mo",
      "tagline": "For teams just getting into structured practice.",
      "features": "1 team VOD review per month\nShared warmup playlist\nDiscord Q&A access",
      "featured": false,
      "ctaLabel": "",
      "ctaUrl": "",
      "enabled": true
    },
    {
      "name": "Pro",
      "price": "$900/mo",
      "tagline": "Our most popular package for competitive rosters.",
      "features": "Weekly team VOD review\nIndividual playlists per player\nMonthly progress reports\nPriority scheduling",
      "featured": true,
      "ctaLabel": "Book a call",
      "ctaUrl": "https://cal.com/your-name/team-intro",
      "enabled": true
    }
  ]
}
```

`packages[].features` is the same one-per-line plain-text pattern as Roster's
Achievements field. A package's `ctaUrl` (if set) takes priority over the
page-level `contactUrl` for that package's button.

`data/vod-reviews.json` — one object per entry in the `reviews` array:

```json
{
  "title": "psev vs. Team X — Map 1 Review",
  "subject": "psev",
  "date": "2026-07-10",
  "summary": "Positioning and cooldown tracking breakdown.",
  "docUrl": "https://docs.google.com/document/d/EXAMPLE/edit?usp=sharing",
  "enabled": true
}
```

`docUrl` is whatever share link Google Docs gives you — the card links out to
it directly in a new tab, so the doc's sharing setting needs to be "Anyone
with the link can view."

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
      "pricing": "$30 / 30 min\n$50 / 60 min",
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
in automatically. `pricing` is optional, a plain string with one price per
line (not an array). For `testimonials`: `role`, `rating`, and `pdf` are all
optional. `rating` is a string `"1"`–`"5"`.

`data/books.json` — one object per book in the `books` array:

```json
{
  "slug": "atomic-habits",
  "title": "Atomic Habits",
  "author": "James Clear",
  "cover": "assets/uploads/atomic-habits.jpg",
  "amazonUrl": "https://www.amazon.com/dp/B07D23CFGR",
  "summary": "A practical guide to building good habits and breaking bad ones.",
  "notes": "First paragraph.\n\nSecond paragraph.",
  "enabled": true
}
```

`author`, `cover`, `amazonUrl`, `summary`, and `notes` are all optional. See
"Reading" above for how `amazonUrl` gets rewritten per-visitor and why Notes
is what controls whether the "Notes →" link appears.

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
removing, and reordering pages" above for the built-in-vs-custom distinction,
and "Nav dropdowns" above for how `parents` works):

```json
{ "id": "home", "label": "Home", "path": "index.html", "enabled": true, "parents": "" }
{ "id": "roster", "label": "Roster", "path": "roster.html", "enabled": true, "parents": "home,about" }
{ "id": "information", "label": "Information", "path": "", "enabled": true, "parents": "" }
```

`parents` is a plain comma-separated string, not an array — empty means
top-level, non-empty means "nest this under these parent IDs instead." An
empty `path` (like `information` above) means the item has no page of its
own and exists only to host a dropdown.

`data/site.json`'s `discordServerId` is a plain string — see "Discord widget"
above for where to find it. Leave it `""` to hide the widget.

## Social link previews (Open Graph)

Every page has Open Graph / Twitter Card meta tags so links posted in Discord,
Twitter, etc. show a title, description, and image.

**Deliberate split from the visible site branding:** the site itself displays
as "Hone" (header, footer, page titles — all driven by `data/site.json` via
`js/site.js`), but `og:site_name` is hardcoded to always say **"Suffering
Builds Character"** across every page. This is intentional — link previews
should keep showing the old name even though the on-site brand changed.
`og:site_name` is **not** wired up to Site Settings — it's static text in
each HTML file's `<head>`.

**`og:title` / `twitter:title` / `og:description` / `twitter:description` /
`<meta name="description">`, on the other hand, are dynamic on the five
per-entry pages** — `wiki-entry.html`, `thread.html`, `notes.html`,
`page.html`, and `player.html`. Each one's render script (`js/wiki-entry.js`
etc.) calls a shared `setMetaTags({ title, description, image })` helper in
`js/site.js` once its content loads, overwriting the generic placeholder tags
baked into the HTML with that specific entry's real title/summary (falling
back to a plain-text excerpt of the body if no summary field exists). Every
other page (Home, Roster, News, Wiki index, VOD Reviews index, etc.) still
shows the static generic copy from its own `<head>` — only individual-entry
pages get this treatment.

**Important limitation:** `setMetaTags` runs in JavaScript after a fetch
resolves, so it only changes what a browser sees — it does **not** by itself
fix what Discord/Twitter/Facebook/Slack show in a link preview, because those
crawlers fetch the raw HTML and don't execute JS. To make link previews
actually reflect the dynamic per-entry tags, turn on **Prerendering** in the
Netlify dashboard (Site configuration → Build & deploy → Post processing →
Prerendering) — a one-click toggle, no code changes needed. Netlify detects
known bot user-agents and serves them a post-JS-execution snapshot instead of
the raw HTML. Without it, link previews for wiki entries/threads/etc. will
still show the generic placeholder copy even though the browser tab title is
correct.

The image points at `assets/logo.svg` — that renders fine in some places
(Discord) but **not reliably everywhere** (Twitter/X doesn't support SVG
previews at all). For guaranteed compatibility, export a PNG version of the
logo (ideally ~1200×630) and swap the `og:image`/`twitter:image` `content`
values in each HTML file's `<head>` to point at it. Also worth doing once you
know your final domain: those `content` values are currently relative paths,
but Open Graph technically wants absolute URLs (e.g.
`https://yoursite.netlify.app/assets/social.png`) for maximum compatibility
with link-preview crawlers. Player pages pass their own `photo` as the
dynamic `og:image` when one's uploaded, falling back to the logo otherwise.

## Search & discoverability

**`sitemap.xml` / `robots.txt`** list the 14 top-level section pages (Home,
Roster, News, Staff, About, Partners, Wiki, VOD Reviews, Threads,
Roadmap, Coaching, Player Spotlights, Reading) so search engines discover and index them
directly instead of relying on crawling nav links. They're static,
hand-maintained files — **individual entries (a specific wiki article,
thread, player profile, book, or custom page) are intentionally NOT listed**,
since those are data-driven with no build step to enumerate what currently
exists. Those still get indexed the normal way, by crawling internal links
from their index pages (`wiki.html`, `roster.html`, etc.) — they just aren't
explicitly prioritized in the sitemap. Add a new top-level page (a new
built-in section, not a CMS entry) to `sitemap.xml` manually if you ever add
one.

**Site search** is the icon in the top-right of the header on every page,
wired up in `js/site.js`. On first click, it fetches `data/wiki.json`,
`data/threads.json`, `data/roadmap.json`, `data/vod-reviews.json`,
`data/news.json`, `data/pages.json`, and `data/spotlights.json` once,
flattens them into one in-memory list, and filters it client-side as you type
(title + summary substring match, case-insensitive, 2+ characters). Results
link straight to the matching page — VOD Reviews open the Google Doc directly
since they don't have an on-site page of their own. It only fetches those
files the first time someone actually opens the search panel, so pages that
never use it don't pay for the extra requests. Roster/Staff/Coaching/Partners/Reading
aren't included in the search index (players, coaches, partners, and books
aren't stored with enough of a free-text body to search meaningfully) — if
that's wanted later, it's a small addition to `buildSearchIndex()` in
`js/site.js`.

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
