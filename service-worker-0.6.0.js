const CACHE='bedrock-web-editor-v0.6.0';
const CORE=[
  './','./index.html','./ui-0.6.0.js?v=0.6.0','./chunk-loader.js?v=0.6.0','./app-0.6.0.js?v=0.6.0',
  './item-data-0.4.0.js?v=0.6.0','./leveldb-adapter.js?v=0.6.0','./db-wasm.js?v=0.6.0','./bedrock-db-core.wasm',
  './nbt.js?v=0.6.0','./zip.js?v=0.6.0','./manifest.webmanifest','./icon.svg',
  './chunks/app-00.bin','./chunks/app-01.bin','./chunks/app-02.bin','./chunks/app-03.bin','./chunks/app-04.bin',
  './chunks/item-00.bin','./chunks/item-01.bin','./chunks/leveldb-00.bin','./chunks/leveldb-01.bin','./chunks/leveldb-02.bin',
  './chunks/ui-00.bin','./chunks/ui-01.bin','./chunks/css-00.bin','./chunks/css-01.bin'
];
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);for(const u of CORE){try{const r=await fetch(u,{cache:'reload'});if(r.ok)await c.put(u,r.clone())}catch(_){}}await self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('bedrock-web-editor-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;e.respondWith((async()=>{const c=await caches.open(CACHE);try{const r=await fetch(e.request,{cache:'no-store'});if(r.ok)c.put(e.request,r.clone()).catch(()=>{});return r}catch(_){return(await c.match(e.request))||(e.request.mode==='navigate'?c.match('./index.html'):Response.error())}})())});
