// api/injuries-nba.js
const axios = require("axios");

module.exports = async (req, res) => {
  try {
    const url =
      "https://sports.core.api.espn.com/v2/sports/basketball/nba/athletes?injury=true";

    const { data } = await axios.get(url, { timeout: 8000 });

    const injuredList = data.items || [];
    const injuries = [];

    // ESPN links each injured player via /athletes/{id}
    for (const item of injuredList) {
      try {
        const { data: athlete } = await axios.get(item.$ref, { timeout: 8000 });

        injuries.push({
          player: athlete?.fullName || athlete?.displayName || null,

          team: athlete?.team?.abbreviation || null,
          teamName: athlete?.team?.displayName || null,

          position: athlete?.position?.abbreviation || null,

          injury: athlete?.injuries?.[0]?.detail || null,
          status: athlete?.injuries?.[0]?.status || null,
          date: athlete?.injuries?.[0]?.date || null
        });
      } catch (err) {
        console.warn("Error parsing athlete:", err.message);
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
