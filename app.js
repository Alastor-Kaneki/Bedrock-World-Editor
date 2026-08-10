import { unzip, zip } from './zip.js';
import { TAG, TAG_NAMES, parseLevelDat, buildLevelDat, parseNBT, buildNBT, getChild, getEntry, setChild, makeNode, cloneNode, nbtToPlain } from './nbt.js';
import { BedrockLevelDBAdapter } from './leveldb-adapter.js';

const $ = (s, p=document) => p.querySelector(s);
const $$ = (s, p=document) => [...p.querySelectorAll(s)];
const state = {
  files: null,
  sourceKind: null,
  sourceName: null,
  levelPath: null,
  doc: null,
  activePlayer: null,
  playerCandidates: [],
  undo: [], redo: [],
  rawPlayer: null,
  rawPlayerName: null,
  dbAdapter: null,
  dbInfo: null,
  dbPlayer: null,
  dbPlayerDirty: false,
  dbStatus: 'idle',
  dbError: null,
  loadToken: 0,
  dirty: false,
};

const commonItems = [
  'minecraft:air','minecraft:stone','minecraft:grass_block','minecraft:dirt','minecraft:cobblestone','minecraft:oak_planks','minecraft:spruce_planks','minecraft:birch_planks','minecraft:glass','minecraft:obsidian','minecraft:bedrock','minecraft:barrier','minecraft:structure_block','minecraft:command_block','minecraft:repeating_command_block','minecraft:chain_command_block','minecraft:light_block','minecraft:end_portal_frame','minecraft:end_gateway','minecraft:dragon_egg','minecraft:chest','minecraft:ender_chest','minecraft:shulker_box','minecraft:crafting_table','minecraft:furnace','minecraft:anvil','minecraft:enchanting_table','minecraft:beacon','minecraft:torch','minecraft:lantern','minecraft:redstone','minecraft:redstone_torch','minecraft:repeater','minecraft:comparator','minecraft:piston','minecraft:sticky_piston','minecraft:tnt','minecraft:water_bucket','minecraft:lava_bucket','minecraft:bucket','minecraft:elytra','minecraft:shield','minecraft:totem_of_undying','minecraft:bow','minecraft:crossbow','minecraft:trident','minecraft:mace','minecraft:wooden_sword','minecraft:stone_sword','minecraft:iron_sword','minecraft:golden_sword','minecraft:diamond_sword','minecraft:netherite_sword','minecraft:wooden_pickaxe','minecraft:stone_pickaxe','minecraft:iron_pickaxe','minecraft:golden_pickaxe','minecraft:diamond_pickaxe','minecraft:netherite_pickaxe','minecraft:diamond_helmet','minecraft:diamond_chestplate','minecraft:diamond_leggings','minecraft:diamond_boots','minecraft:netherite_helmet','minecraft:netherite_chestplate','minecraft:netherite_leggings','minecraft:netherite_boots','minecraft:apple','minecraft:golden_apple','minecraft:enchanted_golden_apple','minecraft:bread','minecraft:cooked_beef','minecraft:ender_pearl','minecraft:ender_eye','minecraft:experience_bottle','minecraft:nether_star','minecraft:diamond','minecraft:emerald','minecraft:netherite_ingot','minecraft:iron_ingot','minecraft:gold_ingot','minecraft:coal','minecraft:amethyst_shard','minecraft:echo_shard','minecraft:recovery_compass','minecraft:compass','minecraft:clock','minecraft:name_tag','minecraft:lead','minecraft:book','minecraft:writable_book','minecraft:written_book','minecraft:map','minecraft:filled_map','minecraft:firework_rocket','minecraft:spawn_egg'
];

function notify(msg, kind='ok') {
  const el = $('#toast'); el.textContent = msg; el.dataset.kind = kind; el.classList.add('show');
  clearTimeout(notify.t); notify.t=setTimeout(()=>el.classList.remove('show'),3200);
}
function fmtBytes(n){ if(n<1024)return `${n} B`; if(n<1048576)return `${(n/1024).toFixed(1)} KiB`; return `${(n/1048576).toFixed(1)} MiB`; }
function download(bytes, name, type='application/octet-stream'){
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function basename(p){ return p.split('/').filter(Boolean).pop() || p; }
function sanitizeWorldName(n){ return (n||'Edited-World').replace(/[\\/:*?"<>|]+/g,'_').trim() || 'Edited-World'; }

function playerDocBytes(doc){ return buildNBT(doc,{rootNamed:doc?._rootNamed!==false}); }
function captureSnapshot(){
  if(!state.doc)return null;
  return {
    level: buildLevelDat(state.doc),
    raw: state.rawPlayer ? playerDocBytes(state.rawPlayer) : null,
    rawNamed: state.rawPlayer?._rootNamed!==false,
    rawName: state.rawPlayerName,
    db: state.dbPlayer ? playerDocBytes(state.dbPlayer.doc) : null,
    dbNamed: state.dbPlayer?.doc?._rootNamed!==false,
    dbMeta: state.dbPlayer ? {key:state.dbPlayer.key,sequence:state.dbPlayer.sequence,source:state.dbPlayer.source} : null,
    dbDirty: state.dbPlayerDirty,
  };
}
function parsePlayerBytes(bytes, preferredNamed=null){
  const order=preferredNamed===null?[true,false]:[preferredNamed,!preferredNamed];
  let last=null;
  for(const rootNamed of order){
    try{
      const doc=parseNBT(bytes,{rootNamed}); doc._rootNamed=rootNamed;
      const trailing=bytes.subarray(doc.bytesRead); const clean=[...trailing].every(x=>x===0);
      if(doc.root?.type===TAG.COMPOUND && (doc.bytesRead===bytes.length||clean))return doc;
    }catch(e){last=e;}
  }
  throw last||new Error('Player NBT is not a root compound.');
}
function restoreSnapshot(snap){
  state.doc=parseLevelDat(snap.level);
  state.rawPlayer=snap.raw?parsePlayerBytes(snap.raw,snap.rawNamed):null; state.rawPlayerName=snap.rawName||null;
  state.dbPlayer=snap.db?{...snap.dbMeta,doc:parsePlayerBytes(snap.db,snap.dbNamed)}:null; state.dbPlayerDirty=!!snap.dbDirty;
  detectPlayers(); setDirty(true); renderAll();
}
function checkpoint(){
  if(!state.doc)return; try { const snap=captureSnapshot(); if(snap)state.undo.push(snap); if(state.undo.length>30)state.undo.shift(); state.redo=[]; } catch(e){console.warn(e)}
}
function setDirty(v=true){state.dirty=v; $('#dirtyBadge').hidden=!v;}
function resetDbState(){ state.dbAdapter=null; state.dbInfo=null; state.dbPlayer=null; state.dbPlayerDirty=false; state.dbStatus='idle'; state.dbError=null; }
function markActivePlayerDirty(){ const meta=state.playerCandidates.find(p=>p.node===state.activePlayer); if(meta?.db)state.dbPlayerDirty=true; setDirty(); }

function root(){ return state.doc?.root; }
function scalar(comp, name, fallback='') { const n=getChild(comp,name); return n?.value ?? fallback; }
function setScalar(comp, name, value, defaultType=TAG.INT){
  const e=getEntry(comp,name); const t=e?.node.type ?? defaultType;
  let v=value;
  if(t===TAG.STRING) v=String(value);
  else if(t===TAG.LONG) v=BigInt(String(value||0));
  else if([TAG.BYTE,TAG.SHORT,TAG.INT].includes(t)) v=Number.parseInt(value||0,10)||0;
  else if([TAG.FLOAT,TAG.DOUBLE].includes(t)) v=Number(value)||0;
  setChild(comp,name,makeNode(t,v));
}

async function loadInputFiles(files){
  if(!files?.length)return;
  const first=files[0];
  try{
    if(files.length>1 || first.webkitRelativePath){
      const map={}; let rootPrefix='';
      for(const f of files){ let p=f.webkitRelativePath || f.name; if(!rootPrefix && p.includes('/'))rootPrefix=p.split('/')[0]+'/'; if(rootPrefix && p.startsWith(rootPrefix))p=p.slice(rootPrefix.length); map[p]=new Uint8Array(await f.arrayBuffer()); }
      await loadWorldMap(map, first.webkitRelativePath?.split('/')[0] || 'World Folder', 'folder');
    } else if(/\.(mcworld|zip)$/i.test(first.name)){
      const map=await unzip(new Uint8Array(await first.arrayBuffer()));
      await loadWorldMap(map, first.name, 'archive');
    } else if(first.name.toLowerCase()==='level.dat' || /\.dat$/i.test(first.name)){
      const bytes=new Uint8Array(await first.arrayBuffer());
      const doc=parseLevelDat(bytes);
      state.files={'level.dat':bytes}; state.sourceKind='leveldat'; state.sourceName=first.name; state.levelPath='level.dat'; state.doc=doc; state.undo=[]; state.redo=[]; state.rawPlayer=null; state.rawPlayerName=null; resetDbState(); setDirty(false); afterLoad();
    } else throw new Error('Choose a .mcworld/.zip, a Bedrock world folder, or level.dat.');
  }catch(e){ console.error(e); notify(e.message||String(e),'err'); }
}

async function loadWorldMap(map, name, kind){
  const paths=Object.keys(map); let levelPath=paths.find(p=>p==='level.dat') || paths.find(p=>p.endsWith('/level.dat'));
  if(!levelPath)throw new Error('No level.dat was found in this world.');
  const doc=parseLevelDat(map[levelPath]);
  state.files=map; state.sourceKind=kind; state.sourceName=name; state.levelPath=levelPath; state.doc=doc; state.undo=[]; state.redo=[]; state.rawPlayer=null; state.rawPlayerName=null; resetDbState(); setDirty(false); afterLoad();
}

function activateTab(name){
  $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  $$('.panel').forEach(p=>p.classList.toggle('active',p.id===`panel-${name}`));
}

async function afterLoad(){
  const token=++state.loadToken;
  $('#emptyState').hidden=true; $('#editor').hidden=false; $('#sourceName').textContent=state.sourceName; $('#sourceType').textContent=state.sourceKind; activateTab('world');
  $('#headerVersion').textContent=state.doc.version; $('#payloadSize').textContent=fmtBytes(state.doc.declaredLength);
  detectPlayers(); renderAll(); notify('level.dat loaded as primary. Scanning secondary world data…');
  await initializeDatabase(token);
}
async function initializeDatabase(token=state.loadToken){
  const hasDb=state.files && Object.keys(state.files).some(p=>/(^|\/)db\//.test(p));
  if(!hasDb){ state.dbStatus='none'; state.dbInfo=null; renderDbInspector(); return; }
  state.dbStatus='scanning'; state.dbError=null; renderDbInspector();
  try{
    const adapter=new BedrockLevelDBAdapter(); await adapter.open(state.files);
    if(token!==state.loadToken)return;
    state.dbAdapter=adapter; state.dbInfo=adapter.diagnostics();
    const hit=await adapter.get('~local_player');
    if(token!==state.loadToken)return;
    if(hit){
      try{ const doc=parsePlayerBytes(hit.value); state.dbPlayer={key:'~local_player',doc,sequence:hit.sequence,source:hit.source}; state.dbStatus='player-found'; }
      catch(e){ state.dbStatus='player-unparsed'; state.dbError=`~local_player was found, but its NBT could not be parsed: ${e.message}`; }
    }else state.dbStatus='ready';
    state.dbInfo=adapter.diagnostics(); detectPlayers(); renderAll();
    if(state.dbPlayer)notify('LevelDB ~local_player loaded. Inventory editing is enabled.');
    else notify('World loaded. LevelDB scan completed.');
  }catch(e){ if(token!==state.loadToken)return; console.error(e); state.dbStatus='error'; state.dbError=e.message||String(e); renderDbInspector(); }
}

function detectPlayers(){
  state.playerCandidates=[];
  const seen=new Set();
  if(state.dbPlayer?.doc?.root?.type===TAG.COMPOUND){ state.playerCandidates.push({path:'Local player · LevelDB',node:state.dbPlayer.doc.root,db:true}); seen.add(state.dbPlayer.doc.root); }
  function walk(n,path,depth){
    if(!n||depth>7||n.type!==TAG.COMPOUND)return;
    const hasInv=getChild(n,'Inventory')?.type===TAG.LIST;
    const hasArmor=getChild(n,'Armor')?.type===TAG.LIST;
    const likelyPlayer=hasInv||hasArmor||getChild(n,'PlayerLevel')||getChild(n,'playerGameType');
    if(likelyPlayer && !seen.has(n)){ state.playerCandidates.push({path:path||'root',node:n}); seen.add(n); }
    for(const e of n.value){ if(e.node.type===TAG.COMPOUND)walk(e.node,path?`${path}.${e.name}`:e.name,depth+1); }
  }
  walk(root(),'root',0);
  const explicit=getChild(root(),'Player');
  if(explicit?.type===TAG.COMPOUND && !seen.has(explicit))state.playerCandidates.unshift({path:'root.Player',node:explicit});
  if(state.rawPlayer?.root?.type===TAG.COMPOUND){
    const raw=state.rawPlayer.root;
    if(getChild(raw,'Inventory')?.type===TAG.LIST || getChild(raw,'Armor')?.type===TAG.LIST){
      state.playerCandidates.push({path:'Raw player NBT',node:raw,raw:true});
    }
  }
  if(!state.playerCandidates.some(p=>p.node===state.activePlayer)) state.activePlayer=state.playerCandidates[0]?.node || null;
}

function renderAll(){ renderOverview(); renderWorldForm(); renderPlayerPicker(); renderInventory(); renderTree(); renderDbInspector(); renderRawPlayer(); updateActions(); }
function updateActions(){
  const enabled=!!state.doc; ['exportWorld','exportLevel','undoBtn'].forEach(id=>$('#'+id).disabled=!enabled); $('#undoBtn').disabled=!state.undo.length; $('#redoBtn').disabled=!state.redo.length;
}

function renderOverview(){
  const r=root(); const name=scalar(r,'LevelName','Unnamed World'); const seed=scalar(r,'RandomSeed','?');
  $('#worldTitle').textContent=String(name); $('#ovName').textContent=String(name); $('#ovSeed').textContent=String(seed);
  const gt=Number(scalar(r,'GameType',0)); $('#ovMode').textContent=['Survival','Creative','Adventure','Spectator'][gt]||`Type ${gt}`;
  $('#ovSpawn').textContent=`${scalar(r,'SpawnX','?')}, ${scalar(r,'SpawnY','?')}, ${scalar(r,'SpawnZ','?')}`;
  $('#ovFiles').textContent=state.files?Object.keys(state.files).length:'1';
  $('#ovPlayers').textContent=state.dbPlayer?'~local_player · secondary LevelDB':state.playerCandidates.length?`${state.playerCandidates.length} level.dat/raw player record(s)`:(state.dbStatus==='scanning'?'Scanning secondary LevelDB…':'No editable player found');
  $('#levelHeaderInfo').textContent=`PRIMARY: ${state.levelPath||'level.dat'} • v${state.doc.version} • ${fmtBytes(state.doc.declaredLength)} NBT`;
}

function renderWorldForm(){
  const r=root();
  const fields={ worldName:'LevelName',seed:'RandomSeed',gameMode:'GameType',difficulty:'Difficulty',spawnX:'SpawnX',spawnY:'SpawnY',spawnZ:'SpawnZ',worldTime:'Time' };
  for(const [id,key] of Object.entries(fields)){ const el=$('#'+id); if(el)el.value=String(scalar(r,key,'')); }
  $('#commandsEnabled').checked=!!Number(scalar(r,'commandsEnabled',0));
  $('#creativeLoaded').checked=!!Number(scalar(r,'hasBeenLoadedInCreative',0));
  const rules=['doDaylightCycle','doEntityDrops','doFireTick','doImmediateRespawn','doInsomnia','doMobLoot','doMobSpawning','doTileDrops','doWeatherCycle','keepInventory','mobGriefing','naturalRegeneration','pvp','showCoordinates','showDeathMessages','tntExplodes'];
  const wrap=$('#gamerules'); wrap.innerHTML='';
  for(const key of rules){ const n=getChild(r,key); if(!n)continue; const lab=document.createElement('label'); lab.className='switchrow'; lab.innerHTML=`<span>${key}</span><input type="checkbox" data-rule="${key}" ${Number(n.value)?'checked':''}><i></i>`; wrap.append(lab); }
  if(!wrap.children.length)wrap.innerHTML='<div class="muted">No common GameRule tags were found in this level.dat.</div>';
}

function applyWorldForm(){
  if(!state.doc)return; checkpoint(); const r=root();
  try{
    setScalar(r,'LevelName',$('#worldName').value,TAG.STRING);
    if(getEntry(r,'RandomSeed'))setScalar(r,'RandomSeed',$('#seed').value,TAG.LONG);
    setScalar(r,'GameType',$('#gameMode').value,TAG.INT); setScalar(r,'Difficulty',$('#difficulty').value,TAG.INT);
    for(const [id,key] of [['spawnX','SpawnX'],['spawnY','SpawnY'],['spawnZ','SpawnZ']])setScalar(r,key,$('#'+id).value,TAG.INT);
    if(getEntry(r,'Time'))setScalar(r,'Time',$('#worldTime').value,TAG.LONG);
    setScalar(r,'commandsEnabled',$('#commandsEnabled').checked?1:0,TAG.BYTE);
    if(getEntry(r,'hasBeenLoadedInCreative'))setScalar(r,'hasBeenLoadedInCreative',$('#creativeLoaded').checked?1:0,TAG.BYTE);
    $$('[data-rule]').forEach(el=>setScalar(r,el.dataset.rule,el.checked?1:0,TAG.BYTE));
    setDirty(); detectPlayers(); renderAll(); notify('level.dat changes applied in memory.');
  }catch(e){notify(e.message,'err');}
}

function renderPlayerPicker(){
  const s=$('#playerPicker'); s.innerHTML=''; s.disabled=false;
  state.playerCandidates.forEach((p,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=p.path; s.append(o); });
  if(state.playerCandidates.length){ const i=Math.max(0,state.playerCandidates.findIndex(p=>p.node===state.activePlayer)); s.value=String(i); $('#playerNoData').hidden=true; $('#inventoryContent').hidden=false; }
  else { const o=document.createElement('option'); o.textContent=state.dbStatus==='scanning'?'Scanning LevelDB…':'No editable player record'; s.append(o); s.disabled=true; $('#playerNoData').hidden=false; $('#inventoryContent').hidden=true; const msg=$('#playerNoDataText'); if(msg)msg.textContent=state.dbStatus==='scanning'?'The editor is scanning the world database for ~local_player.':state.dbError||'No editable local-player record was recovered automatically. You can load a raw player NBT record below, or use the world/NBT tools.'; }
}

function itemInfo(comp){
  if(!comp||comp.type!==TAG.COMPOUND)return {name:'?',count:0,slot:-1,damage:0};
  const name=String(scalar(comp,'Name',scalar(comp,'name','minecraft:unknown')));
  const count=Number(scalar(comp,'Count',scalar(comp,'count',1)));
  const slot=Number(scalar(comp,'Slot',scalar(comp,'slot',-1)));
  const damage=Number(scalar(comp,'Damage',scalar(comp,'damage',0)));
  return {name,count,slot,damage};
}
function inventoryList(player){ const n=getChild(player,'Inventory'); return n?.type===TAG.LIST?n:null; }
function findItemBySlot(list,slot){ return list?.value.find(x=>itemInfo(x).slot===slot)||null; }

function renderInventory(){
  if(!state.activePlayer)return;
  const inv=inventoryList(state.activePlayer); const grid=$('#inventoryGrid'); grid.innerHTML='';
  for(let slot=0;slot<36;slot++){
    const item=findItemBySlot(inv,slot); const inf=itemInfo(item); const b=document.createElement('button'); b.className='slot'; b.dataset.slot=slot;
    if(item){ const short=inf.name.replace(/^minecraft:/,''); b.innerHTML=`<span class="slot-num">${slot}</span><span class="item-glyph">${glyphFor(short)}</span><span class="item-name">${escapeHtml(short)}</span><strong>${inf.count}</strong>`; b.title=`${inf.name} ×${inf.count} • damage ${inf.damage}`; }
    else b.innerHTML=`<span class="slot-num">${slot}</span><span class="empty-dot">+</span>`;
    b.onclick=()=>openItemEditor(slot,item,'Inventory'); grid.append(b);
  }
  renderSpecialList('armorGrid','Armor',['Boots','Leggings','Chestplate','Helmet']);
  renderSpecialList('offhandGrid','Offhand',['Offhand']);
  const xp=scalar(state.activePlayer,'PlayerLevel',scalar(state.activePlayer,'XpLevel','?')); const health=scalar(state.activePlayer,'Health','?');
  $('#playerLevel').textContent=String(xp); $('#playerHealth').textContent=String(health); $('#editPlayerLevel').value=xp==='?'?'':String(xp); $('#editPlayerHealth').value=health==='?'?'':String(health); const meta=state.playerCandidates.find(p=>p.node===state.activePlayer); $('#playerSource').textContent=meta?.db?'LevelDB ~local_player':meta?.raw?'Raw NBT':meta?.path||'level.dat';
}

function renderSpecialList(id,key,labels){
  const wrap=$('#'+id); wrap.innerHTML=''; const list=getChild(state.activePlayer,key);
  labels.forEach((label,i)=>{ const item=list?.type===TAG.LIST ? (list.value.find(x=>itemInfo(x).slot===i) || list.value[i]) : null; const inf=itemInfo(item); const b=document.createElement('button'); b.className='slot special';
    b.innerHTML=item?`<span class="slot-num">${label}</span><span class="item-glyph">${glyphFor(inf.name)}</span><span class="item-name">${escapeHtml(inf.name.replace(/^minecraft:/,''))}</span><strong>${inf.count}</strong>`:`<span class="slot-num">${label}</span><span class="empty-dot">+</span>`;
    b.onclick=()=>openItemEditor(i,item,key,label); wrap.append(b); });
}
function glyphFor(name){ const n=name.toLowerCase(); if(n.includes('sword'))return '⚔'; if(n.includes('pickaxe'))return '⛏'; if(n.includes('helmet'))return '◒'; if(n.includes('chestplate'))return '◇'; if(n.includes('boots'))return '⌁'; if(n.includes('apple'))return '●'; if(n.includes('pearl')||n.includes('eye'))return '◉'; if(n.includes('bow'))return '⌁'; if(n.includes('tnt'))return '▣'; if(n.includes('block')||n.includes('stone')||n.includes('planks'))return '⬛'; return '◆'; }
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function ensureList(player,key){
  let n=getChild(player,key); if(!n){ n=makeNode(TAG.LIST,{elemType:TAG.COMPOUND,items:[]}); setChild(player,key,n); } return n;
}
function newItemCompound(slot,name,count,damage){
  return makeNode(TAG.COMPOUND,[
    {name:'Count',node:makeNode(TAG.BYTE,count)},
    {name:'Damage',node:makeNode(TAG.SHORT,damage)},
    {name:'Name',node:makeNode(TAG.STRING,name)},
    {name:'Slot',node:makeNode(TAG.BYTE,slot)},
    {name:'WasPickedUp',node:makeNode(TAG.BYTE,0)}
  ]);
}
function openItemEditor(slot,item,listKey,label=''){
  const dlg=$('#itemDialog'); const inf=itemInfo(item); dlg.dataset.slot=slot; dlg.dataset.list=listKey; dlg.dataset.exists=item?'1':'0';
  $('#itemSlotLabel').textContent=label||`Slot ${slot}`; $('#itemId').value=item?inf.name:'minecraft:stone'; $('#itemCount').value=item?inf.count:64; $('#itemDamage').value=item?inf.damage:0;
  $('#deleteItem').hidden=!item; $('#itemRaw').textContent=item?JSON.stringify(nbtToPlain(item),null,2):'New item'; dlg.showModal();
}
function saveItem(){
  const dlg=$('#itemDialog'); const slot=Number(dlg.dataset.slot); const key=dlg.dataset.list; const name=$('#itemId').value.trim(); const count=Math.max(0,Math.min(127,Number($('#itemCount').value)||0)); const damage=Number($('#itemDamage').value)||0;
  if(!name) return notify('Item ID cannot be empty.','err'); checkpoint();
  const list=ensureList(state.activePlayer,key); let item=null;
  if(key==='Inventory')item=findItemBySlot(list,slot); else item=list.value.find(x=>itemInfo(x).slot===slot)||list.value[slot]||null;
  if(!item){ item=newItemCompound(slot,name,count,damage); list.value.push(item); }
  else { setScalar(item,'Name',name,TAG.STRING); setScalar(item,'Count',count,TAG.BYTE); setScalar(item,'Damage',damage,TAG.SHORT); if(getEntry(item,'Slot')||key==='Inventory')setScalar(item,'Slot',slot,TAG.BYTE); }
  markActivePlayerDirty(); dlg.close(); renderAll(); notify(`Saved ${name} in ${key}.`);
}
function deleteItem(){
  const dlg=$('#itemDialog'); const slot=Number(dlg.dataset.slot); const key=dlg.dataset.list; const list=getChild(state.activePlayer,key); if(!list)return; checkpoint();
  let i=key==='Inventory'?list.value.findIndex(x=>itemInfo(x).slot===slot):list.value.findIndex((x,idx)=>itemInfo(x).slot===slot||idx===slot);
  if(i>=0)list.value.splice(i,1); markActivePlayerDirty(); dlg.close(); renderAll(); notify('Item removed.');
}

function renderTree(){
  const wrap=$('#nbtTree'); wrap.innerHTML=''; if(!state.doc)return;
  const q=($('#nbtSearch')?.value||'').toLowerCase();
  wrap.append(renderNode(state.doc.rootName||'(root)',root(),'root',0,q));
}
function nodeMatches(name,n,q){ if(!q)return true; if(String(name).toLowerCase().includes(q))return true; if(n.type===TAG.COMPOUND)return n.value.some(e=>nodeMatches(e.name,e.node,q)); if(n.type===TAG.LIST)return n.value.some((x,i)=>nodeMatches(i,x,q)); return String(n.value).toLowerCase().includes(q); }
function renderNode(name,n,path,depth,q){
  if(!nodeMatches(name,n,q))return document.createDocumentFragment();
  const row=document.createElement(n.type===TAG.COMPOUND||n.type===TAG.LIST?'details':'div'); row.className='nbt-node'; if(depth<2||q)row.open=true;
  const head=document.createElement(n.type===TAG.COMPOUND||n.type===TAG.LIST?'summary':'div'); head.className='nbt-head';
  const valueLabel = n.type===TAG.COMPOUND?`${n.value.length} tags`:n.type===TAG.LIST?`${n.value.length} items · ${TAG_NAMES[n.elemType]}`:formatNbtValue(n);
  head.innerHTML=`<span class="tag-type t${n.type}">${TAG_NAMES[n.type]}</span><b>${escapeHtml(name)}</b><span class="nbt-value">${escapeHtml(valueLabel)}</span>`; row.append(head);
  if(isScalarType(n.type)){
    head.title='Click to edit value'; head.onclick=()=>editNbtScalar(n,name,path); return row;
  }
  const children=document.createElement('div'); children.className='nbt-children';
  if(n.type===TAG.COMPOUND)n.value.forEach(e=>children.append(renderNode(e.name,e.node,`${path}.${e.name}`,depth+1,q)));
  else if(n.type===TAG.LIST)n.value.forEach((x,i)=>children.append(renderNode(`[${i}]`,x,`${path}[${i}]`,depth+1,q)));
  row.append(children); return row;
}
function isScalarType(t){return [TAG.BYTE,TAG.SHORT,TAG.INT,TAG.LONG,TAG.FLOAT,TAG.DOUBLE,TAG.STRING].includes(t)}
function formatNbtValue(n){ if(n.type===TAG.STRING)return `“${n.value}”`; if(n.type===TAG.LONG)return n.value.toString(); if(n.type===TAG.BYTE_ARRAY||n.type===TAG.INT_ARRAY||n.type===TAG.LONG_ARRAY)return `${n.value.length} values`; return String(n.value); }
function editNbtScalar(n,name,path){
  const old=n.type===TAG.LONG?n.value.toString():String(n.value); const value=prompt(`Edit ${path}\nType: ${TAG_NAMES[n.type]}`,old); if(value===null)return; checkpoint();
  try{ if(n.type===TAG.STRING)n.value=value; else if(n.type===TAG.LONG)n.value=BigInt(value); else if([TAG.FLOAT,TAG.DOUBLE].includes(n.type))n.value=Number(value); else n.value=parseInt(value,10); setDirty(); detectPlayers(); renderAll(); }
  catch(e){notify(`Invalid ${TAG_NAMES[n.type]} value.`,'err');}
}

function renderDbInspector(){
  const wrap=$('#dbFiles'); wrap.innerHTML=''; if(!state.files)return;
  const paths=Object.keys(state.files).filter(p=>/(^|\/)db\//.test(p)).sort(); $('#dbCount').textContent=String(paths.length);
  const info=state.dbInfo;
  const statusText={idle:'Not scanned',none:'No database',scanning:'Scanning…',ready:'Database opened', 'player-found':'~local_player editable', 'player-unparsed':'Player record found',error:'Scan failed'}[state.dbStatus]||state.dbStatus;
  $('#dbStatus').textContent=statusText;
  $('#dbLocalStatus').textContent=state.dbPlayer?`${state.dbPlayer.source} · seq ${String(state.dbPlayer.sequence??'—')}`:(state.dbStatus==='scanning'?'Scanning…':'Not loaded');
  $('#dbManifest').textContent=info?.manifestPath?basename(info.manifestPath):(info?.manifestWarning||'—');
  $('#dbPending').textContent=state.dbPlayerDirty?'1 local-player edit':'0';
  const warnings=[state.dbError,info?.manifestWarning,...(info?.tableWarnings||[])].filter(Boolean);
  $('#dbHints').textContent=warnings.length?warnings.join(' • '):(paths.length?'Exact-key reader ready. Edited local-player data is exported as a new LevelDB recovery log; original SST tables are left untouched.':'No db/ directory is present in this input.');
  for(const p of paths){ const bytes=state.files[p]; const row=document.createElement('div'); row.className='db-row'; row.innerHTML=`<span>${escapeHtml(p)}</span><b>${fmtBytes(bytes.length)}</b>`; wrap.append(row); }
}

async function loadRawPlayer(file){
  try{ const bytes=new Uint8Array(await file.arrayBuffer()); const parsed=parsePlayerBytes(bytes); state.rawPlayer=parsed; state.rawPlayerName=file.name; detectPlayers(); renderAll(); notify('Raw player NBT loaded.'); }
  catch(e){notify(`Could not parse raw NBT: ${e.message}`,'err');}
}
function renderRawPlayer(){
  const area=$('#rawPlayerPanel'); if(!state.rawPlayer){area.hidden=true; return;} area.hidden=false; $('#rawPlayerName').textContent=state.rawPlayerName; $('#rawPlayerJson').textContent=JSON.stringify(nbtToPlain(state.rawPlayer.root),null,2);
}

function exportLevel(){
  if(!state.doc)return; try{ const bytes=buildLevelDat(state.doc); download(bytes,'level.dat'); notify('level.dat exported.'); }catch(e){notify(e.message,'err');}
}
async function exportWorld(){
  if(!state.doc)return; if(!state.files||state.sourceKind==='leveldat'){return exportLevel();}
  try{
    const map={...state.files}; map[state.levelPath]=buildLevelDat(state.doc); let overlayName='';
    if(state.dbPlayerDirty&&state.dbAdapter&&state.dbPlayer){
      const bytes=playerDocBytes(state.dbPlayer.doc); await state.dbAdapter.put(state.dbPlayer.key,bytes); const overlay=await state.dbAdapter.exportFiles(); Object.assign(map,overlay); overlayName=Object.keys(overlay)[0]||'';
    }
    const zipped=await zip(map,{compress:true}); const worldName=sanitizeWorldName(String(scalar(root(),'LevelName','Edited-World'))); download(zipped,`${worldName}-edited.mcworld`,'application/zip'); notify(overlayName?`Edited .mcworld exported with LevelDB overlay ${basename(overlayName)}.`:'Edited .mcworld exported.');
  }catch(e){console.error(e);notify(`Export failed: ${e.message}`,'err');}
}
function exportRawPlayer(){ if(!state.rawPlayer)return; try{download(buildNBT(state.rawPlayer,{rootNamed:state.rawPlayer._rootNamed!==false}),`edited-${state.rawPlayerName||'player.nbt'}`)}catch(e){notify(e.message,'err')} }

function doUndo(){ if(!state.undo.length||!state.doc)return; const current=captureSnapshot(); if(current)state.redo.push(current); restoreSnapshot(state.undo.pop()); notify('Undid last change.'); }
function doRedo(){ if(!state.redo.length||!state.doc)return; const current=captureSnapshot(); if(current)state.undo.push(current); restoreSnapshot(state.redo.pop()); notify('Redid change.'); }
function applyPlayerStats(){
  if(!state.activePlayer)return; checkpoint();
  const lvl=$('#editPlayerLevel').value, hp=$('#editPlayerHealth').value;
  if(lvl!=='')setScalar(state.activePlayer,'PlayerLevel',lvl,TAG.INT); if(hp!=='')setScalar(state.activePlayer,'Health',hp,TAG.FLOAT);
  markActivePlayerDirty(); renderAll(); notify('Player stats updated.');
}
function clearInventory(){ const inv=inventoryList(state.activePlayer); if(!inv)return notify('No main Inventory list exists.','err'); if(!confirm('Clear all 36 main inventory slots?'))return; checkpoint(); inv.value=[]; markActivePlayerDirty(); renderAll(); notify('Main inventory cleared.'); }
function bindRawAsLocalPlayer(){
  if(!state.rawPlayer)return; if(!state.dbAdapter)return notify('Load a world with a db/ directory first.','err'); checkpoint();
  const doc={rootName:state.rawPlayer.rootName,root:cloneNode(state.rawPlayer.root),_rootNamed:state.rawPlayer._rootNamed!==false};
  state.dbPlayer={key:'~local_player',doc,sequence:null,source:'raw NBT binding'}; state.dbPlayerDirty=true; state.dbStatus='player-found'; detectPlayers(); state.activePlayer=state.dbPlayer.doc.root; setDirty(); renderAll(); notify('Raw NBT bound to ~local_player for the next .mcworld export.');
}
function exportSelectedPlayer(){
  const meta=state.playerCandidates.find(p=>p.node===state.activePlayer); if(!meta)return;
  try{ let doc, name='selected-player.nbt'; if(meta.db){doc=state.dbPlayer.doc;name='local-player.nbt';} else if(meta.raw){doc=state.rawPlayer;name=state.rawPlayerName||name;} else doc={rootName:'',root:state.activePlayer,_rootNamed:false}; download(playerDocBytes(doc),`edited-${name}`); notify('Selected player NBT exported.'); }catch(e){notify(e.message,'err');}
}

function setup(){
  $('#fileInput').onchange=e=>loadInputFiles(e.target.files); $('#folderInput').onchange=e=>loadInputFiles(e.target.files);
  const drop=$('#dropzone'); ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')})); ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')})); drop.ondrop=e=>loadInputFiles(e.dataTransfer.files);
  $$('.tab').forEach(b=>b.onclick=()=>activateTab(b.dataset.tab));
  $('#applyWorld').onclick=applyWorldForm; $('#exportWorld').onclick=exportWorld; $('#exportLevel').onclick=exportLevel; $('#undoBtn').onclick=doUndo; $('#redoBtn').onclick=doRedo;
  $('#playerPicker').onchange=e=>{state.activePlayer=state.playerCandidates[Number(e.target.value)]?.node||null;renderInventory()};
  $('#itemSave').onclick=saveItem; $('#deleteItem').onclick=deleteItem; $('#itemCancel').onclick=()=>$('#itemDialog').close(); $('#nbtSearch').oninput=renderTree;
  $('#rawPlayerInput').onchange=e=>e.target.files[0]&&loadRawPlayer(e.target.files[0]); $('#exportRawPlayer').onclick=exportRawPlayer; $('#bindRawPlayer').onclick=bindRawAsLocalPlayer; $('#applyPlayerStats').onclick=applyPlayerStats; $('#clearInventory').onclick=clearInventory; $('#exportSelectedPlayer').onclick=exportSelectedPlayer; $('#retryDb').onclick=()=>initializeDatabase(state.loadToken);
  $('#itemId').setAttribute('list','itemIds'); const dl=$('#itemIds'); commonItems.forEach(x=>{const o=document.createElement('option');o.value=x;dl.append(o)});
  window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
  if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  updateActions();
}
setup();
