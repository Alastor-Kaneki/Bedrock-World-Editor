export async function loadChunkedGzip(paths){
  const chunks=[]; let total=0;
  for(const path of paths){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);const b=new Uint8Array(await r.arrayBuffer());chunks.push(b);total+=b.length}
  const all=new Uint8Array(total);let o=0;for(const b of chunks){all.set(b,o);o+=b.length}
  return new Response(new Blob([all]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
export async function importSource(source){const u=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));try{return await import(u)}finally{URL.revokeObjectURL(u)}}
