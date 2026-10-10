const dashboardService = require('../services/dashboardService');

function renderDashboard(req, res) {
  return res.render('dashboard/views/index', { user: req.auth });
}

function getSummary(req, res) {
  return res.json({ summary: dashboardService.getSummary() });
}

module.exports = { renderDashboard, getSummary };
