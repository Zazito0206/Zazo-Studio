// Shared Supabase REST helper for the static Zazo site.
(() => {
  const cfg = window.ZAZO_SUPABASE_CONFIG || {};
  const configured = /^https:\/\//.test(cfg.url || '') && /^sb_publishable_|^eyJ/.test(cfg.publishableKey || '');
  const sessionKey = 'zazoSupabaseSession';
  const readSession = () => { try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { return null; } };
  const saveSession = s => localStorage.setItem(sessionKey, JSON.stringify(s));
  const clearSession = () => localStorage.removeItem(sessionKey);
  async function authRequest(path, body) {
    const response = await fetch(cfg.url + '/auth/v1/' + path, { method: 'POST', headers: { apikey: cfg.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || 'No se pudo iniciar sesión.');
    return data;
  }
  async function token() {
    let s = readSession();
    if (!s || Date.now() >= s.until) { clearSession(); return ''; }
    if (s.expiresAt < Date.now() + 60000 && s.refreshToken) {
      const r = await authRequest('token?grant_type=refresh_token', { refresh_token: s.refreshToken });
      s.accessToken = r.access_token; s.refreshToken = r.refresh_token || s.refreshToken; s.expiresAt = Date.now() + (r.expires_in || 3600) * 1000; saveSession(s);
    }
    return s.accessToken || '';
  }
  async function request(path, options = {}) {
    if (!configured) throw new Error('Falta configurar Supabase en supabase-config.js.');
    const access = await token();
    const headers = { apikey: cfg.publishableKey, Authorization: 'Bearer ' + (access || cfg.publishableKey), ...(options.body && !(options.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    const response = await fetch(cfg.url + path, { ...options, headers });
    if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.message || e.error_description || 'Error al guardar o leer la información.'); }
    if (response.status === 204) return null;
    return response.json().catch(() => null);
  }
  async function upload(file, folder = 'media') {
    const access = await token();
    if (!access) throw new Error('Inicia sesión en el panel para subir archivos.');
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = folder + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 9) + '.' + ext;
    await request('/storage/v1/object/zazo-media/' + path.split('/').map(encodeURIComponent).join('/'), { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file });
    return cfg.url + '/storage/v1/object/public/zazo-media/' + path.split('/').map(encodeURIComponent).join('/');
  }
  async function removeAsset(publicUrl) {
    const marker = '/storage/v1/object/public/zazo-media/';
    const at = String(publicUrl || '').indexOf(marker);
    if (at < 0) return;
    const path = decodeURIComponent(String(publicUrl).slice(at + marker.length));
    await request('/storage/v1/object/zazo-media', { method: 'DELETE', body: JSON.stringify({ prefixes: [path] }) });
  }
  window.ZAZOCloud = {
    configured,
    login: async (email, password) => { const r = await authRequest('token?grant_type=password', { email, password }); saveSession({ accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: Date.now() + (r.expires_in || 3600) * 1000, until: Date.now() + 24 * 60 * 60 * 1000 }); return r; },
    logout: clearSession,
    hasSession: () => { const s = readSession(); return !!s && Date.now() < s.until; },
    getContent: async () => { const rows = await request('/rest/v1/portfolio_content?id=eq.1&select=projects,creators,about_photo'); return rows && rows[0] || null; },
    saveContent: async value => request('/rest/v1/portfolio_content?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 1, ...value, updated_at: new Date().toISOString() }) }),
    upload, removeAsset
  };
})();
