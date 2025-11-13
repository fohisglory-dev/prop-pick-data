// api/injuries-all.js
// Merges NBA + NFL injury data using the real scrapers

const scrapeNBA = require("./injuries-nba");
const scrapeNFL = require("./injuries-nfl");

module.exports = async (req, res) => {
  try {
    const leaguesParam = req.query.leagues || "nba,nfl";

    const leagues = leaguesParam
      .split(",")
      .map((l) => l.trim().toLowerCase())
      .filter((l) => ["nba", "nfl"].includes(l));

    if (leagues.length === 0) {
      return res.status(400).json({
        error: "Invalid 'leagues' param. Use nba,nfl or a single league."
      });
    }

    let nbaData = [];
    let nflData = [];

    // Fetch NBA injuries
    if (leagues.includes("nba")) {
      try {
        nbaData = await scrapeNBA();
      } catch (err) {
        console.error("NBA scrape failed:", err);
      }
    }

    // Fetch NFL injuries
    if (leagues.includes("nfl")) {
      try {
        nflData = await scrapeNFL();
      } catch (err) {
        console.error("NFL scrape failed:", err);
      }
    }

    const all = [...nbaData, ...nflData];

    res.status(200).json({
      leagues,
      updatedAt: new Date().toISOString(),
      totalCount: all.length,
      byLeague: {
        nba: { count: nbaData.length, injuries: nbaData },
        nfl: { count: nflData.length, injuries: nflData }
      },
      injuries: all
    });

  } catch (err) {
    res.status(500).json({
      error: "Server error",
      detail: String(err)
    });
  }
};
