// api/roster-nba-all.js
// GET /api/roster-nba-all
// Returns cleaned + prop-ready rosters for all 30 NBA teams.

const { ESPN_TEAM_MAP, getTeamRoster } = require("./_espnRoster");

module.exports = async (req, res) => {
  try {
    const teamCodes = Object.keys(ESPN_TEAM_MAP);

    // Use Promise.all but reuse cache so we don't hammer ESPN
    const results = await Promise.all(teamCodes.map((code) => getTeamRoster(code)));

    res.status(200).json({
      updatedAt: new Date().toISOString(),
      teamCount: teamCodes.length,
      totalPlayers: results.reduce((sum, r) => sum + (r.count || 0), 0),
      teams: results,
    });
  } catch (err) {
    console.error("ESPN all-rosters error:", err);
    res.status(500).json({
      error: "Failed to fetch all NBA rosters",
      detail: String(err),
    });
  }
};
