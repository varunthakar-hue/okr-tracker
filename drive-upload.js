// Drive operations are handled by Claude via MCP on schedule.
// This module just handles local file saving for reports.
const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '../reports');
const READY_FLAG = path.join(__dirname, '../data/report-ready.json');

function markReportReady({ filepath, filename, weekKey }) {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(READY_FLAG, JSON.stringify({ filepath, filename, weekKey, generatedAt: new Date().toISOString() }, null, 2));
  console.log(`📄 Report saved locally: ${filepath}`);
  console.log(`📌 Claude will upload it to Drive at the next scheduled run.`);
}

function getReadyReport() {
  try { return JSON.parse(fs.readFileSync(READY_FLAG, 'utf8')); } catch { return null; }
}

function clearReadyFlag() {
  if (fs.existsSync(READY_FLAG)) fs.unlinkSync(READY_FLAG);
}

module.exports = { markReportReady, getReadyReport, clearReadyFlag };
