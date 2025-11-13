// api/_scrapeCBS.js
// SAFE + UPDATED CBS HYBRID SCRAPER (won’t crash when CBS structure changes)

const axios = require("axios");
const cheerio = require("cheerio");

// Team name → abbreviation map
const TEAM_ABBR = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "LA Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS"
};

// Safe getter
const safe = (arr, i, $) => {
  if (!arr[i]) return null;
  return $(arr[i]).text().trim();
};

// SCRAPE TEAM DETAIL PAGE FOR NOTES
async function scrapeTeamDetail(url) {
  try {
    const { data } = await axios.get(url, { timeout: 8000 });
    const $ = cheerio.load(data);

    let injuries = [];

    $(".TableBase-body tr").each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length < 3) return;

      injuries.push({
        player: safe(tds, 0, $),
        position: safe(tds, 1, $),
        injury: safe(tds, 2, $),
        status: safe(tds, 3, $),
        notes: safe(tds, 4, $)
      });
    });

    return injuries;
  } catch {
    return [];
  }
}

// MAIN CBS SCRAPER
async function scrapeLeague(league) {
  const url = `https://www.cbssports.com/${league}/injuries/`;

  const { data } = await axios.get(url, { timeout: 8000 });
  const $ = cheerio.load(data);

  let results = [];

  $(".TableBase-body tr").each((_, row) => {
    const tds = $(row).find("td");
    if (tds.length < 3) return; // ignore garbage rows

    const teamName = safe(tds, 0, $);
    const team = TEAM_ABBR[teamName] || null;

    results.push({
      team,
      teamName,
      player: safe(tds, 1, $),
      position: safe(tds, 2, $),
      injury: safe(tds, 3, $),
      status: safe(tds, 4, $),
      updated: safe(tds, 5, $),
      notes: null,
      detailUrl: tds[1] ? $(tds[1]).find("a").attr("href") || null : null
    });
  });

  // HYBRID: get deeper notes on Q/O/D players
  for (let r of results) {
    if (!["Out", "Questionable", "Doubtful"].includes(r.status)) continue;
    if (!r.team) continue;

    const teamUrl = `https://www.cbssports.com/${league}/teams/${r.team.toLowerCase()}/x/injuries/`;
    const deep = await scrapeTeamDetail(teamUrl);

    const match = deep.find((d) => d.player === r.player);
    if (match?.notes) r.notes = match.notes;
  }

  return results;
}

module.exports = { scrapeLeague };
