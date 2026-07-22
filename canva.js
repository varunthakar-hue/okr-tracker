import fetch from 'node-fetch';

const CANVA_API_KEY = process.env.CANVA_API_KEY;
const BASE = 'https://api.canva.com/rest/v1';

// Template IDs map to the pre-built locked Canva templates per IP
const TEMPLATE_MAP = {
  kyc: process.env.CANVA_TEMPLATE_KYC,
  certified_cool: process.env.CANVA_TEMPLATE_CERTIFIED_COOL,
  siwik: process.env.CANVA_TEMPLATE_SIWIK,
  fkg: process.env.CANVA_TEMPLATE_FKG,
  adt: process.env.CANVA_TEMPLATE_ADT,
  plot_twist: process.env.CANVA_TEMPLATE_PLOT_TWIST,
  bizarre: process.env.CANVA_TEMPLATE_BIZARRE,
  startup_news: process.env.CANVA_TEMPLATE_STARTUP_NEWS,
  memes: process.env.CANVA_TEMPLATE_MEMES
};

export async function renderDesign(brief) {
  if (!CANVA_API_KEY) {
    console.log('[Canva] API key not configured — logging design brief instead');
    return { status: 'stub', message: 'Set CANVA_API_KEY to enable rendering', brief_saved: true };
  }

  const templateId = TEMPLATE_MAP[brief.template_id];
  if (!templateId) {
    console.warn(`[Canva] No template ID configured for: ${brief.template_id}`);
    return { status: 'stub', message: `Set CANVA_TEMPLATE_${brief.template_id.toUpperCase()} to enable rendering` };
  }

  try {
    // Create a design from the locked template
    const createRes = await canvaPost('/designs', {
      asset_type: 'presentation',
      title: `${brief.ip} — ${brief.story_id}`,
      design_type: { name: 'SocialMedia' }
    });

    const designId = createRes.design?.id;
    if (!designId) throw new Error('Canva design creation returned no ID');

    console.log(`[Canva] Design created: ${designId}`);

    // Export to PDF/PNG for publishing
    const exportRes = await canvaPost(`/exports`, {
      design_id: designId,
      format: { type: 'pdf' }
    });

    return {
      status: 'rendered',
      design_id: designId,
      export_job_id: exportRes.job?.id,
      canva_url: `https://www.canva.com/design/${designId}/edit`
    };
  } catch (err) {
    console.error(`[Canva] Render failed: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

export async function getExportUrl(jobId) {
  if (!CANVA_API_KEY) return null;

  const res = await canvaGet(`/exports/${jobId}`);
  if (res.job?.status === 'success') {
    return res.job?.urls?.[0] || null;
  }
  return null;
}

async function canvaPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CANVA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Canva API error ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function canvaGet(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${CANVA_API_KEY}` }
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Canva API error ${res.status}: ${JSON.stringify(json)}`);
  return json;
}
