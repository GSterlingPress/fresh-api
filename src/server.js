import http from 'node:http';
import {FreshStore} from './store.js';
import {decideFreshness} from './fresh.js';
import {fingerprint} from './verification.js';
import {ActivityStore} from './activity.js';
import {runProductionAcceptance} from './selftest.js';

export const VERSION='0.1.2';
const store=new FreshStore();
const activity=new ActivityStore();
const clients=new Map();
const readiness={ok:false,status:'STARTING',checkedAt:null,error:null};

function send(res,status,data){
  res.writeHead(status,{'content-type':'application/json'});
  res.end(JSON.stringify(data));
}

function readJson(req){
  return new Promise((resolve,reject)=>{
    let text='';
    req.on('data',chunk=>{text+=chunk;});
    req.on('end',()=>{
      try { resolve(text ? JSON.parse(text) : {}); }
      catch (err) { reject(err); }
    });
    req.on('error',reject);
  });
}

function isUrl(value){
  try {
    const u=new URL(value);
    return u.protocol==='http:'||u.protocol==='https:';
  } catch { return false; }
}

function checkResult(input){
  return decideFreshness({
    lastSeenAt:input.lastSeenAt,
    toleranceSeconds:input.toleranceSeconds,
    observations:store.get(input.url)
  });
}

async function handler(req,res){
  try {
    if(req.method==='GET'&&req.url==='/') return send(res,200,{service:'FRESH',version:VERSION,tagline:'Know whether to fetch again.',health:'/health',check:'/v1/check',observe:'/v1/observe',mcp:'/mcp'});
    if(req.method==='GET'&&req.url==='/health') return send(res,readiness.ok?200:503,{ok:readiness.ok,service:'FRESH',version:VERSION,readiness});
    if(req.method==='GET'&&req.url==='/version') return send(res,200,{service:'FRESH',version:VERSION});
    if(req.method==='GET'&&req.url==='/v1/activity') return send(res,200,{...activity.snapshot(),store:store.stats()});

    if(req.method==='POST'&&req.url==='/v1/check'){
      const input=await readJson(req);
      if(!isUrl(input.url)) return send(res,400,{error:'url must be absolute http/https'});
      const result=checkResult(input);
      activity.record(req,{kind:'rest',route:'POST /v1/check'});
      return send(res,200,{...result,urlHost:new URL(input.url).host});
    }

    if(req.method==='POST'&&req.url==='/v1/observe'){
      const input=await readJson(req);
      if(!isUrl(input.url)) return send(res,400,{error:'url must be absolute http/https'});
      const obs=store.observe(input.url,input);
      activity.record(req,{kind:'rest',route:'POST /v1/observe'});
      return send(res,200,{ok:true,observedAt:obs.observedAt});
    }

    if(req.method==='POST'&&req.url==='/mcp'){
      const msg=await readJson(req);
      const caller=fingerprint(req);
      const clientInfo=clients.get(caller)||null;

      if(msg.method==='initialize'){
        const ci=msg.params?.clientInfo||null;
        if(ci?.name) clients.set(caller,ci);
        activity.record(req,{kind:'mcp',route:'initialize',clientInfo:ci});
        return send(res,200,{jsonrpc:'2.0',id:msg.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'FRESH',version:VERSION}}});
      }

      if(msg.method==='notifications/initialized'){
        activity.record(req,{kind:'mcp',route:'notifications/initialized',clientInfo});
        res.writeHead(202);
        return res.end();
      }

      if(msg.method==='tools/list'){
        activity.record(req,{kind:'mcp',route:'tools/list',clientInfo});
        return send(res,200,{jsonrpc:'2.0',id:msg.id,result:{tools:[
          {name:'fresh_check',title:'Should I Fetch This URL Again?',description:'Return REUSE, REFETCH, or UNKNOWN before retrieving a URL again.',annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true},inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},lastSeenAt:{type:'string'},toleranceSeconds:{type:'number',minimum:0}},required:['url','lastSeenAt'],additionalProperties:false}},
          {name:'fresh_observe',title:'Report URL Observation',description:'Report privacy-safe freshness metadata from a completed retrieval.',annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true},inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},observedAt:{type:'string'},etag:{type:'string'},lastModified:{type:'string'},contentHash:{type:'string'}},required:['url'],additionalProperties:false}}
        ]}});
      }

      if(msg.method==='tools/call'){
        const name=msg.params?.name;
        const args=msg.params?.arguments||{};
        if(name==='fresh_check'){
          if(!isUrl(args.url)) return send(res,200,{jsonrpc:'2.0',id:msg.id,result:{isError:true,content:[{type:'text',text:'Invalid URL'}]}});
          const result=checkResult(args);
          activity.record(req,{kind:'mcp',route:'tools/call:fresh_check',clientInfo});
          return send(res,200,{jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result}});
        }
        if(name==='fresh_observe'){
          if(!isUrl(args.url)) return send(res,200,{jsonrpc:'2.0',id:msg.id,result:{isError:true,content:[{type:'text',text:'Invalid URL'}]}});
          store.observe(args.url,args);
          activity.record(req,{kind:'mcp',route:'tools/call:fresh_observe',clientInfo});
          return send(res,200,{jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:'observed'}]}});
        }
      }

      return send(res,200,{jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});
    }

    return send(res,404,{error:'not found'});
  } catch (err) {
    return send(res,500,{error:'internal_error',message:err.message});
  }
}

const port=Number(process.env.PORT||3000);
const server=http.createServer(handler);
server.listen(port,'0.0.0.0',async()=>{
  console.log(`FRESH ${VERSION} listening on ${port}`);
  try {
    const result=await runProductionAcceptance(port);
    readiness.ok=true;
    readiness.status='READY';
    readiness.checkedAt=new Date().toISOString();
    readiness.error=null;
    console.log('FRESH production acceptance passed',JSON.stringify(result));
  } catch (err) {
    readiness.ok=false;
    readiness.status='FAILED';
    readiness.checkedAt=new Date().toISOString();
    readiness.error=err.message;
    console.error('FRESH production acceptance failed',err);
  }
});
