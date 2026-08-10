const td = new TextDecoder('utf-8');
const te = new TextEncoder();

function dv(bytes){ return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
function u16(v,o){return v.getUint16(o,true)}
function u32(v,o){return v.getUint32(o,true)}
function put16(v,o,n){v.setUint16(o,n,true)}
function put32(v,o,n){v.setUint32(o,n>>>0,true)}

let crcTable;
function crc32(bytes){
  if(!crcTable){ crcTable=new Uint32Array(256); for(let n=0;n<256;n++){let c=n; for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); crcTable[n]=c>>>0;} }
  let c=0xFFFFFFFF; for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0;
}

async function streamTransform(bytes, kind){
  const C = kind==='decompress' ? globalThis.DecompressionStream : globalThis.CompressionStream;
  if(!C) throw new Error(`${kind==='decompress'?'DecompressionStream':'CompressionStream'} is not supported by this browser.`);
  let stream;
  try { stream = new Blob([bytes]).stream().pipeThrough(new C('deflate-raw')); }
  catch { throw new Error('This browser does not support raw DEFLATE streams required by ZIP files.'); }
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const inflateRaw = bytes => streamTransform(bytes,'decompress');
const deflateRaw = bytes => streamTransform(bytes,'compress');

function cleanPath(name){
  name=name.replace(/\\/g,'/').replace(/^\/+/, '');
  const parts=name.split('/'); if(parts.some(p=>p==='..'))throw new Error(`Unsafe ZIP path: ${name}`); return name;
}

export async function unzip(bytes, {verifyCrc=true}={}){
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); const view=dv(bytes);
  const start=Math.max(0,bytes.length-65557); let eocd=-1;
  for(let i=bytes.length-22;i>=start;i--){if(u32(view,i)===0x06054b50){eocd=i;break;}}
  if(eocd<0)throw new Error('ZIP end-of-central-directory record not found.');
  const disk=u16(view,eocd+4), cdDisk=u16(view,eocd+6), entries=u16(view,eocd+10), cdSize=u32(view,eocd+12), cdOff=u32(view,eocd+16);
  if(disk!==0||cdDisk!==0)throw new Error('Multi-disk ZIP archives are not supported.');
  if(entries===0xFFFF||cdSize===0xFFFFFFFF||cdOff===0xFFFFFFFF)throw new Error('ZIP64 worlds are not supported by this browser build yet.');
  if(cdOff+cdSize>bytes.length)throw new Error('ZIP central directory is truncated.');
  const out={}; let o=cdOff;
  for(let i=0;i<entries;i++){
    if(o+46>bytes.length||u32(view,o)!==0x02014b50)throw new Error(`Invalid ZIP central directory entry ${i}.`);
    const flags=u16(view,o+8), method=u16(view,o+10), expectedCrc=u32(view,o+16), compSize=u32(view,o+20), rawSize=u32(view,o+24), nameLen=u16(view,o+28), extraLen=u16(view,o+30), commentLen=u16(view,o+32), localOff=u32(view,o+42);
    if(flags&1)throw new Error('Encrypted ZIP entries are not supported.');
    const name=cleanPath(td.decode(bytes.subarray(o+46,o+46+nameLen)));
    o+=46+nameLen+extraLen+commentLen;
    if(name.endsWith('/'))continue;
    if(localOff+30>bytes.length||u32(view,localOff)!==0x04034b50)throw new Error(`Invalid local header for ${name}.`);
    const localNameLen=u16(view,localOff+26), localExtraLen=u16(view,localOff+28); const dataOff=localOff+30+localNameLen+localExtraLen; const comp=bytes.subarray(dataOff,dataOff+compSize);
    if(comp.length!==compSize)throw new Error(`Truncated ZIP data for ${name}.`);
    let raw;
    if(method===0)raw=comp.slice();
    else if(method===8)raw=await inflateRaw(comp);
    else throw new Error(`Unsupported ZIP compression method ${method} for ${name}.`);
    if(raw.length!==rawSize)throw new Error(`Size mismatch while extracting ${name}.`);
    if(verifyCrc&&crc32(raw)!==expectedCrc)throw new Error(`CRC check failed for ${name}.`);
    out[name]=raw;
  }
  return out;
}

function dosDateTime(date=new Date()){
  let year=Math.max(1980,Math.min(2107,date.getFullYear()));
  const time=((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|((Math.floor(date.getSeconds()/2))&31);
  const d=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate(); return {time,date:d};
}

export async function zip(files,{compress=true}={}){
  const names=Object.keys(files); if(names.length>65535)throw new Error('ZIP contains too many files for non-ZIP64 output.');
  const locals=[], centrals=[]; let offset=0; const dt=dosDateTime();
  for(const originalName of names){
    const name=cleanPath(originalName); const nameBytes=te.encode(name); if(nameBytes.length>65535)throw new Error(`ZIP path too long: ${name}`);
    const raw=files[originalName] instanceof Uint8Array?files[originalName]:new Uint8Array(files[originalName]); if(raw.length>0xFFFFFFFF)throw new Error(`File exceeds ZIP32 limit: ${name}`);
    let method=0, payload=raw;
    if(compress && raw.length>64 && globalThis.CompressionStream){
      try{ const c=await deflateRaw(raw); if(c.length+16<raw.length){method=8;payload=c;} }catch{}
    }
    if(payload.length>0xFFFFFFFF)throw new Error(`Compressed file exceeds ZIP32 limit: ${name}`);
    const crc=crc32(raw);
    const local=new Uint8Array(30+nameBytes.length+payload.length), lv=dv(local);
    put32(lv,0,0x04034b50); put16(lv,4,20); put16(lv,6,0x0800); put16(lv,8,method); put16(lv,10,dt.time); put16(lv,12,dt.date); put32(lv,14,crc); put32(lv,18,payload.length); put32(lv,22,raw.length); put16(lv,26,nameBytes.length); put16(lv,28,0); local.set(nameBytes,30); local.set(payload,30+nameBytes.length); locals.push(local);
    const central=new Uint8Array(46+nameBytes.length), cv=dv(central);
    put32(cv,0,0x02014b50); put16(cv,4,20); put16(cv,6,20); put16(cv,8,0x0800); put16(cv,10,method); put16(cv,12,dt.time); put16(cv,14,dt.date); put32(cv,16,crc); put32(cv,20,payload.length); put32(cv,24,raw.length); put16(cv,28,nameBytes.length); put16(cv,30,0); put16(cv,32,0); put16(cv,34,0); put16(cv,36,0); put32(cv,38,0); put32(cv,42,offset); central.set(nameBytes,46); centrals.push(central);
    offset+=local.length; if(offset>0xFFFFFFFF)throw new Error('World archive exceeds ZIP32 size limit.');
  }
  const centralOffset=offset, centralSize=centrals.reduce((n,x)=>n+x.length,0); if(centralOffset+centralSize>0xFFFFFFFF)throw new Error('World archive exceeds ZIP32 size limit.');
  const eocd=new Uint8Array(22), ev=dv(eocd); put32(ev,0,0x06054b50); put16(ev,4,0); put16(ev,6,0); put16(ev,8,names.length); put16(ev,10,names.length); put32(ev,12,centralSize); put32(ev,16,centralOffset); put16(ev,20,0);
  const total=centralOffset+centralSize+eocd.length; const out=new Uint8Array(total); let p=0; for(const x of locals){out.set(x,p);p+=x.length;} for(const x of centrals){out.set(x,p);p+=x.length;} out.set(eocd,p); return out;
}
