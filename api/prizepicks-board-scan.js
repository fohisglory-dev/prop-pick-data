const axios = require("axios");

const PROVIDER_URL = "https://prizepicksapi.com/api/v1/projections";
const DEFAULT_MAX_PAGES = 5;
const HARD_MAX_PAGES = 10;
const PAGE_LIMIT = 100;
const ACTION_BUDGET_MS = 39000;
const RESPONSE_BUDGET_CHARS = 90000;

function firstValue(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== "");
}

function asText(value) {
  if (value && typeof value === "object") {
    return firstValue(value.abbreviation, value.abbr, value.name, value.display_name, value.displayName, value.full_name, value.fullName, null);
  }
  return value === null || value === undefined ? null : String(value);
}

function projectionKey(item) {
  const id = firstValue(item?.id, item?.source_projection_id, null);
  if (id) return "id:" + String(id);
  const player = firstValue(item?.player?.id, item?.player?.name, asText(item?.player), item?.player_id, "unknown-player");
  const event = firstValue(item?.event?.id, item?.event?.starts_at, item?.event?.name, "unknown-event");
  const market = firstValue(item?.market?.id, item?.market?.stat, asText(item?.market), "unknown-market");
  const line = item?.line ?? "unknown-line";
  const tier = item?.source_fields?.odds_type || item?.pricing?.odds_type || "unknown-tier";
  return ["composite", player, event, market, line, tier].join("|");
}

function playerName(item) {
  const player = item?.player;
  return asText(firstValue(
    player?.name,
    player?.display_name,
    player?.displayName,
    player?.full_name,
    player?.fullName,
    player?.label,
    item?.player_name,
    item?.playerName,
    item?.athlete?.name,
    item?.name,
    asText(player),
    null
  ));
}

function playerId(item) {
  return asText(firstValue(item?.player?.id, item?.player_id, item?.athlete?.id, null));
}

function team(item) {
  return asText(firstValue(
    item?.player?.team,
    item?.player?.team_abbreviation,
    item?.player?.teamAbbreviation,
    item?.team,
    item?.team_abbreviation,
    null
  ));
}

function opponent(item) {
  return asText(firstValue(item?.event?.opponent, item?.opponent, item?.event?.opponent_team, null));
}

function matchup(item) {
  const teams = item?.event?.teams || item?.teams || [];
  if (Array.isArray(teams) && teams.length >= 2) {
    const names = teams.map(asText).filter(Boolean);
    if (names.length >= 2) return names.slice(0, 2).sort().join(" @ ");
  }
  const t = team(item);
  const o = opponent(item);
  if (t && o) return [t, o].sort().join(" @ ");
  return asText(firstValue(item?.event?.name, item?.event?.description, item?.matchup, null));
}

function marketName(item) {
  const market = item?.market;
  return asText(firstValue(
    market?.stat,
    market?.name,
    market?.display_name,
    market?.displayName,
    item?.source_fields?.stat_type,
    item?.source_fields?.stat_short,
    item?.stat_type,
    item?.stat,
    asText(market),
    null
  ));
}

function tier(item) {
  return String(firstValue(
    item?.source_fields?.odds_type,
    item?.pricing?.odds_type,
    item?.odds_type,
    item?.tier,
    ""
  )).toLowerCase();
}

function isStandard(item) {
  return ["standard", "standard_line", "normal"].includes(tier(item));
}

function availableSides(item) {
  if (Array.isArray(item?.selections)) {
    const sides = item.selections
      .filter(selection => selection?.available !== false)
      .map(selection => {
        const side = String(selection?.side || "").toLowerCase();
        if (side === "over" || side === "more") return "more";
        if (side === "under" || side === "less") return "less";
        return null;
      })
      .filter(Boolean);
    if (sides.length) return [...new Set(sides)];
  }

  const allowed = String(firstValue(
    item?.source_fields?.allowed_wager_types,
    item?.allowed_wager_types,
    item?.market?.allowed_wager_types,
    ""
  )).toLowerCase().replace(/[^a-z]/g, "");

  const sides = [];
  if (allowed.includes("over") || allowed.includes("more")) sides.push("more");
  if (allowed.includes("under") || allowed.includes("less")) sides.push("less");
  return sides;
}

function makeCompactPayload(items) {
  const players = {};
  const events = {};
  const rows = [];

  for (const item of items) {
    const pId = playerId(item);
    const pName = playerName(item);
    const pKey = pId || pName || "unknown-player";
    const eId = asText(firstValue(item?.event?.id, item?.event?.starts_at, item?.event?.name, null));
    const eKey = eId || ("event-" + rows.length);
    const eMatchup = matchup(item);

    if (!players[pKey]) {
      players[pKey] = [
        pName,
        team(item),
        asText(firstValue(item?.player?.position, item?.position, null))
      ];
    }

    if (!events[eKey]) {
      events[eKey] = [
        asText(firstValue(item?.event?.name, item?.event?.description, null)),
        opponent(item),
        asText(firstValue(item?.event?.starts_at, item?.event?.start_time, null)),
        eMatchup
      ];
    }

    rows.push([
      asText(firstValue(item?.id, item?.source_projection_id, null)),
      pKey,
      eKey,
      marketName(item),
      item?.line ?? null,
      tier(item) || null,
      availableSides(item),
      asText(firstValue(item?.status, item?.source_fields?.source_status, null)),
      Boolean(item?.source_fields?.is_live || item?.source_fields?.in_game || item?.is_live || item?.in_game)
    ]);
  }

  return {
    columns: ["projectionId", "playerKey", "eventKey", "market", "line", "tier", "availableSides", "status", "live"],
    players,
    events,
    rows
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed", allowedMethods: ["GET"] });
  }

  const apiKey = process.env.PRIZEPICKS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: "Missing PRIZEPICKS_API_KEY environment variable" });
  }

  const league = String(req.query.league || "NBA").toUpperCase();
  if (league !== "NBA") {
    return res.status(400).json({ success: false, error: "This endpoint currently supports NBA only." });
  }

  const maxPages = Number(req.query.maxPages ?? DEFAULT_MAX_PAGES);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > HARD_MAX_PAGES) {
    return res.status(400).json({
      success: false,
      error: "maxPages must be an integer from 1 to " + HARD_MAX_PAGES,
      defaultMaxPages: DEFAULT_MAX_PAGES,
      hardMaxPages: HARD_MAX_PAGES
    });
  }

  const limit = Number(req.query.limit ?? PAGE_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_LIMIT) {
    return res.status(400).json({ success: false, error: "limit must be an integer from 1 to " + PAGE_LIMIT });
  }

  const debugSamples = Number(req.query.debugSamples ?? 0);
  if (!Number.isInteger(debugSamples) || debugSamples < 0 || debugSamples > 3) {
    return res.status(400).json({ success: false, error: "debugSamples must be an integer from 0 to 3" });
  }

  const startedMs = Date.now();
  const scanStartedAt = new Date(startedMs).toISOString();
  const pageAudit = [];
  const recordsByKey = new Map();
  const seenCursors = new Set();
  const initialCursor = req.query.cursor ? String(req.query.cursor) : null;
  let cursor = initialCursor;
  if (cursor) seenCursors.add(cursor);

  let providerObservation = null;
  let providerSourceStatus = null;
  let providerMode = null;
  let isDemo = false;
  let stopReason = "max_pages_reached";
  let providerError = null;
  let recordsRetrieved = 0;
  let recordsWithoutProviderId = 0;

  try {
    for (let page = 1; page <= maxPages; page++) {
      const remainingMs = ACTION_BUDGET_MS - (Date.now() - startedMs);
      if (remainingMs < 1500) {
        stopReason = "action_time_budget";
        break;
      }

      const params = { league, view: "compact", limit };
      if (cursor) params.cursor = cursor;

      let response;
      try {
        response = await axios.get(PROVIDER_URL, {
          params,
          timeout: Math.min(8000, remainingMs - 500),
          headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" }
        });
      } catch (error) {
        providerError = {
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
      recordsRetrieved += pageData.length;

      isDemo = isDemo || meta.is_demo === true || pageData.some(item => item?.is_demo === true);
      providerObservation = firstValue(meta.observed_at, meta.fetched_at, providerObservation);
      providerSourceStatus = firstValue(meta.source_status, providerSourceStatus);
      providerMode = firstValue(meta.mode, providerMode);

      let uniqueAdded = 0;
      let duplicates = 0;
      for (const item of pageData) {
        const id = firstValue(item?.id, item?.source_projection_id, null);
        if (!id) recordsWithoutProviderId++;
        const key = projectionKey(item);
        if (recordsByKey.has(key)) {
          duplicates++;
        } else {
          recordsByKey.set(key, item);
          uniqueAdded++;
        }
      }

      const nextCursorValue = firstValue(meta.next_cursor, result.next_cursor, null);
      const nextCursor = nextCursorValue ? String(nextCursorValue) : null;
      pageAudit.push({
        page,
        records: pageData.length,
        uniqueRecordsAdded: uniqueAdded,
        duplicates,
        cursorSupplied: cursor,
        nextCursorReturned: nextCursor
      });

      if (!nextCursor) {
        cursor = null;
        stopReason = "pagination_complete";
        break;
      }

      if (seenCursors.has(nextCursor)) {
        cursor = nextCursor;
        stopReason = "cursor_cycle_detected";
        break;
      }

      seenCursors.add(nextCursor);
      cursor = nextCursor;
      if (page === maxPages) stopReason = "max_pages_reached";
    }

    const allUnique = [...recordsByKey.values()];
    const standard = allUnique.filter(isStandard);
    const playerNames = new Set();
    const playerIds = new Set();
    const matchupSet = new Set();
    const markets = new Set();
    const gameCoverage = {};

    for (const item of allUnique) {
      const name = playerName(item);
      const id = playerId(item);
      const game = matchup(item);
      const stat = marketName(item);

      if (name) playerNames.add(name);
      if (id) playerIds.add(id);
      if (game) matchupSet.add(game);
      if (stat) markets.add(stat);

      if (game) {
        if (!gameCoverage[game]) {
          gameCoverage[game] = {
            matchup: game,
            projections: 0,
            standardProjections: 0,
            uniquePlayers: 0,
            _players: new Set()
          };
        }
        gameCoverage[game].projections++;
        if (isStandard(item)) gameCoverage[game].standardProjections++;
        if (name) gameCoverage[game]._players.add(name);
      }
    }

    for (const entry of Object.values(gameCoverage)) {
      entry.uniquePlayers = entry._players.size;
      delete entry._players;
    }

    let compact = makeCompactPayload(standard);
    let projectionPayloadTruncated = false;
    let includedStandardProjections = standard.length;

    while (includedStandardProjections > 0) {
      if (JSON.stringify(compact).length <= RESPONSE_BUDGET_CHARS) break;
      includedStandardProjections = Math.floor(includedStandardProjections * 0.9);
      compact = makeCompactPayload(standard.slice(0, includedStandardProjections));
      projectionPayloadTruncated = true;
    }

    const debugProjectionSamples = debugSamples
      ? allUnique.slice(0, debugSamples)
      : undefined;

    const payloadChars = JSON.stringify(compact).length;
    const complete = stopReason === "pagination_complete" && !cursor && !providerError;
    const status = complete ? "COMPLETE" : "PARTIAL";

    return res.status(200).json({
      success: !providerError,
      isDemo,
      league,
      fetchedAt: new Date().toISOString(),
      scanStartedAt,
      providerObservation,
      providerSourceStatus,
      providerMode,
      status,
      complete,
      stopReason,
      request: { maxPages, pageLimit: limit, initialCursor, debugSamples },
      pagination: {
        pagesRequested: pageAudit.length,
        recordsRetrieved,
        uniqueProjections: allUnique.length,
        duplicates: recordsRetrieved - allUnique.length,
        recordsWithoutProviderId,
        nextCursor: cursor
      },
      coverage: {
        uniquePlayersByName: playerNames.size,
        uniquePlayerIds: playerIds.size,
        uniqueMatchups: matchupSet.size,
        uniqueMarkets: markets.size,
        standardProjections: standard.length,
        standardProjectionsReturned: includedStandardProjections,
        playersMissingNames: [...playerIds].filter(id =>
          !allUnique.some(item => playerId(item) === id && playerName(item))
        ).length,
        nonStandardProjections: allUnique.length - standard.length,
        matchups: Object.values(gameCoverage).sort((a, b) => a.matchup.localeCompare(b.matchup))
      },
      projectionColumns: compact.columns,
      players: compact.players,
      events: compact.events,
      projections: compact.rows,
      debugProjectionSamples,
      payload: {
        characters: payloadChars,
        truncated: projectionPayloadTruncated,
        note: "projections is an array of rows. Decode each row using projectionColumns; playerKey and eventKey resolve through players and events."
      },
      pageAudit,
      error: providerError,
      notice: isDemo ? "DEMO DATA ONLY. These are fictional projections, not live PrizePicks lines." : null
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
      nextCursor: cursor
    });
  }
};
