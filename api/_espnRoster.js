// api/_espnRoster.js
// Shared ESPN NBA roster scraper + caching + data cleaning

const axios = require("axios");
const cheerio = require("cheerio");

// ESPN uses these team abbreviations in the URL
const ESPN_TEAM_MAP = {
  ATL: "atlanta-hawks",
  BOS: "boston-celtics",
  BKN: "brooklyn-nets",
  CHA: "charlotte-hornets",
  CHI: "chicago-bulls",
  CLE: "cleveland-cavaliers",
  DAL: "dallas-mavericks",
  DEN: "denver-nuggets",
  DET: "detroit-pistons",
  GSW: "golden-state-warriors",
  HOU: "houston-rockets",
  IND: "indiana-pacers",
  LAC: "la-clippers",
  LAL: "los-angeles-lakers",
  MEM: "memphis-grizzlies",
  MIA: "miami-heat",
  MIL: "milwaukee-bucks",
  MIN: "minnesota-timberwolves",
  NOP: "new-orleans-pelicans",
  NYK: "new-york-knicks",
  OKC: "oklahoma-city-thunder",
  ORL: "orlando-magic",
  PHI: "philadelphia-76ers",
  PHX: "phoenix-suns",
  POR: "portland-trail-blazers",
  SAC: "sacramento-kings",
  SAS: "san-antonio-spurs",
  TOR: "toronto-raptors",
  UTA: "utah-jazz",
  WAS: "washington-wizards",
};

// ------- Parsers (clean data) -------

function parseHeight(raw) {
  if (!raw) return null;
  // Handles "6' 8\"", "6'8", "6-8"
  const ftIn = raw.match(/(\d+)\s*['-]\s*(\d+)/);
  let feet = 0;
  let inches = 0;

  if (ftIn) {
    feet = parseInt(ftIn[1], 10);
    inches = parseInt(ftIn[2], 10);
  } else {
    const onlyFeet = raw.match(/(\d+)/);
    if (onlyFeet) feet = parseInt(onlyFeet[1], 10);
  }

  const totalInches = feet * 12 + inches;
  if (!totalInches) return null;

  return { feet, inches, totalInches };
}

function parseWeight(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function parseAge(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ------- In-memory cache (per warm lambda) -------

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = {}; // { LAL: { fetchedAt, data } }

// ------- Core fetcher -------

async function getTeamRoster(teamCode) {
  const team = String(teamCode || "").toUpperCase();

  if (!ESPN_TEAM_MAP[team]) {
    throw new Error(`Invalid NBA team code: ${team}`);
  }

  const now = Date.now();
  const cached = cache[team];

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const slug = ESPN_TEAM_MAP[team];
  const url = `https://www.espn.com/nba/team/roster/_/name/${team.toLowerCase()}/${slug}`;

  const { data } = await axios.get(url, { timeout: 9000 });
  const $ = cheerio.load(data);

  const players = [];

  $("table tbody tr").each((_, row) => {
    const cols = $(row).find("td");
    if (cols.length < 6) return;

    const numberText = $(cols[0]).text().trim() || null;
    const nameCell = $(cols[1]);
    const name = nameCell.text().trim();

    const href = nameCell.find("a").attr("href") || "";
    const idMatch = href.match(/\/id\/(\d+)\//);
    const espnId = idMatch ? parseInt(idMatch[1], 10) : null;

    const positionText = $(cols[2]).text().trim() || null;
    const ageText = $(cols[3]).text().trim() || null;
    const heightText = $(cols[4]).text().trim() || null;
    const weightText = $(cols[5]).text().trim() || null;

    const age = parseAge(ageText);
    const height = parseHeight(heightText);
    const weightLbs = parseWeight(weightText);

    const base = {
      espnId,
      team,
      teamSlug: slug,
      name,
      jerseyNumber: numberText,
      position: positionText,
      age,
      heightRaw: heightText,
      weightRaw: weightText,
      heightFeet: height ? height.feet : null,
      heightInches: height ? height.inches : null,
      heightTotalInches: height ? height.totalInches : null,
      weightLbs,
    };

    // Prop-ready simplified view for betting logic
    const prop = {
      id: espnId,
      name,
      team,
      pos: positionText,
      age,
      heightInches: base.heightTotalInches,
      weightLbs,
    };

    players.push({ ...base, prop });
  });

  const payload = {
    team,
    teamSlug: slug,
    updatedAt: new Date().toISOString(),
    count: players.length,
    players,
    // Slim array for direct prop pipelines
    propPlayers: players.map((p) => p.prop),
  };

  cache[team] = { fetchedAt: now, data: payload };
  return payload;
}

module.exports = {
  ESPN_TEAM_MAP,
  getTeamRoster,
};
