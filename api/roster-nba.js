// api/roster-nba.js
// GET /api/roster-nba?team=LAL

const { getTeamRoster } = require("./_espnRoster");

module.exports = async (req, res) => {
  try {
    const team = (req.query.team || "").toUpperCase();

    if (!team) {
      return res.status(400).json({
        error: "Missing 'team' query param. Example: /api/roster-nba?team=LAL",
      });
    }

    const data = await getTeamRoster(team);
    res.status(200).json(data);
  } catch (err) {
    if (String(err.message || "").startsWith("Invalid NBA team code")) {
      return res.status(400).json({ error: err.message });
    }

    console.error("ESPN roster error:", err);
    res.status(500).json({
      error: "ESPN roster fetch failed",
      detail: String(err),
    });
  }
};
