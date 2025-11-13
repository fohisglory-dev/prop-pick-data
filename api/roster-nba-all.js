// api/roster-nba-all.js
// Calls your existing /api/roster-nba endpoint for every NBA team,
// and aggregates the results. If one team fails, it is logged in `errors`
// but does NOT crash the whole response.

const axios = require("axios");

// Teams that your /api/roster-nba?team=XXX endpoint understands
const TEAMS = [
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE",
  "DAL", "DEN", "DET", "GSW", "HOU", "IND",
  "LAC", "LAL", "MEM", "MIA", "MIL", "MIN",
  "NOP", "NYK", "OKC", "ORL", "PHI", "PHX",
  "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
];

module.exports = async (req, res) => {
  try {
    // Figure out the base URL of THIS deployment so we can call /api/roster-nba
    const host =
      process.env.VERCEL_URL ||
      req.headers.host || // fallback for local dev
      "localhost:3000";

    const baseUrl = host.startsWith("http")
      ? host
      : `https://${host}`;

    const teams = [];
    const errors = [];

    for (const team of TEAMS) {
      const url = `${baseUrl}/api/roster-nba?team=${team}`;

      try {
        const { data } = await axios.get(url, { timeout: 15000 });
        teams.push(data);
      } catch (err) {
        errors.push({
          team,
          status: err.response?.status || null,
          message: err.response?.data || String(err),
        });
      }
    }

    res.status(200).json({
      updatedAt: new Date().toISOString(),
      teamCount: teams.length,
      teams,
      errors, // will be [] if everything worked
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch all NBA rosters",
      detail: String(err),
    });
  }
};
