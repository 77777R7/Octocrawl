// One retained-source replay per case of dev-plan.v1.json through this checkout's engine, API and SDK.
// Usage: node research/accuracy/run_dev.mjs <dataset dir> <output dir> [label] [--plan=<plan.json>] [--engine=<checkout>]
// --plan defaults to dev-plan.v1.json; --engine (default: this checkout) is a built checkout whose engine, API and SDK run,
// so one driver can replay the same plan through two commits (reserved-plan.v2.json's paired run).
// A case's own `request` (the json plans) is merged over the plan's request.
// Build first (npx tsc --build). Each case is served alone at the fixture origin, so two cases with the
// same path (D08 and D09 are both "/") never share a server. A started case is not rerun.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const flags=Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith('--')).map(a=>a.slice(2).split(/=(.*)/s,2)));
const [dataset,out,label='main']=process.argv.slice(2).filter(a=>!a.startsWith('--'));
assert.ok(dataset&&out,'usage: run_dev.mjs <dataset dir> <output dir> [label]');
const root=flags.engine?resolve(flags.engine)+'/':fileURLToPath(new URL('../../',import.meta.url));
const hash=x=>createHash('sha256').update(x).digest('hex');
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
assert.ok(await exists(root+'node_modules'),'engine checkout has no node_modules of its own: '+root);
const plan=JSON.parse(await readFile(flags.plan??new URL('./dev-plan.v1.json',import.meta.url),'utf8'));
const sealBytes=await readFile(dataset+'/seal.json');assert.equal(hash(sealBytes),plan.datasetSealSha256,'dataset seal differs');
const seal=JSON.parse(sealBytes);for(const [rel,expected]of Object.entries(seal.files))assert.equal(hash(await readFile(dataset+'/'+rel)),expected,'sealed source or label changed: '+rel);
for(const k of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])delete process.env[k];
process.env.NO_PROXY='127.0.0.1,localhost';
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();process.env.W2L_SOURCE_COMMIT=commit;
const imp=p=>import(pathToFileURL(root+p).href);
const {serve}=await import(pathToFileURL(createRequire(root+'packages/api/package.json').resolve('@hono/node-server')).href);
const {createApiEngine,createApp}=await imp('packages/api/dist/index.js');
const {localNetworkPolicy}=await imp('packages/contracts/dist/index.js');
const {buildChannels}=await imp('packages/bench/dist/index.js');
const {W2L}=await imp('packages/sdk/dist/index.js');
const dir=out+'/'+label;await mkdir(dir,{recursive:true});
const policy={...localNetworkPolicy(),perHostMinDelayMs:0};
const engine=createApiEngine({taskRoot:out+'/records/'+label,networkPolicy:policy,channelsFor:m=>buildChannels(m,{networkPolicy:policy}).filter(c=>c.id==='http')});
const api=serve({fetch:createApp(engine).fetch,hostname:'127.0.0.1',port:0});if(!api.listening)await new Promise(r=>api.once('listening',r));
const sdk=new W2L({baseUrl:'http://127.0.0.1:'+api.address().port});
const origin=new URL(plan.fixtureOrigin);let current=null;const reads=[];
const source=createServer((req,res)=>{
 const path=new URL(req.url,origin).pathname;const hit=current&&path===current.path;reads.push({at:new Date().toISOString(),caseId:current?.id??null,path:req.url,status:hit?200:404});
 if(!hit){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}).end(current.body);
});
await new Promise((resolve,reject)=>{source.once('error',reject);source.listen(Number(origin.port),origin.hostname,resolve);});
try{
 for(const item of plan.cases){
  const output=dir+'/'+item.id+'.json';if(await exists(output))continue;
  const capture=JSON.parse(await readFile(dataset+'/cases/'+item.id+'/capture.json','utf8'));const u=new URL(item.url);
  current={id:item.id,path:u.pathname,body:await readFile(dataset+'/cases/'+item.id+'/'+capture.sourceFile)};
  const request={...plan.request,...(item.request??{}),url:plan.fixtureOrigin+u.pathname+u.search,...(item.checkNeedle?{verify:{checks:[{type:'markdownIncludes',text:item.checkNeedle}]}}:{})};
  const startedAt=new Date().toISOString();let response=null,error=null;
  try{const {url,...options}=request;response=JSON.parse(JSON.stringify(await sdk.scrape(url,options)));}
  catch(e){error={name:e.name,message:e.message,code:e.code??null};}
  await writeFile(output,JSON.stringify({caseId:item.id,commit,request,startedAt,finishedAt:new Date().toISOString(),sourceSha256:capture.rawSha256,response,error},null,2)+'\n',{flag:'wx'});
  console.log(item.id,response?.status??error?.code??'error',response?.verification?.status??'');
 }
}finally{
 await writeFile(dir+'/source-reads.json',JSON.stringify(reads,null,1)+'\n');
 await engine.close();await new Promise(r=>api.close(r));await new Promise(r=>source.close(r));
}
