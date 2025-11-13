// api/injuries-nfl.js

const { scrapeLeague } = require("./_scrapeCBS");

module.exports = async (req, res) => {
  try {
    const injuries = await scrapeLeague("nfl");

    res.status(200).json({
      league: "nfl",
      updatedAt: new Date().toISOString(),
      count: injuries.length,
      injuries
    });
  } catch (err) {
    res.status(500).json({ error: "NFL scraper failed", detail: String(err) });
  }
};
