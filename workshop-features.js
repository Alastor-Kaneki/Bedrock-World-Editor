const $=(selector,parent=document)=>parent.querySelector(selector);
const $$=(selector,parent=document)=>[...parent.querySelectorAll(selector)];
const PREF_KEY='bedrock-workshop-ui-preferences-v1';

function waitForReady(){
  if(document.documentElement.dataset.appState==='ready')return Promise.resolve();
  return new Promise(resolve=>{
    const observer=new MutationObserver(()=>{
      if(document.documentElement.dataset.appState!=='ready')return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-app-state']});
  });
}

await waitForReady();

function isVisible(node){
  if(!node||node.hidden)return false;
  const style=getComputedStyle(node);
  return style.display!=='none'&&style.visibility!=='hidden';
}

function safeText(node){return (node?.textContent||'').trim();}
function clickIfReady(selector){
  const node=$(selector);
  if(!node||node.disabled)return false;
  node.click();
  return true;
}

function toast(message,kind='ok'){
  const node=$('#toast');
  if(!node)return;
  node.textContent=message;
  node.dataset.kind=kind;
  node.setAttribute('role',kind==='err'?'alert':'status');
  node.classList.add('show');
  setTimeout(()=>node.classList.remove('show'),4200);
}

function readPreferences(){
  try{return {...{compact:false,lowGlow:false,stickyTabs:true,largeTargets:false},...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')};}
  catch(_){return {compact:false,lowGlow:false,stickyTabs:true,largeTargets:false};}
}

let preferences=readPreferences();
function applyPreferences(){
  document.body.classList.toggle('pref-compact',!!preferences.compact);
  document.body.classList.toggle('pref-low-glow',!!preferences.lowGlow);
  document.body.classList.toggle('pref-no-sticky-tabs',!preferences.stickyTabs);
  document.body.classList.toggle('pref-large-targets',!!preferences.largeTargets);
}
function savePreferences(){
  localStorage.setItem(PREF_KEY,JSON.stringify(preferences));
  applyPreferences();
}
applyPreferences();

let preferencesDialog=null;
function buildPreferencesDialog(){
  const dialog=document.createElement('dialog');
  dialog.className='feature-dialog preference-dialog';
  dialog.setAttribute('aria-labelledby','preferenceTitle');
  dialog.innerHTML=`
    <div class="feature-dialog-head">
      <div><p class="eyebrow">INTERFACE</p><h2 id="preferenceTitle">Workshop preferences</h2></div>
      <button class="ghost iconbtn feature-close" type="button" aria-label="Close preferences">×</button>
    </div>
    <div class="preference-list">
      <label><span><b>Compact workspace</b><small>Fit more inventory, NBT and container data on screen.</small></span><input type="checkbox" data-pref="compact"></label>
      <label><span><b>Reduce glow</b><small>Keep the red/purple theme with flatter effects.</small></span><input type="checkbox" data-pref="lowGlow"></label>
      <label><span><b>Sticky editor tabs</b><small>Keep world sections reachable while scrolling.</small></span><input type="checkbox" data-pref="stickyTabs"></label>
      <label><span><b>Larger controls</b><small>Increase click/touch targets for buttons and tabs.</small></span><input type="checkbox" data-pref="largeTargets"></label>
    </div>
    <div class="feature-dialog-actions">
      <button type="button" class="ghost" data-reset>Reset preferences</button>
      <button type="button" class="primary" data-done>Done</button>
    </div>`;
  const sync=()=>{
    $$('[data-pref]',dialog).forEach(input=>{input.checked=!!preferences[input.dataset.pref];});
  };
  dialog.addEventListener('change',event=>{
    const input=event.target.closest?.('[data-pref]');
    if(!input)return;
    preferences[input.dataset.pref]=input.checked;
    savePreferences();
  });
  $('[data-reset]',dialog).addEventListener('click',()=>{
    preferences={compact:false,lowGlow:false,stickyTabs:true,largeTargets:false};
    savePreferences();sync();toast('Interface preferences reset.');
  });
  $('[data-done]',dialog).addEventListener('click',()=>dialog.close());
  $('.feature-close',dialog).addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('toggle',sync);
  document.body.append(dialog);
  sync();
  return dialog;
}
function openPreferences(){
  preferencesDialog??=buildPreferencesDialog();
  if(!preferencesDialog.open)preferencesDialog.showModal();
}

function worldSummary(){
  const dirty=safeText($('#dirtyBadge'))||'Unknown';
  const name=safeText($('#worldTitle'))||'Unnamed world';
  const containerStatus=safeText($('#containerStatus'))||'Unavailable';
  const tileStatus=safeText($('#tileToolsStatus'))||'Unavailable';
  const dbStatus=safeText($('#dbStatus'))||'Unavailable';
  const nonEmptySlots=$$('.slot').filter(slot=>safeText($('.item-name',slot))).length;
  return [
    `Bedrock Workshop v0.6.1`,
    `World: ${name}`,
    `State: ${dirty}`,
    `Containers: ${containerStatus}`,
    `Tile tools: ${tileStatus}`,
    `Database: ${dbStatus}`,
    `Rendered non-empty slots: ${nonEmptySlots}`,
    `Online: ${navigator.onLine?'yes':'no'} (processing remains local)`,
  ].join('\n');
}

async function copyWorldSummary(){
  const summary=worldSummary();
  try{
    await navigator.clipboard.writeText(summary);
    toast('World summary copied.');
  }catch(_){
    const area=document.createElement('textarea');
    area.value=summary;area.style.position='fixed';area.style.opacity='0';
    document.body.append(area);area.select();
    const copied=document.execCommand?.('copy');area.remove();
    toast(copied?'World summary copied.':'Could not access the clipboard.',copied?'ok':'err');
  }
}

let palette=null;
let paletteInput=null;
let paletteList=null;
let activePaletteIndex=0;
let currentCommands=[];

function focusVisibleSearch(){
  const input=$$('.search,input[type="search"]').find(isVisible);
  if(!input){toast('No search field is visible in this section.','err');return;}
  input.focus();input.select?.();
}

function tabCommands(){
  return $$('.tab[data-tab]').map(tab=>({
    label:`Go to ${safeText(tab)||tab.dataset.tab}`,
    hint:'Editor section',
    keywords:`tab section ${tab.dataset.tab}`,
    run:()=>tab.click(),
  }));
}

function commands(){
  const hasWorld=document.body.classList.contains('has-world');
  const items=[
    {label:'Open world archive',hint:'MCWORLD / ZIP / level.dat',keywords:'open import file archive mcworld zip level',run:()=>$('#fileInput')?.click()},
    {label:'Open world folder',hint:'Directory picker',keywords:'open import folder directory',run:()=>$('#folderInput')?.click()},
    {label:'Interface preferences',hint:'Layout and effects',keywords:'settings options compact glow tabs accessibility',run:openPreferences},
    {label:'Copy world summary',hint:'Diagnostics to clipboard',keywords:'copy diagnostics status debug world summary',when:hasWorld,run:copyWorldSummary},
    {label:'Focus section search',hint:'Shortcut /',keywords:'find filter search',when:hasWorld,run:focusVisibleSearch},
    {label:'Save all changes',hint:'Ctrl/Cmd + S',keywords:'save commit edits',when:hasWorld,run:()=>clickIfReady('#saveAllBtn')},
    {label:'Export verified world',hint:'Download MCWORLD',keywords:'export download mcworld save',when:hasWorld,run:()=>clickIfReady('#exportWorld')},
    {label:'Export level.dat',hint:'Download metadata',keywords:'export download level dat metadata',when:hasWorld,run:()=>clickIfReady('#exportLevel')},
    {label:'Undo',hint:'Undo latest edit',keywords:'undo back history',when:hasWorld,run:()=>clickIfReady('#undoBtn')},
    {label:'Redo',hint:'Redo latest edit',keywords:'redo forward history',when:hasWorld,run:()=>clickIfReady('#redoBtn')},
    ...tabCommands().map(command=>({...command,when:hasWorld})),
  ];
  return items.filter(item=>item.when!==false);
}

function renderPalette(){
  if(!paletteInput||!paletteList)return;
  const query=paletteInput.value.trim().toLowerCase();
  currentCommands=commands().filter(command=>{
    if(!query)return true;
    return `${command.label} ${command.hint||''} ${command.keywords||''}`.toLowerCase().includes(query);
  });
  if(activePaletteIndex>=currentCommands.length)activePaletteIndex=0;
  paletteList.replaceChildren();
  if(!currentCommands.length){
    const empty=document.createElement('p');empty.className='palette-empty';empty.textContent='No matching workshop action.';paletteList.append(empty);return;
  }
  currentCommands.forEach((command,index)=>{
    const button=document.createElement('button');button.type='button';button.className='palette-command';
    button.dataset.active=String(index===activePaletteIndex);
    button.innerHTML=`<span><b></b><small></small></span><kbd>↵</kbd>`;
    $('b',button).textContent=command.label;
    $('small',button).textContent=command.hint||'';
    button.addEventListener('mouseenter',()=>{activePaletteIndex=index;renderPalette();});
    button.addEventListener('click',()=>runPaletteCommand(index));
    paletteList.append(button);
  });
  paletteList.children[activePaletteIndex]?.scrollIntoView({block:'nearest'});
}

function runPaletteCommand(index=activePaletteIndex){
  const command=currentCommands[index];
  if(!command)return;
  palette?.close();
  requestAnimationFrame(()=>command.run());
}

function buildPalette(){
  const dialog=document.createElement('dialog');dialog.id='workshopCommandPalette';dialog.className='command-palette';
  dialog.setAttribute('aria-labelledby','paletteTitle');
  dialog.innerHTML=`
    <div class="palette-search-wrap">
      <span aria-hidden="true">⌘</span>
      <input id="paletteSearch" type="search" autocomplete="off" spellcheck="false" placeholder="Search workshop actions…" aria-label="Search workshop actions">
      <kbd>ESC</kbd>
    </div>
    <p id="paletteTitle" class="palette-kicker">COMMAND PALETTE</p>
    <div class="palette-list" role="listbox"></div>
    <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> run</span><span><kbd>Ctrl</kbd><kbd>K</kbd> toggle</span></div>`;
  paletteInput=$('#paletteSearch',dialog);paletteList=$('.palette-list',dialog);
  paletteInput.addEventListener('input',()=>{activePaletteIndex=0;renderPalette();});
  paletteInput.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'){event.preventDefault();activePaletteIndex=(activePaletteIndex+1)%Math.max(1,currentCommands.length);renderPalette();}
    else if(event.key==='ArrowUp'){event.preventDefault();activePaletteIndex=(activePaletteIndex-1+Math.max(1,currentCommands.length))%Math.max(1,currentCommands.length);renderPalette();}
    else if(event.key==='Enter'){event.preventDefault();runPaletteCommand();}
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{paletteInput.value='';activePaletteIndex=0;});
  document.body.append(dialog);return dialog;
}
function openPalette(){
  palette??=buildPalette();
  if(palette.open){palette.close();return;}
  renderPalette();palette.showModal();requestAnimationFrame(()=>paletteInput.focus());
}

const header=$('.topbar');
if(header){
  let utilities=$('.utility-actions',header);
  if(!utilities){utilities=document.createElement('div');utilities.className='utility-actions';header.append(utilities);}
  const commandButton=document.createElement('button');
  commandButton.type='button';commandButton.className='ghost utility-button command-trigger';commandButton.innerHTML='<span>Commands</span><kbd>⌘K</kbd>';
  commandButton.setAttribute('aria-label','Open command palette');commandButton.addEventListener('click',openPalette);
  const preferenceButton=document.createElement('button');
  preferenceButton.type='button';preferenceButton.className='ghost utility-button preference-trigger';preferenceButton.textContent='⚙';
  preferenceButton.setAttribute('aria-label','Open interface preferences');preferenceButton.addEventListener('click',openPreferences);
  utilities.prepend(commandButton,preferenceButton);
}

let hud=null;
function buildHud(){
  const node=document.createElement('section');node.className='workspace-hud';node.hidden=true;node.setAttribute('aria-label','Workspace quick status');
  node.innerHTML=`
    <div class="hud-stats">
      <span data-hud="world"><small>WORLD</small><b>—</b></span>
      <span data-hud="state"><small>STATE</small><b>—</b></span>
      <span data-hud="containers"><small>CONTAINERS</small><b>0</b></span>
      <span data-hud="tiles"><small>TILE TOOLS</small><b>0</b></span>
    </div>
    <div class="hud-actions">
      <button type="button" class="ghost" data-action="commands">Commands <kbd>⌘K</kbd></button>
      <button type="button" class="ghost" data-action="summary">Copy summary</button>
      <button type="button" class="ghost" data-action="preferences">Preferences</button>
    </div>`;
  $('[data-action="commands"]',node).addEventListener('click',openPalette);
  $('[data-action="summary"]',node).addEventListener('click',copyWorldSummary);
  $('[data-action="preferences"]',node).addEventListener('click',openPreferences);
  const editor=$('#editor');
  const anchor=$('.worldbar')||editor?.firstElementChild;
  if(anchor?.parentNode)anchor.insertAdjacentElement('afterend',node);else editor?.prepend(node);
  return node;
}

function numericStatus(text){
  const match=String(text||'').match(/\b(\d+)\b/);return match?match[1]:'0';
}
let hudFrame=0;
function syncHud(){
  if(hudFrame)return;
  hudFrame=requestAnimationFrame(()=>{
    hudFrame=0;hud??=buildHud();
    const hasWorld=document.body.classList.contains('has-world')&&!$('#editor')?.hidden;
    hud.hidden=!hasWorld;if(!hasWorld)return;
    $('[data-hud="world"] b',hud).textContent=safeText($('#worldTitle'))||'Loaded';
    const dirty=safeText($('#dirtyBadge'))||'Ready';
    $('[data-hud="state"] b',hud).textContent=dirty;
    $('[data-hud="state"]',hud).dataset.dirty=String(!/saved|clean|ready|0 changes?/i.test(dirty));
    $('[data-hud="containers"] b',hud).textContent=numericStatus(safeText($('#containerStatus')))||String($$('.container-card').length);
    $('[data-hud="tiles"] b',hud).textContent=String($$('.tile-tool-card').length)||numericStatus(safeText($('#tileToolsStatus')));
  });
}

for(const selector of ['#editor','#dirtyBadge','#containerStatus','#tileToolsStatus','#containerList','#tileToolsList','#worldTitle']){
  const node=$(selector);if(!node)continue;
  new MutationObserver(syncHud).observe(node,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class','data-kind']});
}
syncHud();

function typingTarget(target){return target?.matches?.('input,textarea,select,[contenteditable="true"]');}
document.addEventListener('keydown',event=>{
  const mod=event.ctrlKey||event.metaKey;
  if(mod&&event.key.toLowerCase()==='k'){
    event.preventDefault();openPalette();return;
  }
  if(mod&&event.shiftKey&&event.key.toLowerCase()==='p'){
    event.preventDefault();openPalette();return;
  }
  if(!typingTarget(event.target)&&event.key===','){
    event.preventDefault();openPreferences();
  }
},true);

window.__BEDROCK_WORKSHOP_FEATURES__='0.6.1-feature-pack-1';
