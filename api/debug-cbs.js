const axios = require("axios");

module.exports = async (req, res) => {
  try {
    const { league = "nba" } = req.query;

    const url = `https://www.cbssports.com/${league}/injuries/`;
    const { data } = await axios.get(url, { timeout: 10000 });

    res.status(200).send({
      length: data.length,
      snippet: data.slice(0, 2000)
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
};
