// One call per sealed slot. Pauses can resume only never-attempted slots.
import {readFile,writeFile,mkdir,appendFile,access} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {fork,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=x=>createHash('sha256').update(x).digest('hex');
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
const [mode,configFile,version]=process.argv.slice(2);const cfg=JSON.parse(await readFile(configFile,'utf8'));
const plan=JSON.parse(await readFile(cfg.plan,'utf8'));
if(mode==='--worker'){
 const cwd=cfg.versions[version].cwd;process.env.W2L_SOURCE_COMMIT=plan.versions[version];
 for(const k of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])delete process.env[k];
 process.env.NO_PROXY='127.0.0.1,localhost';
 const require=createRequire(cwd+'/package.json'),imp=p=>import(pathToFileURL(cwd+'/'+p).href);
 const {serve}=require('@hono/node-server');
 const {createApiEngine,createApp}=await imp('packages/api/dist/index.js');
 const {localNetworkPolicy}=await imp('packages/contracts/dist/index.js');
 const {buildChannels}=await imp('packages/bench/dist/index.js');
 const {W2L}=await imp('packages/sdk/dist/index.js');
 const policy={...localNetworkPolicy(),perHostMinDelayMs:0};
 const engine=createApiEngine({taskRoot:cfg.out+'/records/'+version,networkPolicy:policy,channelsFor:m=>buildChannels(m,{networkPolicy:policy}).filter(c=>c.id==='http')});
 const api=serve({fetch:createApp(engine).fetch,hostname:'127.0.0.1',port:0});if(!api.listening)await new Promise(r=>api.once('listening',r));
 let wire=null;const sdk=new W2L({baseUrl:'http://127.0.0.1:'+api.address().port,fetch:async(input,init)=>{const res=await fetch(input,init);wire={apiUrl:String(input),request:JSON.parse(init.body),httpStatus:res.status,body:await res.clone().text()};return res;}});
 process.send({ready:true});
 process.on('message',async msg=>{
  if(msg.close){await engine.close();await new Promise(r=>api.close(r));process.disconnect();return;}
  wire=null;const startedAt=new Date().toISOString();let response,error;
  try{const {url,...options}=msg.request;response=JSON.parse(JSON.stringify(await sdk.scrape(url,options)));}
  catch(e){error={name:e.name,message:e.message,code:e.code??null};}
  process.send({slot:msg.slot,startedAt,finishedAt:new Date().toISOString(),response:response??null,error:error??null,wire});
 });
}else{
 assert.equal(mode,'--run');await mkdir(cfg.out,{recursive:true});
 const planBytes=await readFile(cfg.plan);assert.equal(hash(planBytes),cfg.planSha256,'plan changed');
 const codeSeal=JSON.parse(await readFile(cfg.codeSeal,'utf8'));for(const [rel,expected]of Object.entries(codeSeal))assert.equal(hash(await readFile(cfg.researchRoot+'/'+rel)),expected,'scoring/runner code changed');
 const sealBytes=await readFile(cfg.dataset+'/seal.json');assert.equal(hash(sealBytes),plan.datasetSealSha256,'dataset seal differs');
 const seal=JSON.parse(sealBytes);for(const [rel,expected]of Object.entries(seal.files))assert.equal(hash(await readFile(cfg.dataset+'/'+rel)),expected,'sealed source or label changed');
 for(const v of ['candidate','control'])assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:cfg.versions[v].cwd,encoding:'utf8'}).trim(),plan.versions[v]);
 const conflict=()=>{
  const commands=execFileSync('/bin/ps',['-axo','pid,command'],{encoding:'utf8'}).split('\n');
  const pids=commands.filter(l=>/^\s*\d+\s+(?:\/[^ ]*\/)?node\s/.test(l)&&/(node_modules\/(?:vitest|\.bin\/vitest)|research\/(?:access\/run-set|parity\/run-sites)|packages\/api\/(?:src|dist)\/cli)/.test(l)).map(l=>Number(l.trim().split(/\s+/)[0]));
  const local=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(':',''));
  return {pids,scheduledGuard:(local>=1350&&local<=1410)||(local>=2050&&local<=2110)};
 };
 let gate=conflict();await appendFile(cfg.out+'/resource-checkpoints.jsonl',JSON.stringify({at:new Date().toISOString(),phase:'before-start',...gate})+'\n');
 if(gate.pids.length||gate.scheduledGuard){console.log('RESOURCE_PAUSE: no slot attempted');process.exitCode=75;}
 else{
  const unseal=cfg.out+'/unseal.json';if(!await exists(unseal))await writeFile(unseal,JSON.stringify({schema:'octocrawl.holdout-unseal/1',at:new Date().toISOString(),planSha256:cfg.planSha256,planCommit:cfg.planCommit,codeSealSha256:hash(await readFile(cfg.codeSeal)),datasetSealSha256:plan.datasetSealSha256,cases:plan.caseIds,scope:plan.scope,nonAuthorReview:null},null,2)+'\n',{flag:'wx'});
  const sources=new Map();for(const id of plan.caseIds){const c=JSON.parse(await readFile(cfg.dataset+'/cases/'+id+'/capture.json','utf8'));const def=plan.cases.find(x=>x.id===id);sources.set(new URL(def.url).pathname,{id,body:await readFile(cfg.dataset+'/cases/'+id+'/'+c.sourceFile),sha256:c.rawSha256});}
  const source=createServer(async(req,res)=>{
   const at=new Date().toISOString();if(req.url==='/robots.txt'){await appendFile(cfg.out+'/source-reads.jsonl',JSON.stringify({at,kind:'robots',path:req.url,status:404})+'\n');res.writeHead(404).end();return;}
   const s=sources.get(new URL(req.url,'http://127.0.0.1').pathname);await appendFile(cfg.out+'/source-reads.jsonl',JSON.stringify({at,kind:'source',path:req.url,caseId:s?.id??null,status:s?200:404,sha256:s?.sha256??null})+'\n');
   if(!s){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}).end(s.body);
  });
  const origin=new URL(plan.fixtureOrigin);await new Promise((resolve,reject)=>{source.once('error',reject);source.listen(Number(origin.port),origin.hostname,resolve);});
  const workers={};
  try{
   for(const v of ['candidate','control']){
    await mkdir(cfg.out+'/'+v,{recursive:true});const child=fork(fileURLToPath(import.meta.url),['--worker',configFile,v],{stdio:['ignore','inherit','inherit','ipc']});workers[v]=child;
    await new Promise((resolve,reject)=>{child.once('message',msg=>msg.ready?resolve():reject(new Error('worker not ready')));child.once('exit',code=>reject(new Error('worker exited before ready '+code)));});
   }
   for(const slot of plan.slots){
    const attempted=cfg.out+'/attempted-'+slot.id+'.json',output=cfg.out+'/'+slot.version+'/'+slot.caseId+'.json';
    if(await exists(attempted))continue;
    gate=conflict();await appendFile(cfg.out+'/resource-checkpoints.jsonl',JSON.stringify({at:new Date().toISOString(),phase:'before-slot',slot:slot.id,...gate})+'\n');
    if(gate.pids.length||gate.scheduledGuard){console.log('RESOURCE_PAUSE: remaining slots untouched');process.exitCode=75;break;}
    const item=plan.cases.find(x=>x.id===slot.caseId);const request={...plan.request,url:plan.fixtureOrigin+new URL(item.url).pathname,verify:{checks:[{type:'markdownIncludes',text:item.checkNeedle}]}};
    await writeFile(attempted,JSON.stringify({slot,request,at:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
    const worker=workers[slot.version];const result=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('exit',code=>reject(new Error('worker exited '+code)));worker.send({slot:slot.id,request});});
    assert.equal(result.slot,slot.id);await writeFile(output,JSON.stringify({slot,request,...result},null,2)+'\n',{flag:'wx'});
    await appendFile(cfg.out+'/progress.jsonl',JSON.stringify({at:new Date().toISOString(),slot:slot.id,version:slot.version,caseId:slot.caseId,status:result.response?.status??null,error:result.error??null})+'\n');console.log(slot.id+' recorded');
   }
  }finally{
   for(const worker of Object.values(workers))if(worker.connected)worker.send({close:true});
   await Promise.all(Object.values(workers).map(worker=>worker.exitCode===null?new Promise(resolve=>worker.once('exit',resolve)):Promise.resolve()));
   await new Promise(r=>source.close(r));
  }
 }
}
