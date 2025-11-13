const axios = require("axios");

async function fetchNBA() {
  const url = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";
  const { data } = await axios.get(url);

  const out = [];
  for (const team of data.injuries) {
    for (const p of team.injuries) {
      out.push({
        league: "nba",
        team: team.team.abbreviation,
        teamName: team.team.displayName,
        player: p.athlete.displayName,
        position: p.athlete.position?.abbreviation || null,
        injury: p.injury?.description || null,
        status: p.injury?.status || null,
        date: p.injury?.date || null,
      });
    }
  }
  return out;
}

async function fetchNFL() {
  const url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";
  const { data } = await axios.get(url);

  const out = [];
  for (const team of data.injuries) {
    for (const p of team.injuries) {
      out.push({
        league: "nfl",
        team: team.team.abbreviation,
        teamName: team.team.displayName,
        player: p.athlete.displayName,
        position: p.athlete.position?.abbreviation || null,
        injury: p.injury?.description || null,
        status: p.injury?.status || null,
        date: p.injury?.date || null,
      });
    }
  }
  return out;
}

module.exports = async (req, res) => {
  try {
    const nba = await fetchNBA();
    const nfl = await fetchNFL();
    const all = [...nba, ...nfl];

    res.status(200).json({
      updatedAt: new Date().toISOString(),
      total: all.length,
      byLeague: {
        nba: { count: nba.length, injuries: nba },
        nfl: { count: nfl.length, injuries: nfl }
      },
      injuries: all
    });

  } catch (err) {
    res.status(500).json({ error: "Combined API error", detail: String(err) });
  }
};
