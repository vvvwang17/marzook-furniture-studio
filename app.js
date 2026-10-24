'use strict';
(() => {
  const WIDTH = 1600, HEIGHT = 1000, STORAGE_KEY = 'marzook-furniture-studio-v1';
  const $ = (id) => document.getElementById(id);
  const catalog = window.FURNITURE_CATALOG || { items: [], meta: {} };
  const items = [], itemMap = new Map(), imageCache = new Map(), failedAssets = new Set();
  for (const source of Array.isArray(catalog.items) ? catalog.items : []) {
    if (!source || typeof source.id !== 'string' || itemMap.has(source.id)) continue;
    const item = { ...source, name_cn: String(source.name_cn || source.id), category: String(source.category || '其他'), colors: Array.isArray(source.colors) ? source.colors : [], source_urls: Array.isArray(source.source_urls) ? source.source_urls : [] };
    items.push(item); itemMap.set(item.id, item);
  }
  const aliasMap = new Map();
  for (const item of items) for (const alias of item.aliases || []) aliasMap.set(alias, item.id);
  const canonicalId = id => itemMap.has(id) ? id : aliasMap.get(id);
  let state = { version: 1, title: '我的搭配 · Option 01', note: '', background: 'white', picked: [], instances: [] };
  let activeUid = null, filter = new URLSearchParams(location.search).get('collection') === 'purchased' ? '已购' : '全部', search = '', readyOnly = false, modelsOnly = false, priorityOnly = false, detailId = null, undoStack = [], drag = null, toastTimer = null, saveTimer = null, libraryDragEnded = 0;
  let storageAvailable = true;
  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
  const num = (n, fallback) => Number.isFinite(Number(n)) ? Number(n) : fallback;
  const uid = () => window.crypto?.randomUUID?.() || 'piece-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  const esc = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function localPath(path) { return typeof path === 'string' && path.length && !/^(?:[a-z]+:|\/\/)/i.test(path) && !path.split(/[\\/]/).includes('..') ? path : null; }
  function safeLink(url) { try { const u = new URL(url); return u.protocol === 'https:' ? u.href : null; } catch { return null; } }
  function ready(item) { return item?.status === 'ready' && !!localPath(item.asset) && !failedAssets.has(item.id); }
  function purchased(item) { return item?.purchaseStatus === 'purchased' || item?.collection === '已购'; }
  function modelStatus(id) { return window.FurnitureModels?.getStatus(id) || { ready:false, label:'同款模型待匹配' }; }
  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.instances) || !Array.isArray(raw.picked)) throw new Error('文件不是有效的搭配方案 JSON。');
    const seen = new Set();
    const instances = raw.instances.slice(0, 250).flatMap((p) => {
      if (!p || !canonicalId(p.itemId)) return [];
      let id = typeof p.uid === 'string' ? p.uid : uid(); if (seen.has(id)) id = uid(); seen.add(id);
      const w = clamp(num(p.w, 320), 1, WIDTH), h = clamp(num(p.h, 280), 1, HEIGHT);
      return [{ uid: id, itemId: canonicalId(p.itemId), x: clamp(num(p.x, 0), 0, WIDTH - w), y: clamp(num(p.y, 0), 0, HEIGHT - h), w, h, z: num(p.z, 0) }];
    });
    instances.sort((a, b) => a.z - b.z).forEach((p, i) => p.z = i);
    return { version: 1, title: String(raw.title || '我的搭配 · Option 01').slice(0, 80), note: String(raw.note || '').slice(0, 5000), background: raw.background === 'cream' ? 'cream' : 'white', picked: [...new Set(raw.picked.map(canonicalId).filter(Boolean))], instances };
  }
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved && items.length) state = sanitize(JSON.parse(saved)); } catch { storageAvailable = false; }
  function persist() {
    window.dispatchEvent(new CustomEvent('marzook:picks-changed'));
    clearTimeout(saveTimer); $('save-status').textContent = '正在保存…';
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); $('save-status').textContent = '已保存至此浏览器'; storageAvailable = true; }
      catch { storageAvailable = false; $('save-status').textContent = '请用 JSON 保存方案'; }
    }, 180);
  }
  function checkpoint() { undoStack.push(JSON.stringify(state)); if (undoStack.length > 50) undoStack.shift(); updateButtons(); }
  function undo() { if (!undoStack.length) return; state = sanitize(JSON.parse(undoStack.pop())); activeUid = null; renderAll(); persist(); toast('已撤销上一步'); }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible'); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200); }
  function message(title, text, copyText = '') {
    $('dialog-title').textContent = title; $('dialog-message').textContent = text; $('dialog-copy').hidden = !copyText; $('dialog-copy').value = copyText;
    $('message-dialog').showModal(); if (copyText) { $('dialog-copy').focus(); $('dialog-copy').select(); }
  }
  function setInputs() { $('board-title').value = state.title; $('design-note').value = state.note; }
  function renderFilters() {
    const desired = ['沙发', '单椅', '茶几', '边几', '餐桌', '餐椅', '柜体', '灯具', '装饰品', '地毯', '床'];
    const present = [...new Set(items.map(p => p.category))];
    const categories = ['全部', '已购', ...desired.filter(c => present.includes(c)), ...present.filter(c => !desired.includes(c))];
    $('category-filters').innerHTML = categories.map(c => `<button class="filter${filter === c ? ' active' : ''}" data-category="${esc(c)}" aria-pressed="${filter === c}">${esc(c)}</button>`).join('');
  }
  function updateAddLabels() {
    const mode = document.body.dataset.studioMode;
    const label = mode === 'immersive' ? '加入空间' : mode === 'site' ? '加入现场' : '加入画布';
    $('library-grid').querySelectorAll('[data-add]').forEach(button => {
      const item = itemMap.get(button.dataset.add);
      button.title = button.disabled ? '白底图待制作' : label + '（可重复）';
      button.setAttribute('aria-label', '将' + (item?.name_cn || '') + label);
    });
  }
  function renderLibrary() {
    const q = search.trim().toLowerCase();
    const visible = items.filter(p => (filter === '全部' || (filter === '已购' ? purchased(p) : p.category === filter)) && (!readyOnly || ready(p)) && (!modelsOnly || modelStatus(p.id).ready) && (!priorityOnly || p.priority) && (!q || [p.id, ...(p.aliases || []), p.name_cn, p.category, p.collection, p.priority?'客户优先':'', ...p.colors].join(' ').toLowerCase().includes(q)));
    const completed = items.filter(ready).length;
    $('library-count').textContent = items.length + ' 件';
    $('catalog-summary').textContent = items.length ? `白底 ${completed} / ${items.length} 款 · 可用三维 ${items.filter(p=>modelStatus(p.id).ready).length} 款 · 显示 ${visible.length} 款` : '家具清单尚未载入，接入单品后会显示在这里。';
    $('library-grid').innerHTML = visible.length ? visible.map(p => {
      const isReady = ready(p), src = isReady ? localPath(p.asset) : localPath(p.source_preview), checked = state.picked.includes(p.id);
      return `<article class="product-card ${isReady ? '' : 'pending'} ${checked ? 'picked' : ''}" data-id="${esc(p.id)}"><div class="product-image" data-pick="${esc(p.id)}" title="点击勾选此款"><label class="product-check"><input type="checkbox" data-pickbox="${esc(p.id)}" ${checked ? 'checked' : ''} aria-label="选择${esc(p.name_cn)}"></label><span class="product-category">${purchased(p)?'已购 · ':''}${esc(p.category)}</span>${src ? `<img loading="lazy" src="${esc(src)}" alt="${esc(p.name_cn)}${isReady ? '白底单品图' : '原始参考，待制作'}" data-image-id="${esc(p.id)}">` : '<span class="missing-image">单品图待制作<br>参考图暂未接入</span>'}</div><div class="product-body"><div class="product-name">${esc(p.name_cn)}</div>${p.priority?'<div class="product-priority">客户优先</div>':''}${p.concept_reconstruction?'<div class="product-concept">遮挡细节待核</div>':''}<button class="product-detail" data-detail="${esc(p.id)}">查看大图 / 原图对照 ↗</button><div class="product-meta"><span class="product-id" title="${esc(p.id)}">${esc(p.id)}</span><button class="product-add" data-add="${esc(p.id)}" ${isReady ? '' : 'disabled'} title="${isReady ? '加入画布（可重复）' : '白底图待制作'}" aria-label="将${esc(p.name_cn)}加入画布">＋</button></div></div></article>`;
    }).join('') : `<div class="library-empty">${items.length ? '没有找到匹配的家具。<br>试试其他关键词或分类。' : '清单准备好后，这里会出现客户的真实家具。<br>不会使用虚构的占位家具。'}</div>`;
    updateAddLabels();
    $('library-grid').querySelectorAll('.product-card').forEach(card => {
      const id=card.dataset.id, status=modelStatus(id);
      card.draggable=true;
      card.setAttribute('aria-description', '拖入空间摆放；'+status.label);
      card.querySelector('img')?.setAttribute('draggable','false');
      const badge=document.createElement('div');badge.className='product-model-status'+(status.ready?' model-ready':'');badge.textContent=status.label;
      badge.title=status.note||status.label;
      card.querySelector('.product-body').insertBefore(badge,card.querySelector('.product-detail'));
    });
    $('picked-count').textContent = `已选 ${state.picked.length} 款`;
    $('add-picked').disabled = !state.picked.some(id => ready(itemMap.get(id)));
    $('clear-picks').disabled = state.picked.length === 0;
    $('library-grid').querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
      const id = img.dataset.imageId, p = itemMap.get(id); if (p && img.getAttribute('src') === p.asset) failedAssets.add(id);
      const fallback = document.createElement('span'); fallback.className = 'missing-image'; fallback.textContent = '图片暂不可读取'; img.replaceWith(fallback);
      const add = fallback.closest('.product-card')?.querySelector('[data-add]'); if (add) add.disabled = true;
      $('add-picked').disabled = !state.picked.some(i => ready(itemMap.get(i)));
    }, { once: true }));
  }
  function stylePiece(el, p) { el.style.left = `${p.x / WIDTH * 100}%`; el.style.top = `${p.y / HEIGHT * 100}%`; el.style.width = `${p.w / WIDTH * 100}%`; el.style.height = `${p.h / HEIGHT * 100}%`; el.style.zIndex = p.z + 1; }
  function renderStage() {
    const stage = $('stage'); stage.classList.toggle('cream', state.background === 'cream');
    stage.querySelectorAll('.stage-item').forEach(el => el.remove());
    $('stage-empty').hidden = state.instances.length > 0;
    for (const p of state.instances) {
      const item = itemMap.get(p.itemId); if (!item) continue;
      const el = document.createElement('div'); el.className = 'stage-item' + (p.uid === activeUid ? ' active' : ''); el.dataset.uid = p.uid; el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', `${item.name_cn}，点击选择并拖动`); stylePiece(el, p);
      const img = document.createElement('img'); img.alt = item.name_cn; img.draggable = false;
      const path = localPath(item.asset); if (path) img.src = path; else el.classList.add('image-error');
      img.addEventListener('error', () => el.classList.add('image-error'), { once: true });
      const tag = document.createElement('span'); tag.className = 'item-tag'; tag.textContent = item.id;
      const handle = document.createElement('span'); handle.className = 'resize-handle'; handle.setAttribute('aria-label', '拖动调整大小');
      el.append(img, tag, handle); stage.append(el);
    }
    $('bg-white').classList.toggle('active', state.background === 'white'); $('bg-cream').classList.toggle('active', state.background === 'cream');
    $('bg-white').setAttribute('aria-pressed', state.background === 'white'); $('bg-cream').setAttribute('aria-pressed', state.background === 'cream');
    renderObjectToolbar(); updateButtons();
  }
  function sourceLink(item) { const url = item.source_urls.map(safeLink).find(Boolean); return url ? `<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">原图 ↗</a>` : `<span>${item.source_preview ? '本地上传参考' : '来源待接入'}</span>`; }
  function openDetail(id) {
    const p=itemMap.get(id); if(!p) return; detailId=id;
    $('detail-id').textContent=p.id+' / '+p.category+(purchased(p)?' / 已购':'')+(p.priority?' / 客户优先':''); $('detail-name').textContent=p.name_cn;
    $('detail-product').src=localPath(p.asset)||localPath(p.source_preview)||'';
    $('detail-source').src=localPath(p.source_preview)||'';
    $('detail-product-label').textContent=ready(p)?'白底立体图':'原始参考 · 待制作';
    $('detail-note').textContent=(p.concept_reconstruction?'此款含遮挡细节的意向复原，请与原图核对。 ':'')+(p.notes||'')+' '+(p.material_appearance||'材质为视觉参考。')+' 未提供真实尺寸。';
    $('detail-links').innerHTML=p.source_urls.filter(safeLink).map((url,n)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">客户来源 ${n+1} ↗</a>`).join('');
    const model=modelStatus(id);
    $('detail-model-status').textContent=model.label+(model.note?' · '+model.note:'');
    if(safeLink(model.sourceUrl))$('detail-links').insertAdjacentHTML('beforeend',`<a href="${esc(model.sourceUrl)}" target="_blank" rel="noopener noreferrer">${model.ready?'模型来源':'原型候选 · 待核'} ↗</a>`);
    ['detail-add','detail-white','detail-transparent'].forEach(x=>$(x).disabled=!ready(p)); $('detail-dialog').showModal();
  }
  async function exportSingle(white) {
    const item=itemMap.get(detailId);if(!ready(item))return;
    try { const img=await loadImage(item.asset); const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');if(white){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height)}ctx.drawImage(img,0,0);
      const blob=await new Promise((resolve,reject)=>{try{canvas.toBlob(b=>b?resolve(b):reject(new Error('图片导出失败')),'image/png')}catch(e){reject(e)}});download(blob,item.id+(white?'_白底':'_透明')+'.png');toast('已下载单品图');
    } catch { message('请通过本地启动器打开','直接打开文件时，浏览器可能限制图片导出。请使用“打开搭配库”启动器，再下载单品。'); }
  }
  function renderSelection() {
    const grouped = new Map(); for (const p of state.instances) { const g = grouped.get(p.itemId) || []; g.push(p); grouped.set(p.itemId, g); }
    $('canvas-count').textContent = `${state.instances.length} 件 / ${grouped.size} 款`;
    $('selection-list').innerHTML = grouped.size ? [...grouped].map(([id, list]) => { const item = itemMap.get(id); return `<div class="selection-row${list.some(p => p.uid === activeUid) ? ' active' : ''}" data-select-instance="${esc(list[0].uid)}"><div class="selection-row-title"><span>${esc(item.name_cn)}</span><span class="quantity">×${list.length}</span></div><div class="selection-row-meta"><span>${esc(item.id)}</span>${sourceLink(item)}</div></div>`; }).join('') : '<p class="selection-empty">还没有家具加入画布。<br>从左侧选几件喜欢的款式试试看。</p>';
    $('basket-count').textContent = state.picked.length;
    $('basket-list').innerHTML = state.picked.map(id => { const p = itemMap.get(id); return `<div class="basket-row">${esc(p.name_cn)} ${!ready(p) ? '<span class="pending-label">待制作</span>' : ''}<div class="selection-row-meta"><span>${esc(id)}</span>${sourceLink(p)}</div></div>`; }).join('') || '<p class="small muted" style="margin-top:10px">尚未勾选家具。</p>';
  }
  function active() { return state.instances.find(p => p.uid === activeUid); }
  function renderObjectToolbar() {
    const p = active(); $('object-toolbar').hidden = !p;
    if (p) { $('active-name').textContent = itemMap.get(p.itemId)?.name_cn || p.itemId; $('scale-value').textContent = Math.round(p.w / WIDTH * 100) + '% 画幅'; }
  }
  function updateButtons() { $('undo').disabled = !undoStack.length; $('clear-board').disabled = !state.instances.length; $('auto-layout').disabled = !state.instances.length; $('quick-compose').disabled = !state.instances.length; $('export-png').disabled = !state.instances.length; }
  function renderAll() { setInputs(); renderFilters(); renderLibrary(); renderStage(); renderSelection(); }
  function setActive(id) { activeUid = id; $('stage').querySelectorAll('.stage-item').forEach(el => el.classList.toggle('active', el.dataset.uid === id)); renderObjectToolbar(); renderSelection(); }
  function togglePicked(id) { if (!itemMap.has(id)) return; const set = new Set(state.picked); set.has(id) ? set.delete(id) : set.add(id); state.picked = [...set]; renderLibrary(); renderSelection(); persist(); }
  function loadImage(path) {
    if (imageCache.has(path)) return imageCache.get(path);
    const promise = new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('无法读取图片：' + path)); img.src = path; });
    imageCache.set(path, promise); promise.catch(() => imageCache.delete(path)); return promise;
  }
  async function addItems(ids) {
    if (window.SiteStudio?.acceptsItems()) return window.SiteStudio.addItems(ids);
    const available = ids.map(id => itemMap.get(id)).filter(ready); if (!available.length) { toast('所选家具的白底图尚未完成'); return; }
    if (state.instances.length + available.length > 250) { toast('每张画布最多 250 件，请另存方案后开始新画布'); return; }
    const prepared = await Promise.all(available.map(async item => { try { const img = await loadImage(item.asset); return { item, ratio: img.naturalWidth / img.naturalHeight || 1 }; } catch { failedAssets.add(item.id); return null; } }));
    const valid = prepared.filter(Boolean); if (!valid.length) { renderLibrary(); message('素材暂不可读取', '请确认 assets 文件夹与本页面保持原目录结构；若通过文件直接打开，请改用本地启动器。'); return; }
    checkpoint();
    for (const { item, ratio } of valid) { const w = ['沙发', '床', '餐桌', '茶几'].includes(item.category) ? 440 : item.category === '灯具' ? 240 : 300; const h = Math.min(700, w / ratio); const p = { uid: uid(), itemId: item.id, x: 0, y: 0, w: Math.min(w, h * ratio), h, z: state.instances.length }; state.instances.push(p); activeUid = p.uid; }
    arrange(false); renderLibrary(); renderStage(); renderSelection(); persist();
    toast(`已加入 ${valid.length} 件并自动排开${prepared.length !== valid.length ? '；部分图片暂不可读取' : ''}`);
  }
  function arrange(withHistory = true) {
    const list = state.instances; if (!list.length) return; if (withHistory) checkpoint();
    const count = list.length, gap = Math.max(8, 36 - Math.floor(count / 10) * 2), margin = 48;
    let best = null;
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols), cw = (WIDTH - margin * 2 - gap * (cols - 1)) / cols, ch = (HEIGHT - margin * 2 - gap * (rows - 1)) / rows;
      if (cw <= 0 || ch <= 0) continue;
      const score = list.reduce((s, p) => { const r = p.w / p.h, w = Math.min(cw, ch * r), h = w / r; return s + w * h; }, 0);
      if (!best || score > best.score) best = { cols, rows, cw, ch, score };
    }
    if (!best) { const cols = Math.ceil(Math.sqrt(count * 1.6)); best = { cols, rows: Math.ceil(count / cols), cw: (WIDTH - 80) / cols, ch: (HEIGHT - 80) / Math.ceil(count / cols), score: 0 }; }
    list.forEach((p, index) => { const r = p.w / p.h; p.w = Math.min(best.cw, best.ch * r) * .92; p.h = p.w / r; const row = Math.floor(index / best.cols), col = index % best.cols; const rowCount = Math.min(best.cols, count - row * best.cols); const rowWidth = rowCount * best.cw + (rowCount - 1) * gap; p.x = (WIDTH - rowWidth) / 2 + col * (best.cw + gap) + (best.cw - p.w) / 2; p.y = margin + row * (best.ch + gap) + (best.ch - p.h) / 2; p.x = clamp(p.x, 0, WIDTH - p.w); p.y = clamp(p.y, 0, HEIGHT - p.h); });
    if (withHistory) { renderStage(); renderSelection(); persist(); toast('已按单品外框均匀排开，可再自由调整'); }
  }
  function scaleActive(multiplier) { const p = active(); if (!p) return; checkpoint(); const factor = Math.min(multiplier, WIDTH / p.w, HEIGHT / p.h); const newW = clamp(p.w * factor, 35, WIDTH), newH = newW * p.h / p.w; p.x = clamp(p.x - (newW - p.w) / 2, 0, WIDTH - newW); p.y = clamp(p.y - (newH - p.h) / 2, 0, HEIGHT - newH); p.w = newW; p.h = newH; renderStage(); persist(); }
  function quickCompose(){
    if(!state.instances.length)return; const list=state.instances;
    if(list.length>10){arrange();toast('超过10件已均匀排开；少量主家具更适合快速试搭');return}
    const groups={hero:[],seat:[],table:[],rug:[],light:[],plant:[],other:[]};
    for(const p of list){const item=itemMap.get(p.itemId),c=item.category;const k=c==='旱景绿植'||/植物组合|盆栽|落地绿植/.test(item.name_cn)?'plant':['沙发','床','餐桌'].includes(c)?'hero':['单椅','餐椅'].includes(c)?'seat':c==='茶几'?'table':c==='地毯'?'rug':c==='灯具'?'light':'other';groups[k].push(p)}
    if(groups.hero.length>1||groups.seat.length>2||groups.table.length>1||groups.rug.length>1||groups.light.length>2||groups.plant.length>1||groups.other.length>3){arrange();toast('这组选款适合并列比较，已均匀排开');return}
    checkpoint(); const fit=(p,x,y,w,h,z)=>{let r=p.w/p.h;p.w=Math.min(w,h*r);p.h=p.w/r;p.x=x+(w-p.w)/2;p.y=y+(h-p.h)/2;p.z=z};
    groups.rug.forEach(p=>fit(p,110,400,1380,550,0));
    groups.plant.forEach(p=>fit(p,20,30,350,520,1));
    groups.hero.forEach(p=>fit(p,430,185,740,340,2));
    groups.seat.forEach((p,i)=>fit(p,i?1180:30,415,390,420,3));
    groups.table.forEach(p=>fit(p,475,625,650,310,4));
    groups.light.forEach((p,i)=>fit(p,i?1380:10,20,200,350,1));
    groups.other.forEach((p,i)=>fit(p,300+i*350,15,300,150,5));
    state.instances.sort((a,b)=>a.z-b.z);renderStage();renderSelection();persist();toast('已按类别试搭；可继续拖动微调，比例仅供视觉搭配');
  }
  function removeActive() { if (!active()) return; checkpoint(); state.instances = state.instances.filter(p => p.uid !== activeUid); activeUid = null; renderStage(); renderSelection(); persist(); }
  function duplicateActive() { const p = active(); if (!p) return; if (state.instances.length >= 250) { toast('画布最多 250 件'); return; } checkpoint(); const clone = { ...p, uid: uid(), x: clamp(p.x + 40, 0, WIDTH - p.w), y: clamp(p.y + 40, 0, HEIGHT - p.h), z: Math.max(...state.instances.map(p => p.z), 0) + 1 }; state.instances.push(clone); activeUid = clone.uid; renderStage(); renderSelection(); persist(); }
  function reorder(front) { const p = active(); if (!p) return; checkpoint(); p.z = front ? Math.max(...state.instances.map(x => x.z)) + 1 : Math.min(...state.instances.map(x => x.z)) - 1; state.instances.sort((a, b) => a.z - b.z).forEach((x, i) => x.z = i); renderStage(); renderSelection(); persist(); }
  function selectionText() {
    const grouped = new Map(); state.instances.forEach(p => grouped.set(p.itemId, (grouped.get(p.itemId) || 0) + 1));
    const lines = [`MARZOOK 家具搭配选款`, `方案：${state.title}`, '', '画布家具：'];
    if (!grouped.size) lines.push('（尚未加入画布）');
    for (const [id, qty] of grouped) { const p = itemMap.get(id); lines.push(`${id} | ${p.name_cn} | ${p.category} | 数量 ${qty}`); p.source_urls.forEach(url => { if (safeLink(url)) lines.push('原图：' + url); }); }
    const extra = state.picked.filter(id => !grouped.has(id)); if (extra.length) { lines.push('', '另外勾选、尚未加入画布：'); extra.forEach(id => { const p = itemMap.get(id); lines.push(`${id} | ${p.name_cn}${ready(p) ? '' : ' | 白底图待制作'}`); }); }
    lines.push('', '搭配要求：', state.note.trim() || '请根据这些客户选款，帮我搭配成一张协调的软装 moodboard。保留各单品原款造型及颜色。', '', '请按以上稳定编号组合；白底图为二维立体效果图，摆放比例不代表真实家具尺寸。');
    return lines.join('\n');
  }
  function filename(extension) { return (state.title.trim() || 'MARZOOK搭配').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 65) + extension; }
  function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  async function copyBrief() { const text = selectionText(); try { await navigator.clipboard.writeText(text); toast('已复制，粘贴回聊天即可继续搭配'); } catch { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;left:-10000px;top:0'; document.body.append(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} t.remove(); if (ok) toast('已复制选款及要求'); else message('复制选款及要求', '请复制下面的文字，粘贴回聊天。', text); } }
  async function exportPng() {
    if (!state.instances.length) return;
    const button = $('export-png'); button.disabled = true; button.textContent = '正在生成…';
    try {
      const snapshot = JSON.parse(JSON.stringify(state)), canvas = document.createElement('canvas'); canvas.width = WIDTH * 2; canvas.height = HEIGHT * 2; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('浏览器不支持图片画布。');
      ctx.scale(2, 2); ctx.fillStyle = snapshot.background === 'cream' ? '#f1ede4' : '#ffffff'; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      for (const p of snapshot.instances.sort((a, b) => a.z - b.z)) { const item = itemMap.get(p.itemId); if (!item || !localPath(item.asset)) throw new Error(`单品 ${p.itemId} 的白底素材尚未接入。`); const img = await loadImage(item.asset); const ratio = Math.min(p.w / img.naturalWidth, p.h / img.naturalHeight), dw = img.naturalWidth * ratio, dh = img.naturalHeight * ratio; ctx.drawImage(img, p.x + (p.w - dw) / 2, p.y + (p.h - dh) / 2, dw, dh); }
      const blob = await new Promise((resolve, reject) => { try { canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG 编码失败。')), 'image/png'); } catch (e) { reject(e); } });
      download(blob, filename('.png')); toast('已导出 3200 × 2000 高清搭配图');
    } catch (error) {
      const isFile = location.protocol === 'file:';
      message('PNG 暂未导出', isFile || error.name === 'SecurityError' ? '浏览器限制了直接打开本地文件时的图片导出。请通过文件夹中的本地启动器打开本页面，再导出 PNG。你可以先保存方案 JSON，重新打开后导入，排版会完整恢复。' : `${error.message || '素材读取失败'} 请检查素材文件是否完整，或用本地启动器重新打开。方案 JSON 仍可正常保存。`);
    } finally { button.innerHTML = '导出高清 PNG <span aria-hidden="true">↗</span>'; updateButtons(); }
  }
  $('category-filters').addEventListener('click', e => { const b = e.target.closest('[data-category]'); if (!b) return; filter = b.dataset.category; renderFilters(); renderLibrary(); });
  $('search').addEventListener('input', e => { search = e.target.value; renderLibrary(); });
  $('ready-only').addEventListener('change', e => { readyOnly = e.target.checked; renderLibrary(); });
  $('models-only').addEventListener('change', e => { modelsOnly = e.target.checked; renderLibrary(); });
  $('library-grid').addEventListener('dragstart',e=>{
    const card=e.target.closest('.product-card');
    if(!card||e.target.closest('button,input,label,a')||!e.dataTransfer){e.preventDefault();return;}
    e.dataTransfer.setData('text/x-wave-furniture-id',card.dataset.id);
    e.dataTransfer.setData('text/plain',card.dataset.id);
    e.dataTransfer.effectAllowed='copy';
    card.classList.add('library-dragging');document.body.classList.add('furniture-dragging');
  });
  $('library-grid').addEventListener('dragend',()=>{
    libraryDragEnded=Date.now();
    document.body.classList.remove('furniture-dragging');
    $('library-grid').querySelectorAll('.library-dragging').forEach(el=>el.classList.remove('library-dragging'));
  });
  $('library-grid').addEventListener('click',e=>{if(Date.now()-libraryDragEnded<350){e.preventDefault();e.stopImmediatePropagation();}},true);
  $('priority-only').addEventListener('change',e=>{priorityOnly=e.target.checked;renderLibrary()});
  $('library-grid').addEventListener('dblclick',e=>{const card=e.target.closest('.product-card');if(card)openDetail(card.dataset.id)});
  $('library-grid').addEventListener('click',e=>{const b=e.target.closest('[data-detail]');if(b){e.stopPropagation();openDetail(b.dataset.detail)}});
  $('detail-close').addEventListener('click',()=>$('detail-dialog').close());
  $('detail-add').addEventListener('click',()=>{addItems([detailId]);$('detail-dialog').close()});
  $('detail-white').addEventListener('click',()=>exportSingle(true));$('detail-transparent').addEventListener('click',()=>exportSingle(false));
  $('quick-compose').addEventListener('click',quickCompose);
  $('library-grid').addEventListener('click', e => { const add = e.target.closest('[data-add]'); if (add) { e.stopPropagation(); addItems([add.dataset.add]); return; } const box = e.target.closest('[data-pickbox]'); if (box) { togglePicked(box.dataset.pickbox); return; } const pic = e.target.closest('[data-pick]'); if (pic && !e.target.closest('label')) togglePicked(pic.dataset.pick); });
  $('clear-picks').addEventListener('click', () => { state.picked = []; renderLibrary(); renderSelection(); persist(); });
  $('add-picked').addEventListener('click', () => addItems(state.picked));
  $('board-title').addEventListener('input', e => { state.title = e.target.value; persist(); });
  $('design-note').addEventListener('input', e => { state.note = e.target.value; persist(); });
  $('auto-layout').addEventListener('click', () => arrange()); $('undo').addEventListener('click', undo);
  $('clear-board').addEventListener('click', () => { if (!state.instances.length || !confirm('清空当前画布？可以使用“撤销”恢复。')) return; checkpoint(); state.instances = []; activeUid = null; renderStage(); renderSelection(); persist(); });
  for (const color of ['white', 'cream']) $('bg-' + color).addEventListener('click', () => { if (state.background === color) return; checkpoint(); state.background = color; renderStage(); persist(); });
  $('scale-down').addEventListener('click', () => scaleActive(.9)); $('scale-up').addEventListener('click', () => scaleActive(1.1)); $('duplicate').addEventListener('click', duplicateActive); $('delete-item').addEventListener('click', removeActive); $('to-front').addEventListener('click', () => reorder(true)); $('to-back').addEventListener('click', () => reorder(false));
  $('selection-list').addEventListener('click', e => { if (e.target.closest('a')) return; const row = e.target.closest('[data-select-instance]'); if (row) setActive(row.dataset.selectInstance); });
  $('stage').addEventListener('pointerdown', e => {
    if (e.button !== 0) return; const el = e.target.closest('.stage-item'); if (!el) { setActive(null); return; }
    const p = state.instances.find(p => p.uid === el.dataset.uid); if (!p) return; e.preventDefault(); setActive(p.uid); const rect = $('stage').getBoundingClientRect();
    drag = { uid: p.uid, resize: !!e.target.closest('.resize-handle'), pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, original: { ...p }, scaleX: WIDTH / rect.width, scaleY: HEIGHT / rect.height, checkpointed: false };
    $('stage').setPointerCapture(e.pointerId); el.classList.add('dragging');
  });
  $('stage').addEventListener('pointermove', e => {
    if (!drag || drag.pointerId !== e.pointerId) return; const p = state.instances.find(p => p.uid === drag.uid); if (!p) return;
    const dx = (e.clientX - drag.startX) * drag.scaleX, dy = (e.clientY - drag.startY) * drag.scaleY; if (!drag.checkpointed && Math.abs(dx) + Math.abs(dy) > 2) { checkpoint(); drag.checkpointed = true; }
    if (drag.resize) { const r = drag.original.w / drag.original.h; const change = Math.abs(dx) > Math.abs(dy * r) ? dx : dy * r; p.w = clamp(drag.original.w + change, 35, Math.min(WIDTH - p.x, (HEIGHT - p.y) * r)); p.h = p.w / r; } else { p.x = clamp(drag.original.x + dx, 0, WIDTH - p.w); p.y = clamp(drag.original.y + dy, 0, HEIGHT - p.h); }
    const el = [...$('stage').querySelectorAll('.stage-item')].find(el => el.dataset.uid === p.uid); if (el) stylePiece(el, p); renderObjectToolbar();
  });
  function endDrag(e) { if (!drag || e.pointerId !== drag.pointerId) return; const moved = drag.checkpointed; if ($('stage').hasPointerCapture(e.pointerId)) $('stage').releasePointerCapture(e.pointerId); drag = null; $('stage').querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging')); if (moved) persist(); }
  $('stage').addEventListener('pointerup', endDrag); $('stage').addEventListener('pointercancel', endDrag);
  $('stage').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const el = e.target.closest('.stage-item'); if (el) { e.preventDefault(); setActive(el.dataset.uid); } } });
  document.addEventListener('keydown', e => {
    if (document.body.dataset.studioMode && document.body.dataset.studioMode !== 'board') return;
    if (e.target.closest('input,textarea,select,dialog') || e.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    const p = active(); if (!p) return; if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeActive(); return; }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); if (!e.repeat) checkpoint(); const step = e.shiftKey ? 20 : 4; p.x = clamp(p.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), 0, WIDTH - p.w); p.y = clamp(p.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0), 0, HEIGHT - p.h); renderStage(); persist(); }
  });
  $('copy-brief').addEventListener('click', copyBrief); $('export-png').addEventListener('click', exportPng);
  $('export-text').addEventListener('click', () => download(new Blob(['\ufeff' + selectionText()], { type: 'text/plain;charset=utf-8' }), filename('_选款.txt')));
  $('export-json').addEventListener('click', () => { download(new Blob([JSON.stringify({ ...state, application: 'MARZOOK furniture studio', canvas: { width: WIDTH, height: HEIGHT, unit: 'relative-pixels-not-real-dimensions' }, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json;charset=utf-8' }), filename('_方案.json')); toast('方案已保存，可导入恢复布局'); });
  $('import-json').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return; try { if (file.size > 5 * 1024 * 1024) throw new Error('方案文件过大，请选择导出的 JSON 文件。'); const raw = JSON.parse(await file.text()); const next = sanitize(raw); checkpoint(); state = next; activeUid = null; renderAll(); persist(); const dropped = (raw.instances?.length || 0) - next.instances.length; toast(dropped > 0 ? `方案已恢复；${dropped} 件不在当前家具库中的素材已跳过` : '方案已恢复'); } catch (error) { message('无法导入方案', error.message || '请选取本工作室导出的 JSON 文件。'); } finally { e.target.value = ''; }
  });
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  window.addEventListener('beforeunload', () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} });
  window.addEventListener('marzook:mode-changed', updateAddLabels);
  window.addEventListener('marzook:models-changed', renderLibrary);
  window.FurnitureStudio = { getPicked: () => [...state.picked], getBoardIds: () => state.instances.map(p => p.itemId), openDetail, toast, message };
  renderAll(); if (!storageAvailable) $('save-status').textContent = '请用 JSON 保存方案';
})();
