# Suffering Builds Character

Static roster site for the clan. No build step — plain HTML/CSS/JS, with a
password-protected owner panel for editing player profiles.

## Structure

- `index.html` — roster grid, one card per player
- `player.html` — player detail page, reads `?id=<player-id>` from the URL
- `news.html` — announcements feed, most recent first
- `schedule.html` — upcoming scrims/tournaments, past events shown greyed out
- `hall-of-fame.html` — every player's achievements in one place
- `about.html` — clan story, founding date, and house rules
- `404.html` — themed not-found page, served automatically by Netlify
- `data/players.json` — roster data as `{ "players": [...] }`
- `data/news.json` — announcements as `{ "news": [...] }`
- `data/schedule.json` — events as `{ "events": [...] }`
- `data/about.json` — about-page content as `{ "founded", "story", "rules" }`
- `data/site.json` — site-wide branding/theme and per-page headings, applied at runtime by `js/site.js`
- `js/roster.js` / `js/player.js` / `js/news.js` / `js/schedule.js` / `js/hall-of-fame.js` / `js/about.js` — fetch the matching JSON file and render it, shouldn't need to touch these for content updates
- `js/site.js` — reads `data/site.json` on every page and applies site name, tagline, logo, accent colors, page heading/intro, and footer extras
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

**Preferred:** log into `/admin` (see above). You'll see five sections —
Roster, News, Schedule, About, and **Site Settings**. Roster entries have a
**Photo** field: upload an image there and it replaces that player's initials
avatar automatically, everywhere on the site (including the Hall of Fame page,
which is generated automatically from each player's achievements — nothing to
edit separately there).

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

Layout, navigation structure, and which pages exist are still defined in code
(not exposed to the CMS) — that's a deliberate line between "content the owner
should be able to change any time" and "structure that needs a developer."

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
  "achievements": ["...", "..."],
  "socials": { "twitch": "https://...", "twitter": "https://...", "discord": "https://..." }
}
```

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
  "story": "The clan's story, one or more sentences.",
  "rules": ["Rule one.", "Rule two."]
}
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
