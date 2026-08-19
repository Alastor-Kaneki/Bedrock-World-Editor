const $=(selector,parent=document)=>parent.querySelector(selector);
const $$=(selector,parent=document)=>[...parent.querySelectorAll(selector)];

const APP_NAME='Bedrock Workshop';
const APP_VERSION='0.6.1';

function setText(selector,text,parent=document){
  const node=$(selector,parent);
  if(node)node.textContent=text;
}

function isVisible(node){
  return !!node&&!node.hidden&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden';
}

function isTypingTarget(target){
  return !!target?.matches?.('input,textarea,select,[contenteditable="true"]');
}

document.title=`${APP_NAME} | Private world editor`;
setText('.brand strong',APP_NAME);
setText('.brand small','private world editor');
setText('.hero .eyebrow',`BEDROCK WORKSHOP / LOCAL-FIRST / v${APP_VERSION} ALPHA`);

const heroHeading=$('.hero h1');
if(heroHeading){
  heroHeading.replaceChildren('Your Bedrock world.');
  const accent=document.createElement('span');
  accent.textContent='Your rules.';
  heroHeading.append(accent);
}
setText('.hero-copy>p','Tune world settings, inventories, containers and NBT without handing your save to a server. Open a copy, make your changes, then download a verified world.');

const heroCopy=$('.hero-copy');
if(heroCopy){
  const trust=document.createElement('div');
  trust.className='trust-row';
  for(const label of ['No uploads','Works offline','Original stays untouched']){
    const chip=document.createElement('span');
    chip.textContent=label;
    trust.append(chip);
  }
  heroCopy.append(trust);
}

const dropzone=$('.dropzone');
if(dropzone){
  dropzone.setAttribute('role','region');
  dropzone.setAttribute('aria-label','Open a Minecraft Bedrock world');
}
setText('.dropzone h2','Bring in a world copy');
setText('.dropzone>p','.mcworld / ZIP / level.dat / world folder');
setText('.dropzone>small','Everything is decoded and rebuilt on this device. Your world never leaves this browser.');
const dropIcon=$('.drop-icon');
if(dropIcon){
  dropIcon.textContent='◆';
  dropIcon.setAttribute('aria-hidden','true');
}
const dropButtons=$('.drop-buttons');
if(dropButtons){
  const formats=document.createElement('div');
  formats.className='format-row';
  for(const label of ['MCWORLD','ZIP','LEVEL.DAT','FOLDER']){
    const item=document.createElement('span');
    item.textContent=label;
    formats.append(item);
  }
  dropButtons.insertAdjacentElement('afterend',formats);
}

const workflow=[
  ['Open a copy','Load an archive, folder, or standalone level.dat'],
  ['Tune locally','Edit world data without a server or account'],
  ['Verify and export','Download a checked copy and keep your original'],
];
$$('.feature-row>div').forEach((card,index)=>{
  const [heading,detail]=workflow[index]||[];
  const title=$('b',card);
  const body=$('span',card);
  if(title&&heading)title.textContent=heading;
  if(body&&detail)body.textContent=detail;
});

let installPrompt=null;
let helpDialog=null;
let localPill=null;
let installButton=null;

function buildHelpDialog(){
  const dialog=document.createElement('dialog');
  dialog.id='workshopHelpDialog';
  dialog.className='workshop-help';
  dialog.setAttribute('aria-labelledby','workshopHelpTitle');
  dialog.innerHTML=`
    <div class="help-head">
      <div>
        <p class="eyebrow">WORKSHOP CONTROLS</p>
        <h2 id="workshopHelpTitle">Shortcuts & safety</h2>
      </div>
      <button type="button" class="iconbtn help-close" aria-label="Close shortcuts">×</button>
    </div>
    <div class="help-grid">
      <section>
        <h3>Keyboard</h3>
        <div class="shortcut-row"><kbd>Ctrl</kbd><span>+</span><kbd>S</kbd><p>Save all world edits</p></div>
        <div class="shortcut-row"><kbd>/</kbd><p>Focus the visible editor search</p></div>
        <div class="shortcut-row"><kbd>?</kbd><p>Open this help panel</p></div>
        <div class="shortcut-row"><kbd>←</kbd><kbd>→</kbd><p>Move between editor tabs</p></div>
      </section>
      <section>
        <h3>Safety model</h3>
        <p>Your files are processed in this browser. The original archive or folder is not overwritten. Export creates a separate copy.</p>
        <p>The workshop warns before leaving when it detects unsaved edits or tile-card drafts.</p>
      </section>
    </div>
  `;
  $('.help-close',dialog)?.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if(event.target===dialog)dialog.close();
  });
  document.body.append(dialog);
  return dialog;
}

function syncConnectionState(){
  if(!localPill)return;
  localPill.dataset.online=String(navigator.onLine);
  const label=$('span',localPill);
  if(label)label.textContent=navigator.onLine?'PROCESSING ON DEVICE':'OFFLINE • ON DEVICE';
}

const header=$('.topbar');
if(header){
  const actions=$('.top-actions',header);
  const utilities=document.createElement('div');
  utilities.className='utility-actions';

  localPill=document.createElement('span');
  localPill.className='local-pill';
  localPill.setAttribute('role','status');
  localPill.setAttribute('aria-live','polite');
  const localLabel=document.createElement('span');
  localPill.append(localLabel);
  utilities.append(localPill);

  installButton=document.createElement('button');
  installButton.type='button';
  installButton.className='ghost utility-button install-trigger';
  installButton.textContent='Install';
  installButton.hidden=true;
  installButton.addEventListener('click',async()=>{
    if(!installPrompt)return;
    installButton.disabled=true;
    try{
      await installPrompt.prompt();
      await installPrompt.userChoice;
    }finally{
      installPrompt=null;
      installButton.hidden=true;
      installButton.disabled=false;
    }
  });
  utilities.append(installButton);

  const helpButton=document.createElement('button');
  helpButton.type='button';
  helpButton.className='ghost utility-button help-trigger';
  helpButton.textContent='?';
  helpButton.setAttribute('aria-label','Keyboard shortcuts and safety');
  helpButton.setAttribute('aria-keyshortcuts','?');
  helpButton.addEventListener('click',()=>{
    helpDialog??=buildHelpDialog();
    if(!helpDialog.open)helpDialog.showModal();
  });
  utilities.append(helpButton);

  header.insertBefore(utilities,actions||null);
  syncConnectionState();
}

window.addEventListener('online',syncConnectionState);
window.addEventListener('offline',syncConnectionState);
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  installPrompt=event;
  if(installButton)installButton.hidden=false;
});
window.addEventListener('appinstalled',()=>{
  installPrompt=null;
  if(installButton)installButton.hidden=true;
});

let workspaceState=null;
const worldbar=$('.worldbar');
if(worldbar){
  workspaceState=document.createElement('div');
  workspaceState.className='workspace-state';
  workspaceState.hidden=true;
  const dot=document.createElement('span');
  dot.className='workspace-dot';
  dot.setAttribute('aria-hidden','true');
  const label=document.createElement('span');
  label.className='workspace-label';
  workspaceState.append(dot,label);
  worldbar.append(workspaceState);
}

const tileDrafts=new Map();

function tileDraftBaseKey(card){
  const kind=$('.eyebrow',card)?.textContent?.trim()||'tile';
  const id=$('.container-head h3',card)?.textContent?.trim()||'unknown';
  const position=($('.container-head p',card)?.textContent||'').split(' • chunk')[0].trim();
  return `${kind}|${id}|${position}`;
}

function tileDraftKey(card){
  return card.dataset.tileDraftKey||`${tileDraftBaseKey(card)}|0`;
}

function tileFields(card){
  return $$('.tile-textarea,.tile-input',card);
}

function coreDirtyState(){
  const badge=$('#dirtyBadge');
  if(!badge||badge.hidden||!isVisible(badge))return false;
  const text=(badge.textContent||'').trim();
  if(!text)return false;
  return !/^(saved|clean|ready|0\s+changes?)$/i.test(text);
}

function hasUnsavedWork(){
  return tileDrafts.size>0||coreDirtyState();
}

function currentWorldName(){
  const title=$('#worldTitle');
  const text=(title?.textContent||'').trim();
  return text&&text.toLowerCase()!=='world' ? text : '';
}

function syncDocumentTitle(){
  const dirty=hasUnsavedWork();
  const world=currentWorldName();
  document.title=`${dirty?'● ':''}${world?`${world} · `:''}${APP_NAME}`;
}

function syncWorkspaceState(){
  const hasWorld=document.body.classList.contains('has-world');
  if(workspaceState)workspaceState.hidden=!hasWorld;
  if(!hasWorld){
    syncDocumentTitle();
    return;
  }

  const dirty=hasUnsavedWork();
  document.body.classList.toggle('has-unsaved-work',dirty);
  if(workspaceState){
    workspaceState.dataset.dirty=String(dirty);
    const label=$('.workspace-label',workspaceState);
    if(label){
      if(tileDrafts.size){
        label.textContent=`${tileDrafts.size} unsaved tile draft${tileDrafts.size===1?'':'s'}`;
      }else{
        label.textContent=dirty?'Unsaved changes':'Local state saved';
      }
    }
  }
  syncDocumentTitle();
}

function syncWorldState(){
  const editor=$('#editor');
  const hasWorld=!!editor&&!editor.hidden;
  const hadWorld=document.body.classList.contains('has-world');
  document.body.classList.toggle('has-world',hasWorld);
  if(hasWorld&&!hadWorld){
    const title=$('#worldTitle');
    if(title){
      title.tabIndex=-1;
      requestAnimationFrame(()=>title.focus({preventScroll:true}));
    }
  }
  syncWorkspaceState();
}

const editor=$('#editor');
if(editor)new MutationObserver(syncWorldState).observe(editor,{attributes:true,attributeFilter:['hidden']});
syncWorldState();

const worldTitle=$('#worldTitle');
if(worldTitle)new MutationObserver(syncDocumentTitle).observe(worldTitle,{childList:true,subtree:true,characterData:true});

const dirtyBadge=$('#dirtyBadge');
if(dirtyBadge){
  new MutationObserver(syncWorkspaceState).observe(dirtyBadge,{
    childList:true,subtree:true,characterData:true,attributes:true,
    attributeFilter:['hidden','class','style','data-kind'],
  });
}

function syncTabs(){
  const tabs=$$('.tab');
  for(const tab of tabs){
    const name=tab.dataset.tab;
    if(!name)continue;
    const panel=$(`#panel-${name}`);
    const active=tab.classList.contains('active');
    tab.id=`tab-${name}`;
    tab.setAttribute('role','tab');
    tab.setAttribute('aria-selected',String(active));
    tab.setAttribute('aria-controls',`panel-${name}`);
    tab.tabIndex=active?0:-1;
    if(panel){
      panel.setAttribute('role','tabpanel');
      panel.setAttribute('aria-labelledby',tab.id);
      panel.setAttribute('aria-hidden',String(!active));
    }
  }
}

const tabsNav=$('.tabs');
if(tabsNav){
  tabsNav.setAttribute('role','tablist');
  tabsNav.addEventListener('click',()=>requestAnimationFrame(syncTabs));
  tabsNav.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const tabs=$$('.tab',tabsNav);
    const current=tabs.indexOf(document.activeElement);
    if(current<0)return;
    event.preventDefault();
    const next=event.key==='Home'
      ?0
      :event.key==='End'
        ?tabs.length-1
        :(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    tabs[next].focus();
    tabs[next].click();
  });
  new MutationObserver(syncTabs).observe(tabsNav,{subtree:true,attributes:true,attributeFilter:['class']});
  syncTabs();
}

for(const label of $$('.file-label')){
  label.setAttribute('role','button');
  label.tabIndex=0;
  label.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    event.preventDefault();
    $('input',label)?.click();
  });
}

const accessibleNames={
  containerSearch:'Search containers',
  tileToolsSearch:'Search tile entities',
  nbtSearch:'Search NBT tags and values',
  catalogSearch:'Search the Bedrock item catalog',
  catalogFilter:'Filter the Bedrock item catalog',
};
for(const [id,label] of Object.entries(accessibleNames)){
  document.getElementById(id)?.setAttribute('aria-label',label);
}

$('#saveAllBtn')?.setAttribute('aria-keyshortcuts','Control+S Meta+S');
$('#itemDialog')?.setAttribute('aria-labelledby','itemSlotLabel');
$('#catalogDialog')?.setAttribute('aria-labelledby','catalogTitle');
const catalogHeading=$('#catalogDialog h2');
if(catalogHeading)catalogHeading.id='catalogTitle';

for(const id of ['dirtyBadge','containerStatus','tileToolsStatus','dbStatus']){
  const node=document.getElementById(id);
  if(node){
    node.setAttribute('role','status');
    node.setAttribute('aria-live','polite');
  }
}

function labelSlots(root=document){
  $$('.slot:not([aria-label])',root).forEach(slot=>{
    const number=$('.slot-num',slot)?.textContent?.trim()||'';
    const item=$('.item-name',slot)?.textContent?.trim();
    const area=slot.closest('.ender-card')
      ?'Ender Chest'
      :slot.closest('.container-card')
        ?$('.container-head h3',slot.closest('.container-card'))?.textContent||'Container'
        :slot.closest('#armorGrid')
          ?'Armor'
          :slot.closest('#offhandGrid')
            ?'Offhand'
            :'Inventory';
    slot.setAttribute('aria-label',`${area} slot ${number||'unknown'}, ${item||'empty'}`);
  });
}

const slotRoots=['#inventoryGrid','#armorGrid','#offhandGrid','#enderChestGrid','#containerList'];
for(const selector of slotRoots){
  const root=$(selector);
  if(root)new MutationObserver(()=>labelSlots(root)).observe(root,{childList:true,subtree:true});
}
labelSlots();

function enhanceNbtControls(){
  $$('#nbtTree .nbt-head[title]').forEach(control=>{
    if(control.tagName!=='DIV'||control.dataset.keyboardReady)return;
    control.dataset.keyboardReady='true';
    control.tabIndex=0;
    control.setAttribute('role','button');
    const name=$('b',control)?.textContent?.trim()||'NBT value';
    control.setAttribute('aria-label',`Edit ${name}`);
    control.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      event.preventDefault();
      control.click();
    });
  });
}

const nbtTree=$('#nbtTree');
if(nbtTree)new MutationObserver(enhanceNbtControls).observe(nbtTree,{childList:true,subtree:true});
enhanceNbtControls();

function announce(message,kind='err'){
  const toast=$('#toast');
  if(!toast)return;
  toast.textContent=message;
  toast.dataset.kind=kind;
  toast.setAttribute('role',kind==='err'?'alert':'status');
  toast.classList.add('show');
  setTimeout(()=>{
    toast.classList.remove('show');
    toast.setAttribute('role','status');
  },6000);
}

function restoreTileDrafts(){
  const occurrences=new Map();
  $$('.tile-tool-card').forEach(card=>{
    const base=tileDraftBaseKey(card);
    const occurrence=occurrences.get(base)||0;
    const key=`${base}|${occurrence}`;
    occurrences.set(base,occurrence+1);
    card.dataset.tileDraftKey=key;
    const values=tileDrafts.get(key);
    if(!values)return;
    tileFields(card).forEach((field,index)=>{
      if(values[index]!==undefined)field.value=values[index];
    });
    card.classList.add('has-draft');
  });
  syncWorkspaceState();
}

const tileToolsList=$('#tileToolsList');
if(tileToolsList)new MutationObserver(restoreTileDrafts).observe(tileToolsList,{childList:true,subtree:true});
restoreTileDrafts();

document.addEventListener('input',event=>{
  if(!event.target.matches?.('.tile-textarea,.tile-input'))return;
  const card=event.target.closest('.tile-tool-card');
  if(!card)return;
  const key=tileDraftKey(card);
  tileDrafts.set(key,tileFields(card).map(field=>field.value));
  card.dataset.tileDraftKey=key;
  card.classList.add('has-draft');
  syncWorkspaceState();
},true);

document.addEventListener('change',event=>{
  if(event.target.matches?.('#fileInput,#folderInput')){
    tileDrafts.clear();
    requestAnimationFrame(syncWorkspaceState);
  }
},true);

document.addEventListener('click',event=>{
  const tileSave=event.target.closest?.('.tile-tool-card .primary');
  if(tileSave){
    tileDrafts.delete(tileDraftKey(tileSave.closest('.tile-tool-card')));
    requestAnimationFrame(syncWorkspaceState);
    return;
  }

  if(!event.target.closest?.('#saveAllBtn,#exportWorld,#exportLevel')||!tileDrafts.size)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  $('.tab[data-tab="tiles"]')?.click();
  const search=$('#tileToolsSearch');
  if(search?.value){
    search.value='';
    search.dispatchEvent(new Event('input',{bubbles:true}));
  }
  const firstKey=tileDrafts.keys().next().value;
  requestAnimationFrame(()=>{
    restoreTileDrafts();
    const draft=$$('.tile-tool-card').find(card=>card.dataset.tileDraftKey===firstKey);
    draft?.scrollIntoView({behavior:'smooth',block:'center'});
    $('.tile-textarea,.tile-input',draft)?.focus();
  });
  announce(`Save all ${tileDrafts.size} highlighted tile card${tileDrafts.size===1?'':'s'} before Save All or export. Drafts are retained while you navigate.`);
},true);

document.addEventListener('keydown',event=>{
  const mod=event.ctrlKey||event.metaKey;
  const key=event.key.toLowerCase();

  if(mod&&key==='s'&&document.body.classList.contains('has-world')){
    event.preventDefault();
    const save=$('#saveAllBtn');
    if(save&&!save.disabled)save.click();
    return;
  }

  if(event.key==='/'&&!mod&&!event.altKey&&!isTypingTarget(event.target)&&document.body.classList.contains('has-world')){
    const visibleSearch=$$('.search,input[type="search"]').find(isVisible);
    if(visibleSearch){
      event.preventDefault();
      visibleSearch.focus();
      visibleSearch.select?.();
    }
    return;
  }

  if(event.key==='?'&&!mod&&!event.altKey&&!isTypingTarget(event.target)){
    event.preventDefault();
    helpDialog??=buildHelpDialog();
    if(!helpDialog.open)helpDialog.showModal();
  }
});

window.addEventListener('beforeunload',event=>{
  if(!hasUnsavedWork())return;
  event.preventDefault();
  event.returnValue='';
});

function showUpdateBanner(registration){
  if(!registration?.waiting||$('#workshopUpdateBanner'))return;

  const banner=document.createElement('aside');
  banner.id='workshopUpdateBanner';
  banner.className='update-banner';
  banner.setAttribute('role','status');

  const copy=document.createElement('div');
  const strong=document.createElement('strong');
  strong.textContent='Workshop update ready';
  const small=document.createElement('span');
  small.textContent='Reload to switch to the newest cached editor.';
  copy.append(strong,small);

  const reload=document.createElement('button');
  reload.type='button';
  reload.className='primary';
  reload.textContent='Reload';
  reload.addEventListener('click',()=>{
    reload.disabled=true;
    let reloading=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(reloading)return;
      reloading=true;
      location.reload();
    },{once:true});
    registration.waiting?.postMessage({type:'SKIP_WAITING'});
  });

  const dismiss=document.createElement('button');
  dismiss.type='button';
  dismiss.className='ghost iconbtn';
  dismiss.textContent='×';
  dismiss.setAttribute('aria-label','Dismiss update notice');
  dismiss.addEventListener('click',()=>banner.remove());

  banner.append(copy,reload,dismiss);
  document.body.append(banner);
}

if('serviceWorker' in navigator){
  navigator.serviceWorker.getRegistration().then(registration=>{
    if(!registration)return;
    showUpdateBanner(registration);
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      if(!worker)return;
      worker.addEventListener('statechange',()=>{
        if(worker.state==='installed'&&navigator.serviceWorker.controller){
          showUpdateBanner(registration);
        }
      });
    });
  }).catch(()=>{});
}

window.__BEDROCK_WORKSHOP_ENHANCEMENTS__='0.6.1-ui-refresh';
