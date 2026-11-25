const axios = require("axios");

const PROVIDER_URL = "https://prizepicksapi.com/api/v1/projections";
const DEFAULT_MAX_PAGES = 5;
const HARD_MAX_PAGES = 10;
const PAGE_LIMIT = 100;

// Stable identity for a projection. Provider IDs are preferred; the composite
// fallback is used only when an ID is absent, and is reported in the response.
function projectionKey(item) {
  const id = item?.id ?? item?.source_projection_id;
  if (id !== null && id !== undefined && String(id).trim()) {
    return "id:" + String(id);
  }

  const player = item?.player?.id || item?.player?.name || "unknown-player";
  const event = item?.event?.id || item?.event?.starts_at || "unknown-event";
  const market = item?.market?.id || item?.market?.stat || "unknown-market";
  const line = item?.line ?? "unknown-line";
  const tier = item?.source_fields?.odds_type || item?.pricing?.odds_type || "unknown-tier";
  return ["composite", player, event, market, line, tier].join("|");
}

function firstValue(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== "");
}

function getPlayerName(item) {
  return firstValue(item?.player?.name, item?.player?.display_name, item?.player_name, item?.name, null);
}

function getPlayerId(item) {
  return firstValue(item?.player?.id, item?.player_id, null);
}

function getTeam(item) {
  return firstValue(item?.player?.team, item?.player?.team_abbreviation, item?.team, null);
}

function getOpponent(item) {
  return firstValue(item?.event?.opponent, item?.opponent, item?.event?.opponent_team, null);
}

function getMatchup(item) {
  const homeAwayTeams = item?.event?.teams || item?.teams || [];
  if (Array.isArray(homeAwayTeams) && homeAwayTeams.length >= 2) {
    const names = homeAwayTeams.map(team =>
      typeof team === "string" ? team : firstValue(team?.abbreviation, team?.name, team?.display_name)
    ).filter(Boolean);
    if (names.length >= 2) return names.slice(0, 2).sort().join(" @ ");
  }

  const team = getTeam(item);
  const opponent = getOpponent(item);
  if (team && opponent) return [String(team), String(opponent)].sort().join(" @ ");

  return firstValue(item?.event?.name, item?.event?.description, item?.matchup, null);
}

function getTier(item) {
  return String(firstValue(
    item?.source_fields?.odds_type,
    item?.pricing?.odds_type,
    item?.odds_type,
    item?.tier,
    ""
  )).toLowerCase();
}

function isStandard(item) {
  const tier = getTier(item);
  return tier === "standard" || tier === "standard_line" || tier === "normal";
}

function uniqueSorted(values) {
  return [...new Set(values.filter(value => value !== null && value !== undefined && String(value).trim() !== "").map(String))].sort();
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
      allowedMethods: ["GET"]
    });
  }

  const apiKey = process.env.PRIZEPICKS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "Missing PRIZEPICKS_API_KEY environment variable"
    });
  }

  const league = String(req.query.league || "NBA").toUpperCase();
  if (league !== "NBA") {
    return res.status(400).json({
      success: false,
      error: "This endpoint currently supports NBA only."
    });
  }

  const requestedPages = Number(req.query.maxPages ?? DEFAULT_MAX_PAGES);
  if (!Number.isInteger(requestedPages) || requestedPages < 1 || requestedPages > HARD_MAX_PAGES) {
    return res.status(400).json({
      success: false,
      error: "maxPages must be an integer from 1 to " + HARD_MAX_PAGES,
      defaultMaxPages: DEFAULT_MAX_PAGES,
      hardMaxPages: HARD_MAX_PAGES
    });
  }

  const requestedLimit = Number(req.query.limit ?? PAGE_LIMIT);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > PAGE_LIMIT) {
    return res.status(400).json({
      success: false,
      error: "limit must be an integer from 1 to " + PAGE_LIMIT
    });
  }

  const startedAt = new Date().toISOString();
  const pageAudit = [];
  const recordsByKey = new Map();
  const playerNames = new Set();
  const playerIds = new Set();
  const matchupSet = new Set();
  const standardProjectionKeys = new Set();
  const markets = new Set();

  let cursor = req.query.cursor ? String(req.query.cursor) : null;
  const initialCursor = cursor;
  let finalCursor = cursor;
  let providerObservation = null;
  let providerSourceStatus = null;
  let providerMode = null;
  let demoData = false;
  let stopReason = "max_pages_reached";
  let apiError = null;
  let rawRecordCount = 0;
  let fallbackKeyCount = 0;

  try {
    for (let page = 1; page <= requestedPages; page++) {
      const params = { league, view: "compact", limit: requestedLimit };
      if (cursor) params.cursor = cursor;

      let response;
      try {
        response = await axios.get(PROVIDER_URL, {
          params,
          timeout: 20000,
          headers: {
            Authorization: "Bearer " + apiKey,
            Accept: "application/json"
          }
        });
      } catch (error) {
        apiError = {
          page,
          providerStatus: error.response?.status || null,
          detail: error.response?.data || error.message
        };
        stopReason = "provider_request_failed";
        break;
      }

      const result = response.data || {};
      const pageData = Array.isArray(result.data) ? result.data : [];
      const meta = result.meta || {};
      rawRecordCount += pageData.length;

      demoData = demoData || meta.is_demo === true || pageData.some(item => item?.is_demo === true);
      providerObservation = firstValue(meta.observed_at, meta.fetched_at, providerObservation);
      providerSourceStatus = firstValue(meta.source_status, providerSourceStatus);
      providerMode = firstValue(meta.mode, providerMode);

      let newUnique = 0;
      let duplicateCount = 0;
      for (const item of pageData) {
        const key = projectionKey(item);
        if (key.startsWith("composite|")) fallbackKeyCount++;

        if (recordsByKey.has(key)) {
          duplicateCount++;
        } else {
          recordsByKey.set(key, item);
          newUnique++;
        }
      }

      const nextCursor = firstValue(meta.next_cursor, result.next_cursor, null);
      pageAudit.push({
        page,
        records: pageData.length,
        uniqueRecordsAdded: newUnique,
        duplicates: duplicateCount,
        cursorSupplied: cursor,
        nextCursorReturned: nextCursor
      });

      if (!nextCursor) {
        cursor = null;
        finalCursor = null;
        stopReason = "pagination_complete";
        break;
      }

      const normalizedNext = String(nextCursor);
      if (normalizedNext === cursor) {
        finalCursor = normalizedNext;
        stopReason = "repeated_cursor";
        break;
      }

      cursor = normalizedNext;
      finalCursor = normalizedNext;

      if (page === requestedPages) {
        stopReason = "max_pages_reached";
      }
    }

    const records = [...recordsByKey.values()];
    for (const item of records) {
      const playerName = getPlayerName(item);
      const playerId = getPlayerId(item);
      const matchup = getMatchup(item);
      const market = firstValue(item?.market?.stat, item?.market?.name, item?.stat_type, item?.stat, null);

      if (playerName) playerNames.add(String(playerName));
      if (playerId) playerIds.add(String(playerId));
      if (matchup) matchupSet.add(String(matchup));
      if (market) markets.add(String(market));
      if (isStandard(item)) standardProjectionKeys.add(projectionKey(item));
    }

    const gameCoverage = {};
    for (const item of records) {
      const matchup = getMatchup(item);
      if (!matchup) continue;

      if (!gameCoverage[matchup]) {
        gameCoverage[matchup] = {
          matchup,
          projections: 0,
          standardProjections: 0,
          players: []
        };
      }

      gameCoverage[matchup].projections++;
      if (isStandard(item)) gameCoverage[matchup].standardProjections++;

      const player = getPlayerName(item);
      if (player && !gameCoverage[matchup].players.includes(String(player))) {
        gameCoverage[matchup].players.push(String(player));
      }
    }

    for (const entry of Object.values(gameCoverage)) {
      entry.players.sort();
      entry.uniquePlayers = entry.players.length;
      delete entry.players;
    }

    const complete = stopReason === "pagination_complete" && !finalCursor && !apiError;
    const status = complete ? "COMPLETE" : "PARTIAL";

    return res.status(200).json({
      success: !apiError,
      isDemo: demoData,
      league,
      fetchedAt: new Date().toISOString(),
      scanStartedAt: startedAt,
      providerObservation,
      providerSourceStatus,
      providerMode,
      status,
      complete,
      stopReason,
      request: {
        maxPages: requestedPages,
        pageLimit: requestedLimit,
        initialCursor
      },
      pagination: {
        pagesRequested: pageAudit.length,
        recordsRetrieved: rawRecordCount,
        uniqueProjections: records.length,
        duplicates: rawRecordCount - records.length,
        fallbackCompositeKeys: fallbackKeyCount,
        nextCursor: finalCursor
      },
      coverage: {
        uniquePlayersByName: playerNames.size,
        uniquePlayerIds: playerIds.size,
        uniqueMatchups: matchupSet.size,
        uniqueMarkets: markets.size,
        standardProjections: standardProjectionKeys.size,
        matchups: Object.values(gameCoverage).sort((a, b) => a.matchup.localeCompare(b.matchup))
      },
      pageAudit,
      data: records,
      error: apiError,
      notice: demoData
        ? "DEMO DATA ONLY. These are fictional projections, not live PrizePicks lines."
        : null
    });
  } catch (error) {
    console.error("PrizePicks board scan error:", error.message || error);
    return res.status(500).json({
      success: false,
      status: "PARTIAL",
      error: "PrizePicks board scan failed",
      detail: String(error.message || error),
      pageAudit,
      pagesRetrieved: pageAudit.length,
      nextCursor: finalCursor
    });
  }
};
