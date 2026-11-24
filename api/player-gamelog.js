
const axios = require("axios");

const GAMELOG_URL =
  "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes";

const SUMMARY_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary";

const client = axios.create({
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0" }
});

async function getGameDetails(eventId, playerTeam) {
  try {
    const { data } = await client.get(SUMMARY_URL, {
      params: { event: eventId }
    });

    const teams = data.boxscore?.teams || [];

    const teamCodes = teams.map(item =>
      item.team?.abbreviation || item.abbreviation || null
    );

    const opponent = teams.find(item => {
      const code = item.team?.abbreviation || item.abbreviation;
      return code &&
        (!playerTeam ||
          code.toUpperCase() !== playerTeam.toUpperCase());
    });

    return {
      date:
        data.header?.competitions?.[0]?.date ||
        data.header?.gameDate ||
        data.gameInfo?.date ||
        null,
      teams: teamCodes,
      opponent:
        opponent?.team?.abbreviation ||
        opponent?.abbreviation ||
        null
    };
  } catch (err) {
    return {
      date: null,
      teams: [],
      opponent: null,
      detail: String(err.message || err)
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

    const { data } = await client.get(
      `${GAMELOG_URL}/${athleteId}/gamelog`,
      { params: { season } }
    );

    const labels = data.names || [];
    const displayNames = data.displayNames || [];
    const games = [];
    const seen = new Set();

    const categories = (data.seasonTypes || [])
      .flatMap(type => type.categories || []);

    for (const category of categories) {
      const playerTeam =
        category.displayTeam ||
        category.team?.abbreviation ||
        null;

      for (const event of category.events || []) {
        if (!event.eventId || seen.has(event.eventId)) continue;
        seen.add(event.eventId);

        const values = {};

        labels.forEach((label, index) => {
          values[label] = event.stats?.[index] ?? null;
        });

        const getStat = name => {
          const index = labels.indexOf(name);
          return index >= 0
            ? event.stats?.[index] ?? null
            : null;
        };

        const pointsValue = getStat("points");

        if (
          pointsValue === null ||
          !Number.isFinite(Number(pointsValue))
        ) continue;

        games.push({
          eventId: event.eventId,
          date: event.gameDate || null,
          opponent: event.opponent || null,
          playerTeam,
          points: Number(pointsValue),
          minutes: getStat("minutes"),
          rebounds: getStat("totalRebounds"),
          assists: getStat("assists"),
          stats: values
        });
      }
    }

    // Enrich missing game dates and opponents.
    const gamesToEnrich = games.slice(0, 30);

    for (let i = 0; i < gamesToEnrich.length; i += 5) {
      const batch = gamesToEnrich.slice(i, i + 5);

      const details = await Promise.all(
        batch.map(game =>
          getGameDetails(game.eventId, game.playerTeam)
        )
      );

      batch.forEach((game, index) => {
        const detail = details[index];

        if (!game.date) game.date = detail.date;

        if (!game.opponent) {
          game.opponent = detail.opponent;
        }

        game.teams = detail.teams;
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

    const summarize = items => ({
      count: items.length,
      pointsAverage: average(items, "points"),
      minutesAverage: average(items, "minutes"),
      reboundsAverage: average(items, "rebounds"),
      assistsAverage: average(items, "assists"),
      games: items
    });

    const last5 = games.slice(0, 5);
    const last10 = games.slice(0, 10);

    return res.status(200).json({
      playerId: athleteId,
      season,
      updatedAt: new Date().toISOString(),
      labels,
      displayNames,
      gameCount: games.length,
      gameDetailsStatus: {
        datesAvailable: games.filter(g => g.date).length,
        opponentsAvailable: games.filter(g => g.opponent).length
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
