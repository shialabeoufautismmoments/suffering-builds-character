/* =============================================================================
   CONVERSIONS - anonymous public-site traffic joined to durable lead outcomes.
   ============================================================================= */
const Conversions = { days: 90, analytics: null, leads: [], loading: false, error: '' };

Conversions.emptyAnalytics = () => ({ totals: { page_view: 0, cta_click: 0, application: 0 }, pages: {}, sources: {}, campaigns: {}, ctas: {}, daily: [] });
Conversions.cutoff = () => new Date(Date.now() - (Conversions.days - 1) * 86400000).toISOString();
Conversions.leadRows = () => (Conversions.leads || []).filter(lead => lead.source === 'website' && String(lead.createdAt || '') >= Conversions.cutoff());
Conversions.converted = lead => (lead.status || '') === 'Booked';
Conversions.rate = (part, whole) => whole ? `${((part / whole) * 100).toFixed(1)}%` : '—';
Conversions.source = lead => lead.referralCode ? 'Referral' : lead.utmSource || lead.referrerHost || 'Direct';

Conversions.load = async function () {
  if (Conversions.loading) return;
  Conversions.loading = true; Conversions.error = '';
  try {
    const analyticsRequest = window.api.siteAnalyticsGet ? window.api.siteAnalyticsGet(Conversions.days) : Promise.resolve({ analytics: Conversions.emptyAnalytics() });
    const leadsRequest = window.api.coachLeadsGet ? window.api.coachLeadsGet() : Promise.resolve({ leads: Waitlist.all() });
    const [analyticsResult, leadsResult] = await Promise.allSettled([analyticsRequest, leadsRequest]);
    Conversions.analytics = analyticsResult.status === 'fulfilled' ? analyticsResult.value.analytics : Conversions.emptyAnalytics();
    Conversions.leads = leadsResult.status === 'fulfilled' ? (leadsResult.value.leads || []) : Waitlist.all();
    if (leadsResult.status === 'fulfilled') { Waitlist.items = Conversions.leads; Waitlist.loaded = true; }
    if (analyticsResult.status === 'rejected') Conversions.error = 'Public traffic totals are temporarily unavailable; lead conversion data is still shown.';
  } catch (error) {
    Conversions.error = error.message || 'Could not load conversion analytics.';
    Conversions.analytics = Conversions.emptyAnalytics(); Conversions.leads = Waitlist.all();
  } finally {
    Conversions.loading = false; if (UI.currentView === 'conversions') UI.refresh();
  }
};

Conversions.leadBucket = function (keyFn) {
  const rows = {};
  Conversions.leadRows().forEach(lead => {
    const key = keyFn(lead) || 'Unattributed';
    rows[key] ||= { applications: 0, clients: 0 };
    rows[key].applications += 1;
    if (Conversions.converted(lead)) rows[key].clients += 1;
  });
  return rows;
};

Conversions.funnelRows = function (traffic = {}, leads = {}) {
  const keys = new Set([...Object.keys(traffic || {}), ...Object.keys(leads || {})]);
  return [...keys].map(name => ({ name, views: Number(traffic[name]?.page_view || 0), clicks: Number(traffic[name]?.cta_click || 0), applications: Number(leads[name]?.applications || 0), clients: Number(leads[name]?.clients || 0) }))
    .sort((a, b) => b.clients - a.clients || b.applications - a.applications || b.views - a.views).slice(0, 20);
};

Conversions.funnelTable = function (title, rows) {
  return `<div class="card conversion-table"><div class="card-head"><h2>${UI.escape(title)}</h2></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Source</th><th>Views</th><th>CTA clicks</th><th>Applications</th><th>Clients</th><th>View → app</th><th>Lead → client</th></tr></thead><tbody>${rows.map(row => `<tr><td><b>${UI.escape(row.name)}</b></td><td>${row.views}</td><td>${row.clicks}</td><td>${row.applications}</td><td>${row.clients}</td><td>${Conversions.rate(row.applications, row.views)}</td><td>${Conversions.rate(row.clients, row.applications)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No data in this range yet.</p>'}</div>`;
};

Conversions.leadTable = function (title, rows) {
  return `<div class="card conversion-table"><div class="card-head"><h2>${UI.escape(title)}</h2></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Source</th><th>Applications</th><th>Clients</th><th>Lead → client</th></tr></thead><tbody>${rows.map(row => `<tr><td><b>${UI.escape(row.name)}</b></td><td>${row.applications}</td><td>${row.clients}</td><td>${Conversions.rate(row.clients, row.applications)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No attributed applications in this range.</p>'}</div>`;
};

UI.renderers.conversions = function (el) {
  if (!Conversions.analytics && !Conversions.loading) { Conversions.load(); }
  if (Conversions.loading && !Conversions.analytics) {
    el.innerHTML = '<div class="page-head"><div><div class="kicker">PUBLIC SITE</div><h1>Conversion Analytics</h1><div class="sub">Loading anonymous traffic and lead outcomes...</div></div></div>';
    return;
  }
  const analytics = Conversions.analytics || Conversions.emptyAnalytics();
  const leads = Conversions.leadRows();
  const converted = leads.filter(Conversions.converted).length;
  const views = Number(analytics.totals?.page_view || 0);
  const clicks = Number(analytics.totals?.cta_click || 0);
  const pageLeads = Conversions.leadBucket(lead => lead.landingPath || '/');
  const sourceLeads = Conversions.leadBucket(Conversions.source);
  const campaignLeads = Conversions.leadBucket(lead => lead.utmCampaign || 'Unattributed');
  const serviceRows = Conversions.funnelRows({}, Conversions.leadBucket(lead => lead.service || 'Not specified'));
  const coachRows = Conversions.funnelRows({}, Conversions.leadBucket(lead => ((DB.coaches || []).find(coach => coach.id === lead.assignedCoachId) || {}).name || 'Unassigned'));
  el.innerHTML = `<div class="page-head"><div><div class="kicker">PUBLIC SITE</div><h1>Conversion Analytics</h1><div class="sub">Anonymous aggregate traffic joined to saved applications and booked clients. No visitor profiles or tracking cookies.</div></div><div class="seg">${[[30,'30d'],[90,'90d'],[365,'1y']].map(([days,label]) => `<button class="${Conversions.days === days ? 'on' : ''}" onclick="Conversions.setDays(${days})">${label}</button>`).join('')}</div></div>
    ${Conversions.error ? `<div class="notice mb">${UI.escape(Conversions.error)}</div>` : ''}
    <div class="stat-tiles mb"><div class="stat-tile"><div class="label">Page views</div><div class="value">${views}</div></div><div class="stat-tile"><div class="label">CTA clicks</div><div class="value">${clicks}</div><small>${Conversions.rate(clicks, views)} click rate</small></div><div class="stat-tile"><div class="label">Applications</div><div class="value accent">${leads.length}</div><small>${Conversions.rate(leads.length, views)} of views</small></div><div class="stat-tile"><div class="label">Booked clients</div><div class="value">${converted}</div><small>${Conversions.rate(converted, leads.length)} of leads</small></div></div>
    <div class="conversion-grid">${Conversions.funnelTable('Landing pages', Conversions.funnelRows(analytics.pages, pageLeads))}${Conversions.funnelTable('Traffic sources', Conversions.funnelRows(analytics.sources, sourceLeads))}${Conversions.funnelTable('Campaigns', Conversions.funnelRows(analytics.campaigns, campaignLeads))}${Conversions.leadTable('Coaching services', serviceRows)}${Conversions.leadTable('Assigned coaches', coachRows)}${Conversions.funnelTable('CTA performance', Conversions.funnelRows(analytics.ctas, {}))}</div>`;
};

Conversions.setDays = function (days) { Conversions.days = Number(days) || 90; Conversions.analytics = null; Conversions.load(); UI.refresh(); };
