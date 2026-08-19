// Feature pack marker: 2026-08-19
const CACHE='bedrock-workshop-v0.6.1-features-1';
const CORE=[
  './','./index.html','./ui-0.6.1.js?v=0.6.1','./app-0.6.1.js?v=0.6.1',
  './chunk-loader.js?v=0.6.1','./bedrock-helpers-0.6.1.js?v=0.6.1',
  './enhancements.css?v=0.6.1','./enhancements.js?v=0.6.1',
  './workshop-features.css?v=0.6.1-feature-pack-1','./workshop-features.js?v=0.6.1-feature-pack-1',
  './item-data-0.4.0.js?v=0.6.1','./leveldb-adapter.js?v=0.6.1',
  './db-wasm.js?v=0.6.1','./bedrock-db-core.wasm','./nbt.js?v=0.6.1',
  './zip.js?v=0.6.1','./manifest.webmanifest','./icon.svg',
  './chunks/app-00.bin','./chunks/app-01.bin','./chunks/app-02.bin',
  './chunks/app-03.bin','./chunks/app-04.bin','./chunks/item-00.bin',
  './chunks/item-01.bin','./chunks/leveldb-00.bin','./chunks/leveldb-01.bin',
  './chunks/leveldb-02.bin','./chunks/ui-00.bin','./chunks/ui-01.bin',
  './chunks/css-00.bin','./chunks/css-01.bin',
];
const CORE_URLS=new Set(CORE.map(path=>new URL(path,self.location.href).href));

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>(key.startsWith('bedrock-web-editor-')||key.startsWith('bedrock-workshop-'))&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

async function navigationResponse(request){
  const cache=await caches.open(CACHE);
  const url=new URL(request.url);
  const rootPath=new URL('./',self.registration.scope).pathname;
  const indexPath=new URL('./index.html',self.registration.scope).pathname;
  const isAppShell=url.pathname===rootPath||url.pathname===indexPath;
  try{
    const response=await fetch(request);
    if(response.ok&&isAppShell)cache.put('./index.html',response.clone()).catch(()=>{});
    return response;
  }catch(_){
    return (await cache.match(request))||(isAppShell?cache.match('./index.html'):null)||Response.error();
  }
}

async function assetResponse(request){
  if(!CORE_URLS.has(request.url))return fetch(request);
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok)cache.put(request,response.clone()).catch(()=>{});
  return response;
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(event.request.mode==='navigate'?navigationResponse(event.request):assetResponse(event.request));
});
