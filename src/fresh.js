export const DECISIONS=['REUSE','REFETCH','UNKNOWN'];

function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null}

export function decideFreshness({lastSeenAt,toleranceSeconds=3600,observations=[]}={}){
  if(!lastSeenAt)return {decision:'UNKNOWN',confidence:0.05,estimatedStaleRisk:null,reason:'No prior observation time was supplied.',evidence:{observations:observations.length,knownChanges:0}};
  const now=Date.now();
  const lastSeenMs=Date.parse(lastSeenAt);
  if(!Number.isFinite(lastSeenMs))return {decision:'UNKNOWN',confidence:0.05,estimatedStaleRisk:null,reason:'lastSeenAt is invalid.',evidence:{observations:observations.length,knownChanges:0}};
  const ageSeconds=Math.max(0,(now-lastSeenMs)/1000);
  const sorted=[...observations].sort((a,b)=>new Date(a.observedAt)-new Date(b.observedAt));
  let changes=0; const intervals=[]; let prev=null; let prevChangedAt=null;
  for(const o of sorted){
    const sig=o.contentHash||o.etag||o.lastModified||null;
    if(prev&&sig&&prev.sig&&sig!==prev.sig){changes++; if(prevChangedAt)intervals.push((new Date(o.observedAt)-prevChangedAt)/1000); prevChangedAt=new Date(o.observedAt);}
    else if(!prevChangedAt&&sig) prevChangedAt=new Date(o.observedAt);
    prev={sig};
  }
  const avgChangeSeconds=mean(intervals);
  const latest=sorted.at(-1)||null;
  const latestMs=latest?Date.parse(latest.observedAt):null;
  const latestAge=Number.isFinite(latestMs)?Math.max(0,(now-latestMs)/1000):null;
  const stableSignals=sorted.length>=2 && changes===0;

  if(latestAge!==null && latestAge<=Math.max(60,toleranceSeconds/4) && stableSignals){
    return {decision:'REUSE',confidence:clamp(0.72+Math.min(sorted.length,8)*0.025,0,0.94),estimatedStaleRisk:0.04,reason:'A recent shared observation found no change across repeated checks.',evidence:{lastObservedAt:latest.observedAt,observations:sorted.length,knownChanges:changes,averageChangeSeconds:avgChangeSeconds}};
  }
  if(avgChangeSeconds&&ageSeconds>=avgChangeSeconds*0.8){
    return {decision:'REFETCH',confidence:0.82,estimatedStaleRisk:0.72,reason:'The cached copy is approaching or beyond this URL’s observed change interval.',evidence:{lastObservedAt:latest?.observedAt||null,observations:sorted.length,knownChanges:changes,averageChangeSeconds:Math.round(avgChangeSeconds)}};
  }
  if(ageSeconds<=toleranceSeconds && stableSignals && sorted.length>=3){
    return {decision:'REUSE',confidence:0.74,estimatedStaleRisk:0.12,reason:'The cached copy is within tolerance and shared history has been stable.',evidence:{lastObservedAt:latest?.observedAt||null,observations:sorted.length,knownChanges:changes,averageChangeSeconds:avgChangeSeconds}};
  }
  if(ageSeconds>toleranceSeconds*4 && changes>0){
    return {decision:'REFETCH',confidence:0.76,estimatedStaleRisk:0.61,reason:'The cached copy is old relative to tolerance and this URL has changed before.',evidence:{lastObservedAt:latest?.observedAt||null,observations:sorted.length,knownChanges:changes,averageChangeSeconds:avgChangeSeconds}};
  }
  return {decision:'UNKNOWN',confidence:clamp(0.15+Math.min(sorted.length,6)*0.05,0,0.45),estimatedStaleRisk:null,reason:'Shared evidence is not strong enough to safely recommend reuse or refetch.',evidence:{lastObservedAt:latest?.observedAt||null,observations:sorted.length,knownChanges:changes,averageChangeSeconds:avgChangeSeconds}};
}
