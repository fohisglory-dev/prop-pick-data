
const axios = require("axios");

const BASE_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

const client = axios.create({
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0" }
});

async function getGameDetails(eventId, playerTeam) {
  try {
    const { data } = await client.get(
      `${BASE_URL}/summary?event=${eventId}`
    );

    const competition =
      data.header?.competitions?.[0] ||
      data.boxscore?.teams?.[0]?.competition ||
      {};

    const competitors = competition.competitors || [];

    const opponent = competitors.find(
      item =>
        item.team?.abbreviation &&
        item.team.abbreviation.toUpperCase() !==
          String(playerTeam || "").toUpperCase()
    );

    return {
      date: competition.date || data.header?.season?.startDate || null,
      opponent: opponent?.team?.abbreviation || null
    };
  } catch (err) {
    return {
      date: null,
      opponent: null
    };
  }
}

module.exports = async (req, res) => {
  try {
    const athleteId = String(req.query.playerId || "").trim();
    const season = String(req.query.season || "2027").trim();

    if (!/^\d+$/.test(athleteId)) {
      return res.status(400).json({
        error: "A valid ESPN playerId is required."
      });
    }

    const [gameLogResponse, athleteResponse] = await Promise.all([
      client.get(
        `${BASE_URL}/athletes/${athleteId}/gamelog?season=${season}`
      ),
      client.get(`${BASE_URL}/athletes/${athleteId}`)
    ]);

    const data = gameLogResponse.data;
    const playerTeam =
      athleteResponse.data.athlete?.team?.abbreviation ||
      athleteResponse.data.team?.abbreviation ||
      null;

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

        const getStat = name => {
          const index = labels.indexOf(name);
          return index >= 0 ? event.stats?.[index] ?? null : null;
        };

        const pointsValue = getStat("points");

        if (
          pointsValue === null ||
          !Number.isFinite(Number(pointsValue))
        ) {
          continue;
        }

        games.push({
          eventId: event.eventId,
          date: event.gameDate || null,
          opponent: event.opponent || null,
          points: Number(pointsValue),
          minutes: getStat("minutes"),
          rebounds: getStat("totalRebounds"),
          assists: getStat("assists"),
          stats: values
        });
      }
    }

    // Retrieve missing dates and opponents from ESPN game summaries.
    const gamesToEnrich = games.slice(0, 30);

    for (let i = 0; i < gamesToEnrich.length; i += 5) {
      const batch = gamesToEnrich.slice(i, i + 5);

      const details = await Promise.all(
        batch.map(game =>
          getGameDetails(game.eventId, playerTeam)
        )
      );

      batch.forEach((game, index) => {
        if (!game.date) {
          game.date = details[index].date;
        }

        if (!game.opponent) {
          game.opponent = details[index].opponent;
        }
      });
    }

    const average = (items, key) => {
      const values = items
        .map(game => Number(game[key]))
        .filter(Number.isFinite);

      return values.length
        ? Number(
            (
              values.reduce((a, b) => a + b, 0) /
              values.length
            ).toFixed(2)
          )
        : null;
    };

    const last5 = games.slice(0, 5);
    const last10 = games.slice(0, 10);

    const summarize = items => ({
      count: items.length,
      pointsAverage: average(items, "points"),
      minutesAverage: average(items, "minutes"),
      reboundsAverage: average(items, "rebounds"),
      assistsAverage: average(items, "assists"),
      games: items
    });

    return res.status(200).json({
      playerId: athleteId,
      playerTeam,
      season,
      updatedAt: new Date().toISOString(),
      labels,
      displayNames,
      gameCount: games.length,
      gameDetailsStatus: {
        datesAvailable: games.filter(game => game.date).length,
        opponentsAvailable: games.filter(game => game.opponent).length
      },
      last5: summarize(last5),
      last10: summarize(last10),
      games
    });

  } catch (err) {
    return res.status(500).json({
      error: "ESPN player game log failed",
      detail: String(err)
    });
  }
};
