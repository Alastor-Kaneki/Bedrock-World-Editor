const base=new URL('.',import.meta.url);

function prepareV040Shell(){
  const top=document.querySelector('.top-actions');
  if(top && !document.getElementById('saveAllBtn')){
    const b=document.createElement('button'); b.id='saveAllBtn'; b.className='ghost'; b.disabled=true; b.textContent='Save All';
    const undo=document.getElementById('undoBtn'); if(undo)top.insertBefore(b,undo); else top.append(b);
  }
  for(const el of document.querySelectorAll('.eyebrow')) el.textContent=el.textContent.replace(/v0\.[0-9.]+(?:\s*ALPHA)?/gi,'v0.4.0 ALPHA');
  const about=[...document.querySelectorAll('#panel-about p')].find(p=>p.textContent.includes('Build:'));
  if(about) about.innerHTML='<strong>Build:</strong> v0.4.0-alpha • Save All + verified export';
}

async function gunzip(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`Could not load ${url.pathname}: HTTP ${r.status}`);if(typeof DecompressionStream==='undefined')throw new Error('This browser does not support DecompressionStream.');return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();}
async function importBlob(source){const u=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));try{return await import(u)}finally{URL.revokeObjectURL(u)}}
try{prepareV040Shell();let source=await gunzip(new URL('./app-v0.4.0.payload.gz?build=0.4.0-r1',base));source=source.replaceAll('__BASE__',base.href);await importBlob(source);document.documentElement.dataset.loaderBuild='0.4.0';}catch(error){console.error('Bedrock Web Editor v0.4.0 failed to start',error);const t=document.getElementById('toast');if(t){t.textContent=`v0.4.0 startup failed: ${error.message}`;t.dataset.kind='err';t.classList.add('show')}}
