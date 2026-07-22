require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const fs = require('fs');
const path = require('path');
const { getRazorpayMetrics } = require('./social/twitter');
const { getWeekKey } = require('./config');

const METRICS_PATH = path.join(__dirname, '../data/metrics-cache.json');

function loadMetrics() { try { return JSON.parse(fs.readFileSync(METRICS_PATH, 'utf8')); } catch { return {}; } }
function saveMetrics(m) { fs.writeFileSync(METRICS_PATH, JSON.stringify(m, null, 2)); }

async function refreshMetrics() {
  const weekKey = getWeekKey();
  const metrics = loadMetrics();
  if (!metrics[weekKey]) metrics[weekKey] = {};

  console.log('📊 Fetching Twitter metrics...');
  metrics[weekKey].twitter = await getRazorpayMetrics();
  metrics[weekKey].refreshedAt = new Date().toISOString();

  saveMetrics(metrics);
  console.log('✅ Metrics cached');
  return metrics[weekKey];
}

module.exports = { refreshMetrics };
