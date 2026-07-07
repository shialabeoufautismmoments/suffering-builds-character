(function () {
  const STORE_KEY = 'coachsbc-hq-web-store';
  const TOKEN_KEY = 'coachsbc-hq-session-token';
  const unsupported = msg => Promise.resolve({ success: false, msg });
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  const setToken = value => {
    sessionStorage.setItem(TOKEN_KEY, value);
    localStorage.setItem(TOKEN_KEY, value);
  };
  const download = (filename, data, type = 'application/octet-stream') => {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'coachsbc-export';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return { success: true, msg: filename || 'Downloaded.' };
  };
  const dataUrlToBlob = dataUrl => {
    const [head, body] = String(dataUrl || '').split(',');
    const mime = /data:([^;]+)/.exec(head || '')?.[1] || 'application/octet-stream';
    const binary = atob(body || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };
  async function authedFetch(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token()}`,
      },
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 409) return { conflict: true, ...result };
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  }

  window.COACHSBC_WEB = true;
  window.api = {
    appVersion: async () => 'web-3.2.0',
    loadStore: async () => localStorage.getItem(STORE_KEY),
    saveStore: async data => { localStorage.setItem(STORE_KEY, String(data || '')); return true; },
    coachUnlock: async password => {
      const response = await fetch('/api/coach-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: String(password || '') }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Incorrect password.');
      setToken(result.token);
      return { success: true };
    },
    coachLock: async () => {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      return true;
    },
    coachWorkspaceGet: () => authedFetch('/api/coach-workspace'),
    coachWorkspacePut: payload => authedFetch('/api/coach-workspace', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
    exportBackup: async (filename, data) => download(filename, data, 'application/json'),
    exportJson: async (filename, data) => download(filename, data, 'application/json'),
    exportHtml: async (filename, html) => download(filename, html, 'text/html'),
    saveFile: async (filename, dataUrl) => download(filename, dataUrlToBlob(dataUrl)),
    exportPdf: async (filename, html) => {
      const w = window.open('', '_blank');
      if (!w) return { success: false, msg: 'Pop-up blocked. Allow pop-ups, then export again.' };
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 300);
      return { success: true, msg: `${filename || 'Report'} opened for browser print/save as PDF.` };
    },
    importBackup: async () => new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.kcoach,.json,application/json';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, content: String(reader.result || '') });
        reader.onerror = () => resolve({ error: 'Could not read that backup file.' });
        reader.readAsText(file);
      };
      input.click();
    }),
    importPlaylists: async () => null,
    pushToSteam: () => unsupported('Steam playlist push is only available in the desktop app.'),
    readStatsFolder: () => unsupported("Local KovaaK's stats folder import is only available in the desktop app."),
    kovaaksWebSync: () => unsupported("KovaaK's web sync is only available in the desktop app right now."),
    renderCard: () => unsupported('Image card rendering is only available in the desktop app.'),
    captureRegion: () => unsupported('Screen capture is only available in the desktop app.'),
    copyImage: async dataUrl => {
      try {
        if (!navigator.clipboard || !window.ClipboardItem) return false;
        await navigator.clipboard.write([new ClipboardItem({ [dataUrlToBlob(dataUrl).type]: dataUrlToBlob(dataUrl) })]);
        return true;
      } catch (e) { return false; }
    },
    postWebhook: () => unsupported('Discord webhook posting is only available in the desktop app.'),
    discordAvatarLookup: () => unsupported('Discord avatar lookup is only available in the desktop app.'),
    openExternal: async url => {
      window.open(String(url || ''), '_blank', 'noopener,noreferrer');
      return { success: true };
    },
    calBookings: () => unsupported('Cal.com API sync is only available in the desktop app.'),
    cloudSyncConfig: async () => ({ configured: false }),
    cloudSyncChooseFolder: async () => '',
    cloudSyncConfigure: () => unsupported('Folder sync is only available in the desktop app.'),
    cloudSyncDisable: () => unsupported('Folder sync is only available in the desktop app.'),
    cloudSyncStatus: async () => ({ state: 'unconfigured' }),
    cloudSyncPush: () => unsupported('Folder sync is only available in the desktop app.'),
    cloudSyncPull: () => unsupported('Folder sync is only available in the desktop app.'),
    cloudSyncOpenFolder: async () => false,
  };
})();
