
const axios = require("axios");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
      allowedMethods: ["GET"]
    });
  }

  const apiKey = process.env.PRIZEPICKS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Missing PRIZEPICKS_API_KEY environment variable"
    });
  }

  try {
    const league = String(req.query.league || "NBA").toUpperCase();

    if (league !== "NBA") {
      return res.status(400).json({
        error: "This endpoint currently supports NBA only."
      });
    }

    const requestedLimit = Number(req.query.limit || 100);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
      : 100;

    const params = {
      league,
      view: "compact",
      limit
    };

    if (req.query.cursor) {
      params.cursor = String(req.query.cursor);
    }

    const response = await axios.get(
      "https://prizepicksapi.com/api/v1/projections",
      {
        params,
        timeout: 20000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json"
        }
      }
    );

    const result = response.data || {};
    const isDemo =
      result.meta?.is_demo === true ||
      (Array.isArray(result.data) &&
        result.data.some(item => item.is_demo === true));

    return res.status(200).json({
      success: true,
      isDemo,
      league,
      fetchedAt: new Date().toISOString(),
      count: Array.isArray(result.data)
        ? result.data.length
        : 0,
      data: result.data || [],
      meta: result.meta || {},
      notice: isDemo
        ? "DEMO DATA ONLY. These are fictional projections, not live PrizePicks lines."
        : null
    });

  } catch (error) {
    const status = error.response?.status || 502;

    console.error(
      "PrizePicks board API error:",
      status,
      error.response?.data || error.message
    );

    return res.status(status).json({
      success: false,
      error: "PrizePicks projection request failed",
      providerStatus: status,
      detail: error.response?.data || error.message
    });
  }
};
