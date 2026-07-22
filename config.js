const TEAM = [
  { name: "Sanjana Shetty",       id: "U08QZEDGMFE", role: "Social Lead",                  reportsTo: "Varun",   group: "social" },
  { name: "Shristy Khemka",       id: "U0A83LZ00SE", role: "Twitter/X & Owned Media",       reportsTo: "Sanjana", group: "social" },
  { name: "Mandhara Mahabalesh",  id: "U0631BJ094Z", role: "Instagram / Product / LinkedIn", reportsTo: "Sanjana", group: "social" },
  { name: "Jude Lopez",           id: "U03QQHPDJDV", role: "Founder Content",                reportsTo: "Sanjana", group: "social" },
  { name: "Rashmee Lahon",        id: "U02QWTEDB5M", role: "IPO Social Readiness",           reportsTo: "Sanjana", group: "social" },
  { name: "Akash Wadhwa",         id: "U08QFN6M279", role: "Brand Lead",                     reportsTo: "Varun",   group: "brand" },
  { name: "Ishan Gupta",          id: "U07BRM03N74", role: "Founder Content / Brand",        reportsTo: "Akash",   group: "brand" },
  { name: "Ajmal P",              id: "U0A4X4PUU4Q", role: "Founder Content",                reportsTo: "Akash",   group: "brand" },
  { name: "Nivedita Prabhu",      id: "U08N156N35W", role: "Brand",                          reportsTo: "Varun",   group: "brand" },
  { name: "Anoushka Bhada",       id: "U07SNV3PGQP", role: "PMM Engage",                    reportsTo: "Varun",   group: "brand" },
];

const VARUN_ID = "U08ENGET78X";

const MESSAGES = {
  "U08QZEDGMFE": `Hey Sanjana! 👋 Monday check-in.\n1. Team tracking overall — any early concerns?\n2. One social metric to call out (LI/IG/X)?\n3. Team's single biggest blocker?\n(Plain text is fine!)`,

  "U0A83LZ00SE": `Hey Shristy! 👋 Quick Monday check-in.\n1. X posts this week + any reach spikes?\n2. Owned media / newsletter updates?\n3. Any blockers?\n(Just reply here!)`,

  "U0631BJ094Z": `Hey Mandhara! 👋 Weekly check-in.\n1. IG reach and Reels performance this week?\n2. Any product content or LinkedIn posts out?\n3. Priorities and blockers?\n(Plain text is fine!)`,

  "U03QQHPDJDV": `Hey Jude! 👋 Monday check-in.\n1. Founder posts out this week — any standouts?\n2. Ishan + Ajmal content cadence — how's it going?\n3. Any founders being tough to get content from?\n(Just reply here!)`,

  "U02QWTEDB5M": `Hey Rashmee! 👋 Weekly check-in.\n1. IPO narrative / Tier-1 earned media progress?\n2. IPO-safe content review status?\n3. Blockers?\n(Plain text is fine!)`,

  "U08QFN6M279": `Hey Akash! 👋 Monday check-in from Varun.\n1. Top brand projects this week for you + the team?\n2. Key win + any blockers (yours + Riddhima + Ishan + Ajmal)?\n3. Anything you need from Varun?\n(Just reply here!)`,

  "U07BRM03N74": `Hey Ishan! 👋 Quick Monday check-in.\n1. Founder/brand content you're working on this week?\n2. Any standout posts or reach numbers?\n3. Anything blocking you?\n(Plain text is fine!)`,

  "U0A4X4PUU4Q": `Hey Ajmal! 👋 Quick Monday check-in.\n1. Founder content this week — posts out or in pipeline?\n2. Any wins or blockers?\n(Just reply here!)`,

  "U08N156N35W": `Hey Nivedita! 👋 Monday check-in from Varun.\n1. What are you working on this week?\n2. Key win + any blockers?\n3. What do you need?\n(Plain text is fine!)`,

  "U07SNV3PGQP": `Hey Anoushka! 👋 Weekly check-in from Varun.\n1. Ads GMV tracking this week?\n2. Gift Cards — any new wins?\n3. Any blockers?\n(Whenever you get a min!)`,
};

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

module.exports = { TEAM, VARUN_ID, MESSAGES, getWeekKey };
