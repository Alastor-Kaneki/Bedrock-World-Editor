const SCRATCH = 1024;
let singleton = null;

function asU8(value){
  if(value instanceof Uint8Array)return value;
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  return new TextEncoder().encode(String(value??''));
}

export async function loadBedrockDbWasm(url=new URL('./bedrock-db-core.wasm',import.meta.url)){
  if(singleton)return singleton;
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`WASM core HTTP ${response.status}`);
  let instance;
  try{
    if(WebAssembly.instantiateStreaming){
      ({instance}=await WebAssembly.instantiateStreaming(response.clone(),{}));
    }
  }catch(_){ }
  if(!instance){
    const bytes=await response.arrayBuffer();
    ({instance}=await WebAssembly.instantiate(bytes,{}));
  }
  const e=instance.exports;
  if(!(e.memory instanceof WebAssembly.Memory)||typeof e.crc32c!=='function')throw new Error('Invalid Bedrock DB WASM core');

  const ensure=(len)=>{
    const need=SCRATCH+len;
    if(need>e.memory.buffer.byteLength)e.memory.grow(Math.ceil((need-e.memory.buffer.byteLength)/65536));
  };
  const put=(value)=>{
    const b=asU8(value); ensure(b.length); new Uint8Array(e.memory.buffer,SCRATCH,b.length).set(b); return b;
  };
  singleton={
    crc32c(value){const b=put(value);return e.crc32c(SCRATCH,b.length)>>>0;},
    crcMask(value){return e.crc_mask(value>>>0)>>>0;},
    crcUnmask(value){return e.crc_unmask(value>>>0)>>>0;},
    parseDbKey(value){
      const b=put(value); if(b.length<9)return null;
      const type=e.dbkey_type(SCRATCH,b.length)>>>0;
      if(type===0xffffffff)return null;
      return {x:e.dbkey_x(SCRATCH,b.length)|0,z:e.dbkey_z(SCRATCH,b.length)|0,dimension:e.dbkey_dimension(SCRATCH,b.length)|0,type};
    },
    packInternalKeyTag(sequence,type=1){return e.pack_internal_key_tag(BigInt(sequence),type>>>0);},
    exports:e,
  };
  return singleton;
}
