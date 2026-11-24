
// api/_espnRoster.js
// Shared ESPN NBA roster scraper with player IDs

const axios = require("axios");
const cheerio = require("cheerio");

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
  WAS: "washington-wizards"
};

async function fetchNBATeamRoster(teamCode) {
  const team = (teamCode || "").toUpperCase();
  const slug = ESPN_TEAM_MAP[team];

  if (!slug) {
    throw new Error(`Unknown NBA team code: ${team}`);
  }

  const url = `https://www.espn.com/nba/team/roster/_/name/${team.toLowerCase()}/${slug}`;

  const { data } = await axios.get(url, {
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const $ = cheerio.load(data);
  const players = [];

  $("table tbody tr").each((_, row) => {
    const cols = $(row).find("td");
    if (cols.length < 6) return;

    const playerLink = $(cols[1]).find("a").attr("href") || "";
    const idMatch = playerLink.match(/\/id\/(\d+)/i);

    players.push({
      espnId: idMatch ? idMatch[1] : null,
      number: $(cols[0]).text().trim(),
      name: $(cols[1]).text().trim(),
      position: $(cols[2]).text().trim(),
      age: $(cols[3]).text().trim(),
      height: $(cols[4]).text().trim(),
      weight: $(cols[5]).text().trim()
    });
  });

  return {
    team,
    teamSlug: slug,
    updatedAt: new Date().toISOString(),
    count: players.length,
    players
  };
}

module.exports = {
  ESPN_TEAM_MAP,
  fetchNBATeamRoster
};
