import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OVERWATCH_CATALOG } from "../apps/shared/overwatch-catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function unique(values, label) {
  const seen = new Set();
  values.forEach(value => {
    const key = String(value).toLowerCase();
    assert(!seen.has(key), `Duplicate ${label}: ${value}`);
    seen.add(key);
  });
}

const heroRoles = new Set(["Tank", "Damage", "Support"]);
const mapModes = new Set(["Control", "Escort", "Hybrid", "Push", "Flashpoint", "Clash"]);
unique(OVERWATCH_CATALOG.heroes.map(hero => hero.name), "hero");
unique(OVERWATCH_CATALOG.maps.map(map => map.name), "map");
OVERWATCH_CATALOG.heroes.forEach(hero => {
  assert(hero.name && heroRoles.has(hero.role), `Invalid hero record: ${JSON.stringify(hero)}`);
  ["c", "t", "s"].forEach(field => assert(Number.isFinite(hero[field]), `${hero.name} is missing numeric ${field}.`));
  assert(typeof hero.mvt === "boolean", `${hero.name} is missing its movement flag.`);
  assert(typeof hero.aim === "string" && hero.aim, `${hero.name} is missing its aim description.`);
});
OVERWATCH_CATALOG.maps.forEach(map => assert(map.name && mapModes.has(map.mode), `Invalid map record: ${JSON.stringify(map)}`));
assert(OVERWATCH_CATALOG.heroes.some(hero => hero.name === "Emre"), "Emre is missing from the shared catalog.");
assert(OVERWATCH_CATALOG.heroes.some(hero => hero.name === "Shion"), "Shion is missing from the shared catalog.");
assert(OVERWATCH_CATALOG.maps.some(map => map.name === "Neon Junction" && map.mode === "Hybrid"), "Neon Junction must be a Hybrid map.");
assert(OVERWATCH_CATALOG.maps.some(map => map.name === "Aatlis" && map.mode === "Flashpoint"), "Aatlis must be a Flashpoint map.");

for (const file of ["data/site.json", "data/players.json", "data/news.json", "data/testimonials.json", "data/coaching-guide.json", "data/spotlights.json"]) {
  try {
    JSON.parse(await readFile(path.join(root, file), "utf8"));
  } catch (error) {
    errors.push(`${file} is not valid JSON: ${error.message}`);
  }
}

const site = JSON.parse(await readFile(path.join(root, "data/site.json"), "utf8"));
assert(site.navigation.some(item => item.id === "client-login" && item.path === "apps/client/" && item.enabled !== false), "Client Login must be enabled in site navigation.");
assert(site.navigation.some(item => item.id === "coaching-guide" && item.path === "coaching-guide.html" && item.enabled !== false), "The coaching comparison must be enabled in site navigation.");
for (const file of ["privacy.html", "terms.html", "refund-policy.html"]) {
  const html = await readFile(path.join(root, file), "utf8");
  assert(html.includes('content="HONE your skills. Suffering Builds Character."'), `${file} has the wrong embed description.`);
}
const privacy = await readFile(path.join(root, "privacy.html"), "utf8");
const terms = await readFile(path.join(root, "terms.html"), "utf8");
assert(privacy.includes("does not set tracking cookies") && privacy.includes("referral code"), "Privacy policy must explain anonymous analytics and referral attribution.");
assert(terms.includes("Referral rewards") && terms.includes("genuine new clients"), "Referral eligibility terms are missing.");

const homepage = await readFile(path.join(root, "index.html"), "utf8");
const homepageIds = [...homepage.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
unique(homepageIds, "homepage id");
for (const match of homepage.matchAll(/\baria-describedby="([^"]+)"/g)) {
  for (const id of match[1].split(/\s+/)) assert(homepageIds.includes(id), `Homepage aria-describedby points to missing #${id}.`);
}
assert(homepage.includes('name="consent"') && homepage.includes('href="privacy.html"'), "The coaching form must include policy consent.");
assert((homepage.match(/data-coaching-step=/g) || []).length === 2, "The coaching application must have two steps.");

const embedText = "HONE your skills. Suffering Builds Character.";
const htmlFiles = (await filesUnder(root)).filter(file => file.endsWith(".html"));
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const occurrences = html.split(embedText).length - 1;
  assert(occurrences >= 3, `${path.relative(root, file)} does not use the site-wide embed text for description, Open Graph, and Twitter.`);
}

const intake = await readFile(path.join(root, "netlify/functions/coaching-intake.mjs"), "utf8");
assert(intake.indexOf("createCoachingLead") < intake.indexOf("fetch(destination"), "The coaching application must be persisted before Discord delivery.");
assert(intake.includes("input.consent !== true"), "Server-side coaching consent validation is missing.");

const clientWorkspace = await readFile(path.join(root, "netlify/functions/client-workspace.mjs"), "utf8");
const clientApp = await readFile(path.join(root, "apps/client/app.js"), "utf8");
const hqMatches = await readFile(path.join(root, "apps/hq/js/matches.js"), "utf8");
const hqFeedback = await readFile(path.join(root, "apps/hq/js/feedback.js"), "utf8");
const hqSync = await readFile(path.join(root, "apps/hq/js/sync.js"), "utf8");
const hqTeams = await readFile(path.join(root, "apps/hq/js/teams.js"), "utf8");
const hqReferrals = await readFile(path.join(root, "apps/hq/js/referrals.js"), "utf8");
const hqConversions = await readFile(path.join(root, "apps/hq/js/conversions.js"), "utf8");
const siteAnalytics = await readFile(path.join(root, "netlify/functions/site-analytics.mjs"), "utf8");
const siteScript = await readFile(path.join(root, "js/site.js"), "utf8");
assert(clientWorkspace.includes("applySessionFeedback") && clientWorkspace.includes("testimonialAllowed"), "Server-side session feedback handling is missing.");
assert(clientWorkspace.includes('quoteNeedsReview ? "Not reviewed"'), "Changed testimonial quotes must return to review before publication.");
assert(clientApp.includes("submitSessionFeedback") && clientApp.includes("Private feedback for the coaching team"), "The client feedback form is missing.");
assert(hqFeedback.includes("Feedback.alertHtml") && hqFeedback.includes("publicationStatus"), "Coach HQ feedback triage is missing.");
assert(hqSync.includes("'feedback'") && hqSync.includes("feedback: []"), "Coach HQ cloud sync must include feedback records.");
assert(hqSync.includes("'teams'") && hqSync.includes("'referrals'"), "Coach HQ cloud sync must include teams and referrals.");
assert(hqTeams.includes("UI.renderers.teams") && hqTeams.includes("team.mapPool") && hqTeams.includes("team.compositions"), "The team coaching workspace is incomplete.");
assert(clientWorkspace.includes("publicTeam") && clientApp.includes("renderTeamWorkspace"), "Team workspaces must be available in the client app.");
assert(clientApp.includes("renderMapWinrate") && clientApp.includes("mapWinrateStats") && clientApp.includes("setMapWinrateSort") && clientApp.includes("Draws are shown in your record but are not counted"), "The client map winrate tab is missing or incomplete.");
assert(hqMatches.includes("Matches.sortMapStats") && hqMatches.includes("Matches.setMapSort") && (hqMatches.match(/Name \(A-Z\)/g) || []).length, "Coach HQ map winrate sorting is missing.");
assert(hqReferrals.includes("Referrals.recordConversion") && clientApp.includes("renderReferrals"), "Referral rewards are not connected across HQ and the client app.");
assert(intake.includes("referralCode") && intake.includes("recordSiteEvent"), "Coaching applications must retain referral and conversion attribution.");
assert(hqConversions.includes("UI.renderers.conversions") && siteAnalytics.includes("siteAnalyticsSummary"), "Conversion analytics are missing.");
assert(siteScript.includes("sendSiteAnalytics") && siteScript.includes("no cookies"), "Anonymous aggregate public-site analytics are missing their privacy guardrail.");

const coachingGuide = JSON.parse(await readFile(path.join(root, "data/coaching-guide.json"), "utf8"));
assert(coachingGuide.services.length >= 2 && coachingGuide.faq.length >= 3, "The coaching comparison needs published services and FAQs.");
assert(coachingGuide.services.some(item => item.sourceType === "Duo Coaching") && coachingGuide.services.some(item => item.sourceType === "Team Coaching"), "The coaching comparison must stay connected to the live offer sources.");
const spotlights = JSON.parse(await readFile(path.join(root, "data/spotlights.json"), "utf8"));
assert(spotlights.spotlights.every(item => item.enabled === false || item.consentConfirmed === true), "Every enabled public result must have confirmed player permission.");

if (errors.length) {
  console.error(errors.map(error => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Site checks passed: ${OVERWATCH_CATALOG.heroes.length} heroes, ${OVERWATCH_CATALOG.maps.length} maps, ${htmlFiles.length} embed-checked pages, durable coaching intake, and policy pages.`);
