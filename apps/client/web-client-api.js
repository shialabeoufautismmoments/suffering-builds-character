(function () {
  const CACHE_KEY = 'coachsbc-client-web-cache';
  const cacheGet = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
    catch (e) { return {}; }
  };
  const cacheSet = data => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data || {}));
    return true;
  };
  async function request(method, code, payload) {
    const response = await fetch(`/api/client-workspace${method === 'GET' ? `?code=${encodeURIComponent(code)}` : ''}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-client-code': String(code || ''),
      },
      body: method === 'PUT' ? JSON.stringify({ code, ...(payload || {}) }) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Sync failed (${response.status}).`);
    return result;
  }
  window.COACHSBC_WEB = true;
  window.clientApi = {
    appVersion: async () => 'web-3.2.1',
    cacheGet: async () => cacheGet(),
    cacheSet: async data => cacheSet(data),
    workspaceGet: async code => {
      const result = await request('GET', code);
      cacheSet({ lastCode: String(code || '').trim().toUpperCase(), workspace: result.data });
      return result;
    },
    workspacePut: async (code, payload) => {
      const result = await request('PUT', code, payload);
      cacheSet({ lastCode: String(code || '').trim().toUpperCase(), workspace: result.data });
      return result;
    },
  };
})();
