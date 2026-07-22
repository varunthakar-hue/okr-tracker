const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { TEAM } = require('./config');

// Parse a downloaded OKR xlsx buffer into structured weekly tasks
function parseOKRBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const result = { brand: [], social: [], engage: [] };

  // Brand OKR Tracker sheet
  const brandSheet = workbook.Sheets['Brand OKR Tracker'] || workbook.Sheets[workbook.SheetNames.find(n => n.toLowerCase().includes('brand okr'))];
  if (brandSheet) result.brand = parseTrackerSheet(brandSheet, 'brand');

  // Social OKR tracker sheet
  const socialSheet = workbook.Sheets['Social OKR tracker'] || workbook.Sheets[workbook.SheetNames.find(n => n.toLowerCase().includes('social okr'))];
  if (socialSheet) result.social = parseTrackerSheet(socialSheet, 'social');

  // Engage sheet
  const engageSheet = workbook.Sheets['Engage'] || workbook.Sheets[workbook.SheetNames.find(n => n.toLowerCase().includes('engage'))];
  if (engageSheet) result.engage = parseTrackerSheet(engageSheet, 'engage');

  return result;
}

function parseTrackerSheet(sheet, group) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const tasks = [];

  // Find header row containing KEY RESULT / OWNER / TARGET / CURRENT / STATUS columns
  let headerIdx = -1;
  let colMap = {};

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i].map(c => String(c).toUpperCase().trim());
    const krIdx = row.findIndex(c => c.includes('KEY RESULT') || c === 'KR');
    if (krIdx >= 0) {
      headerIdx = i;
      colMap.kr     = krIdx;
      colMap.owner  = row.findIndex(c => c.includes('OWNER'));
      colMap.target = row.findIndex(c => c.includes('TARGET'));
      colMap.current= row.findIndex(c => c.includes('CURRENT'));
      colMap.status = row.findIndex(c => c.includes('STATUS'));
      // Find week plan columns (columns with "week" in header)
      colMap.week1  = row.findIndex(c => c.includes('1ST WEEK') || c.includes('WEEK 1') || c.includes('WEEK OF'));
      colMap.week2  = row.findIndex(c => c.includes('2ND WEEK') || c.includes('WEEK 2') || c.includes('NEXT WEEK'));
      break;
    }
  }

  if (headerIdx < 0) return tasks;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const kr = String(row[colMap.kr] || '').trim();
    if (!kr || kr.toUpperCase().includes('OBJECTIVE')) continue;

    const ownerRaw = String(row[colMap.owner] || '').trim();
    const owner = resolveOwner(ownerRaw, group);

    tasks.push({
      kr,
      ownerRaw,
      owner,         // resolved team member name(s)
      target: String(row[colMap.target] || '').trim(),
      current: String(row[colMap.current] || '').trim(),
      status: String(row[colMap.status] || '').trim(),
      thisWeekPlan: colMap.week1 >= 0 ? String(row[colMap.week1] || '').trim() : '',
      nextWeekPlan: colMap.week2 >= 0 ? String(row[colMap.week2] || '').trim() : '',
      group,
    });
  }

  return tasks.filter(t => t.kr.length > 3);
}

function resolveOwner(label, group) {
  if (!label) return [];
  const matched = TEAM.filter(m =>
    m.okrOwnerLabel.some(l => label.toLowerCase().includes(l.toLowerCase())) ||
    (group && m.group === group && label.toLowerCase().includes('team'))
  );
  return matched.map(m => m.name);
}

// Group tasks by owner Slack ID for per-person check-in messages
function tasksByMember(parsedOKRs) {
  const byMember = {};

  for (const member of TEAM) {
    byMember[member.id] = { member, tasks: [] };
  }

  const allTasks = [...parsedOKRs.brand, ...parsedOKRs.social, ...parsedOKRs.engage];

  for (const task of allTasks) {
    // owner can be an array or missing (fall back to ownerRaw fuzzy match)
    const owners = Array.isArray(task.owner) ? task.owner : [];
    if (owners.length === 0 && task.ownerRaw) {
      // fuzzy: find any team member whose name appears in ownerRaw
      const matched = TEAM.filter(m => task.ownerRaw.toLowerCase().includes(m.name.split(' ')[0].toLowerCase()));
      owners.push(...matched.map(m => m.name));
    }
    for (const name of owners) {
      const member = TEAM.find(m => m.name === name);
      if (member) {
        byMember[member.id].tasks.push(task);
      }
    }
  }

  return byMember;
}

module.exports = { parseOKRBuffer, tasksByMember };
