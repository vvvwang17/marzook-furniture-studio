// Plan-space navigation in metres. No renderer, DOM, or Three dependency.
const EPS=1e-8;
const cache=new WeakMap();
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const cross=(ax,az,bx,bz)=>ax*bz-az*bx;
const clamp01=t=>Math.max(0,Math.min(1,t));
const point=p=>Array.isArray(p)?[p[0],p.length>2?p[2]:p[1]]:[p?.x,p?.z];

function distanceToSegment(x,z,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
  const t=length?clamp01(((x-a[0])*dx+(z-a[1])*dz)/length):0;
  return{d2:(x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2,t};
}
function edges(poly){return poly.map((a,i)=>[a,poly[(i+1)%poly.length]]);}
function ring(raw){
  const result=(Array.isArray(raw)?raw:[]).filter(p=>Array.isArray(p)&&finite(p[0])&&finite(p[1])).map(p=>[p[0],p[1]]);
  if(result.length>1&&Math.hypot(result[0][0]-result.at(-1)[0],result[0][1]-result.at(-1)[1])<EPS)result.pop();
  return result.length>=3?result:[];
}

// Boundary is included. A hole uses the same predicate and therefore removes
// its boundary too; positive clearance is checked separately against the union.
export function pointInRing(x,z,poly){
  if(!finite(x)||!finite(z)||!Array.isArray(poly)||poly.length<3)return false;
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[j],b=poly[i];
    if(distanceToSegment(x,z,a,b).d2<=EPS*EPS)return true;
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
const contains=(shape,x,z)=>pointInRing(x,z,shape.outer)&&!shape.holes.some(h=>pointInRing(x,z,h));
const inFloor=(floors,x,z)=>floors.some(r=>contains(r,x,z));

function intersectionCuts(a,b,c,d){
  const ax=b[0]-a[0],az=b[1]-a[1],bx=d[0]-c[0],bz=d[1]-c[1];
  const qx=c[0]-a[0],qz=c[1]-a[1],den=cross(ax,az,bx,bz);
  if(Math.abs(den)>EPS){
    const t=cross(qx,qz,bx,bz)/den,u=cross(qx,qz,ax,az)/den;
    return t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS?[clamp01(t)]:[];
  }
  if(Math.abs(cross(qx,qz,ax,az))>EPS)return[];
  const length=ax*ax+az*az;if(length<EPS*EPS)return[];
  return[c,d].map(p=>((p[0]-a[0])*ax+(p[1]-a[1])*az)/length).filter(t=>t>=-EPS&&t<=1+EPS).map(clamp01);
}

function prepared(data){
  if(!data||typeof data!=='object')return{floors:[],boundary:[],obstructions:[]};
  const cached=cache.get(data);
  if(cached&&cached.floorSource===data.floorRegions&&cached.obstructionSource===data.obstructions&&cached.floorCount===data.floorRegions?.length&&cached.obstructionCount===data.obstructions?.length)return cached.nav;
  const shapes=raw=>(Array.isArray(raw)?raw:[]).map(r=>({...r,outer:ring(r.outer),holes:(r.holes||[]).map(ring).filter(r=>r.length)})).filter(r=>r.outer.length);
  const floors=shapes(data.floorRegions),allEdges=floors.flatMap(r=>[r.outer,...r.holes].flatMap(edges));
  const boundary=[];
  // Split crossings before classifying each edge. Shared or overlapping floor
  // regions are one walkable union, so their internal seams never become walls.
  for(const [a,b] of allEdges){
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<EPS)continue;
    const cuts=[0,1];for(const [c,d] of allEdges)cuts.push(...intersectionCuts(a,b,c,d));
    cuts.sort((a,b)=>a-b);
    const unique=cuts.filter((t,i)=>!i||t-cuts[i-1]>EPS);
    for(let i=1;i<unique.length;i++){
      const t0=unique[i-1],t1=unique[i];if((t1-t0)*length<EPS)continue;
      const mid=(t0+t1)/2,x=a[0]+dx*mid,z=a[1]+dz*mid,probe=Math.min(1e-5,length*(t1-t0)/10);
      const nx=-dz/length*probe,nz=dx/length*probe;
      if(inFloor(floors,x+nx,z+nz)!==inFloor(floors,x-nx,z-nz))boundary.push([[a[0]+dx*t0,a[1]+dz*t0],[a[0]+dx*t1,a[1]+dz*t1]]);
    }
  }
  const obstructions=shapes(data.obstructions).map(o=>({...o,
    minY:finite(o.minY)?o.minY:0,maxY:finite(o.maxY)?o.maxY:Infinity,
    edges:[o.outer,...o.holes].flatMap(edges),
    bounds:[Math.min(...o.outer.map(p=>p[0])),Math.max(...o.outer.map(p=>p[0])),Math.min(...o.outer.map(p=>p[1])),Math.max(...o.outer.map(p=>p[1]))]
  }));
  const result={floors,boundary,obstructions};
  cache.set(data,{nav:result,floorSource:data.floorRegions,obstructionSource:data.obstructions,floorCount:data.floorRegions?.length,obstructionCount:data.obstructions?.length});
  return result;
}

export function floorAt(data,x,z){
  if(!finite(x)||!finite(z))return 0;
  const levels=prepared(data).floors.filter(r=>contains(r,x,z)).map(r=>finite(r.elevation)?r.elevation:0);
  return levels.length?Math.max(...levels):0;
}
const bodyOverlap=(o,feet)=>o.maxY>feet+.1+EPS&&o.minY<feet+1.7-EPS;

export function isWalkable(data,x,z,margin=.18){
  if(!finite(x)||!finite(z)||!finite(margin)||margin<0)return false;
  const nav=prepared(data);if(!inFloor(nav.floors,x,z))return false;
  const radius2=margin*margin;
  if(margin>0&&nav.boundary.some(([a,b])=>distanceToSegment(x,z,a,b).d2<radius2-EPS*EPS))return false;
  const feet=floorAt(data,x,z);
  for(const o of nav.obstructions){
    if(!bodyOverlap(o,feet)||x<o.bounds[0]-margin||x>o.bounds[1]+margin||z<o.bounds[2]-margin||z>o.bounds[3]+margin)continue;
    if(contains(o,x,z)||margin>0&&o.edges.some(([a,b])=>distanceToSegment(x,z,a,b).d2<=radius2+EPS*EPS))return false;
  }
  return true;
}

function segmentDistance(a,b,c,d){
  const cuts=intersectionCuts(a,b,c,d);if(cuts.length)return{d2:0,t:cuts[0]};
  const candidates=[distanceToSegment(c[0],c[1],a,b),distanceToSegment(d[0],d[1],a,b),
    {d2:distanceToSegment(a[0],a[1],c,d).d2,t:0},{d2:distanceToSegment(b[0],b[1],c,d).d2,t:1}];
  return candidates.reduce((best,p)=>p.d2<best.d2?p:best);
}

export function canTraverse(data,from,to,margin=.18){
  const a=point(from),b=point(to);
  if(![...a,...b].every(finite)||!finite(margin)||margin<0)return false;
  const nav=prepared(data),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const count=Math.max(1,Math.ceil(length/.08)),radius2=margin*margin;
  if(!isWalkable(data,...a,margin))return false;
  let previous=a;
  for(let i=1;i<=count;i++){
    const p=[a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count];
    if(!isWalkable(data,...p,margin))return false;
    // Sweep each short segment too: even a millimetre-thin wall or a corner
    // grazed between samples must not be skipped by a large frame delta.
    for(const [c,d] of nav.boundary){
      if(margin>0&&segmentDistance(previous,p,c,d).d2<radius2-EPS*EPS)return false;
    }
    for(const o of nav.obstructions)for(const [c,d] of o.edges){
      const hit=segmentDistance(previous,p,c,d);if(hit.d2>radius2+EPS*EPS)continue;
      const x=previous[0]+(p[0]-previous[0])*hit.t,z=previous[1]+(p[1]-previous[1])*hit.t;
      if(bodyOverlap(o,floorAt(data,x,z)))return false;
    }
    previous=p;
  }
  return true;
}

export function nearestWalkable(data,x,z,limit=1.5){
  if(!finite(x)||!finite(z)||!finite(limit)||limit<0)return null;
  if(isWalkable(data,x,z))return[x,z];
  const steps=Math.ceil(limit/.05);
  for(let i=1;i<=steps;i++){
    const radius=Math.min(limit,i*.05),angles=Math.max(12,Math.ceil(2*Math.PI*radius/.05));
    for(let j=0;j<angles;j++){
      const theta=j/angles*2*Math.PI,p=[x+Math.cos(theta)*radius,z+Math.sin(theta)*radius];
      if(isWalkable(data,...p))return p;
    }
  }
  return null;
}
