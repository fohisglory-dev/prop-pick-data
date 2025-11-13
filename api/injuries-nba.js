const axios = require("axios");

const TEAMS = [
  "atl","bos","bkn","cha","chi","cle","dal","den","det","gsw",
  "hou","ind","lac","lal","mem","mia","mil","min","nop","nyk",
  "okc","orl","phi","phx","por","sac","sas","tor","uta","was"
];

module.exports = async (req, res) => {
  try {
    let injuries = [];

    for (const team of TEAMS) {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team}/injuries`;

      try {
        const { data } = await axios.get(url, { timeout: 8000 });

        const items = data?.injuries || [];

        for (const inj of items) {
          injuries.push({
            player: inj?.athlete?.displayName || null,
            team: inj?.team?.abbreviation || team.toUpperCase(),
            teamName: inj?.team?.displayName || null,
            position: inj?.athlete?.position?.abbreviation || null,
            injury: inj?.details?.[0]?.shortComment || inj?.status || null,
            status: inj?.details?.[0]?.type || null,
            date: inj?.details?.[0]?.date || null
          });
        }
      } catch (err) {
        console.warn(`ESPN team failed: ${team}`, err.message);
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
