/* =============================================================================
   REFERRALS - client codes, converted-lead rewards, and fulfillment tracking.
   ============================================================================= */
const Referrals = {};

Referrals.normalize = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
Referrals.codeCandidate = function (client) {
  const name = String(client?.name || 'PLAYER').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PLAYER';
  const suffix = String(client?.id || uid()).replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase().padStart(5, 'X');
  return `HONE-${name}-${suffix}`;
};
Referrals.ensureCodes = function () {
  const used = new Set(); let changed = false;
  (DB.clients || []).forEach(client => {
    let code = Referrals.normalize(client.referralCode) || Referrals.codeCandidate(client);
    let attempt = 2;
    while (used.has(code)) code = `${Referrals.codeCandidate(client)}-${attempt++}`;
    used.add(code);
    if (client.referralCode !== code) { client.referralCode = code; changed = true; }
  });
  if (changed) saveDB();
  return changed;
};
Referrals.findClient = code => (DB.clients || []).find(client => Referrals.normalize(client.referralCode) === Referrals.normalize(code)) || null;
Referrals.siteOrigin = () => /^https?:/.test(location.origin) ? location.origin : 'https://sufferingbuildscharacter.com';
Referrals.link = client => `${Referrals.siteOrigin()}/?ref=${encodeURIComponent(client.referralCode)}#coaching-intake`;
Referrals.rewardLabel = () => (DB.settings || {}).referralRewardLabel || '1 bonus coaching session';

Referrals.recordConversion = function (lead, referredClient) {
  const referrer = Referrals.findClient(lead?.referralCode);
  if (!referrer || !referredClient || referrer.id === referredClient.id) return null;
  DB.referrals ||= [];
  const existing = DB.referrals.find(item => item.leadId === lead.id || item.referredClientId === referredClient.id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const record = {
    id: uid(), leadId: lead.id, referrerClientId: referrer.id, referredClientId: referredClient.id,
    referredName: referredClient.name || 'Referred client', status: 'Pending', rewardLabel: Referrals.rewardLabel(),
    source: 'website-referral', createdAt: now, updatedAt: now,
  };
  DB.referrals.push(record);
  return record;
};

UI.renderers.referrals = function (el) {
  Referrals.ensureCodes();
  const roster = activeClients();
  const records = (DB.referrals || []).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const pending = records.filter(item => item.status === 'Pending').length;
  const fulfilled = records.filter(item => item.status === 'Fulfilled').length;
  el.innerHTML = `<div class="page-head"><div><div class="kicker">CLIENT GROWTH</div><h1>Referrals & Rewards</h1><div class="sub">Give every client a trackable link and follow each earned reward through fulfillment.</div></div></div>
    <div class="stat-tiles mb"><div class="stat-tile"><div class="label">Active codes</div><div class="value">${roster.length}</div></div><div class="stat-tile"><div class="label">Converted referrals</div><div class="value accent">${records.length}</div></div><div class="stat-tile"><div class="label">Pending rewards</div><div class="value">${pending}</div></div><div class="stat-tile"><div class="label">Fulfilled</div><div class="value">${fulfilled}</div></div></div>
    <div class="card mb"><div class="card-head"><h2>Reward settings</h2></div><label class="field"><span>Default reward</span><input value="${UI.escape(Referrals.rewardLabel())}" maxlength="120" onchange="Referrals.saveReward(this.value)" placeholder="1 bonus coaching session"></label><p class="muted small">This label is copied onto new converted referrals. Existing rewards keep their original value for accurate records.</p></div>
    <div class="card mb"><div class="card-head"><h2>Client referral links</h2><span class="muted small">Links open the coaching application with attribution attached.</span></div><div class="referral-code-grid">${roster.slice().sort((a,b) => a.name.localeCompare(b.name)).map(client => `<article class="referral-code-card"><div><b>${UI.escape(client.name)}</b><code>${UI.escape(client.referralCode)}</code></div><button class="btn btn-xs btn-primary" onclick="Referrals.copyLink('${UI.attr(client.id)}')">Copy link</button></article>`).join('') || '<p class="muted">Add or restore an active client to create referral links.</p>'}</div></div>
    <div class="card"><div class="card-head"><h2>Reward pipeline</h2></div>${records.length ? `<div class="table-wrap"><table><thead><tr><th>Referrer</th><th>Converted client</th><th>Reward</th><th>Date</th><th>Status</th></tr></thead><tbody>${records.map(Referrals.row).join('')}</tbody></table></div>` : UI.emptyState('REF', 'No converted referrals yet', 'A reward appears here when a referral-attributed website lead is converted to a client.')}</div>`;
};

Referrals.row = function (item) {
  const referrer = getClient(item.referrerClientId);
  const referred = getClient(item.referredClientId);
  return `<tr><td><b>${UI.escape(referrer?.name || 'Former client')}</b></td><td>${UI.escape(referred?.name || item.referredName || 'Referred client')}</td><td><input class="referral-reward-input" value="${UI.escape(item.rewardLabel || '')}" onchange="Referrals.update('${UI.attr(item.id)}','rewardLabel',this.value)"></td><td>${UI.fmtDate(String(item.createdAt || '').slice(0,10))}</td><td><select onchange="Referrals.update('${UI.attr(item.id)}','status',this.value)">${['Pending','Approved','Fulfilled','Declined'].map(value => `<option ${value === item.status ? 'selected' : ''}>${value}</option>`).join('')}</select></td></tr>`;
};

Referrals.saveReward = function (value) {
  DB.settings ||= {}; DB.settings.referralRewardLabel = String(value || '').trim().slice(0, 120) || '1 bonus coaching session'; saveDB(); UI.toast('Default referral reward updated.', 'good');
};
Referrals.update = function (id, field, value) {
  const record = (DB.referrals || []).find(item => item.id === id); if (!record || !['status','rewardLabel'].includes(field)) return;
  record[field] = String(value || '').trim().slice(0, 120); record.updatedAt = new Date().toISOString(); if (field === 'status' && value === 'Fulfilled') record.fulfilledAt = record.updatedAt; saveDB(); UI.toast('Referral reward updated.', 'good'); UI.refresh();
};
Referrals.copyLink = async function (clientId) {
  const client = getClient(clientId); if (!client) return;
  try { await navigator.clipboard.writeText(Referrals.link(client)); UI.toast('Referral link copied.', 'good'); }
  catch (error) { UI.toast('Could not copy the referral link.', 'bad'); }
};
