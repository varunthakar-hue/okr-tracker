require('dotenv').config();
const cron = require('node-cron');
const { sendCheckins } = require('./send');

// Runs every Monday at 10:30 AM IST (UTC+5:30 = 05:00 UTC)
cron.schedule('30 5 * * 1', sendCheckins, { timezone: 'Asia/Kolkata' });

console.log('⏰ Scheduler running — check-ins fire every Monday at 10:30 AM IST');
