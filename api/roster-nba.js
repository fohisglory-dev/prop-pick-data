// force redeploy

// api/roster-nba.js
// ESPN NBA Roster Scraper
// Example: /api/roster-nba?team=LAL

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
  WAS: "washington-wizards"
};

module.exports = async (req, res) => {
  try {
    const team = (req.query.team || "").toUpperCase();

    if (!team || !ESPN_TEAM_MAP[team]) {
      return res.status(400).json({
        error: "Missing or invalid 'team'. Example: ?team=LAL"
      });
    }

    const slug = ESPN_TEAM_MAP[team];
    const url = `https://www.espn.com/nba/team/roster/_/name/${team.toLowerCase()}/${slug}`;

    const { data } = await axios.get(url, { timeout: 9000 });
    const $ = cheerio.load(data);

    let players = [];

    // ESPN roster table rows
    $("table tbody tr").each((i, row) => {
      const cols = $(row).find("td");
      if (cols.length < 5) return;

      players.push({
        number: $(cols[0]).text().trim(),
        name: $(cols[1]).text().trim(),
        position: $(cols[2]).text().trim(),
        age: $(cols[3]).text().trim(),
        height: $(cols[4]).text().trim(),
        weight: $(cols[5]).text().trim(),
      });
    });

    res.status(200).json({
      team,
      teamSlug: slug,
      updatedAt: new Date().toISOString(),
      count: players.length,
      players
    });

  } catch (err) {
    res.status(500).json({
      error: "ESPN roster fetch failed",
      detail: String(err)
    });
  }
};
