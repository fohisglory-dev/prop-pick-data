// api/injuries-nba.js

const { scrapeLeague } = require("./_scrapeCBS");

module.exports = async (req, res) => {
  try {
    const injuries = await scrapeLeague("nba");

    res.status(200).json({
      league: "nba",
      updatedAt: new Date().toISOString(),
      count: injuries.length,
      injuries
    });
  } catch (err) {
    res.status(500).json({ error: "NBA scraper failed", detail: String(err) });
  }
};
