const SOURCES={
 ONCE:'https://optimistic-compassion-production.up.railway.app/v1/activity',
 PREFLIGHT:'https://preflight-api-production-01a2.up.railway.app/v1/activity',
 RECOVER:'https://recover-api-production-bbba.up.railway.app/v1/activity',
 POSTFACT:'https://postfact-api-production.up.railway.app/activity.json',
 NETTYPE:'https://nettype-api.onrender.com/v1/activity',
 MAILTYPE:'https://mailtype-api.onrender.com/v1/activity'
};

const internalHeaders={
 'user-agent':'sterling-activity-dashboard/1.0',
 'x-tollbooth-internal':'1',
 'x-once-internal':'1',
 'x-preflight-internal':'1',
 'x-recover-internal':'1',
 'x-nettype-test':'1',
 'x-mailtype-test':'1'
};

export async function combinedActivity(fresh){
 const entries=await Promise.all(
  Object.entries(SOURCES).map(async([name,url])=>{
   try{
    const r=await fetch(url,{
     headers:internalHeaders,
     signal:AbortSignal.timeout(3500)
    });
    return [name,r.ok?await r.json():{error:`HTTP ${r.status}`}];
   }catch(e){
    return [name,{error:e.message}];
   }
  })
 );
 return {
  generatedAt:new Date().toISOString(),
  services:{FRESH:fresh,...Object.fromEntries(entries)}
 };
}

function count(d){
 if(!d||d.error)return {use:'—',strangers:'—',callers:'—'};
 const r=d.realUse||{};
 return {
  use:
   r.allTimeCalls ??
   r.allTimeRealWorldCalls ??
   d.allTimeRealUse ??
   d.coreUse ??
   (d.feed?.length??0),

  strangers:
   r.allTimeVerifiedStrangers ??
   r.verifiedStrangers ??
   d.convertedStrangers ??
   d.verifiedStrangers ??
   0,

  callers:
   r.allTimeCallers ??
   r.allTimeRealWorldCallers ??
   d.uniqueRealCallers ??
   d.callers ??
   '—'
 };
}

export function dashboardHtml(){
 return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sterling Toll-Booth Activity</title>
<style>
body{
 font-family:system-ui;
 background:#0b1020;
 color:#eef2ff;
 margin:0;
 padding:28px
}
.wrap{max-width:1180px;margin:auto}
.muted{color:#9ca3af}
.grid{
 display:grid;
 grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
 gap:14px;
 margin-top:24px
}
.box{
 background:#11172a;
 border:1px solid #28304d;
 border-radius:17px;
 padding:18px
}
.live{color:#79f2a7}
.big{font-size:30px;font-weight:900}
.stats{
 display:grid;
 grid-template-columns:repeat(3,1fr);
 gap:8px;
 margin-top:14px
}
.small{font-size:12px;color:#9ca3af}
.warn{color:#ffd166}
</style>
</head>

<body>
<div class="wrap">

<h1>Sterling Toll-Booth Activity</h1>

<div class="muted">
ONCE · PREFLIGHT · FRESH · RECOVER · POSTFACT · NETTYPE · MAILTYPE —
verified strangers exclude controlled tests, our own checks, known validators,
and ambiguous machine traffic.
</div>

<div id="grid" class="grid">
 <div class="muted">Loading…</div>
</div>

<p class="muted" id="updated"></p>

</div>

<script>
function esc(x){
 return String(x??'—').replace(/[&<>]/g,c=>({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;'
 }[c]))
}

function counts(d){
 if(!d||d.error)return {u:'—',s:'—',c:'—'};

 const r=d.realUse||{};

 return {
  u:
   r.allTimeCalls ??
   r.allTimeRealWorldCalls ??
   d.allTimeRealUse ??
   d.coreUse ??
   (d.feed?.length??0),

  s:
   r.allTimeVerifiedStrangers ??
   r.verifiedStrangers ??
   d.convertedStrangers ??
   d.verifiedStrangers ??
   0,

  c:
   r.allTimeCallers ??
   r.allTimeRealWorldCallers ??
   d.uniqueRealCallers ??
   d.callers ??
   '—'
 };
}

async function load(){
 try{
  const r=await fetch('/v1/activity/all');
  const d=await r.json();

  grid.innerHTML=Object.entries(d.services).map(([n,x])=>{
   const c=counts(x);

   return '<div class="box">' +
    '<h2>'+esc(n)+' <span class="'+(x.error?'warn':'live')+'">● '+
    (x.error?'UNREACHABLE':'LIVE')+
    '</span></h2>' +

    '<div class="stats">' +

    '<div>' +
     '<div class="small">CORE USE</div>' +
     '<div class="big">'+esc(c.u)+'</div>' +
    '</div>' +

    '<div>' +
     '<div class="small">VERIFIED STRANGERS</div>' +
     '<div class="big">'+esc(c.s)+'</div>' +
    '</div>' +

    '<div>' +
     '<div class="small">CALLERS</div>' +
     '<div class="big">'+esc(c.c)+'</div>' +
    '</div>' +

    '</div></div>';
  }).join('');

  updated.textContent='Updated '+new Date(d.generatedAt).toLocaleString();

 }catch(e){
  grid.innerHTML='<div class="warn">Unable to load activity.</div>';
 }
}

load();
setInterval(load,15000);
</script>

</body>
</html>`;
}
