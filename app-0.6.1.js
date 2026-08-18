import {loadChunkedGzip,importSource} from './chunk-loader.js?v=0.6.1';

const base=new URL('.',import.meta.url);

try{
  let source=await loadChunkedGzip([
    './chunks/app-00.bin','./chunks/app-01.bin','./chunks/app-02.bin',
    './chunks/app-03.bin','./chunks/app-04.bin',
  ]);
  source=source.replaceAll('__BASE__',base.href).replaceAll('0.6.0','0.6.1');
  const helpers=new URL('./bedrock-helpers-0.6.1.js?v=0.6.1',base).href;
  source=`import { bytesToHex, parseBedrockDbKey, parseNbtSequence, buildNbtSequence, tileId, tilePos, containerSlotCount } from ${JSON.stringify(helpers)};\n${source}`;
  await importSource(source);
  const startupToast=document.getElementById('toast');
  if(startupToast?.dataset.kind==='err'&&/startup failed/i.test(startupToast.textContent||''))throw new Error(startupToast.textContent);
}catch(error){
  console.error(error);
  const toast=document.getElementById('toast');
  if(toast){
    toast.textContent=`v0.6.1 startup failed: ${error.message}`;
    toast.dataset.kind='err';
    toast.classList.add('show');
  }
  throw error;
}
