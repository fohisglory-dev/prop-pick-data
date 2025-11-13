// api/injuries-all.js
// Combined NBA + NFL injuries via CBS scraper

const { scrapeLeague } = require("./_scrapeCBS");

module.exports = async (req, res) => {
  try {
    const leaguesParam = req.query.leagues || "nba,nfl";

    const leagues = leaguesParam
      .split(",")
      .map((l) => l.trim().toLowerCase())
      .filter((l) => ["nba", "nfl"].includes(l));

    if (leagues.length === 0) {
      return res.status(400).json({
        error: "Invalid 'leagues' param. Use nba,nfl or a single league.",
      });
    }

    // Run both scrapers in parallel
    const results = await Promise.all(
      leagues.map((lg) => scrapeLeague(lg))
    );

    const injuries = [];
    const byLeague = {};
    let totalCount = 0;

    leagues.forEach((lg, index) => {
      const list = results[index] || [];
      byLeague[lg] = {
        league: lg,
        count: list.length,
        injuries: list,
      };
      injuries.push(...list.map((p) => ({ league: lg, ...p })));
      totalCount += list.length;
    });

    res.status(200).json({
      leagues,
      updatedAt: new Date().toISOString(),
      source: "CBS Sports (scraped)",
      totalCount,
      byLeague,
      injuries,
    });
  } catch (err) {
    res.status(500).json({
      error: "Server error while scraping combined injuries",
      detail: String(err),
    });
  }
};
