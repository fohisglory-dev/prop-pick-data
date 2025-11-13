// api/_scrapeCBS.js
// Updated CBS scraper using new React table markup

const axios = require("axios");
const cheerio = require("cheerio");

// TEAM NAMES → ABBR
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


// SCRAPE LEAGUE PAGE
async function scrapeLeague(league) {
  try {
    const url = `https://www.cbssports.com/${league}/injuries/`;
    const { data } = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(data);

    let results = [];

    // NEW CBS STRUCTURE:
    // rows = ".TableBase-tableRow"
    $(".TableBase-tableRow").each((_, row) => {
      const tds = $(row).find(".TableBase-bodyTd");
      if (tds.length < 5) return;

      const teamName = $(tds[0]).text().trim();
      const player = $(tds[1]).text().trim();
      const position = $(tds[2]).text().trim();
      const injury = $(tds[3]).text().trim();
      const status = $(tds[4]).text().trim();
      const updated = $(tds[5]).text().trim();

      results.push({
        team: TEAM_ABBR[teamName] || null,
        teamName,
        player,
        position,
        injury,
        status,
        updated,
        notes: null
      });
    });

    return results;
  } catch (err) {
    console.error("CBS SCRAPE FAILED:", err);
    return [];
  }
}

module.exports = { scrapeLeague };
