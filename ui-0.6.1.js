import {loadChunkedGzip} from './chunk-loader.js?v=0.6.1';

const base=new URL('.',import.meta.url);

function showFailure(error){
  console.error(error);
  const main=document.createElement('main');
  main.className='boot-failure';
  const eyebrow=document.createElement('p');
  eyebrow.textContent='BEDROCK WORKSHOP';
  const heading=document.createElement('h1');
  heading.textContent='The editor could not start.';
  const detail=document.createElement('p');
  detail.textContent=String(error?.message||error);
  const reload=document.createElement('button');
  reload.type='button';reload.textContent='Reload workshop';reload.onclick=()=>location.reload();
  main.append(eyebrow,heading,detail,reload);
  document.body.replaceChildren(main);
}

try{
  if(typeof DecompressionStream!=='function')throw new Error('A current browser with DecompressionStream support is required.');
  const [css,enhancements,html]=await Promise.all([
    loadChunkedGzip(['./chunks/css-00.bin','./chunks/css-01.bin']),
    fetch(new URL('./enhancements.css?v=0.6.1',base)).then(response=>{
      if(!response.ok)throw new Error(`enhancements.css: HTTP ${response.status}`);
      return response.text();
    }),
    loadChunkedGzip(['./chunks/ui-00.bin','./chunks/ui-01.bin']),
  ]);
  const style=document.createElement('style');
  style.textContent=`${css}\n${enhancements}`;
  document.head.append(style);
  document.body.innerHTML=html.replaceAll('v0.6.0','v0.6.1');
  await import(new URL('./app-0.6.1.js?v=0.6.1',base).href);
  await import(new URL('./enhancements.js?v=0.6.1',base).href);
  document.documentElement.dataset.appState='ready';
}catch(error){
  showFailure(error);
}
