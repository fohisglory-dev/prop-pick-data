
const axios = require("axios");

const TEAM_ABBREVIATIONS = {
  "1": "ATL", "2": "BUF", "3": "CHI", "4": "CIN",
  "5": "CLE", "6": "DAL", "7": "DEN", "8": "DET",
  "9": "GB", "10": "TEN", "11": "IND", "12": "KC",
  "13": "LV", "14": "LAR", "15": "MIA", "16": "MIN",
  "17": "NE", "18": "NO", "19": "NYG", "20": "NYJ",
  "21": "PHI", "22": "ARI", "23": "PIT", "24": "LAC",
  "25": "SF", "26": "SEA", "27": "TB", "28": "WSH",
  "29": "CAR", "30": "JAX", "33": "BAL", "34": "HOU"
};

async function fetchNBA() {
  const url =
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";

  const { data } = await axios.get(url, { timeout: 10000 });
  const injuries = [];

  for (const team of data.injuries || []) {
    for (const player of team.injuries || []) {
      const athlete = player.athlete || {};

      injuries.push({
        league: "nba",
        team: athlete.team?.abbreviation || null,
        teamName: athlete.team?.displayName || team.displayName || null,
        player: athlete.displayName || null,
        position: athlete.position?.abbreviation || null,
        injury: player.shortComment || player.longComment || null,
        status: player.status || null,
        date: player.date || null
      });
    }
  }

  return injuries;
}

async function fetchNFL() {
  const url =
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";

  const { data } = await axios.get(url, { timeout: 10000 });
  const injuries = [];

  for (const team of data.injuries || []) {
    for (const player of team.injuries || []) {
      const athlete = player.athlete || {};

      injuries.push({
        league: "nfl",
        team: TEAM_ABBREVIATIONS[String(team.id)] || null,
        teamName: team.displayName || null,
        player: athlete.displayName || null,
        position: athlete.position?.abbreviation || null,
        injury: player.shortComment || player.longComment || null,
        status: player.status || null,
        date: player.date || null
      });
    }
  }

  return injuries;
}

module.exports = async (req, res) => {
  try {
    const requested = String(
      req.query.leagues || req.query.league || "all"
    ).toLowerCase();

    let nba = [];
    let nfl = [];

    if (requested === "all" || requested === "nba") {
      nba = await fetchNBA();
    }

    if (requested === "all" || requested === "nfl") {
      nfl = await fetchNFL();
    }

    if (!["all", "nba", "nfl"].includes(requested)) {
      return res.status(400).json({
        error: "Invalid league",
        allowed: ["nba", "nfl", "all"]
      });
    }

    const all = [...nba, ...nfl];

    return res.status(200).json({
      updatedAt: new Date().toISOString(),
      total: all.length,
      byLeague: {
        nba: { count: nba.length, injuries: nba },
        nfl: { count: nfl.length, injuries: nfl }
      },
      injuries: all
    });

  } catch (err) {
    console.error("Combined injury API error:", err.message);

    return res.status(500).json({
      error: "Combined API error",
      detail: err.message
    });
  }
};
