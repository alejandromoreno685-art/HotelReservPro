const availabilityService = require('../services/availabilityService');

async function search(req, res) {
  const result = await availabilityService.searchAvailability(req.query);
  return res.json(result);
}

module.exports = { search };
