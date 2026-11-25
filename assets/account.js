(() => {
  const $ = id => document.getElementById(id);
  const config = window.ASSET_BACKEND_CONFIG || {};
  const api = String(config.apiBaseUrl || '').replace(/\/$/, '');
  const enabled = Boolean(config.useSameOrigin || api);
  const tokenKey = 'huajiao-gallery-api-token-v1';
  let user = null, mode = null, preview = false;
  const previewAvailable = !enabled && (location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname));
  const previewSessionKey = 'huajiao-gallery-preview-session-v1';
  const menu = $('accountMenu'), dialog = $('accountLoginDialog');
  const headers = () => { const token = localStorage.getItem(tokenKey); return token ? { Authorization: 'Bearer ' + token } : {}; };
  const notify = () => { update(); if (!user && currentPrimaryView === 'my') { setPrimaryView('frames'); render(false); } document.body.classList.remove('auth-pending'); window.dispatchEvent(new CustomEvent('gallery-auth-change', { detail: { user } })); };
  function update() {
    const name = user ? (user.displayName || (user.email && !user.email.endsWith('@users.invalid') ? user.email : '公司成员')) : '登录';
    $('accountName').textContent = name; $('accountMenuHeading').textContent = user ? name : '未登录';
    document.querySelector('.account-avatar').textContent = user ? name.slice(0, 1) : '人';
    $('myNav').dataset.auth = user ? 'user' : 'guest';
    $('myNav').setAttribute('aria-label', user ? name : '登录');
    $('accountLogin').hidden = Boolean(user); $('accountLogout').hidden = !user;
    $('accountCenter').hidden = !user;
    $('accountLogout').textContent = '退出登录';
    $('accountPreviewNotice').hidden = !preview;
  }
  function closeMenu() { menu.hidden = true; $('myNav').setAttribute('aria-expanded', 'false'); }
  async function initialize() {
    if (!enabled) {
      try { preview = previewAvailable && sessionStorage.getItem(previewSessionKey) === 'true'; } catch {}
      if (preview) user = { id: 'local-preview', displayName: '预览账号' };
      notify(); return;
    }
    try {
      const modeResponse = await fetch(api + '/api/auth/mode', { credentials: 'same-origin' });
      if (!modeResponse.ok) throw new Error();
      mode = (await modeResponse.json()).mode;
      const me = await fetch(api + '/api/auth/me', { headers: headers(), credentials: 'same-origin' });
      if (me.ok) user = (await me.json()).user;
      else if (me.status === 401) localStorage.removeItem(tokenKey);
    } catch { mode = null; }
    notify();
  }
  const ready = initialize();
  async function requireLogin() {
    await ready;
    if (user) {
      if (preview) return true;
      try {
        const response = await fetch(api + '/api/auth/me', { headers: headers(), credentials: 'same-origin' });
        if (response.ok) return true;
        if (response.status !== 401 && response.status !== 403) throw new Error('无法验证登录状态，请检查网络后重试。');
        user = null; localStorage.removeItem(tokenKey); notify();
      } catch { $('accountLoginError').textContent = '无法验证登录状态，请检查网络后重试。'; if (!dialog.open) dialog.showModal(); return false; }
    }
    showLogin(); return false;
  }
  function showLogin() {
    closeMenu(); $('accountLoginError').textContent = '';
    $('accountPasswordForm').hidden = mode !== 'password'; $('accountDingLogin').hidden = mode !== 'dingtalk';
    $('accountPreviewButton').hidden = !previewAvailable;
    $('accountLoginMessage').textContent = !enabled ? '当前是本地预览，尚未连接登录服务。接入公司后台后即可登录、收藏和下载。' : !mode ? '登录服务暂时不可用，请稍后重试。' : '登录后可以收藏和下载素材。';
    if (mode === 'dingtalk') $('accountDingLogin').href = api + '/auth/dingtalk?next=' + encodeURIComponent(location.pathname + location.search + '#my');
    if (!dialog.open) dialog.showModal();
  }
  $('myNav').addEventListener('click', async () => { await ready; if (!user) { showLogin(); return; } menu.hidden = !menu.hidden; $('myNav').setAttribute('aria-expanded', String(!menu.hidden)); });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && !$('myNav').contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); $('myNav').focus(); } });
  $('accountLogin').addEventListener('click', showLogin);
  $('accountLoginClose').addEventListener('click', () => dialog.close());
  $('accountPreviewButton').addEventListener('click', () => {
    if (!previewAvailable) return; preview = true; user = { id: 'local-preview', displayName: '预览账号' };
    try { sessionStorage.setItem(previewSessionKey, 'true'); } catch {}
    dialog.close(); notify(); showMyView(); window.assetWorkflow.setMode('favorites');
  });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  $('accountPasswordForm').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget, submit = form.querySelector('button'); submit.disabled = true; $('accountLoginError').textContent = '';
    try {
      const response = await fetch(api + '/api/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.elements.email.value, password: form.elements.password.value }) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || '登录失败，请重试。');
      // The session cookie is HttpOnly; do not persist the returned token.
      localStorage.removeItem(tokenKey); user = data.user; form.reset(); dialog.close(); notify();
    } catch (error) { $('accountLoginError').textContent = error.message; } finally { submit.disabled = false; }
  });
  async function openPersonal(modeName) { closeMenu(); if (!await requireLogin()) return; showMyView(); window.assetWorkflow.setMode(modeName); }
  $('accountCenter').addEventListener('click', () => openPersonal('favorites'));
  $('accountLogout').addEventListener('click', async () => {
    if (preview) { preview = false; user = null; try { sessionStorage.removeItem(previewSessionKey); } catch {} closeMenu(); notify(); return; }
    const button = $('accountLogout');
    button.disabled = true;
    try {
      const response = await fetch(api + '/api/auth/logout', { method: 'POST', headers: headers(), credentials: 'same-origin' });
      if (!response.ok) throw new Error();
      localStorage.removeItem(tokenKey); user = null; closeMenu(); notify();
      if (config.useSameOrigin && mode === 'dingtalk') location.href = '/login';
    } catch { alert('退出失败，请检查网络后重试。'); }
    finally { button.disabled = false; }
  });
  window.galleryAuth = { ready, requireLogin, headers, api, enabled, user: () => user, isPreview: () => preview, showLogin };
})();
