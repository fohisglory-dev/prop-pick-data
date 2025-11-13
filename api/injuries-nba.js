const axios = require("axios");

module.exports = async (req, res) => {
  try {
    const url = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";
    const { data } = await axios.get(url, { timeout: 8000 });

    const injuries = [];

    for (const team of data.injuries) {
      for (const player of team.injuries) {
        injuries.push({
          team: team.team.abbreviation,
          teamName: team.team.displayName,
          player: player.athlete.displayName,
          position: player.athlete.position?.abbreviation || null,
          injury: player.injury?.description || null,
          status: player.injury?.status || null,
          date: player.injury?.date || null,
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
    res.status(500).json({ error: "NBA API failed", detail: String(err) });
  }
};
