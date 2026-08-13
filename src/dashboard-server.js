import http from 'node:http';
import {spawn} from 'node:child_process';
import {combinedActivity,dashboardHtml} from './dashboard.js';
const upstreamPort=3001;
const child=spawn(process.execPath,['src/server.js'],{stdio:'inherit',env:{...process.env,PORT:String(upstreamPort)}});
const proxy=(req,res)=>{const p=http.request({hostname:'127.0.0.1',port:upstreamPort,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${upstreamPort}`}},r=>{res.writeHead(r.statusCode||502,r.headers);r.pipe(res)});p.on('error',e=>{res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'upstream_starting',message:e.message}))});req.pipe(p)};
const server=http.createServer(async(req,res)=>{if(req.method==='GET'&&req.url==='/activity'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(dashboardHtml())}if(req.method==='GET'&&req.url==='/v1/activity/all'){try{const r=await fetch(`http://127.0.0.1:${upstreamPort}/v1/activity`,{headers:{'x-tollbooth-internal':'1'}});const fresh=await r.json();res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify(await combinedActivity(fresh)))}catch(e){res.writeHead(503,{'content-type':'application/json'});return res.end(JSON.stringify({error:e.message}))}}return proxy(req,res)});
const port=Number(process.env.PORT||3000);server.listen(port,'0.0.0.0',()=>console.log(`Sterling activity gateway listening on ${port}`));
const stop=()=>{child.kill('SIGTERM');server.close(()=>process.exit(0))};process.on('SIGTERM',stop);process.on('SIGINT',stop);
