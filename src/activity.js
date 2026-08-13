import fs from 'node:fs';
import path from 'node:path';
import {auditEnvelope,classify,fingerprint,VERIFICATION_POLICY} from './verification.js';

function defaultDir(){return process.env.FRESH_DATA_DIR??(process.env.RAILWAY_ENVIRONMENT?'/data':path.resolve('.fresh-data'))}
function atomicWrite(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,file)}
export class ActivityStore{
 constructor({dataDir=null}={}){this.file=path.join(dataDir??defaultDir(),'activity.json');this.events=[];this.clientInfo=new Map();this.load()}
 load(){try{const d=JSON.parse(fs.readFileSync(this.file,'utf8'));this.events=Array.isArray(d.events)?d.events:[];this.clientInfo=new Map(Array.isArray(d.clientInfo)?d.clientInfo:[])}catch(e){if(e?.code!=='ENOENT')console.error('activity load failed',e?.message)}}
 persist(){atomicWrite(this.file,{version:1,events:this.events,clientInfo:[...this.clientInfo]})}
 record(req,{kind,route,clientInfo=null,useClass='real-world'}={}){const caller=fingerprint(req);if(clientInfo?.name)this.clientInfo.set(caller,clientInfo);const ci=clientInfo||this.clientInfo.get(caller)||null;const c=classify({req,kind,route,clientInfo:ci,useClass});const event={at:new Date().toISOString(),kind,route,caller,classification:c.classification,classificationReasons:c.reasons,audit:auditEnvelope(req,ci)};this.events.unshift(event);if(this.events.length>5000)this.events.length=5000;this.persist();return event}
 snapshot(){const credible=this.events.filter(e=>e.classification==='CREDIBLE_REAL_USE');const unique=new Set(credible.map(e=>e.caller));const milestones=[];for(const e of credible){if(milestones.some(x=>x.caller===e.caller))continue;milestones.push({number:milestones.length+1,achieved:true,at:e.at,caller:e.caller,classification:e.classification,reasons:e.classificationReasons});if(milestones.length===10)break}while(milestones.length<10)milestones.push({number:milestones.length+1,achieved:false});return {service:'FRESH',verificationPolicy:VERIFICATION_POLICY,realUse:{verifiedStrangers:unique.size},realWorldConversionMilestones:milestones,privacy:{rawIpStored:false,requestPayloadStored:false,fullTargetUrlStored:false},feed:this.events.slice(0,500)}}
}
