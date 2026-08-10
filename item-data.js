const base = new URL('.', import.meta.url);
const res = await fetch(new URL('./item-data.payload.gz?v=0.3.3-firefox', base), {cache:'no-store'});
if (!res.ok) throw new Error(`Could not load item data payload: HTTP ${res.status}`);
if (typeof DecompressionStream === 'undefined') throw new Error('This browser does not support DecompressionStream.');
let source = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
source = source.replaceAll('__BASE__', base.href);

// Use a same-origin blob: module rather than a data: module. Firefox treats
// data: modules as opaque-origin and can reject their imports of nbt.js.
const blobUrl = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
let mod;
try {
  mod = await import(blobUrl);
} finally {
  URL.revokeObjectURL(blobUrl);
}

export const OFFICIAL_SOURCES = mod.OFFICIAL_SOURCES;
export const ENCHANTMENTS = mod.ENCHANTMENTS;
export const FALLBACK_CATALOG = mod.FALLBACK_CATALOG;
export const enchantmentById = mod.enchantmentById;
export const enchantmentByKey = mod.enchantmentByKey;
export const getItemEnchantments = mod.getItemEnchantments;
export const setItemEnchantments = mod.setItemEnchantments;
export const classifyCatalogItem = mod.classifyCatalogItem;
export const parseItemsMarkdown = mod.parseItemsMarkdown;
export const loadOfficialCatalog = mod.loadOfficialCatalog;
export const resetCatalogCache = mod.resetCatalogCache;
