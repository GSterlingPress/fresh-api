import http from 'node:http';
import {FreshStore} from './store.js';
import {decideFreshness} from './fresh.js';
import {fingerprint} from './verification.js';
import {ActivityStore} from './activity.js';

export const VERSION='0.1.0';
const store=new FreshStore();
const activity=new ActivityStore();
const clientInfoByCaller=new Map();

function json(res,status,body){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body))}
function readBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(reject)});req.on('error',reject)})}
function validHttpUrl(u){try{const x=new URL(u);return ['http:','https:'].includes(x.protocol)}catch{return false}}

async function handleCheck(req,res,input,kind='rest',route='POST /v1/check'){
  if(!validHttpUrl(input.url))return json(res,400,{error:'url must be absolute http/https'});
  const observations=store.get(input.url);
  const result=decideFreshness({lastSeenAt:input.lastSeenAt,toleranceSeconds:input.toleranceSeconds,observations});
  activity.record(req,{kind,route});
  return json(res,200,{...result,urlHost:new URL(input.url).host});
}

async function serverHandler(req,res){
  try{
    if(req.method==='GET'&&req.url==='/health')return json(res,200,{ok:true,service:'FRESH',version:VERSION});
    if(req.method==='GET'&&req.url==='/version')return json(res,200,{service:'FRESH',version:VERSION});
    if(req.method==='GET'&&req.url==='/v1/activity')return json(res,200,{...activity.snapshot(),store:store.stats()});

    if(req.method==='POST'&&req.url==='/v1/check')return handleCheck(req,res,await readBody(req));

    if(req.method==='POST'&&req.url==='/v1/observe'){
      const input=await readBody(req);
      if(!validHttpUrl(input.url))return json(res,400,{error:'url must be absolute http/https'});
      const obs=store.observe(input.url,input);
      activity.record(req,{kind:'rest',route:'POST /v1/observe'});
      return json(res,200,{ok:true,observedAt:obs.observedAt});
    }

    if(req.method==='POST'&&req.url==='/mcp'){
      const msg=await readBody(req);
      const caller=fingerprint(req);

      if(msg.method==='initialize'){
        const ci=msg.params?.clientInfo||null;
        if(ci?.name)clientInfoByCaller.set(caller,ci);
        activity.record(req,{kind:'mcp',route:'initialize',clientInfo:ci});
        return json(res,200,{jsonrpc:'2.0',id:msg.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'FRESH',version:VERSION}}});
      }

      if(msg.method==='notifications/initialized'){
        activity.record(req,{kind:'mcp',route:'notifications/initialized',clientInfo:clientInfoByCaller.get(caller)||null});
        res.writeHead(202);return res.end();
      }

      if(msg.method==='tools/list'){
        activity.record(req,{kind:'mcp',route:'tools/list',clientInfo:clientInfoByCaller.get(caller)||null});
        return json(res,200,{jsonrpc:'2.0',id:msg.id,result:{tools:[
          {name:'fresh_check',title:'Should I Fetch This URL Again?',description:'Decide REUSE, REFETCH, or UNKNOWN before paying to retrieve a URL again.',annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true},inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},lastSeenAt:{type:'string'},toleranceSeconds:{type:'number',minimum:0}},required:['url','lastSeenAt'],additionalProperties:false}},
          {name:'fresh_observe',title:'Report URL Observation',description:'Report privacy-safe freshness metadata from a completed retrieval.',annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true},inputSchema:{type:'object',properties:{url:{type:'string',format:'uri'},observedAt:{type:'string'},etag:{type:'string'},lastModified:{type:'string'},contentHash:{type:'string'}},required:['url'],additionalProperties:false}}
        ]}});
      }

      if(msg.method==='tools/call'){
        const name=msg.params?.name;
        const args=msg.params?.arguments||{};
        const ci=clientInfoByCaller.get(caller)||null;
        if(name==='fresh_check'){
          if(!validHttpUrl(args.url))return json(res,200,{jsonrpc:'2.0',id:msg.id,result:{isError:true,content:[{type:'text',text:'Invalid URL'}]}});
          const result=decideFreshness({lastSeenAt:args.lastSeenAt,toleranceSeconds:args.toleranceSeconds,observations:store.get(args.url)});
          activity.record(req,{kind:'mcp',route:'tools/call:fresh_check',clientInfo:ci});
          return json(res,200,{jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result}});
        }
        if(name==='fresh_observe'){
          if(!validHttpUrl(args.url))return json(res,200,{jsonrpc:'2.0',id:msg.id,result:{isError:true,content:[{type:'text',text:'Invalid URL'}]}});
          store.observe(args.url,args);
          activity.record(req,{kind:'mcp',route:'tools/call:fresh_observe',clientInfo:ci});
          return json(res,200,{jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:'observed'}]}});
        }
      }

      return json(res,200,{jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});
    }

    return json(res,404,{error:'not found'});
  }catch(e){
    return json(res,500,{error:'internal_error',message:e.message});
  }
}

const port=Number(process.env.PORT||3000);
http.createServer(serverHandler).listen(port,()=>console.log(`FRESH ${VERSION} listening on ${port}`));
