(() => {
  const $ = (id) => document.getElementById(id);
  const previewFavoritesKey = 'huajiao-gallery-preview-favorites-v1';
  const legacyFavoritesKey = 'huajiao-gallery-favorites-v1';
  const recentKey = 'huajiao-gallery-recent-v1';
  const historyKey = 'huajiao-gallery-history-v2';
  const downloadKey = 'huajiao-gallery-downloads-v1';
  const viewState = { mode: currentPrimaryView === 'my' ? 'favorites' : 'all', favorites: new Set(), recent: [], downloads: {} };
  const config = window.ASSET_BACKEND_CONFIG || {};
  const apiBase = String(config.apiBaseUrl || '').replace(/\/$/, '');
  const backendEnabled = Boolean(config.useSameOrigin || apiBase);
  const apiHeaders = () => { const token = localStorage.getItem('huajiao-gallery-api-token-v1') || ''; return token ? { Authorization: `Bearer ${token}` } : {}; };
  const protectedImageUrls = new Map();
  const localRead = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
  const localWrite = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  viewState.favorites = new Set();
  viewState.recent = localRead(recentKey, []);
  if (!Array.isArray(viewState.recent)) viewState.recent = [];
  let history = localRead(historyKey, []);
  if (!Array.isArray(history)) history = [];
  let historyRange = 'all';
  viewState.downloads = localRead(downloadKey, {});

  function itemsForCurrentCategory() {
    if (currentPrimaryView === 'my') return [...data.items, ...uploadedItems, ...remoteItems];
    if (currentAssetCategory === 'frames') return [...data.items.filter((item) => !item.asset_category), ...uploadedItems.filter((item) => !item.asset_category), ...remoteItems.filter((item) => item.asset_category === 'frames')];
    return [...data.items.filter((item) => item.asset_category === currentAssetCategory), ...uploadedItems.filter((item) => item.asset_category === currentAssetCategory), ...remoteItems.filter((item) => item.asset_category === currentAssetCategory)];
  }
  function findItem(id) { return itemsForCurrentCategory().find((item) => String(item.id) === String(id)); }
  function itemTags(item) { return [...new Set([...(item.tags || []), ...(item.rendering || []), ...(item.materials || []), ...(item.motifs || [])].filter(Boolean))]; }
  function itemUseCases(item) { return [...new Set([...(item.useCases || []), ...(item.use_cases || []), ...(item.motifs || [])].filter(Boolean))]; }
  function itemDate(item) { return String(item.updatedAt || item.updated_at || item.added_date || item.createdAt || item.created_at || item.addedAt || ''); }
  function keyFor(item) { return String(item.id); }
  function localDay(value = new Date()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
  function selectedHistoryDay() {
    if (historyRange === 'date') return $('historyDate').value;
    if (historyRange === 'today') return localDay();
    if (historyRange === 'yesterday') { const date = new Date(); date.setDate(date.getDate() - 1); return localDay(date); }
    return '';
  }
  function setHistoryRange(value) {
    historyRange = value;
    document.querySelectorAll('[data-history-range]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.historyRange === value)));
    $('historyDate').classList.toggle('is-selected', value === 'date');
    if (value !== 'date') $('historyDate').value = '';
    updateHistoryDateTrigger();
    render(false);
  }
  function matches(item) {
    const key = keyFor(item);
    if (viewState.mode === 'favorites' && !viewState.favorites.has(key)) return false;
    if (viewState.mode === 'recent') {
      if (!viewState.recent.includes(key) && !history.some(entry => entry.id === key)) return false;
      const day = selectedHistoryDay();
      if (day && !history.some(entry => entry.id === key && localDay(entry.viewedAt) === day)) return false;
    }
    return true;
  }
  function sortItems(items) {
    if (viewState.mode === 'recent') items.sort((a, b) => {
      const day = selectedHistoryDay();
      const index = item => history.findIndex(entry => entry.id === keyFor(item) && (!day || localDay(entry.viewedAt) === day));
      const ia = index(a), ib = index(b);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
      return viewState.recent.indexOf(keyFor(a)) - viewState.recent.indexOf(keyFor(b));
    });
    else items.sort((a, b) => Number(b.user_selected) - Number(a.user_selected) || String(a.id).localeCompare(String(b.id)));
  }
  window.assetWorkflow = { matches, sortItems, setMode, mode: () => viewState.mode };

  function formatSize(bytes) {
    if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return '—';
    const size = Number(bytes);
    return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
  }
  function imageUrl(item, original = false) {
    if (item.remote_id) return original ? (item.original_url || item.image_url) : item.image_url;
    if (item.local_url) return item.local_url;
    const path = original ? item.path : (item.thumbnail_path || item.path?.replace(/^assets\//, 'assets/thumbs/'));
    return path ? `jing-tai-tou-xiang-kuang-zhi-zuo/${path}` : '';
  }
  function detailImageUrl(item) {
    if (item.remote_id) return window.galleryAuth.user() ? (item.preview_url || item.image_url) : item.image_url;
    if (item.local_url) return item.local_url;
    const path = window.galleryAuth.user() ? item.path : (item.thumbnail_path || item.path?.replace(/^assets\//, 'assets/thumbs/'));
    return path ? `jing-tai-tou-xiang-kuang-zhi-zuo/${path}` : '';
  }
  function filename(item) { return item.download_filename || item.source_filename || item.filename || item.title || '素材'; }
  function extension(item) {
    const match = filename(item).match(/\.([a-z0-9]+)$/i) || String(item.path || '').match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toUpperCase() : (item.mimeType || '').split('/')[1]?.toUpperCase() || '—';
  }
  function categoryName(item) {
    const category = item.asset_category || item.category;
    if (category && assetCategoryLabels[category]) return assetCategoryLabels[category];
    return String(item.primary_category || item.collection || '头像框').replace(/^\d{2}\s*/, '');
  }
  function syncFavoriteButton(button, item) {
    const active = viewState.favorites.has(keyFor(item));
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? `取消收藏：${item.title}` : `收藏：${item.title}`);
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.75 5.58 6.16.9-4.45 4.33 1.05 6.13L12 17.05l-5.51 2.89 1.05-6.13L3.1 9.48l6.15-.9L12 3Z"/></svg>';
  }
  let favoriteLoadVersion = 0;
  async function loadFavorites() {
    const version = ++favoriteLoadVersion;
    viewState.favorites = new Set();
    if (window.galleryAuth.isPreview()) {
      const stored = localRead(previewFavoritesKey, null) ?? localRead(legacyFavoritesKey, []);
      viewState.favorites = new Set(Array.isArray(stored) ? stored : []);
    } else if (window.galleryAuth.user()) {
      try {
        const response = await fetch(apiBase + '/api/favorites', { headers: apiHeaders(), credentials: 'same-origin' });
        if (!response.ok) throw new Error('收藏暂时无法读取，请检查登录状态。');
        const payload = await response.json();
        if (version !== favoriteLoadVersion) return;
        viewState.favorites = new Set(payload.favorites || []);
      } catch (error) { if (version === favoriteLoadVersion) console.warn(error.message); }
    }
    if (version === favoriteLoadVersion) render(false);
  }
  async function toggleFavorite(item) {
    if (!await window.galleryAuth.requireLogin()) return;
    const key = keyFor(item), next = !viewState.favorites.has(key);
    if (window.galleryAuth.isPreview()) {
      if (next) viewState.favorites.add(key); else viewState.favorites.delete(key);
      localWrite(previewFavoritesKey, [...viewState.favorites]);
      if ($('assetDetailDialog').open) $('detailFavorite').textContent = next ? '★ 已收藏' : '☆ 收藏';
      render(false); return;
    }
    try {
      const response = await fetch(apiBase + '/api/favorites/' + encodeURIComponent(key), { method: 'PUT', credentials: 'same-origin', headers: { ...apiHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: next }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { if (response.status === 401) { await window.galleryAuth.requireLogin(); return; } throw new Error(payload.error || '收藏失败，请重试。'); }
      if (next) viewState.favorites.add(key); else viewState.favorites.delete(key);
      decorateCards();
      if ($('assetDetailDialog').open) $('detailFavorite').textContent = viewState.favorites.has(key) ? '★ 已收藏' : '☆ 收藏';
      render(false);
    } catch (error) { alert(error.message); }
  }
  async function removeFromGallery(item, button) {
    if (!await window.galleryAuth.requireLogin()) return;
    if (window.galleryAuth.isPreview()) { alert('这是本机预览模式，仅展示删除按钮。接入后台并获得管理员授权后即可删除素材。'); return; }
    if (!window.galleryAuth.user()?.canDeleteAssets) return;
    const message = item.remote_id
      ? `确定删除「${item.title}」吗？删除后无法恢复。`
      : `确定从素材库中移除「${item.title}」吗？该素材将不再出现在共享图库中。`;
    if (!confirm(message)) return;
    button.disabled = true;
    try {
      const endpoint = item.remote_id ? '/api/assets/' + encodeURIComponent(item.remote_id) : '/api/catalog/' + encodeURIComponent(item.id);
      const response = await fetch(apiBase + endpoint, { method: 'DELETE', headers: apiHeaders(), credentials: 'same-origin' });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || '删除失败，请重试。'); }
      if (item.remote_id) { remoteItems = remoteItems.filter(entry => entry.remote_id !== item.remote_id); }
      else { data.items = data.items.filter(entry => entry.id !== item.id); }
      render(false);
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
  }
  function decorateCards() {
    document.querySelectorAll('#grid .card[data-item-id]').forEach((card) => {
      const item = findItem(card.dataset.itemId);
      if (!item) return;
      let favorite = card.querySelector('.favorite-toggle');
      if (!favorite) {
        favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'favorite-toggle';
        favorite.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); const latest = findItem(card.dataset.itemId); if (latest) toggleFavorite(latest); });
        card.querySelector('.card-actions').prepend(favorite);
      }
      const actions = card.querySelector('.card-actions');
      let remove = actions.querySelector('.delete-button');
      const canDelete = !item.local_url && (window.galleryAuth.isPreview() || (backendEnabled && window.galleryAuth.user()?.canDeleteAssets));
      if (canDelete && !remove) {
        remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-button';
        remove.setAttribute('aria-label', `删除：${item.title}`); remove.title = '删除素材';
        remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg>';
        remove.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); const latest = findItem(card.dataset.itemId); if (latest) removeFromGallery(latest, remove); });
        actions.append(remove);
      } else if (!canDelete && remove) remove.remove();
      syncFavoriteButton(favorite, item);
      if (item.remote_id) hydrateImage(card.querySelector('.picture img'), item.image_url);
    });
  }
  async function hydrateImage(image, url) {
    const token = localStorage.getItem('huajiao-gallery-api-token-v1') || '';
    if (!image || !url || !token || !apiBase || new URL(url, location.href).origin === location.origin) return;
    if (image.dataset.protectedImage === url) return;
    image.dataset.protectedImage = url;
    if (protectedImageUrls.has(url)) { image.src = protectedImageUrls.get(url); return; }
    try {
      const response = await fetch(url, { headers: apiHeaders() });
      if (!response.ok) return;
      const objectUrl = URL.createObjectURL(await response.blob());
      protectedImageUrls.set(url, objectUrl);
      if (image.isConnected) image.src = objectUrl;
    } catch {}
  }
  const metadataKey = 'huajiao-gallery-creation-metadata-v1';
  let detailItem = null, detailVersion = 0;
  const detailIsLocal = item => !backendEnabled || Boolean(item.local_url);
  function showMetadata(metadata) {
    $('detailCreator').textContent = metadata.creator || '未填写';
    $('detailCreatedDate').textContent = metadata.createdDate ? formatDate(metadata.createdDate) : '未填写';
  }
  async function updateDetailMetadata(item, version) {
    try {
      let metadata;
      if (detailIsLocal(item)) metadata = localRead(metadataKey, {})[keyFor(item)] || { creator: item.creator || '', createdDate: item.createdDate || '' };
      else {
        const response = await fetch(apiBase + '/api/asset-metadata/' + encodeURIComponent(keyFor(item)), { credentials: 'same-origin', headers: apiHeaders() });
        if (!response.ok) throw new Error();
        metadata = await response.json();
      }
      if (version === detailVersion && detailItem === item && $('assetDetailDialog').open) showMetadata(metadata);
    } catch { if (version === detailVersion && detailItem === item && $('assetDetailDialog').open) { $('detailCreator').textContent = '暂时无法读取'; $('detailCreatedDate').textContent = '暂时无法读取'; } }
  }
  async function updateDetailUsage(item, version) {
    try {
      const result = await window.getAssetUsageSummary(item);
      if (version !== detailVersion || detailItem !== item || !$('assetDetailDialog').open) return;
      const unique = values => [...new Set(values.filter(Boolean))].join('、') || '暂无记录';
      $('detailUsers').textContent = result.loginRequired ? '登录后查看' : unique(result.records.map(record => record.actor));
      $('detailBusinesses').textContent = result.loginRequired ? '登录后查看' : unique(result.records.map(record => record.activity));
      const usageButton = $('detailUsage').querySelector('button');
      if (usageButton) usageButton.textContent = (usageOf(item) === 'used' ? '已使用' : '未使用') + ' · 查看记录';
    } catch { if (version === detailVersion && detailItem === item && $('assetDetailDialog').open) { $('detailUsers').textContent = '暂时无法读取'; $('detailBusinesses').textContent = '暂时无法读取'; } }
  }
  window.addEventListener('gallery-usage-updated', event => { if (detailItem && event.detail.key === keyFor(detailItem)) updateDetailUsage(detailItem, detailVersion); });
  function openDetail(item) {
    if (!item) return;
    detailItem = item; const version = ++detailVersion;
    showMetadata({}); $('detailUsers').textContent = '正在读取…'; $('detailBusinesses').textContent = '正在读取…';
    const key = keyFor(item);
    viewState.recent = [key, ...viewState.recent.filter((value) => value !== key)].slice(0, 60);
    localWrite(recentKey, viewState.recent);
    const viewedAt = new Date().toISOString();
    history = [{ id: key, viewedAt }, ...history.filter(entry => !(entry.id === key && localDay(entry.viewedAt) === localDay(viewedAt)))].slice(0, 1000);
    localWrite(historyKey, history);
    $('detailImage').src = detailImageUrl(item);
    $('detailImage').alt = item.title;
    if (item.remote_id) hydrateImage($('detailImage'), detailImageUrl(item));
    $('detailCategory').textContent = categoryName(item);
    $('detailTitle').textContent = item.title;
    $('detailTags').replaceChildren(...itemTags(item).slice(0, 5).map((tag) => { const chip = document.createElement('span'); chip.textContent = tag; return chip; }));
    const dimensions = item.width && item.height ? [item.width, item.height] : (item.size || []);
    $('detailDimensions').textContent = dimensions.length >= 2 ? `${dimensions[0]} × ${dimensions[1]} px` : '—';
    $('detailFormat').textContent = extension(item);
    $('detailSize').textContent = formatSize(item.sizeBytes || item.size_bytes);
    $('detailUpdated').textContent = formatDate(itemDate(item));
    $('detailUsage').textContent = typeof usageOf === 'function' ? (usageOf(item) === 'used' ? '已使用' : '未使用') : (item.is_used ? '已使用' : '未使用');
    $('detailUsage').replaceChildren(Object.assign(document.createElement('button'), { type: 'button', textContent: typeof usageOf === 'function' && usageOf(item) === 'used' ? '已使用 · 查看记录' : '未使用 · 查看记录', onclick: () => window.openUsageRecords(item) }));
    $('detailReviewNote').hidden = !item.reviewNote;
    $('detailReviewNote').textContent = item.reviewNote ? `审核修改意见：${item.reviewNote}` : '';
    const download = $('detailDownload');
    download.href = imageUrl(item, true); download.download = filename(item); download.dataset.itemId = key;
    syncFavoriteButton($('detailFavorite'), item); $('detailFavorite').textContent = viewState.favorites.has(key) ? '★ 已收藏' : '☆ 收藏';
    $('detailFavorite').onclick = () => toggleFavorite(item);
    $('assetDetailDialog').showModal();
    updateDetailMetadata(item, version); updateDetailUsage(item, version);
  }
  function touchDownload(item) {
    const key = keyFor(item);
    viewState.downloads[key] = (viewState.downloads[key] || 0) + 1;
    localWrite(downloadKey, viewState.downloads);
    if (backendEnabled) {
      fetch(`${apiBase}/api/metrics/downloads/${encodeURIComponent(key)}`, { method: 'POST', headers: apiHeaders() })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => { if (payload?.downloads) viewState.downloads[key] = Math.max(viewState.downloads[key], payload.downloads); localWrite(downloadKey, viewState.downloads); })
        .catch(() => {});
    }
  }
  async function downloadItem(item, event) {
    event?.preventDefault();
    if (!item || !await window.galleryAuth.requireLogin()) return;
    if (window.galleryAuth.isPreview()) { alert('这是本机预览模式，接入公司钉钉并登录后即可下载。'); return; }
    const url = imageUrl(item, true);
    try {
      const response = await fetch(url, { headers: apiHeaders(), credentials: 'same-origin' });
      if (!response.ok) { if (response.status === 401) { await window.galleryAuth.requireLogin(); return; } throw new Error('原图下载失败，请稍后重试。'); }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = filename(item); document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000); touchDownload(item);
    } catch (error) { alert(error.message); }
  }
  function closeBackdrop(dialog) { dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }); }

  function setMode(mode, shouldRender = true) {
    viewState.mode = mode;
    $('personalViewContext').hidden = true;
    $('historyFilters').hidden = mode !== 'recent';
    if (mode === 'recent') { historyRange = 'all'; $('historyDate').value = ''; $('historyDate').classList.remove('is-selected'); document.querySelectorAll('[data-history-range]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.historyRange === 'all'))); }
    document.querySelectorAll('[data-library-view]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.libraryView === mode)));
    document.querySelectorAll('[data-my-action]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.myAction === mode)));
    if (typeof updateHistoryDateTrigger === 'function') updateHistoryDateTrigger();
    if (mode !== 'recent' && typeof closeHistoryCalendar === 'function') closeHistoryCalendar();
    if (shouldRender) render(false);
  }
  document.querySelectorAll('[data-library-view]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.libraryView)));
  document.querySelectorAll('[data-my-action]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.myAction)));
  document.querySelectorAll('[data-history-range]').forEach(button => button.addEventListener('click', () => setHistoryRange(button.dataset.historyRange)));
  const historyCalendar = $('historyCalendar');
  const historyDateTrigger = $('historyDateTrigger');
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  function updateHistoryDateTrigger() {
    $('historyDateText').textContent = $('historyDate').value || '选择日期';
    historyDateTrigger.classList.toggle('is-selected', Boolean($('historyDate').value));
  }
  function closeHistoryCalendar(restoreFocus = false) {
    historyCalendar.hidden = true;
    historyDateTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) historyDateTrigger.focus();
  }
  function renderHistoryCalendar() {
    const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
    $('historyCalendarMonth').textContent = `${year}年${month + 1}月`;
    const days = $('historyCalendarDays');
    days.replaceChildren();
    const start = new Date(year, month, 1 - new Date(year, month, 1).getDay());
    const today = localDay();
    for (let i = 0; i < 42; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const day = localDay(date);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = date.getDate();
      button.dataset.day = day;
      button.setAttribute('aria-label', `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`);
      button.setAttribute('aria-pressed', String(day === $('historyDate').value));
      button.classList.toggle('outside-month', date.getMonth() !== month);
      button.classList.toggle('today', day === today);
      button.disabled = day > today;
      days.append(button);
    }
  }
  historyDateTrigger.addEventListener('click', () => {
    if (!historyCalendar.hidden) { closeHistoryCalendar(); return; }
    const selected = $('historyDate').value;
    const date = selected ? new Date(`${selected}T00:00:00`) : new Date();
    calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    renderHistoryCalendar();
    historyCalendar.hidden = false;
    historyDateTrigger.setAttribute('aria-expanded', 'true');
  });
  historyCalendar.addEventListener('click', event => {
    const shift = event.target.closest('[data-calendar-shift]');
    if (shift) { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + Number(shift.dataset.calendarShift), 1); renderHistoryCalendar(); return; }
    const day = event.target.closest('[data-day]');
    if (day && !day.disabled) { $('historyDate').value = day.dataset.day; setHistoryRange('date'); closeHistoryCalendar(true); }
  });
  document.addEventListener('click', event => { if (!$('historyDatePicker').contains(event.target)) closeHistoryCalendar(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !historyCalendar.hidden) { event.preventDefault(); closeHistoryCalendar(true); } });
  $('assetDetailDialog').addEventListener('close', () => { detailItem = null; detailVersion++; if (viewState.mode === 'recent') render(false); });
  $('backToAllAssets').addEventListener('click', () => document.querySelector('[data-library-view=all]').click());
  $('grid').addEventListener('click', (event) => {
    const download = event.target.closest('.download-button');
    if (download) { const item = findItem(download.closest('.card')?.dataset.itemId); if (item) downloadItem(item, event); return; }
    if (event.target.closest('.favorite-toggle,.delete-button,.usage-tag')) return;
    const card = event.target.closest('.card[data-item-id]');
    if (card) { event.preventDefault(); const item = findItem(card.dataset.itemId); if (item) openDetail(item); }
  });
  $('detailDownload').addEventListener('click', (event) => { const item = findItem($('detailDownload').dataset.itemId); if (item) downloadItem(item, event); });
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => $(button.dataset.closeDialog).close()));
  closeBackdrop($('assetDetailDialog'));
  const observer = new MutationObserver(() => decorateCards());
  observer.observe($('grid'), { childList: true });
  window.addEventListener('gallery-auth-change', loadFavorites);
  window.galleryAuth.ready.then(loadFavorites);
  decorateCards();
})();
