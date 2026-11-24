
// api/roster-nba.js
// GET /api/roster-nba?team=LAL

const { fetchNBATeamRoster } = require("./_espnRoster");

module.exports = async (req, res) => {
  try {
    const team = (req.query.team || "").toUpperCase();

    if (!team) {
      return res.status(400).json({
        error: "Missing 'team' query param. Example: /api/roster-nba?team=LAL"
      });
    }

    const data = await fetchNBATeamRoster(team);

    return res.status(200).json(data);

  } catch (err) {
    if (String(err.message || "").startsWith("Unknown NBA team code")) {
      return res.status(400).json({ error: err.message });
    }

    console.error("ESPN roster error:", err);

    return res.status(500).json({
      error: "ESPN roster fetch failed",
      detail: String(err)
    });
  }
};
