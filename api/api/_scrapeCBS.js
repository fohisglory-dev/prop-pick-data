// api/_scrapeCBS.js
// Hybrid CBS scraper: league page first, then team pages for deeper notes.

const axios = require("axios");
const cheerio = require("cheerio");

// Converts "Los Angeles Lakers" → "LAL"
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

// SCRAPE TEAM DETAIL PAGE FOR FULL NOTES
async function scrapeTeamDetail(url) {
  try {
    const { data } = await axios.get(url, { timeout: 8000 });
    const $ = cheerio.load(data);

    const rows = $(".TableBase-body tr");
    let injuries = [];

    rows.each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length < 4) return;

      injuries.push({
        player: $(tds[0]).text().trim(),
        position: $(tds[1]).text().trim(),
        injury: $(tds[2]).text().trim(),
        status: $(tds[3]).text().trim(),
        notes: $(tds[4]).text().trim() || null
      });
    });

    return injuries;
  } catch (err) {
    return [];
  }
}

// SCRAPE MAIN CBS LEAGUE PAGE
async function scrapeLeague(league) {
  const url = `https://www.cbssports.com/${league}/injuries/`;

  const { data } = await axios.get(url, { timeout: 8000 });
  const $ = cheerio.load(data);

  let results = [];

  $(".TableBase-body tr").each((_, row) => {
    const tds = $(row).find("td");
    if (tds.length < 5) return;

    const teamName = $(tds[0]).text().trim();
    const team = TEAM_ABBR[teamName] || null;

    const entry = {
      team,
      teamName,
      player: $(tds[1]).text().trim(),
      position: $(tds[2]).text().trim(),
      injury: $(tds[3]).text().trim(),
      status: $(tds[4]).text().trim(),
      updated: $(tds[5]).text().trim(),
      notes: null,
      detailUrl: $(tds[1]).find("a").attr("href") || null
    };

    results.push(entry);
  });

  // HYBRID STEP — fetch detailed notes for Q/O/D only
  for (let r of results) {
    if (!["Out", "Questionable", "Doubtful"].includes(r.status)) continue;

    if (!r.team) continue;

    const teamUrl = `https://www.cbssports.com/${league}/teams/${r.team.toLowerCase()}/x/injuries/`;

    const deepData = await scrapeTeamDetail(teamUrl);

    // match by player name
    const match = deepData.find((d) => d.player === r.player);
    if (match && match.notes) {
      r.notes = match.notes;
    }
  }

  return results;
}

module.exports = { scrapeLeague };
