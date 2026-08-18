export async function loadChunkedGzip(paths){
  if(typeof DecompressionStream!=='function')throw new Error('This browser does not support gzip decompression streams.');
  const chunks=await Promise.all(paths.map(async path=>{const r=await fetch(new URL(path,import.meta.url));if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);return new Uint8Array(await r.arrayBuffer())}));
  let total=0;for(const b of chunks)total+=b.length;
  const all=new Uint8Array(total);let o=0;for(const b of chunks){all.set(b,o);o+=b.length}
  return new Response(new Blob([all]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
export async function importSource(source){const u=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));try{return await import(u)}finally{URL.revokeObjectURL(u)}}
