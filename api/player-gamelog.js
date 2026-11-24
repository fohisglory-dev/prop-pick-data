
const axios = require("axios");

module.exports = async (req, res) => {
  try {
    const athleteId = String(req.query.playerId || "").trim();
    const season = String(req.query.season || "2027").trim();

    if (!/^\d+$/.test(athleteId)) {
      return res.status(400).json({
        error: "A valid ESPN playerId is required."
      });
    }

    const url =
      `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${athleteId}/gamelog?season=${season}`;

    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const labels = data.names || [];
    const displayNames = data.displayNames || [];
    const games = [];
    const seen = new Set();

    const categories = (data.seasonTypes || [])
      .flatMap(type => type.categories || []);

    for (const category of categories) {
      for (const event of category.events || []) {
        if (!event.eventId || seen.has(event.eventId)) continue;
        seen.add(event.eventId);

        const values = {};

        labels.forEach((label, index) => {
          values[label] = event.stats?.[index] ?? null;
        });

        const pointsIndex = labels.indexOf("points");
        const minutesIndex = labels.indexOf("minutes");
        const reboundsIndex = labels.indexOf("totalRebounds");
        const assistsIndex = labels.indexOf("assists");

        games.push({
          eventId: event.eventId,
          date: event.gameDate || null,
          opponent: event.opponent || null,
          points: pointsIndex >= 0
            ? Number(event.stats?.[pointsIndex])
            : null,
          minutes: minutesIndex >= 0
            ? event.stats?.[minutesIndex] ?? null
            : null,
          rebounds: reboundsIndex >= 0
            ? Number(event.stats?.[reboundsIndex])
            : null,
          assists: assistsIndex >= 0
            ? Number(event.stats?.[assistsIndex])
            : null,
          stats: values
        });
      }
    }

    const validGames = games.filter(game =>
      Number.isFinite(game.points)
    );

    const average = (items, key) => {
      const values = items
        .map(game => Number(game[key]))
        .filter(Number.isFinite);

      return values.length
        ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2))
        : null;
    };

    const last5 = validGames.slice(0, 5);
    const last10 = validGames.slice(0, 10);

    return res.status(200).json({
      playerId: athleteId,
      season,
      updatedAt: new Date().toISOString(),
      labels,
      displayNames,
      gameCount: validGames.length,
      last5: {
        count: last5.length,
        pointsAverage: average(last5, "points"),
        minutesAverage: average(last5, "minutes"),
        reboundsAverage: average(last5, "rebounds"),
        assistsAverage: average(last5, "assists"),
        games: last5
      },
      last10: {
        count: last10.length,
        pointsAverage: average(last10, "points"),
        minutesAverage: average(last10, "minutes"),
        reboundsAverage: average(last10, "rebounds"),
        assistsAverage: average(last10, "assists"),
        games: last10
      },
      games: validGames
    });

  } catch (err) {
    return res.status(500).json({
      error: "ESPN player game log failed",
      detail: String(err)
    });
  }
};
