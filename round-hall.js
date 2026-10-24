const schemes={
 a:{title:'云绿与酒红',kicker:'A / MOSS & OXBLOOD',description:'让原款灰绿云纹成为视觉中心，以小面积酒红白棋盘石和细密双色织物回应相连客餐厅。',ids:['P01_sofa','N42_chair','N36_coffee','N13_side','W23_03','LT23_07','V07_bowl'],noteTitle:'一条舒展的弧线，收拢对话。',noteText:'P01 的圆润扶手和云纹面料延展为三座弧形；两把赭黄与红棕单椅面向沙发。只用一件彩纹边几，浅米灰平织毯给丰富纹理留出呼吸。',dimensions:'外 R2,500 / 深 1,000 / 100°；设计外弦约 3,830 mm',palette:['#74785a','#782e32','#c29a48','#b8a785','#252624']},
 b:{title:'橄榄与烟金',kicker:'B / OLIVE & SMOKED GOLD',description:'把灰金织面与橄榄皮感两个原款转为三段弧形模块，保留皮框、横向绑带和金属扣的识别特征。',ids:['P08_sofafabric','P08_sofagreen','N42_chair','O50_coffee','N13_side','W23_03','LT23_07','V07_bowl'],noteTitle:'皮革与平织，在弧线上交错。',noteText:'两侧为灰金织面，中段为橄榄皮感；三段围合保持开放。黑色圆茶几使皮革、金属与酒红灯具更突出，和相邻空间的黑石地面及酒红屏风形成连续。',dimensions:'外 R2,450 / 深 1,000 / 104°；设计外弦约 3,861 mm',palette:['#5c6244','#a39874','#965d3b','#652e32','#242625']}
};
const $=id=>document.getElementById(id);
function change(key,replace=true){
 const s=schemes[key]||schemes.a;key=schemes[key]?key:'a';
 document.querySelectorAll('[data-variant]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.variant===key)));
 $('scheme-title').textContent=s.title;$('scheme-kicker').textContent=s.kicker;$('scheme-description').textContent=s.description;$('design-note-title').textContent=s.noteTitle;$('design-note-text').textContent=s.noteText;$('sofa-dimension').textContent=s.dimensions;
 $('palette').replaceChildren(...s.palette.map(c=>{const i=document.createElement('i');i.style.backgroundColor=c;return i;}));
 const root='downloads/round-hall/';$('render-image').src=root+key+'-front.png';$('render-image').alt=key.toUpperCase()+'方案圆厅三维效果';$('render-link').href=root+key+'-front.png';$('side-image').src=root+key+'-side.png';$('selection-board').src=root+'selection-'+key+'.png';$('download-render').href=root+key+'-front.png';$('download-board').href=root+'selection-'+key+'.png';
 $('scheme-vr').href=$('top-vr').href=$('footer-vr').href='vr.html?area=round&scheme='+key;
 $('selection-board').alt=key.toUpperCase()+'方案家具库白底单品搭配板';
 const catalog=new Map(window.FURNITURE_CATALOG.items.map(x=>[x.id,x]));
 $('products').replaceChildren(...s.ids.map(id=>{const x=catalog.get(id),card=document.createElement('article');card.className='product';const image=document.createElement('img');image.src=x.asset;image.alt=x.name_cn;image.loading='lazy';const code=document.createElement('strong');code.textContent=id;const name=document.createElement('p');name.textContent=x.name_cn;const note=document.createElement('small');note.textContent=/sofa/.test(id)?'展示原款白底图；本次弧形为定制设计。':id==='N42_chair'?'两把；细密平织外观，面料小样待确认。':id==='LT23_07'?'六颗原石壁灯；按曲墙单颗布置，石种待核。':id==='W23_03'?'库内三灯组合；按现有顶高缩短吊带。':'家具库原款；试摆尺寸待核实。';const a=document.createElement('a');a.textContent='原款白底图 ↗';a.href=x.asset;a.target='_blank';card.append(image,code,name,note,a);if(x.source_urls?.[0]){const b=document.createElement('a');b.href=x.source_urls[0];b.textContent='客户来源 ↗';b.target='_blank';b.rel='noopener';card.append(b);}return card;}));
 if(replace){const u=new URL(location.href);u.searchParams.set('scheme',key);history.replaceState(null,'',u);}
}
document.querySelectorAll('[data-variant]').forEach(b=>b.onclick=()=>change(b.dataset.variant));
change(new URLSearchParams(location.search).get('scheme')||'a',false);
fetch('downloads/round-hall/sources.json').then(r=>r.json()).then(s=>{if(s.rug?.productUrl)$('rug-official').href=s.rug.productUrl;}).catch(()=>{});
