// api/roster-nba-all.js
// Fetches rosters for ALL NBA teams with a small delay per team
// Example: /api/roster-nba-all
// Optional: /api/roster-nba-all?delayMs=150

const { ESPN_TEAM_MAP, fetchNBATeamRoster } = require("./_espnRoster");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = async (req, res) => {
  try {
    // Allow overriding delay via query param for testing,
    // but default to 150ms to avoid ESPN rate limits
    const delayMs = Number(req.query.delayMs || "150");
    const teams = Object.keys(ESPN_TEAM_MAP);

    const allTeams = [];
    const errors = [];

    for (const team of teams) {
      try {
        const roster = await fetchNBATeamRoster(team);
        allTeams.push(roster);
      } catch (err) {
        // We don't want one failure to kill the whole response
        errors.push({ team, error: String(err) });
      }

      // Throttle requests so ESPN doesn't block us
      await sleep(delayMs);
    }

    return res.status(200).json({
      updatedAt: new Date().toISOString(),
      teamCount: teams.length,
      errors,    // if you want you can remove this later
      teams: allTeams
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to fetch all NBA rosters",
      detail: String(err)
    });
  }
};
