import {FreshStore} from './store.js';

async function requestJson(url,options={}){
  const response=await fetch(url,options);
  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{throw new Error(`non-JSON response from ${url}: ${text.slice(0,120)}`)}
  if(!response.ok)throw new Error(`${url} returned ${response.status}: ${text.slice(0,200)}`);
  return data;
}

export async function runProductionAcceptance(port){
  const base=`http://127.0.0.1:${port}`;
  const headers={'content-type':'application/json','x-tollbooth-internal':'1','user-agent':'fresh-production-selftest/1.0'};
  const before=await requestJson(`${base}/v1/activity`,{headers});
  const beforeVerified=before.realUse?.verifiedStrangers??0;
  const now=Date.now();
  const url=`https://fresh-selftest.invalid/resource/${now}`;

  const unknown=await requestJson(`${base}/v1/check`,{method:'POST',headers,body:JSON.stringify({url,lastSeenAt:new Date(now-60000).toISOString(),toleranceSeconds:3600})});
  if(unknown.decision!=='UNKNOWN')throw new Error(`expected UNKNOWN, got ${unknown.decision}`);

  for(const observation of [
    {observedAt:new Date(now-180000).toISOString(),etag:'selftest-a',contentHash:'sha256:selftest-a'},
    {observedAt:new Date(now-120000).toISOString(),etag:'selftest-a',contentHash:'sha256:selftest-a'}
  ]){
    await requestJson(`${base}/v1/observe`,{method:'POST',headers,body:JSON.stringify({url,...observation})});
  }

  const reuse=await requestJson(`${base}/v1/check`,{method:'POST',headers,body:JSON.stringify({url,lastSeenAt:new Date(now-30000).toISOString(),toleranceSeconds:3600})});
  if(reuse.decision!=='REUSE')throw new Error(`expected REUSE, got ${reuse.decision}`);

  await requestJson(`${base}/v1/observe`,{method:'POST',headers,body:JSON.stringify({url,observedAt:new Date(now-30000).toISOString(),etag:'selftest-b',contentHash:'sha256:selftest-b'})});
  const refetch=await requestJson(`${base}/v1/check`,{method:'POST',headers,body:JSON.stringify({url,lastSeenAt:new Date(now-86400000).toISOString(),toleranceSeconds:60})});
  if(refetch.decision!=='REFETCH')throw new Error(`expected REFETCH, got ${refetch.decision}`);

  const reloaded=new FreshStore();
  if(reloaded.get(url).length<3)throw new Error('persistent observation reload failed');

  const init=await requestJson(`${base}/mcp`,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{clientInfo:{name:'fresh-production-selftest',version:'1.0.0'}}})});
  if(init.result?.serverInfo?.name!=='FRESH')throw new Error('MCP initialize failed');
  const list=await requestJson(`${base}/mcp`,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})});
  const names=(list.result?.tools||[]).map(t=>t.name);
  if(!names.includes('fresh_check')||!names.includes('fresh_observe'))throw new Error('MCP tools/list missing tools');
  const call=await requestJson(`${base}/mcp`,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'fresh_check',arguments:{url,lastSeenAt:new Date(now-30000).toISOString(),toleranceSeconds:3600}}})});
  if(!call.result?.structuredContent?.decision)throw new Error('MCP fresh_check returned no decision');

  const after=await requestJson(`${base}/v1/activity`,{headers});
  const afterVerified=after.realUse?.verifiedStrangers??0;
  if(afterVerified!==beforeVerified)throw new Error(`self-test changed verified stranger count ${beforeVerified} -> ${afterVerified}`);
  const controlled=after.feed?.some(e=>e.audit?.userAgent==='fresh-production-selftest/1.0'&&e.classification==='CONTROLLED_TEST');
  if(!controlled)throw new Error('self-test traffic was not classified CONTROLLED_TEST');

  return {unknown:unknown.decision,reuse:reuse.decision,refetch:refetch.decision,persistence:true,mcp:true,strangerCountUnchanged:true};
}
