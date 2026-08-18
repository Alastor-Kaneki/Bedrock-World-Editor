import { unzip, zip } from '../zip.js?v=0.6.1';
import { parseNBT, buildNBT, TAG, getChild, getEntry, makeNode } from '../nbt.js?v=0.6.1';
import { BedrockLevelDBAdapter, LevelDBInternals, setLevelDBIntegrityCore } from '../leveldb-adapter.js?v=0.6.1';
import { loadBedrockDbWasm } from '../db-wasm.js?v=0.6.1';
import {
  bytesToHex,parseBedrockDbKey,parseNbtSequence,buildNbtSequence,
  tileId,tilePos,containerSlotCount,
} from '../bedrock-helpers-0.6.1.js?v=0.6.1';

const result=document.getElementById('result');
const lines=[];
const report=message=>{lines.push(message);result.textContent=lines.join('\n');};
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const compound=entries=>makeNode(TAG.COMPOUND,entries.map(([name,node])=>({name,node})));
const equalBytes=(left,right)=>left?.length===right?.length&&left.every((byte,index)=>byte===right[index]);
const waitFor=async(predicate,message,timeout=12000)=>{
  const started=performance.now();
  while(performance.now()-started<timeout){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,40));}
  throw new Error(message);
};

async function fixture(name){
  const response=await fetch(`../test-fixtures/${name}`);
  if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function run(){
  const encoder=new TextEncoder();
  assert(LevelDBInternals.crc32c(encoder.encode('123456789'))===0xe3069283,'CRC32C standard vector failed');
  report('PASS  CRC32C JavaScript vector');

  const key=new Uint8Array(13),view=new DataView(key.buffer);
  view.setInt32(0,-12,true);view.setInt32(4,34,true);view.setInt32(8,2,true);key[12]=0x31;
  const decoded=parseBedrockDbKey(key);
  assert(decoded?.x===-12&&decoded.z===34&&decoded.dimension===2&&decoded.type===0x31,'Bedrock DB key decode failed');
  const overworldKey=new Uint8Array(9),overworldView=new DataView(overworldKey.buffer);
  overworldView.setInt32(0,-12,true);overworldView.setInt32(4,34,true);overworldKey[8]=0x31;
  const overworldDecoded=parseBedrockDbKey(overworldKey);
  assert(overworldDecoded?.x===-12&&overworldDecoded.z===34&&overworldDecoded.dimension===0&&overworldDecoded.type===0x31,'Overworld DB key decode failed');
  assert(bytesToHex(key).endsWith('31'),'Hex conversion failed');
  report('PASS  overworld/dimension DB key helpers');

  const first={rootName:'',root:compound([['id',makeNode(TAG.STRING,'Chest')],['x',makeNode(TAG.INT,1)]]),_rootNamed:false};
  const second={rootName:'tile',root:compound([['id',makeNode(TAG.STRING,'Hopper')],['y',makeNode(TAG.INT,64)]]),_rootNamed:true};
  const sequence=buildNbtSequence([first,second]);
  const parsed=parseNbtSequence(sequence);
  assert(parsed.length===2&&tileId(parsed[0].root)==='Chest'&&tilePos(parsed[1].root).y===64,'Concatenated tile NBT round-trip failed');
  assert(equalBytes(buildNbtSequence(parsed),sequence),'Rebuilt tile NBT changed bytes');
  const items=makeNode(TAG.LIST,{elemType:TAG.COMPOUND,items:[compound([['Slot',makeNode(TAG.BYTE,4)]])]});
  const hopper=compound([['id',makeNode(TAG.STRING,'Hopper')],['Items',items]]);
  assert(containerSlotCount(hopper)===5,'Container slot mapping failed');
  report('PASS  concatenated tile NBT and container helpers');

  const playerBytes=await fixture('demo-player.nbt');
  const player=parseNBT(playerBytes,{rootNamed:true});
  assert(getChild(player.root,'Inventory')?.type===TAG.LIST,'Player fixture has no Inventory list');
  const playerRoundTrip=buildNBT(player,{rootNamed:true});
  assert(playerRoundTrip.length===playerBytes.length&&playerRoundTrip.every((byte,index)=>byte===playerBytes[index]),'Player NBT round-trip changed bytes');
  report('PASS  player NBT byte-for-byte round-trip');

  const originalMap=await unzip(await fixture('demo-world-leveldb.mcworld'));
  const manifestRecord=LevelDBInternals.encodeVersionEditSnapshot({
    comparatorName:'leveldb.BytewiseComparator',logNumber:1n,prevLogNumber:0n,liveFiles:new Map(),
  },11n,100n,[]);
  const writableMap={
    ...originalMap,
    'db/MANIFEST-000011':LevelDBInternals.buildLogFile(manifestRecord),
    'db/CURRENT':encoder.encode('MANIFEST-000011\n'),
  };
  const db=new BedrockLevelDBAdapter();await db.open(writableMap);
  const before=await db.get('~local_player');
  assert(before?.sequence===100n,'Could not recover ~local_player sequence 100');
  const edited=parseNBT(before.value,{rootNamed:true});
  const level=getEntry(edited.root,'PlayerLevel');
  assert(level,'Player fixture has no PlayerLevel tag');level.node.value=77;
  await db.put('~local_player',buildNBT(edited,{rootNamed:true}));
  const tileKey=new Uint8Array(13),tileKeyView=new DataView(tileKey.buffer);
  tileKeyView.setInt32(0,0,true);tileKeyView.setInt32(4,0,true);tileKeyView.setInt32(8,0,true);tileKey[12]=0x31;
  const emptyItems=makeNode(TAG.LIST,{elemType:TAG.COMPOUND,items:[]});
  const commandTile={rootName:'',root:compound([
    ['id',makeNode(TAG.STRING,'CommandBlock')],['x',makeNode(TAG.INT,1)],['y',makeNode(TAG.INT,64)],['z',makeNode(TAG.INT,1)],
    ['Command',makeNode(TAG.STRING,'say original')],['Items',emptyItems],
  ]),_rootNamed:false};
  const signTile={rootName:'',root:compound([
    ['id',makeNode(TAG.STRING,'Sign')],['x',makeNode(TAG.INT,2)],['y',makeNode(TAG.INT,64)],['z',makeNode(TAG.INT,1)],
    ['Text',makeNode(TAG.STRING,'original sign')],
  ]),_rootNamed:false};
  await db.put(tileKey,buildNbtSequence([commandTile,signTile]));
  const overlay=await db.exportFiles();
  const overlayPaths=Object.keys(overlay);
  const tablePath=overlayPaths.find(path=>path.endsWith('.ldb'));
  const manifestPath=overlayPaths.find(path=>/MANIFEST-\d+$/.test(path));
  const currentPath=overlayPaths.find(path=>path.endsWith('/CURRENT'));
  assert(tablePath,'LevelDB export did not create an L0 table');
  assert(manifestPath,'LevelDB export did not create a MANIFEST');
  assert(currentPath,'LevelDB export did not create CURRENT');
  const oldManifest=writableMap['db/MANIFEST-000011'];
  assert(overlay[manifestPath].length>oldManifest.length&&oldManifest.every((byte,index)=>overlay[manifestPath][index]===byte),'Generated MANIFEST did not preserve its complete history');
  assert(manifestPath.endsWith(new TextDecoder().decode(overlay[currentPath]).trim()),'CURRENT does not name the generated MANIFEST');
  const editedMap={...writableMap,...overlay};
  const reopened=new BedrockLevelDBAdapter();await reopened.open(editedMap);
  const after=await reopened.get('~local_player');
  assert(after?.sequence===101n,'Generated L0 table did not supersede the original player record');
  assert(Number(getChild(parseNBT(after.value,{rootNamed:true}).root,'PlayerLevel').value)===77,'Edited player level was not recovered');
  const reopenedTile=await reopened.get(tileKey);
  assert(reopenedTile?.sequence===102n&&parseNbtSequence(reopenedTile.value).length===2,'Tile-entity NBT did not round-trip through LevelDB');
  report('PASS  LevelDB player/tile writeback and history-preserving rollover');

  const largeValue=new Uint8Array(100000);for(let index=0;index<largeValue.length;index++)largeValue[index]=index&255;
  const largeDb=new BedrockLevelDBAdapter();await largeDb.open(writableMap);await largeDb.put('large-test-record',largeValue);
  const largeMap={...writableMap,...await largeDb.exportFiles()};
  const largeReopened=new BedrockLevelDBAdapter();await largeReopened.open(largeMap);
  assert(equalBytes((await largeReopened.get('large-test-record'))?.value,largeValue),'100,000-byte LevelDB value changed during writeback');
  report('PASS  100,000-byte LevelDB value writeback');

  const repacked=await zip(editedMap,{compress:true});
  const reopenedMap=await unzip(repacked);
  assert(Object.keys(reopenedMap).length===Object.keys(editedMap).length,'ZIP repack changed the file count');
  for(const [path,bytes] of Object.entries(editedMap))assert(equalBytes(reopenedMap[path],bytes),`ZIP repack changed ${path}`);
  report('PASS  complete .mcworld ZIP repack');

  const wasm=await loadBedrockDbWasm();setLevelDBIntegrityCore(wasm);
  assert(wasm.crc32c(encoder.encode('123456789'))===0xe3069283,'WASM CRC32C vector failed');
  assert(wasm.parseDbKey(key)?.type===0x31,'WASM DB key decode failed');
  report('PASS  WebAssembly integrity core');

  const frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:-10000px;top:0;width:390px;height:844px;border:0';
  const frameLoaded=new Promise((resolve,reject)=>{frame.addEventListener('load',resolve,{once:true});setTimeout(()=>reject(new Error('Editor iframe did not load')),12000);});
  frame.src='../?browser-smoke=0.6.1';document.body.append(frame);await frameLoaded;
  report('PASS  editor frame navigation');
  const frameWindow=frame.contentWindow,frameDocument=frame.contentDocument;
  await waitFor(()=>frameDocument.documentElement.dataset.appState==='ready','Editor bootstrap did not reach ready state');
  report('PASS  editor controller bootstrap');
  const transfer=new frameWindow.DataTransfer();
  transfer.items.add(new frameWindow.File([repacked],'demo-world-leveldb.mcworld',{type:'application/zip'}));
  const input=frameDocument.getElementById('fileInput');input.files=transfer.files;
  input.dispatchEvent(new frameWindow.Event('change',{bubbles:true}));
  await waitFor(()=>!frameDocument.getElementById('editor')?.hidden,'Demo world did not open');
  report('PASS  generated fixture world load');
  await waitFor(()=>{const status=frameDocument.getElementById('containerStatus')?.textContent||'';return status&&!/scanning|load a world/i.test(status);},'Tile/container scan did not finish');
  const containerStatus=frameDocument.getElementById('containerStatus').textContent;
  assert(/1 container found/i.test(containerStatus),`Tile/container scan failed: ${containerStatus}`);
  assert(frameDocument.body.classList.contains('has-world'),'Loaded-world responsive state was not applied');
  assert(frameDocument.getElementById('exportWorld')?.disabled===false,'Export action was not enabled after load');
  for(const id of ['saveAllBtn','exportWorld','undoBtn','redoBtn','exportLevel'])assert(frameWindow.getComputedStyle(frameDocument.getElementById(id)).display!=='none',`${id} is unavailable in the narrow editor layout`);
  assert(frameWindow.getComputedStyle(frameDocument.getElementById('commandsEnabled')).display==='block','Switch inputs remain hidden from keyboard access');
  assert(frameDocument.querySelector('#nbtTree .nbt-head[role="button"][tabindex="0"]'),'Scalar NBT values are not keyboard accessible');
  frame.style.width='820px';await new Promise(resolve=>frameWindow.requestAnimationFrame(()=>frameWindow.requestAnimationFrame(resolve)));
  assert(frameWindow.getComputedStyle(frameDocument.getElementById('saveAllBtn')).display!=='none','Save All is unavailable in the tablet editor layout');
  frame.style.width='390px';
  await waitFor(()=>frameDocument.querySelectorAll('.tile-tool-card').length===2,'Special tile tools did not render both fixture records');
  const findTileCard=id=>[...frameDocument.querySelectorAll('.tile-tool-card')].find(card=>card.querySelector('h3')?.textContent===id);
  let commandCard=findTileCard('CommandBlock'),signCard=findTileCard('Sign');
  const editField=(field,value)=>{field.value=value;field.dispatchEvent(new frameWindow.Event('input',{bubbles:true}));};
  editField(commandCard.querySelector('.tile-textarea'),'say draft');
  editField(signCard.querySelector('.tile-textarea'),'sign draft');
  const tileSearch=frameDocument.getElementById('tileToolsSearch');tileSearch.value='command';tileSearch.dispatchEvent(new frameWindow.Event('input',{bubbles:true}));
  await waitFor(()=>frameDocument.querySelector('.tile-textarea')?.value==='say draft','Command draft did not survive search rerender');
  tileSearch.value='';tileSearch.dispatchEvent(new frameWindow.Event('input',{bubbles:true}));
  await waitFor(()=>frameDocument.querySelectorAll('.tile-tool-card.has-draft').length===2,'Both tile drafts were not restored');
  commandCard=findTileCard('CommandBlock');commandCard.querySelector('.primary').click();
  await waitFor(()=>frameDocument.querySelectorAll('.tile-tool-card.has-draft').length===1,'Saving one tile card discarded or retained the wrong drafts');
  signCard=findTileCard('Sign');assert(signCard.querySelector('.tile-textarea').value==='sign draft','Sign draft was lost when another card was saved');
  frameDocument.getElementById('saveAllBtn').click();
  assert(/Save all 1 highlighted tile card/.test(frameDocument.getElementById('toast').textContent),'Save All did not block the remaining tile draft');
  signCard.querySelector('.primary').click();
  await waitFor(()=>frameDocument.querySelectorAll('.tile-tool-card.has-draft').length===0,'Saved tile draft remained marked as pending');
  let registration=null;
  await waitFor(async()=>{
    registration=await frameWindow.navigator.serviceWorker.getRegistration();
    return registration?.active?.scriptURL.endsWith('/service-worker-0.6.1.js')||registration?.waiting?.scriptURL.endsWith('/service-worker-0.6.1.js');
  },'v0.6.1 service worker did not install');
  if(registration.waiting?.scriptURL.endsWith('/service-worker-0.6.1.js')){
    const changed=new Promise(resolve=>frameWindow.navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    registration.waiting.postMessage({type:'SKIP_WAITING'});await changed;
    registration=await frameWindow.navigator.serviceWorker.getRegistration();
  }
  assert(registration.active?.scriptURL.endsWith('/service-worker-0.6.1.js'),'v0.6.1 service worker is not active');
  const cacheName='bedrock-workshop-v0.6.1';
  assert((await frameWindow.caches.keys()).includes(cacheName),'v0.6.1 offline cache was not installed');
  const offlineCache=await frameWindow.caches.open(cacheName);
  for(const asset of ['index.html','item-data-0.4.0.js?v=0.6.1','leveldb-adapter.js?v=0.6.1','chunk-loader.js?v=0.6.1','chunks/app-00.bin']){
    assert(await offlineCache.match(new URL(`../${asset}`,import.meta.url)),`Offline cache is missing ${asset}`);
  }
  const shellUrl=new URL('../index.html',import.meta.url),shellBefore=await (await offlineCache.match(shellUrl)).text();
  const docsFrame=document.createElement('iframe');docsFrame.hidden=true;docsFrame.src='../README.md?cache-safety-check=1';document.body.append(docsFrame);
  await new Promise((resolve,reject)=>{docsFrame.addEventListener('load',resolve,{once:true});setTimeout(()=>reject(new Error('README navigation did not finish')),12000);});
  docsFrame.remove();
  const shellAfter=await (await offlineCache.match(shellUrl)).text();
  assert(shellAfter===shellBefore,'A non-app navigation replaced the cached editor shell');
  frame.remove();
  report('PASS  full UI, real tile scan, multi-draft retention, and offline asset cache');

  document.documentElement.dataset.testStatus='pass';
  result.dataset.status='pass';
  report('\nALL BROWSER SMOKE TESTS PASSED');
}

try{
  await run();
}catch(error){
  console.error(error);
  document.documentElement.dataset.testStatus='fail';
  result.dataset.status='fail';
  result.textContent=`${lines.join('\n')}\n\nFAIL  ${error.stack||error.message||error}`;
}
