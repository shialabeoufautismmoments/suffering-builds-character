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

for (const file of ["data/site.json", "data/players.json", "data/news.json", "data/testimonials.json"]) {
  try {
    JSON.parse(await readFile(path.join(root, file), "utf8"));
  } catch (error) {
    errors.push(`${file} is not valid JSON: ${error.message}`);
  }
}

const site = JSON.parse(await readFile(path.join(root, "data/site.json"), "utf8"));
assert(site.navigation.some(item => item.id === "client-login" && item.path === "apps/client/" && item.enabled !== false), "Client Login must be enabled in site navigation.");
for (const file of ["privacy.html", "terms.html", "refund-policy.html"]) {
  const html = await readFile(path.join(root, file), "utf8");
  assert(html.includes('content="HONE your skills. Suffering Builds Character."'), `${file} has the wrong embed description.`);
}

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

if (errors.length) {
  console.error(errors.map(error => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Site checks passed: ${OVERWATCH_CATALOG.heroes.length} heroes, ${OVERWATCH_CATALOG.maps.length} maps, ${htmlFiles.length} embed-checked pages, durable coaching intake, and policy pages.`);
