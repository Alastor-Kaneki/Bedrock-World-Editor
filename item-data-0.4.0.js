import {loadChunkedGzip,importSource} from './chunk-loader.js?v=0.6.0';
const base=new URL('.',import.meta.url);let s=await loadChunkedGzip(['./chunks/item-00.bin','./chunks/item-01.bin']);s=s.replaceAll('__BASE__',base.href);const m=await importSource(s);
export const OFFICIAL_SOURCES=m.OFFICIAL_SOURCES,ENCHANTMENTS=m.ENCHANTMENTS,FALLBACK_CATALOG=m.FALLBACK_CATALOG,getItemEnchantments=m.getItemEnchantments,setItemEnchantments=m.setItemEnchantments,loadOfficialCatalog=m.loadOfficialCatalog,classifyCatalogItem=m.classifyCatalogItem,isBlockIdentifier=m.isBlockIdentifier;
