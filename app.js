const base = new URL('.', import.meta.url);

// v0.3 UI is injected before the main controller starts so existing GitHub Pages
// deployments can upgrade without replacing the entire HTML shell.
const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = new URL('./v3.css', base).href;
document.head.append(css);

const oldDialog = document.getElementById('itemDialog');
if (oldDialog) {
  oldDialog.outerHTML = `
  <dialog id="itemDialog" class="wide-dialog">
    <form method="dialog" onsubmit="return false">
      <div class="dialog-head"><div><span class="eyebrow">ITEM STACK</span><h2 id="itemSlotLabel">Slot</h2></div><button id="itemCancel" class="iconbtn" aria-label="Close">×</button></div>
      <div id="itemPreview" class="item-preview"></div>
      <div class="item-id-row">
        <label><span>Item identifier</span><input id="itemId" list="itemIds" autocomplete="off" spellcheck="false"></label>
        <button id="browseCatalog" class="ghost" type="button">Browse all items</button>
      </div>
      <datalist id="itemIds"></datalist>
      <div class="formgrid two"><label><span>Count</span><input id="itemCount" type="number" min="0" max="127"></label><label><span>Damage / data</span><input id="itemDamage" type="number"></label></div>
      <section class="enchant-editor">
        <div class="subsection-head"><div><span class="eyebrow">ENCHANTMENTS</span><h3>Enchant stack</h3></div><button id="enchantClear" class="ghost smallbtn" type="button">Clear all</button></div>
        <div id="enchantList" class="enchant-list"></div>
        <div class="enchant-add">
          <label><span>Enchantment</span><select id="enchantType"></select></label>
          <label id="enchantCustomWrap" hidden><span>Numeric ID</span><input id="enchantCustomId" type="number" value="0" min="-32768" max="32767"></label>
          <label><span>Level</span><input id="enchantLevel" type="number" value="1" min="-32768" max="32767" step="1"></label>
          <button id="enchantAdd" class="ghost" type="button">Add / update</button>
        </div>
        <p class="muted tiny">Normal maximum levels are shown as hints. The editor allows out-of-range levels and custom numeric IDs for experimental/illegal stacks.</p>
      </section>
      <details><summary>Raw item data</summary><pre id="itemRaw" class="codebox"></pre></details>
      <div class="dialog-actions"><button id="deleteItem" class="danger" type="button">Delete item</button><span></span><button id="itemCancel2" class="ghost" type="button" onclick="document.getElementById('itemDialog').close()">Cancel</button><button id="itemSave" class="primary" type="button">Save item</button></div>
    </form>
  </dialog>`;
}

const catalog = document.createElement('dialog');
catalog.id = 'catalogDialog';
catalog.className = 'catalog-dialog';
catalog.innerHTML = `
  <form method="dialog" onsubmit="return false">
    <div class="dialog-head"><div><span class="eyebrow">OFFICIAL BEDROCK CATALOG</span><h2>Items & hidden IDs</h2></div><button id="catalogClose" class="iconbtn" type="button" aria-label="Close">×</button></div>
    <div class="catalog-source"><b id="catalogSourceStatus">Loading official catalog…</b><span id="catalogSourceDetails">Microsoft Learn + Mojang bedrock-samples</span></div>
    <div class="catalog-toolbar">
      <input id="catalogSearch" class="search" placeholder="Search item ID or runtime ID…" autocomplete="off">
      <select id="catalogFilter">
        <option value="all">All items</option>
        <option value="special">Hidden / technical / education</option>
        <option value="technical">Technical / normally unobtainable</option>
        <option value="education">Education / chemistry</option>
        <option value="deprecated">Deprecated / placeholder</option>
        <option value="normal">Normal</option>
      </select>
      <span id="catalogCount" class="pill">0 results</span>
    </div>
    <p class="muted tiny catalog-note">Catalog IDs come from Microsoft’s Bedrock reference. Sprites are linked directly from Mojang’s official <code>bedrock-samples</code> resource pack when a matching vanilla texture exists. No Minecraft textures are copied into this repository.</p>
    <div id="catalogGrid" class="catalog-grid"></div>
    <div class="catalog-more"><button id="catalogLoadMore" class="ghost" type="button">Show more</button></div>
  </form>`;
document.body.insertBefore(catalog, document.getElementById('toast'));

for (const el of document.querySelectorAll('.eyebrow')) {
  if (el.textContent.includes('v0.2.1')) el.textContent = el.textContent.replace('v0.2.1', 'v0.3.0');
}

async function gunzip(url) {
  const res = await fetch(url, {cache:'no-cache'});
  if (!res.ok) throw new Error(`Could not load ${url.pathname}: HTTP ${res.status}`);
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

try {
  let source = await gunzip(new URL('./app-v3.payload.gz', base));
  source = source.replaceAll('__BASE__', base.href);
  const bytes = new TextEncoder().encode(source);
  let binary = ''; for (let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000));
  await import(`data:text/javascript;base64,${btoa(binary)}`);
} catch (error) {
  console.error('Bedrock Web Editor v0.3 failed to start', error);
  const toast = document.getElementById('toast');
  if (toast) { toast.textContent = `v0.3 startup failed: ${error.message}`; toast.dataset.kind='err'; toast.classList.add('show'); }
}
