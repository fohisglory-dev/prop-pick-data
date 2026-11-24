
// api/player-lookup.js
// ESPN NBA player search and ID lookup

const axios = require("axios");

module.exports = async (req, res) => {
  try {
    const name = String(req.query.name || "").trim();

    if (!name) {
      return res.status(400).json({
        error: "Missing player name",
        example: "/api/player-lookup?name=Anthony%20Davis"
      });
    }

    const url = "https://site.web.api.espn.com/apis/search/v2";

    const { data } = await axios.get(url, {
      params: {
        query: name,
        limit: 20,
        sport: "basketball"
      },
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const playerResults = (data.results || [])
      .filter(result => result.type === "player")
      .flatMap(result => result.contents || []);

    const nbaPlayers = playerResults
      .filter(player =>
        player.defaultLeagueSlug === "nba" ||
        player.description === "NBA"
      )
      .map(player => {
        const uidMatch = String(player.uid || "").match(/~a:(\d+)/);
        const linkMatch = String(player.link?.web || "")
          .match(/\/id\/(\d+)/);

        return {
          espnId: uidMatch?.[1] || linkMatch?.[1] || null,
          name: player.displayName || null,
          team: player.subtitle || null,
          league: "NBA",
          profileUrl: player.link?.web || null
        };
      })
      .filter(player => player.espnId);

    const normalize = value =>
      String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

    const exactMatches = nbaPlayers.filter(
      player => normalize(player.name) === normalize(name)
    );

    const results = exactMatches.length
      ? exactMatches
      : nbaPlayers;

    return res.status(200).json({
      searchQuery: name,
      league: "NBA",
      matchType: exactMatches.length ? "exact" : "candidates",
      count: results.length,
      players: results
    });

  } catch (error) {
    console.error("ESPN player lookup error:", error);

    return res.status(502).json({
      error: "ESPN player search failed",
      detail: String(error.message || error)
    });
  }
};
