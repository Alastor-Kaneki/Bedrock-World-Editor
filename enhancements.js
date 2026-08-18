const $=(selector,parent=document)=>parent.querySelector(selector);
const $$=(selector,parent=document)=>[...parent.querySelectorAll(selector)];

function setText(selector,text,parent=document){const node=$(selector,parent);if(node)node.textContent=text;}

document.title='Bedrock Workshop | Private world editor';
setText('.brand strong','Bedrock Workshop');
setText('.brand small','private world editor');
setText('.hero .eyebrow','BEDROCK WORKSHOP / LOCAL-FIRST / v0.6.1 ALPHA');

const heroHeading=$('.hero h1');
if(heroHeading){
  heroHeading.replaceChildren('Your Bedrock world.');
  const accent=document.createElement('span');accent.textContent='Your rules.';heroHeading.append(accent);
}
setText('.hero-copy>p','Tune world settings, inventories, containers and NBT without handing your save to a server. Open a copy, make your changes, then download a verified world.');

const heroCopy=$('.hero-copy');
if(heroCopy){
  const trust=document.createElement('div');trust.className='trust-row';
  for(const label of ['No uploads','Works offline','Original stays untouched']){const chip=document.createElement('span');chip.textContent=label;trust.append(chip);}
  heroCopy.append(trust);
}

setText('.dropzone h2','Bring in a world copy');
setText('.dropzone>p','.mcworld / ZIP / level.dat / world folder');
setText('.dropzone>small','Everything is decoded and rebuilt on this device. Your world never leaves this browser.');
const dropIcon=$('.drop-icon');if(dropIcon){dropIcon.textContent='◆';dropIcon.setAttribute('aria-hidden','true');}
const dropButtons=$('.drop-buttons');
if(dropButtons){
  const formats=document.createElement('div');formats.className='format-row';
  for(const label of ['MCWORLD','ZIP','LEVEL.DAT','FOLDER']){const item=document.createElement('span');item.textContent=label;formats.append(item);}
  dropButtons.insertAdjacentElement('afterend',formats);
}

const workflow=[
  ['Open a copy','Load an archive, folder, or standalone level.dat'],
  ['Tune locally','Edit world data without a server or account'],
  ['Verify and export','Download a checked copy and keep your original'],
];
$$('.feature-row>div').forEach((card,index)=>{
  const [heading,detail]=workflow[index]||[];
  if(heading)setText('b',heading,card);
  const title=$('b',card),body=$('span',card);
  if(title&&heading)title.textContent=heading;
  if(body&&detail)body.textContent=detail;
});

const header=$('.topbar');
if(header){
  const local=document.createElement('span');local.className='local-pill';
  const label=document.createElement('span');label.textContent='PROCESSING ON DEVICE';local.append(label);
  const actions=$('.top-actions',header);header.insertBefore(local,actions||null);
}

function syncWorldState(){
  const editor=$('#editor');
  const hasWorld=!!editor&&!editor.hidden;
  const hadWorld=document.body.classList.contains('has-world');
  document.body.classList.toggle('has-world',hasWorld);
  if(hasWorld&&!hadWorld){
    const title=$('#worldTitle');
    if(title){title.tabIndex=-1;requestAnimationFrame(()=>title.focus({preventScroll:true}));}
  }
}
const editor=$('#editor');
if(editor)new MutationObserver(syncWorldState).observe(editor,{attributes:true,attributeFilter:['hidden']});
syncWorldState();

function syncTabs(){
  const tabs=$$('.tab');
  for(const tab of tabs){
    const name=tab.dataset.tab;
    const panel=$(`#panel-${name}`);
    const active=tab.classList.contains('active');
    tab.id=`tab-${name}`;
    tab.setAttribute('role','tab');
    tab.setAttribute('aria-selected',String(active));
    tab.setAttribute('aria-controls',`panel-${name}`);
    tab.tabIndex=active?0:-1;
    if(panel){panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panel.setAttribute('aria-hidden',String(!active));}
  }
}
const tabsNav=$('.tabs');
if(tabsNav){
  tabsNav.setAttribute('role','tablist');
  tabsNav.addEventListener('click',()=>requestAnimationFrame(syncTabs));
  tabsNav.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const tabs=$$('.tab',tabsNav);const current=tabs.indexOf(document.activeElement);if(current<0)return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    tabs[next].focus();tabs[next].click();
  });
  new MutationObserver(syncTabs).observe(tabsNav,{subtree:true,attributes:true,attributeFilter:['class']});
  syncTabs();
}

for(const label of $$('.file-label')){
  label.setAttribute('role','button');label.tabIndex=0;
  label.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;
    event.preventDefault();$('input',label)?.click();
  });
}

const accessibleNames={
  containerSearch:'Search containers',tileToolsSearch:'Search tile entities',nbtSearch:'Search NBT tags and values',
  catalogSearch:'Search the Bedrock item catalog',catalogFilter:'Filter the Bedrock item catalog',
};
for(const [id,label] of Object.entries(accessibleNames))document.getElementById(id)?.setAttribute('aria-label',label);

$('#itemDialog')?.setAttribute('aria-labelledby','itemSlotLabel');
$('#catalogDialog')?.setAttribute('aria-labelledby','catalogTitle');
const catalogHeading=$('#catalogDialog h2');if(catalogHeading)catalogHeading.id='catalogTitle';
for(const id of ['dirtyBadge','containerStatus','tileToolsStatus','dbStatus']){
  const node=document.getElementById(id);if(node){node.setAttribute('role','status');node.setAttribute('aria-live','polite');}
}

function labelSlots(root=document){
  $$('.slot:not([aria-label])',root).forEach(slot=>{
    const number=$('.slot-num',slot)?.textContent?.trim()||'';
    const item=$('.item-name',slot)?.textContent?.trim();
    const area=slot.closest('.ender-card')?'Ender Chest':slot.closest('.container-card')?$('.container-head h3',slot.closest('.container-card'))?.textContent||'Container':slot.closest('#armorGrid')?'Armor':slot.closest('#offhandGrid')?'Offhand':'Inventory';
    slot.setAttribute('aria-label',`${area} slot ${number||'unknown'}, ${item||'empty'}`);
  });
}
const slotRoots=['#inventoryGrid','#armorGrid','#offhandGrid','#enderChestGrid','#containerList'];
for(const selector of slotRoots){const root=$(selector);if(root)new MutationObserver(()=>labelSlots(root)).observe(root,{childList:true,subtree:true});}
labelSlots();

function enhanceNbtControls(){
  $$('#nbtTree .nbt-head[title]').forEach(control=>{
    if(control.tagName!=='DIV'||control.dataset.keyboardReady)return;
    control.dataset.keyboardReady='true';control.tabIndex=0;control.setAttribute('role','button');
    const name=$('b',control)?.textContent?.trim()||'NBT value';
    control.setAttribute('aria-label',`Edit ${name}`);
    control.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      event.preventDefault();control.click();
    });
  });
}
const nbtTree=$('#nbtTree');
if(nbtTree)new MutationObserver(enhanceNbtControls).observe(nbtTree,{childList:true,subtree:true});
enhanceNbtControls();

function announce(message){
  const toast=$('#toast');if(!toast)return;
  toast.textContent=message;toast.dataset.kind='err';toast.setAttribute('role','alert');toast.classList.add('show');
  setTimeout(()=>{toast.classList.remove('show');toast.setAttribute('role','status');},6000);
}

const tileDrafts=new Map();

function tileDraftBaseKey(card){
  const kind=$('.eyebrow',card)?.textContent?.trim()||'tile';
  const id=$('.container-head h3',card)?.textContent?.trim()||'unknown';
  const position=($('.container-head p',card)?.textContent||'').split(' • chunk')[0].trim();
  return `${kind}|${id}|${position}`;
}

function tileDraftKey(card){return card.dataset.tileDraftKey||`${tileDraftBaseKey(card)}|0`;}

function tileFields(card){return $$('.tile-textarea,.tile-input',card);}

function restoreTileDrafts(){
  const occurrences=new Map();
  $$('.tile-tool-card').forEach(card=>{
    const base=tileDraftBaseKey(card),occurrence=occurrences.get(base)||0,key=`${base}|${occurrence}`;
    occurrences.set(base,occurrence+1);card.dataset.tileDraftKey=key;
    const values=tileDrafts.get(key);if(!values)return;
    tileFields(card).forEach((field,index)=>{if(values[index]!==undefined)field.value=values[index];});
    card.classList.add('has-draft');
  });
}

const tileToolsList=$('#tileToolsList');
if(tileToolsList)new MutationObserver(restoreTileDrafts).observe(tileToolsList,{childList:true,subtree:true});
restoreTileDrafts();

document.addEventListener('input',event=>{
  if(!event.target.matches?.('.tile-textarea,.tile-input'))return;
  const card=event.target.closest('.tile-tool-card');if(!card)return;
  const key=tileDraftKey(card);tileDrafts.set(key,tileFields(card).map(field=>field.value));
  card.dataset.tileDraftKey=key;card.classList.add('has-draft');
},true);

document.addEventListener('change',event=>{
  if(event.target.matches?.('#fileInput,#folderInput'))tileDrafts.clear();
},true);

document.addEventListener('click',event=>{
  const tileSave=event.target.closest?.('.tile-tool-card .primary');
  if(tileSave){tileDrafts.delete(tileDraftKey(tileSave.closest('.tile-tool-card')));return;}
  if(!event.target.closest?.('#saveAllBtn,#exportWorld,#exportLevel')||!tileDrafts.size)return;
  event.preventDefault();event.stopImmediatePropagation();
  $('.tab[data-tab="tiles"]')?.click();
  const search=$('#tileToolsSearch');
  if(search?.value){search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));}
  const firstKey=tileDrafts.keys().next().value;
  requestAnimationFrame(()=>{
    restoreTileDrafts();
    const draft=$$('.tile-tool-card').find(card=>card.dataset.tileDraftKey===firstKey);
    draft?.scrollIntoView({behavior:'smooth',block:'center'});$('.tile-textarea,.tile-input',draft)?.focus();
  });
  announce(`Save all ${tileDrafts.size} highlighted tile card${tileDrafts.size===1?'':'s'} before Save All or export. Drafts are retained while you navigate.`);
},true);

window.__BEDROCK_WORKSHOP_ENHANCEMENTS__='0.6.1';
