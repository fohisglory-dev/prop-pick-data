
const axios = require("axios");

const GAMELOG_URL =
  "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes";

const SUMMARY_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary";

const client = axios.create({
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0" }
});

// Convert ESPN values to numbers without treating missing values as zero.
function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  // Handle minutes formatted as MM:SS.
  if (typeof value === "string" && /^\d+:\d{1,2}$/.test(value)) {
    const [minutes, seconds] = value.split(":").map(Number);
    return minutes + seconds / 60;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, decimals = 2) {
  return value === null || !Number.isFinite(value)
    ? null
    : Number(value.toFixed(decimals));
}

function average(values) {
  const valid = values.filter(Number.isFinite);

  if (!valid.length) return null;

  return round(
    valid.reduce((sum, value) => sum + value, 0) / valid.length
  );
}

function standardDeviation(values) {
  const valid = values.filter(Number.isFinite);

  if (!valid.length) return null;

  const mean = average(valid);
  const variance =
    valid.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    valid.length;

  return round(Math.sqrt(variance));
}

function getAttemptedValue(value) {
  if (value === null || value === undefined) return null;

  // ESPN commonly formats these as "made-attempted".
  const match = String(value).match(/^\s*\d+\s*-\s*(\d+)\s*$/);

  return match ? Number(match[1]) : null;
}

function getGameStat(game, stat) {
  switch (stat) {
    case "points":
      return toNumber(game.points);

    case "rebounds":
      return toNumber(game.rebounds);

    case "assists":
      return toNumber(game.assists);

    case "steals":
      return toNumber(game.stats?.steals);

    case "blocks":
      return toNumber(game.stats?.blocks);

    case "turnovers":
      return toNumber(game.stats?.turnovers);

    case "pra": {
      const points = toNumber(game.points);
      const rebounds = toNumber(game.rebounds);
      const assists = toNumber(game.assists);

      if (
        points === null ||
        rebounds === null ||
        assists === null
      ) return null;

      return points + rebounds + assists;
    }

    default:
      return null;
  }
}

function analyzeProp(games, stat, line, direction) {
  const results = {};

  for (const period of [5, 10]) {
    const sample = games.slice(0, period);

    const outcomes = sample
      .map(game => ({
        game,
        value: getGameStat(game, stat)
      }))
      .filter(item => item.value !== null);

    const values = outcomes.map(item => item.value);
    const margins = values.map(value => value - line);

    let wins = 0;
    let losses = 0;
    let pushes = 0;

    for (const value of values) {
      if (value === line) {
        pushes++;
      } else if (
        direction === "over"
          ? value > line
          : value < line
      ) {
        wins++;
      } else {
        losses++;
      }
    }

    const decided = wins + losses;

    results[`last${period}`] = {
      gamesAvailable: sample.length,
      gamesWithStat: values.length,
      line,
      direction,
      wins,
      losses,
      pushes,
      hitRate: decided
        ? round((wins / decided) * 100, 1)
        : null,
      average: average(values),
      averageMargin: average(margins),
      standardDeviation: standardDeviation(values),
      gameResults: outcomes.map(({ game, value }) => ({
        date: game.date,
        opponent: game.opponent,
        value,
        margin: round(value - line)
      }))
    };
  }

  return {
    stat,
    line,
    direction,
    calculationNote:
      "Hit rate excludes pushes. Average margin is actual result minus the line. Standard deviation is population standard deviation.",
    ...results
  };
}

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

    const requestedStat = String(req.query.stat || "")
      .trim()
      .toLowerCase();

    const requestedDirection = String(req.query.direction || "over")
      .trim()
      .toLowerCase();

    const hasLine =
      req.query.line !== undefined &&
      req.query.line !== "";

    const supportedStats = [
      "points",
      "rebounds",
      "assists",
      "pra",
      "steals",
      "blocks",
      "turnovers"
    ];

    if (!/^\d+$/.test(athleteId)) {
      return res.status(400).json({
        error: "A valid ESPN playerId is required."
      });
    }

    if (requestedStat || hasLine) {
      const line = Number(req.query.line);

      if (!requestedStat || !hasLine) {
        return res.status(400).json({
          error: "Provide both stat and line to request prop analysis."
        });
      }

      if (!supportedStats.includes(requestedStat)) {
        return res.status(400).json({
          error: "Unsupported stat.",
          supportedStats
        });
      }

      if (!Number.isFinite(line)) {
        return res.status(400).json({
          error: "Line must be a valid number."
        });
      }

      if (!["over", "under"].includes(requestedDirection)) {
        return res.status(400).json({
          error: "Direction must be over or under."
        });
      }
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

        const pointsValue = toNumber(getStat("points"));

        if (pointsValue === null) continue;

        games.push({
          eventId: event.eventId,
          date: event.gameDate || null,
          opponent: event.opponent || null,
          playerTeam,
          points: pointsValue,
          minutes: getStat("minutes"),
          rebounds: getStat("totalRebounds"),
          assists: getStat("assists"),
          stats: values,
          fga: getAttemptedValue(
            getStat("fieldGoalsMade-fieldGoalsAttempted")
          ),
          fta: getAttemptedValue(
            getStat("freeThrowsMade-freeThrowsAttempted")
          )
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
        if (!game.opponent) game.opponent = detail.opponent;

        game.teams = detail.teams;
      });
    }

    const summarize = items => ({
      count: items.length,
      pointsAverage: average(
        items.map(game => toNumber(game.points))
      ),
      minutesAverage: average(
        items.map(game => toNumber(game.minutes))
      ),
      reboundsAverage: average(
        items.map(game => toNumber(game.rebounds))
      ),
      assistsAverage: average(
        items.map(game => toNumber(game.assists))
      ),
      fgaAverage: average(
        items.map(game => game.fga)
      ),
      ftaAverage: average(
        items.map(game => game.fta)
      ),
      games: items
    });

    const last5 = games.slice(0, 5);
    const last10 = games.slice(0, 10);

    const response = {
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
    };

    if (requestedStat && hasLine) {
      response.propAnalysis = analyzeProp(
        games,
        requestedStat,
        Number(req.query.line),
        requestedDirection
      );
    }

    return res.status(200).json(response);

  } catch (err) {
    return res.status(500).json({
      error: "ESPN player game log failed",
      detail: String(err.message || err)
    });
  }
};
