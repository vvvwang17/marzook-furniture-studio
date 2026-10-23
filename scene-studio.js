'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const KEY = 'marzook-site-studio-v1';
  const bridge = window.FurnitureStudio;
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const num = (v,f=0) => Number.isFinite(Number(v)) ? Number(v) : f;
  const safe = p => typeof p === 'string' && p.length && !/^(?:[a-z]+:|\/\/)/i.test(p) && !p.split(/[\\/]/).includes('..') ? p : null;
  const uid = () => window.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2);
  const clone = x => JSON.parse(JSON.stringify(x));
  const toast = t => bridge?.toast(t);
  const message = (title,text,copy='') => bridge?.message(title,text,copy);
  const catalog = new Map((window.FURNITURE_CATALOG?.items || []).map(p => [p.id,p]));
  const scenes = (window.SITE_SCENES?.items || []).filter(p => p && typeof p.id==='string' && safe(p.image)).map(p => ({...p,width:Math.max(100,num(p.width,1600)),height:Math.max(100,num(p.height,1000))}));
  const sceneMap = new Map(scenes.map(p => [p.id,p]));
  const loadedImages = new Map();
  const extraModes = new Map();
  let state = {version:1,sceneId:scenes[0]?.id || '',boards:{},options:[]};
  let currentMode = 'site',activeUid=null,compare=false,hidePieces=false,drag=null,history=[],storageOK=true,saveTimer,loadingToken=0,busy=false;

  function cleanBoard(raw={}) {
    const instances = (Array.isArray(raw.instances)?raw.instances:[]).slice(0,80).flatMap(p => {
      const item=catalog.get(p?.itemId); if(!item || !safe(item.asset) || item.status!=='ready') return [];
      const w=clamp(num(p.w,.25),.018,1),h=clamp(num(p.h,.25),.018,1);
      return [{uid:uid(),itemId:item.id,x:clamp(num(p.x),0,1-w),y:clamp(num(p.y),0,1-h),w,h,z:num(p.z),flip:!!p.flip}];
    });
    instances.sort((a,b)=>a.z-b.z).forEach((p,i)=>p.z=i);
    return {title:String(raw.title || '现场搭配 · Option 01').slice(0,80),note:String(raw.note || '').slice(0,5000),instances};
  }
  try {
    const raw=JSON.parse(localStorage.getItem(KEY)||'null');
    if(raw && raw.version===1) {
      state.sceneId=sceneMap.has(raw.sceneId)?raw.sceneId:state.sceneId;
      for(const [id,b] of Object.entries(raw.boards||{})) if(sceneMap.has(id)) state.boards[id]=cleanBoard(b);
      state.options=(Array.isArray(raw.options)?raw.options:[]).filter(p=>sceneMap.has(p?.sceneId)).slice(-60).map(p=>({id:uid(),sceneId:p.sceneId,createdAt:p.createdAt,board:cleanBoard(p.board)}));
    }
  } catch {storageOK=false;}
  const scene = () => sceneMap.get(state.sceneId);
  function board() {if(!state.boards[state.sceneId])state.boards[state.sceneId]=cleanBoard();return state.boards[state.sceneId];}
  const active = () => board().instances.find(p=>p.uid===activeUid);
  function persist() {
    clearTimeout(saveTimer);$('site-save-status').textContent='正在保存…';
    saveTimer=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(state));storageOK=true;$('site-save-status').textContent='已保存至此浏览器';}catch{storageOK=false;$('site-save-status').textContent='请导出 JSON 保存';}},180);
  }
  function checkpoint() {history.push({sceneId:state.sceneId,board:clone(board())});if(history.length>40)history.shift();}
  function changed(){renderPieces();renderControls();persist();}
  function undo(){if(!history.length)return;const prev=history.pop();state.sceneId=prev.sceneId;state.boards[state.sceneId]=prev.board;activeUid=null;renderScene();persist();toast('已撤销上一步');}
  function setMode(mode) {
    if(!['site','board','drawings'].includes(mode)&&!extraModes.has(mode))return;
    extraModes.get(currentMode)?.deactivate?.();currentMode=mode;document.body.dataset.studioMode=mode;
    $('site-studio').hidden=mode!=='site';$('project-drawings').hidden=mode!=='drawings';
    document.querySelectorAll('.mode-tab').forEach(b=>{b.classList.toggle('active',b.dataset.studioMode===mode);b.setAttribute('aria-pressed',String(b.dataset.studioMode===mode));});
    const addLabel=mode==='site'?'加入现场':extraModes.get(mode)?.addLabel||'加入画布';
    $('add-picked').innerHTML=esc(addLabel)+' <span aria-hidden="true">＋</span>';
    $('detail-add').textContent=addLabel;
    if(mode==='site'){updatePicks();renderControls();}
    extraModes.get(mode)?.activate?.();
    window.dispatchEvent(new CustomEvent('marzook:mode-changed',{detail:{mode}}));
  }
  document.addEventListener('click',e=>{const b=e.target.closest('button[data-studio-mode]');if(b)setMode(b.dataset.studioMode);});
  function loadImage(path) {
    if(loadedImages.has(path))return loadedImages.get(path);
    const task=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('图片无法读取：'+path));img.src=path;});
    loadedImages.set(path,task);task.catch(()=>loadedImages.delete(path));return task;
  }
  function renderSceneStrip(){
    $('site-scenes').innerHTML=scenes.map(s=>`<button class="scene-card${s.id===state.sceneId?' active':''}" data-scene="${esc(s.id)}" aria-pressed="${s.id===state.sceneId}"><img src="${esc(safe(s.thumbnail)||s.image)}" alt="${esc(s.title)}空景预览"><span>${esc(s.title)}</span><small>${esc(s.area || '现场还原空景')}</small></button>`).join('');
  }
  async function setBackground(){
    const s=scene();if(!s)return;const token=++loadingToken,path=compare&&safe(s.original)?s.original:s.image;
    $('site-loading').hidden=false;$('site-loading').textContent='正在读取场景…';
    $('site-stage').style.aspectRatio=`${s.width}/${s.height}`;
    $('site-stage').style.maxWidth=s.width/s.height<1?Math.min(760,s.width/s.height*850)+'px':'';
    try{await loadImage(path);if(token!==loadingToken)return;$('site-background').src=path;$('site-background').alt=(compare?'客户现场原始照片：':'现场还原空景：')+s.title;$('site-loading').hidden=true;}
    catch(err){if(token!==loadingToken)return;$('site-loading').textContent='此视角图片暂时无法读取，请切换视角或刷新页面。';}
    $('site-pieces').hidden=compare||hidePieces;
    $('site-view-label').textContent=compare?'现场原图':hidePieces||!board().instances.length?'现场还原空景':'现场搭配 · 二维试摆';
    $('site-original').textContent=compare?'返回现场搭配':'查看现场原图';$('site-original').setAttribute('aria-pressed',String(compare));
    $('site-hide-pieces').textContent=hidePieces?'显示家具':'暂隐家具';$('site-hide-pieces').setAttribute('aria-pressed',String(hidePieces));
  }
  function renderScene(){
    const s=scene();const has=!!s;$('site-no-scenes').hidden=has;document.querySelector('.site-workbench').hidden=!has;
    renderSceneStrip();if(!s)return;
    $('site-scene-name').textContent=s.title;$('site-scene-description').textContent=s.description||s.area||'';
    $('site-scene-note').textContent=Array.isArray(s.notes)?s.notes.join(' '):String(s.notes||'保留现场固定墙面、门窗、柱位与地面。');
    $('site-download-background').href=s.image;$('site-download-background').download=`MARZOOK_${s.id}_现场空景.${s.image.split('.').pop()}`;
    $('site-original').disabled=!safe(s.original);$('site-option-name').value=board().title;$('site-note').value=board().note;
    renderPieces();renderControls();renderOptions();setBackground();
  }
  function pieceStyle(el,p){el.style.left=p.x*100+'%';el.style.top=p.y*100+'%';el.style.width=p.w*100+'%';el.style.height=p.h*100+'%';el.style.zIndex=p.z+1;el.dataset.flip=String(p.flip);}
  function renderPieces(){
    const container=$('site-pieces');container.innerHTML='';
    for(const p of board().instances){const item=catalog.get(p.itemId);if(!item)continue;const el=document.createElement('div');el.className='site-piece'+(p.uid===activeUid?' active':'');el.dataset.uid=p.uid;el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',item.name_cn+'，可拖动或使用方向键移动');el.setAttribute('aria-pressed',String(p.uid===activeUid));pieceStyle(el,p);el.innerHTML=`<img src="${esc(item.asset)}" alt="${esc(item.name_cn)}" draggable="false"><span class="item-tag">${esc(item.id)}</span><span class="resize-handle" aria-hidden="true"></span>`;container.append(el);}
    container.hidden=compare||hidePieces;
    $('site-view-label').textContent=compare?'现场原图':hidePieces||!board().instances.length?'现场还原空景':'现场搭配 · 二维试摆';
    renderLayers();
  }
  function renderLayers(){
    $('site-piece-count').textContent=board().instances.length+' 件';
    $('site-layer-list').innerHTML=board().instances.length?[...board().instances].sort((a,b)=>b.z-a.z).map(p=>{const item=catalog.get(p.itemId);return `<button class="site-layer-row${p.uid===activeUid?' active':''}" data-site-layer="${esc(p.uid)}" aria-pressed="${p.uid===activeUid}"><img src="${esc(item.asset)}" alt=""><span class="layer-copy"><strong>${esc(item.name_cn)}</strong><small>${esc(item.id)}${p.flip?' · 已镜像':''}</small></span></button>`;}).join(''):'<div class="site-layer-empty">当前是空景。<br>选一组家具放进来，开始试搭。</div>';
  }
  function renderControls(){
    const p=active(),has=!!scene(),count=board().instances.length;
    $('site-piece-tools').hidden=!p||compare||hidePieces;
    if(p){$('site-active-name').textContent=catalog.get(p.itemId)?.name_cn||p.itemId;$('site-scale-label').textContent=Math.round(p.w*100)+'%';$('site-flip').setAttribute('aria-pressed',String(p.flip));}
    $('site-arrange').disabled=!has||!count||busy;$('site-clear').disabled=!count||busy;$('site-undo').disabled=!history.length||busy;$('site-export-png').disabled=!has||busy;$('site-hide-pieces').disabled=!count||compare;
    $('site-from-board').disabled=!has||!(bridge?.getBoardIds().length)||busy;updatePicks();
  }
  function updatePicks(){const ids=bridge?.getPicked()||[];$('site-picked-count').textContent=ids.length;$('site-add-picked').disabled=!scene()||!ids.some(id=>catalog.get(id)?.status==='ready')||busy;}
  window.addEventListener('marzook:picks-changed',updatePicks);
  function selectPiece(id){activeUid=id;$('site-pieces').querySelectorAll('.site-piece').forEach(el=>{el.classList.toggle('active',el.dataset.uid===id);el.setAttribute('aria-pressed',String(el.dataset.uid===id));});renderLayers();renderControls();}
  function zone(){const z=scene()?.placementZone||{};const x=clamp(num(z.x,.05),0,.8),y=clamp(num(z.y,.43),0,.8);return{x,y,w:clamp(num(z.w,.90),.15,1-x),h:clamp(num(z.h,.52),.15,1-y)};}
  function arrange(withHistory=true){
    const list=board().instances,s=scene();if(!list.length||!s)return;if(withHistory)checkpoint();
    const z=zone(),W=s.width,H=s.height,gap=Math.min(W,H)*.024;let best;
    for(let cols=1;cols<=list.length;cols++){const rows=Math.ceil(list.length/cols),cw=(z.w*W-gap*(cols-1))/cols,ch=(z.h*H-gap*(rows-1))/rows;if(cw<=0||ch<=0)continue;const score=list.reduce((n,p)=>{const r=p.w*W/(p.h*H),w=Math.min(cw,ch*r);return n+w*w/r;},0);if(!best||score>best.score)best={cols,rows,cw,ch,score};}
    if(!best)return;
    list.forEach((p,i)=>{const r=p.w*W/(p.h*H),row=Math.floor(i/best.cols),col=i%best.cols,rowN=Math.min(best.cols,list.length-row*best.cols),rw=rowN*best.cw+(rowN-1)*gap,w=Math.min(best.cw,best.ch*r)*.94,h=w/r;p.w=w/W;p.h=h/H;p.x=z.x+(z.w*W-rw)/2/W+(col*(best.cw+gap)+(best.cw-w)/2)/W;p.y=z.y+(row*(best.ch+gap)+best.ch-h)/H;});
    changed();if(withHistory)toast('家具已排开，可拖动到合适位置并调整大小');
  }
  async function addItems(ids){
    const s=scene();if(!s){toast('现场空景尚未接入');return;}if(busy)return;
    const available=ids.map(id=>catalog.get(id)).filter(p=>p?.status==='ready'&&safe(p.asset));
    if(!available.length){toast('请先在家具库勾选已完成的单品');return;}
    if(board().instances.length+available.length>80){toast('单个现场最多放入 80 件家具，请缩小选款范围');return;}
    busy=true;renderControls();const targetSceneId=state.sceneId;
    try{
      const results=await Promise.all(available.map(async p=>{try{return{item:p,img:await loadImage(p.asset)}}catch{return null}}));
      if(state.sceneId!==targetSceneId){toast('已切换视角，请在当前视角重新加入家具');return;}
      const valid=results.filter(Boolean);if(!valid.length)throw new Error('所选素材无法读取。请确认图片文件完整。');
      checkpoint();
      for(const {item,img} of valid){const ratio=img.naturalWidth/img.naturalHeight;let w=.32,h=w*s.width/(ratio*s.height);if(h>.6){h=.6;w=h*s.height*ratio/s.width;}const p={uid:uid(),itemId:item.id,x:.1,y:.5,w,h,z:board().instances.length,flip:false};board().instances.push(p);activeUid=p.uid;}
      compare=false;hidePieces=false;arrange(false);setBackground();toast(`已加入 ${valid.length} 件并排开${valid.length<available.length?'；部分素材无法读取':''}`);
    }catch(err){message('暂时无法加入家具',err.message);}finally{busy=false;renderControls();}
  }
  function mutateActive(fn){const p=active();if(!p)return;checkpoint();fn(p);changed();}
  function scale(mult){mutateActive(p=>{const f=Math.min(mult,1/p.w,1/p.h);const w=clamp(p.w*f,.018,1),h=p.h*w/p.w;p.x=clamp(p.x-(w-p.w)/2,0,1-w);p.y=clamp(p.y-(h-p.h)/2,0,1-h);p.w=w;p.h=h;});}
  function remove(){if(!active())return;checkpoint();board().instances=board().instances.filter(p=>p.uid!==activeUid);activeUid=null;changed();}
  function reorder(front){mutateActive(p=>{p.z=front?Math.max(...board().instances.map(x=>x.z))+1:-1;board().instances.sort((a,b)=>a.z-b.z).forEach((x,i)=>x.z=i);});}
  function duplicate(){const p=active();if(!p||board().instances.length>=80)return;checkpoint();const next={...p,uid:uid(),x:clamp(p.x+.04,0,1-p.w),y:clamp(p.y+.04,0,1-p.h),z:board().instances.length};board().instances.push(next);activeUid=next.uid;changed();}
  function renderOptions(){const list=state.options.filter(p=>p.sceneId===state.sceneId);$('site-saved-options').innerHTML='<option value="">选择一个 Option</option>'+list.map(p=>`<option value="${esc(p.id)}">${esc(p.board.title)} · ${p.board.instances.length} 件</option>`).join('');$('site-load-option').disabled=true;$('site-delete-option').disabled=true;}
  function saveOption(){if(state.options.length>=60){toast('已保存 60 个 Option，请先导出备份并删除不再使用的方案');return;}const option={id:uid(),sceneId:state.sceneId,createdAt:new Date().toISOString(),board:clone(board())};state.options.push(option);renderOptions();$('site-saved-options').value=option.id;$('site-load-option').disabled=false;$('site-delete-option').disabled=false;persist();toast('已保存此视角的一个 Option');}
  function fileName(ext){return (board().title.trim()||scene()?.title||'MARZOOK现场搭配').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,65)+ext;}
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  function exportData(){const s=scene();return{application:'MARZOOK site studio',version:1,exportedAt:new Date().toISOString(),scene:{id:s.id,title:s.title,area:s.area,image:s.image,original:s.original,width:s.width,height:s.height,sourceLabel:s.sourceLabel,sourceReference:s.sourceReference,notes:s.notes},board:clone(board()),furniture:board().instances.map(p=>({id:p.itemId,name:catalog.get(p.itemId)?.name_cn,asset:catalog.get(p.itemId)?.asset,reference:catalog.get(p.itemId)?.source_preview})),coordinateUnit:'normalized-image-coordinates; visual placement, not physical dimensions',renderType:'2D furniture collage over site-based reconstructed background'};}
  function brief(){const s=scene();const grouped=new Map();board().instances.forEach(p=>grouped.set(p.itemId,(grouped.get(p.itemId)||0)+1));return[`请精修这份 MARZOOK 客户现场软装搭配。`,`区域 / 视角：${s.title}${s.area?' / '+s.area:''}`,`方案：${board().title}`,`现场空景：${s.image}`,s.original?`现场原图：${s.original}`:'',s.sourceReference?`来源参考：${typeof s.sourceReference==='string'?s.sourceReference:JSON.stringify(s.sourceReference)}`:'',`以随附 PNG + JSON 的选款及位置为基础，保留现场墙板、地面、门窗、柱位、固定镜饰和灯具。`,`家具清单：`,...Array.from(grouped,([id,n])=>`${id} | ${catalog.get(id)?.name_cn} | ${n} 件`),'',`搭配要求：${board().note.trim()||'保留客户已选家具的原款造型、配色和材质；调整合理尺度、透视与光影，避免家具交叠穿插，保留通道。'}`,`请先核对现场资料，不要修改固定硬装或新增不存在的门窗。当前试摆为二维拼贴，不代表实测尺寸。`].filter(Boolean).join('\n');}
  async function copyBrief(){const text=brief();try{await navigator.clipboard.writeText(text);toast('精修要求已复制；连同 PNG 和 JSON 发回聊天即可');}catch{message('复制精修要求','复制以下内容，并连同导出的 PNG 和 JSON 发回聊天。',text);}}
  async function exportPng(){
    if(!scene()||busy)return;busy=true;renderControls();$('site-export-png').textContent='正在导出…';
    const snapshot=exportData();
    try{
      const s=snapshot.scene,maxSide=2400,factor=maxSide/Math.max(s.width,s.height),canvas=document.createElement('canvas');canvas.width=Math.round(s.width*factor);canvas.height=Math.round(s.height*factor);const ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器无法生成图片');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(await loadImage(s.image),0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      for(const p of snapshot.board.instances.sort((a,b)=>a.z-b.z)){const img=await loadImage(catalog.get(p.itemId).asset),boxW=p.w*canvas.width,boxH=p.h*canvas.height,r=Math.min(boxW/img.naturalWidth,boxH/img.naturalHeight),w=img.naturalWidth*r,h=img.naturalHeight*r,x=p.x*canvas.width+(boxW-w)/2,y=p.y*canvas.height+(boxH-h)/2;ctx.save();ctx.shadowColor='#191d1435';ctx.shadowBlur=canvas.width*.006;ctx.shadowOffsetY=canvas.width*.005;if(p.flip){ctx.translate(x+w,y);ctx.scale(-1,1);ctx.drawImage(img,0,0,w,h);}else ctx.drawImage(img,x,y,w,h);ctx.restore();}
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG 编码失败')),'image/png'));download(blob,fileName('_现场搭配.png'));toast(`已导出 ${canvas.width} × ${canvas.height} PNG；可配合 JSON 继续精修`);
    }catch(err){message('PNG 暂未导出',err.message+'。请确认通过本地启动器打开工作室；也可以先保存 JSON。');}finally{busy=false;$('site-export-png').textContent='导出现场搭配 PNG ↗';renderControls();}
  }
  function renderDrawings(){
    const data=window.PROJECT_FILES||{},files=(data.items||[]).filter(p=>safe(p.download));
    $('project-updated').textContent=data.updatedAt?'更新：'+data.updatedAt:'';
    $('project-file-grid').innerHTML=files.length?files.map(p=>`<article class="project-file-card"><a class="project-file-preview" href="${esc(safe(p.preview)||p.download)}" target="_blank" rel="noopener" aria-label="查看${esc(p.title)}预览">${safe(p.preview)?`<img src="${esc(p.preview)}" alt="${esc(p.title)}预览" loading="lazy">`:''}<span>${esc(p.type||'图纸')}</span></a><div class="project-file-body"><h2>${esc(p.title)}</h2><p>${esc(p.description||'')}</p>${p.notes?`<p class="project-file-notes">${esc(Array.isArray(p.notes)?p.notes.join(' '):p.notes)}</p>`:''}<div class="project-file-meta">${esc(p.filename||p.download.split('/').pop())}${p.sizeBytes?' · '+(p.sizeBytes/1024/1024).toFixed(1)+' MB':''}</div><div class="project-file-links"><a class="primary" href="${esc(p.download)}" download="${esc(p.filename||'')}">下载 ${esc(p.type||'源文件')} ↓</a>${safe(p.preview)?`<a class="button-link" href="${esc(p.preview)}" target="_blank" rel="noopener">查看预览 ↗</a>`:''}</div></div></article>`).join(''):'<div class="site-empty"><h2>客户图纸正在接入</h2><p>文件准备好后，可在这里查看和下载。</p></div>';
  }
  $('site-scenes').addEventListener('click',e=>{const b=e.target.closest('[data-scene]');if(!b||busy)return;state.sceneId=b.dataset.scene;activeUid=null;compare=false;hidePieces=false;renderScene();persist();});
  $('site-add-picked').addEventListener('click',()=>addItems(bridge?.getPicked()||[]));$('site-from-board').addEventListener('click',()=>addItems(bridge?.getBoardIds()||[]));
  $('site-arrange').addEventListener('click',()=>arrange());$('site-undo').addEventListener('click',undo);
  $('site-clear').addEventListener('click',()=>{if(!board().instances.length)return;checkpoint();board().instances=[];activeUid=null;hidePieces=false;changed();toast('家具已清空，可撤销恢复');});
  $('site-original').addEventListener('click',()=>{compare=!compare;setBackground();renderControls();});$('site-hide-pieces').addEventListener('click',()=>{hidePieces=!hidePieces;setBackground();renderControls();});
  $('site-scale-down').addEventListener('click',()=>scale(.9));$('site-scale-up').addEventListener('click',()=>scale(1.1));$('site-flip').addEventListener('click',()=>mutateActive(p=>p.flip=!p.flip));$('site-front').addEventListener('click',()=>reorder(true));$('site-back').addEventListener('click',()=>reorder(false));$('site-duplicate').addEventListener('click',duplicate);$('site-delete').addEventListener('click',remove);
  $('site-layer-list').addEventListener('click',e=>{const b=e.target.closest('[data-site-layer]');if(b){compare=false;hidePieces=false;setBackground();selectPiece(b.dataset.siteLayer);}});
  $('site-option-name').addEventListener('input',e=>{board().title=e.target.value;persist();});$('site-note').addEventListener('input',e=>{board().note=e.target.value;persist();});
  $('site-save-option').addEventListener('click',saveOption);$('site-saved-options').addEventListener('change',e=>{$('site-load-option').disabled=!e.target.value;$('site-delete-option').disabled=!e.target.value;});
  $('site-load-option').addEventListener('click',()=>{const option=state.options.find(p=>p.id===$('site-saved-options').value);if(!option)return;checkpoint();state.boards[state.sceneId]=clone(option.board);activeUid=null;compare=false;hidePieces=false;renderScene();persist();toast('已载入 Option，可撤销恢复之前排版');});
  $('site-delete-option').addEventListener('click',()=>{const id=$('site-saved-options').value;if(!id)return;if(!confirm('删除这个已保存的 Option？当前画布不会改变。'))return;state.options=state.options.filter(p=>p.id!==id);renderOptions();persist();});
  $('site-export-png').addEventListener('click',exportPng);$('site-copy-brief').addEventListener('click',copyBrief);
  $('site-export-json').addEventListener('click',()=>{if(scene()){download(new Blob([JSON.stringify({...exportData(),refinementBrief:brief()},null,2)],{type:'application/json;charset=utf-8'}),fileName('_现场方案.json'));toast('已导出现场方案，可重新导入或发回聊天');}});
  $('site-import-json').addEventListener('click',()=>$('site-import-file').click());$('site-import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw new Error('方案文件超过 5 MB');const raw=JSON.parse(await file.text());if(raw.application!=='MARZOOK site studio'||!sceneMap.has(raw.scene?.id)||!Array.isArray(raw.board?.instances))throw new Error('请选择本工作室导出的现场方案 JSON，且对应视角仍在库中。');checkpoint();state.sceneId=raw.scene.id;state.boards[state.sceneId]=cleanBoard(raw.board);activeUid=null;compare=false;hidePieces=false;renderScene();persist();toast('现场方案已恢复');}catch(err){message('无法导入现场方案',err.message);}finally{e.target.value='';}});
  $('site-stage').addEventListener('pointerdown',e=>{
    if(e.button!==0||compare||hidePieces||busy)return;const el=e.target.closest('.site-piece');if(!el){selectPiece(null);return;}const p=board().instances.find(p=>p.uid===el.dataset.uid);if(!p)return;e.preventDefault();selectPiece(p.uid);const rect=$('site-stage').getBoundingClientRect();drag={uid:p.uid,pointerId:e.pointerId,resize:!!e.target.closest('.resize-handle'),startX:e.clientX,startY:e.clientY,rect,original:{...p},checkpointed:false};$('site-stage').setPointerCapture(e.pointerId);el.classList.add('dragging');
  });
  $('site-stage').addEventListener('pointermove',e=>{
    if(!drag||drag.pointerId!==e.pointerId)return;const p=board().instances.find(p=>p.uid===drag.uid);if(!p)return;const dx=(e.clientX-drag.startX)/drag.rect.width,dy=(e.clientY-drag.startY)/drag.rect.height;
    if(!drag.checkpointed&&(Math.abs(dx)+Math.abs(dy)>.002)){checkpoint();drag.checkpointed=true;}
    if(drag.resize){const r=drag.original.w/drag.original.h,change=Math.abs(dx)>Math.abs(dy*r)?dx:dy*r;p.w=clamp(drag.original.w+change,.018,Math.min(1-p.x,(1-p.y)*r));p.h=p.w/r;}else{p.x=clamp(drag.original.x+dx,0,1-p.w);p.y=clamp(drag.original.y+dy,0,1-p.h);}
    const el=[...$('site-pieces').children].find(el=>el.dataset.uid===p.uid);if(el)pieceStyle(el,p);renderControls();
  });
  function endDrag(e){if(!drag||drag.pointerId!==e.pointerId)return;const moved=drag.checkpointed;if($('site-stage').hasPointerCapture(e.pointerId))$('site-stage').releasePointerCapture(e.pointerId);drag=null;$('site-pieces').querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));if(moved)persist();}
  $('site-stage').addEventListener('pointerup',endDrag);$('site-stage').addEventListener('pointercancel',endDrag);
  $('site-stage').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const el=e.target.closest('.site-piece');if(el){e.preventDefault();selectPiece(el.dataset.uid);}}});
  document.addEventListener('keydown',e=>{if(currentMode!=='site'||e.target.closest('input,textarea,select,dialog')||e.isComposing||busy)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();return;}const p=active();if(!p||compare||hidePieces)return;if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(!e.repeat)checkpoint();const d=e.shiftKey?.025:.004;p.x=clamp(p.x+(e.key==='ArrowRight'?d:e.key==='ArrowLeft'?-d:0),0,1-p.w);p.y=clamp(p.y+(e.key==='ArrowDown'?d:e.key==='ArrowUp'?-d:0),0,1-p.h);changed();}});
  window.addEventListener('beforeunload',()=>{try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}});
  window.SiteStudio={
    isActive:()=>currentMode==='site',
    acceptsItems:()=>currentMode==='site'||typeof extraModes.get(currentMode)?.addItems==='function',
    addItems:ids=>typeof extraModes.get(currentMode)?.addItems==='function'?extraModes.get(currentMode).addItems(ids):addItems(ids),
    setMode,getMode:()=>currentMode,
    registerMode:(mode,handlers={})=>{if(!mode||['site','board','drawings'].includes(mode))throw new Error('该模式名称已保留');extraModes.set(mode,handlers);if(handlers.default)setMode(mode);}
  };
  renderScene();renderDrawings();setMode('site');if(!storageOK)$('site-save-status').textContent='请导出 JSON 保存';
})();
