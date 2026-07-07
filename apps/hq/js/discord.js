/* =============================================================================
   DISCORD -one-click posting of text/markdown or rendered card images to a
   client's saved Discord webhook (posted from the main process, no CORS).
   ============================================================================= */
const Discord = {};

Discord.post = function (clientId, content, imageDataUrl) {
  const c = getClient(clientId);
  if (!c) return;
  if (!c.webhook) {
    UI.toast(`Add ${c.name}'s Discord webhook in their profile (Edit Client) first.`, 'bad');
    return;
  }
  UI.toast(imageDataUrl ? 'Posting card to Discord...' : 'Posting to Discord...');
  window.api.postWebhook(c.webhook, content || '', imageDataUrl).then(r => {
    UI.toast(r.success ? `Posted to ${c.name}'s Discord.` : 'Post failed: ' + (r.msg || ''), r.success ? 'good' : 'bad');
  });
};


