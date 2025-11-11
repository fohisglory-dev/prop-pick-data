// api/injuries.js
// Minimal serverless endpoint so your GPT can call it.
// Later we can replace `players` with real CBS-scraped data.

module.exports = async (req, res) => {
  try {
    const { league } = req.query;
    const allowed = ['nba', 'nfl'];

    if (!league || !allowed.includes(String(league).toLowerCase())) {
      res.status(400).json({
        error: "Missing or invalid 'league' query param. Use 'nba' or 'nfl'.",
      });
      return;
    }

    // Placeholder payload – proves the route works.
    res.status(200).json({
      league: String(league).toLowerCase(),
      updatedAt: new Date().toISOString(),
      source: 'CBS (proxy endpoint placeholder)',
      players: [], // will populate with real data next
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: String(err) });
  }
};
