// api/injuries-nba.js
const axios = require("axios");

module.exports = async (req, res) => {
  try {
    const url =
      "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";

    const { data } = await axios.get(url, { timeout: 8000 });

    const injuries = [];

    // ESPN feed uses `data.injuries` (array of teams)
    for (const team of data.injuries || []) {
      const teamAbbr = team.team?.abbreviation || null;
      const teamName = team.team?.displayName || null;

      for (const player of team.injuries || []) {
        const ath = player.athlete || {};

        injuries.push({
          team: teamAbbr,
          teamName,

          player: ath.displayName || null,

          // SAFE optional chaining everywhere
          position: ath.position?.abbreviation || null,

          injury: player.injury?.description || null,
          status: player.injury?.status || null,
          date: player.injury?.date || null
        });
      }
    }

    res.status(200).json({
      league: "nba",
      updatedAt: new Date().toISOString(),
      count: injuries.length,
      injuries
    });

  } catch (err) {
    res.status(500).json({
      error: "NBA API failed",
      detail: String(err)
    });
  }
};
