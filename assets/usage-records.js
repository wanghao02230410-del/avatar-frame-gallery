(() => {
  const localKey = 'huajiao-gallery-usage-records-v1';
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const read = () => { try { const data = JSON.parse(localStorage.getItem(localKey) || '{}'); return data && typeof data === 'object' ? data : {}; } catch { return {}; } };
  const active = r => !r.cancelledAt && (!r.exclusive || r.expiresOn >= today());
  window.localUsageActive = key => (read()[key] || []).some(active);
  const keyOf = item => item.remote_id ? 'api-' + item.remote_id : String(item.id);
  const headers = () => { const token = localStorage.getItem('huajiao-gallery-api-token-v1'); return { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }; };
  async function call(url, options = {}) {
    const response = await fetch(backendApi + url, { credentials: 'same-origin', headers: headers(), ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '操作失败，请稍后重试。');
    return payload;
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'workflow-dialog usage-dialog';
  dialog.setAttribute('aria-labelledby', 'usageTitle');
  dialog.innerHTML = `<div class="workflow-dialog-inner"><div class="workflow-dialog-head"><h2 id="usageTitle">素材使用记录</h2><button type="button" class="workflow-close" aria-label="关闭">×</button></div>
    <p class="usage-asset-title"></p><p class="request-local-notice usage-mode" hidden>当前为本地预览，记录仅保存在此浏览器，不能防止其他人重复预订。</p>
    <div class="usage-legacy" hidden>此素材有旧版“已使用”标记，未记录人员和活动。 <button type="button" class="usage-clear">清除旧标记</button></div>
    <div class="usage-list" aria-live="polite"></div><h3>登记使用或预订</h3>
    <form class="request-form usage-form"><label class="field full usage-actor-field">使用者<input name="actor" maxlength="80" required placeholder="填写使用者姓名"></label>
    <label class="field full">使用业务 / 活动名称<input name="activity" maxlength="120" required placeholder="例如：周年庆活动"></label>
    <label class="usage-check full"><input type="checkbox" name="exclusive"> 独占预订</label>
    <label class="field full usage-date" hidden>预订截止日期（含当天）<input type="date" name="expiresOn"></label>
    <p class="usage-help full">普通使用记录持续有效，结束后可释放；独占预订在截止日期后自动释放。有效独占预订期间不能登记其他使用。</p>
    <div class="usage-error full" role="alert"></div><div class="dialog-actions full"><button class="usage-submit" type="submit">登记</button></div></form></div>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const form = $('form'), error = $('.usage-error'), list = $('.usage-list');
  let selected = null;
  dialog.querySelector('.workflow-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  form.elements.namedItem('exclusive').addEventListener('change', () => { const checked = form.elements.namedItem('exclusive').checked; $('.usage-date').hidden = !checked; form.elements.namedItem('expiresOn').required = checked; form.elements.namedItem('expiresOn').min = today(); });
  function recordLine(record) {
    const card = document.createElement('div'); card.className = 'usage-record';
    const heading = document.createElement('strong'); heading.textContent = record.activity;
    const state = record.cancelledAt ? '已结束' : (record.exclusive && record.expiresOn < today() ? '已到期' : record.exclusive ? '独占预订中' : '使用中');
    const detail = document.createElement('p'); detail.textContent = `${record.actor} · ${state}${record.exclusive ? ' · 截止 ' + record.expiresOn : ''} · 登记于 ${record.createdAt.slice(0, 10)}`;
    card.append(heading, detail);
    if (record.canCancel && active(record)) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = record.exclusive ? '取消预订' : '结束使用';
      button.addEventListener('click', async () => { button.disabled = true; error.textContent = ''; try {
        const key = keyOf(selected);
        if (backendEnabled) await call('/api/usage/' + encodeURIComponent(key) + '/records/' + encodeURIComponent(record.id), { method: 'DELETE' });
        else { const data = read(); const r = (data[key] || []).find(x => x.id === record.id); if (r) r.cancelledAt = new Date().toISOString(); localStorage.setItem(localKey, JSON.stringify(data)); }
        await refresh();
      } catch (e) { error.textContent = e.message; button.disabled = false; } });
      card.append(button);
    }
    return card;
  }
  async function refresh() {
    const item = selected, key = keyOf(item); let result;
    list.textContent = '正在读取记录…';
    if (backendEnabled) result = await call('/api/usage/' + encodeURIComponent(key) + '/records');
    else result = { records: (read()[key] || []).map(r => ({ ...r, canCancel: true })), legacyUsed: usageMap[key] === 'used' };
    if (selected !== item || !dialog.open) return;
    $('.usage-legacy').hidden = !result.legacyUsed;
    list.replaceChildren(...result.records.map(recordLine));
    if (!result.records.length) { const empty = document.createElement('p'); empty.className = 'usage-empty'; empty.textContent = '暂无使用记录'; list.append(empty); }
    if (backendEnabled) await refreshRemoteItems(); else render(false);
    window.dispatchEvent(new CustomEvent('gallery-usage-updated', { detail: { key } }));
  }
  window.getAssetUsageSummary = async item => {
    const key = keyOf(item);
    if (backendEnabled && !window.galleryAuth.user()) return { loginRequired: true, records: [] };
    const result = backendEnabled ? await call('/api/usage/' + encodeURIComponent(key) + '/records') : { records: read()[key] || [] };
    return { records: (result.records || []).filter(active) };
  };
  window.openUsageRecords = async item => {
    selected = item; form.reset(); form.elements.namedItem('exclusive').dispatchEvent(new Event('change')); error.textContent = '';
    $('.usage-asset-title').textContent = item.title; $('.usage-mode').hidden = backendEnabled;
    $('.usage-legacy').hidden = true; list.textContent = '正在读取记录…';
    if (!dialog.open) dialog.showModal();
    try { await refresh(); } catch (e) { list.textContent = ''; error.textContent = e.message; }
  };
  $('.usage-clear').addEventListener('click', async () => { error.textContent = ''; try {
    const key = keyOf(selected);
    if (backendEnabled) await call('/api/usage/' + encodeURIComponent(key), { method: 'PUT', body: JSON.stringify({ isUsed: false }) });
    else { delete usageMap[key]; saveUsage(); }
    await refresh();
  } catch (e) { error.textContent = e.message; } });
  form.addEventListener('submit', async e => {
    e.preventDefault(); error.textContent = ''; const key = keyOf(selected), exclusive = form.elements.namedItem('exclusive').checked;
    const activity = form.elements.namedItem('activity').value.trim(), actor = form.elements.namedItem('actor').value.trim(), expiresOn = form.elements.namedItem('expiresOn').value;
    if (!activity || !actor) { error.textContent = '请填写使用者和使用业务。'; return; }
    if (exclusive && (!expiresOn || expiresOn < today())) { error.textContent = '请选择今天或之后的截止日期。'; return; }
    const submit = $('.usage-submit'); submit.disabled = true;
    try {
      if (backendEnabled) await call('/api/usage/' + encodeURIComponent(key) + '/records', { method: 'POST', body: JSON.stringify({ activity, actor, exclusive, expiresOn: exclusive ? expiresOn : '' }) });
      else {
        const data = read(), records = data[key] || [], existing = records.filter(active);
        if (existing.some(r => r.exclusive) || (exclusive && (existing.length || usageMap[key] === 'used'))) throw new Error('素材已有使用记录或有效独占预订，无法建立冲突的预订。');
        records.unshift({ id: crypto.randomUUID(), activity, actor, exclusive, expiresOn: exclusive ? expiresOn : '', createdAt: new Date().toISOString(), cancelledAt: '' });
        data[key] = records; localStorage.setItem(localKey, JSON.stringify(data));
      }
      form.reset(); form.elements.namedItem('exclusive').dispatchEvent(new Event('change')); await refresh();
    } catch (err) { error.textContent = err.message; } finally { submit.disabled = false; }
  });
  window.addEventListener('storage', e => { if (e.key === localKey) render(false); });
})();
