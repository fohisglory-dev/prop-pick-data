// api/injuries-all.js
// Combined NBA + NFL Injury Endpoint (placeholder version)

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

    res.status(200).json({
      leagues,
      updatedAt: new Date().toISOString(),
      source: "CBS (proxy endpoint placeholder)",
      players: [], // Next step: plug in real CBS data
    });

  } catch (err) {
    res.status(500).json({
      error: "Server error",
      detail: String(err),
    });
  }
};
