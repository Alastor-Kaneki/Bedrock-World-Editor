const BUILD='0.4.0-alpha';
document.documentElement.dataset.appBuild=BUILD;
window.__BEDROCK_WEB_EDITOR_BOOT__=BUILD;

async function purge(){
  if('caches' in window){try{for(const k of await caches.keys())if(k.startsWith('bedrock-web-editor-'))await caches.delete(k)}catch(e){console.warn(e)}}
  if('serviceWorker' in navigator){try{for(const r of await navigator.serviceWorker.getRegistrations())if(r.scope===new URL('./',location.href).href)await r.unregister()}catch(e){console.warn(e)}}
}

try{
  await purge();
  await import('./app-v0.4.0.js?loader=0.4.0-r1');
}catch(error){
  console.error('Bedrock Web Editor v0.4.0 bootstrap failure',error);
  const t=document.getElementById('toast'); if(t){t.textContent=`v0.4.0 bootstrap failed: ${error?.message||error}`;t.dataset.kind='err';t.classList.add('show')}
}
