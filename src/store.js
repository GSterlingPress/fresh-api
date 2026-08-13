import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function defaultDir(){return process.env.FRESH_DATA_DIR??(process.env.RAILWAY_ENVIRONMENT?'/data':path.resolve('.fresh-data'))}
function atomicWrite(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,file)}
export function normalizeUrl(raw){const u=new URL(raw);u.hash='';return u.toString()}
export class FreshStore{
  constructor({dataDir=null}={}){this.dataDir=dataDir??defaultDir();this.file=path.join(this.dataDir,'observations.json');this.map=new Map();this.load()}
  load(){try{const d=JSON.parse(fs.readFileSync(this.file,'utf8'));for(const [k,v] of d.entries||[])this.map.set(k,v)}catch(e){if(e?.code!=='ENOENT')console.error('fresh store load failed',e?.message)}}
  persist(){atomicWrite(this.file,{version:1,entries:[...this.map]})}
  key(url){return crypto.createHash('sha256').update(normalizeUrl(url)).digest('hex').slice(0,32)}
  get(url){return this.map.get(this.key(url))?.observations||[]}
  observe(url,obs){const key=this.key(url);const current=this.map.get(key)||{host:new URL(url).host,observations:[]};current.observations.push({observedAt:obs.observedAt||new Date().toISOString(),etag:obs.etag||null,lastModified:obs.lastModified||null,contentHash:obs.contentHash||null});if(current.observations.length>200)current.observations=current.observations.slice(-200);this.map.set(key,current);this.persist();return current.observations.at(-1)}
  stats(){let observations=0;for(const v of this.map.values())observations+=v.observations.length;return {trackedUrls:this.map.size,observations}}
}
