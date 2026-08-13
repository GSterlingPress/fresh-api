import crypto from 'node:crypto';
const VALIDATOR_RE=/(smithery|glama|pulsemcp|pulse-mcp|mcpbeat|sentineloracle|glimind|registry|verifymcp|mcp-verifier|healthcheck)/i;
const INTERACTIVE_RE=/(claude|cursor|windsurf|vscode|visual studio code|chatgpt|openai|cline|roo|zed)/i;
function safe(v,n=256){const s=String(v||'').trim();return s?s.slice(0,n):null}
export function fingerprint(req){const ip=String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket?.remoteAddress||'';return crypto.createHash('sha256').update([ip,req.headers['user-agent']||'',req.headers['accept-language']||''].join('|')).digest('hex').slice(0,12)}
export function auditEnvelope(req,clientInfo=null){return {userAgent:safe(req.headers['user-agent'],512),acceptLanguage:safe(req.headers['accept-language'],128),origin:safe(req.headers.origin),referrer:safe(req.headers.referer||req.headers.referrer),via:safe(req.headers.via,128),forwardedHost:safe(req.headers['x-forwarded-host'],128),requestMethod:safe(req.method,16),requestPath:safe(req.url,128),clientInfo:clientInfo&&clientInfo.name?{name:safe(clientInfo.name,80),version:safe(clientInfo.version,40)}:null}}
export function classify({req,kind,route,clientInfo,useClass='real-world'}){
 const internal=String(req.headers['x-fresh-internal']||'')==='1'||String(req.headers['x-tollbooth-internal']||'')==='1';
 if(internal||useClass==='demo')return {classification:'CONTROLLED_TEST',reasons:[internal?'internal/test marker':'demo target']};
 const audit=auditEnvelope(req,clientInfo);const text=[audit.userAgent,audit.clientInfo?.name,audit.clientInfo?.version,audit.referrer,audit.via].filter(Boolean).join(' ');
 if(VALIDATOR_RE.test(text))return {classification:'KNOWN_VALIDATOR',reasons:['validator/probe identity evidence']};
 if(kind==='mcp'&&route==='tools/call:fresh_check'&&INTERACTIVE_RE.test(audit.clientInfo?.name||''))return {classification:'CREDIBLE_REAL_USE',reasons:[`interactive MCP client: ${audit.clientInfo.name}`]};
 return {classification:'UNKNOWN_MACHINE',reasons:['core operation observed','insufficient evidence to prove genuine stranger']};
}
export const VERIFICATION_POLICY={version:1,rule:'Core-tool invocation is evidence of use, not automatically evidence of a real stranger. Only CREDIBLE_REAL_USE advances stranger milestones.',classes:['KNOWN_VALIDATOR','LIKELY_VALIDATOR','CONTROLLED_TEST','UNKNOWN_MACHINE','CREDIBLE_REAL_USE']};
