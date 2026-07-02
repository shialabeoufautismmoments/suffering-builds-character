# Suffering Builds Character

Static roster site for the clan. No build step — plain HTML/CSS/JS, with a
password-protected owner panel for editing player profiles.

## Structure

- `index.html` — roster grid, one card per player
- `player.html` — player detail page, reads `?id=<player-id>` from the URL
- `data/players.json` — **all player data lives here** as `{ "players": [...] }`
- `js/roster.js` / `js/player.js` — fetch `data/players.json` and render it, shouldn't need to touch these for content updates
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

## Editing the roster

**Preferred:** log into `/admin` (see above) and edit players through the form —
no code required, and it's the actual point of this setup.

**Manual alternative:** edit `data/players.json` directly and commit/push:

```json
{
  "id": "unique-slug",
  "name": "Real \"Handle\" Name",
  "game": "Game Title",
  "role": "Role",
  "rank": "Current Rank",
  "joined": "2025-01-01",
  "accent": "#8b0000",
  "bio": "Short bio.",
  "achievements": ["...", "..."],
  "socials": { "twitch": "https://...", "twitter": "https://...", "discord": "https://..." }
}
```

`id` is used in the URL (`player.html?id=unique-slug`) — keep it lowercase with
no spaces.

To swap the avatar initials for a real photo, edit the `.player-avatar` markup in
`js/roster.js` and `js/player.js` to use an `<img>` instead, and add a `photo` field
to each player pointing at a file in `assets/`.

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
