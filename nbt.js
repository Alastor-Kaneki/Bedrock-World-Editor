const TAG = {
  END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6,
  BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12
};

const TAG_NAMES = ['End','Byte','Short','Int','Long','Float','Double','ByteArray','String','List','Compound','IntArray','LongArray'];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

class Reader {
  constructor(bytes) {
    this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.o = 0;
  }
  need(n) { if (this.o + n > this.bytes.length) throw new Error(`Unexpected EOF at ${this.o}, need ${n} bytes`); }
  u8(){ this.need(1); return this.view.getUint8(this.o++); }
  i8(){ this.need(1); return this.view.getInt8(this.o++); }
  i16(){ this.need(2); const v=this.view.getInt16(this.o,true); this.o+=2; return v; }
  i32(){ this.need(4); const v=this.view.getInt32(this.o,true); this.o+=4; return v; }
  i64(){ this.need(8); const v=this.view.getBigInt64(this.o,true); this.o+=8; return v; }
  f32(){ this.need(4); const v=this.view.getFloat32(this.o,true); this.o+=4; return v; }
  f64(){ this.need(8); const v=this.view.getFloat64(this.o,true); this.o+=8; return v; }
  u16(){ this.need(2); const v=this.view.getUint16(this.o,true); this.o+=2; return v; }
  str(){ const len=this.u16(); this.need(len); const s=decoder.decode(this.bytes.subarray(this.o,this.o+len)); this.o+=len; return s; }
  raw(n){ this.need(n); const v=this.bytes.slice(this.o,this.o+n); this.o+=n; return v; }
}

class Writer {
  constructor(){ this.a=[]; }
  push(...xs){ this.a.push(...xs.map(x=>x&255)); }
  i8(v){ this.push(v); }
  i16(v){ this.push(v, v>>8); }
  i32(v){ this.push(v, v>>8, v>>16, v>>24); }
  i64(v){
    v=BigInt(v);
    if (v<0) v=(1n<<64n)+v;
    for(let i=0n;i<8n;i++) this.push(Number((v>>(8n*i))&255n));
  }
  f32(v){ const b=new Uint8Array(4); new DataView(b.buffer).setFloat32(0,Number(v),true); this.bytes(b); }
  f64(v){ const b=new Uint8Array(8); new DataView(b.buffer).setFloat64(0,Number(v),true); this.bytes(b); }
  u16(v){ this.push(v, v>>8); }
  str(s){ const b=encoder.encode(String(s)); if(b.length>65535) throw new Error('String too long'); this.u16(b.length); this.bytes(b); }
  bytes(b){ for(const x of b) this.a.push(x); }
  out(){ return Uint8Array.from(this.a); }
}

function node(type, value, extra={}) { return { type, value, ...extra }; }

function readPayload(r, type) {
  switch(type){
    case TAG.BYTE: return node(type, r.i8());
    case TAG.SHORT: return node(type, r.i16());
    case TAG.INT: return node(type, r.i32());
    case TAG.LONG: return node(type, r.i64());
    case TAG.FLOAT: return node(type, r.f32());
    case TAG.DOUBLE: return node(type, r.f64());
    case TAG.BYTE_ARRAY: { const n=r.i32(); if(n<0) throw new Error('Negative byte-array length'); return node(type, r.raw(n)); }
    case TAG.STRING: return node(type, r.str());
    case TAG.LIST: {
      const elemType=r.u8(); const n=r.i32(); if(n<0) throw new Error('Negative list length');
      const arr=[]; for(let i=0;i<n;i++) arr.push(readPayload(r,elemType));
      return node(type, arr, { elemType });
    }
    case TAG.COMPOUND: {
      const entries=[];
      while(true){ const t=r.u8(); if(t===TAG.END) break; const name=r.str(); entries.push({name, node:readPayload(r,t)}); }
      return node(type, entries);
    }
    case TAG.INT_ARRAY: { const n=r.i32(); if(n<0) throw new Error('Negative int-array length'); const a=[]; for(let i=0;i<n;i++)a.push(r.i32()); return node(type,a); }
    case TAG.LONG_ARRAY: { const n=r.i32(); if(n<0) throw new Error('Negative long-array length'); const a=[]; for(let i=0;i<n;i++)a.push(r.i64()); return node(type,a); }
    default: throw new Error(`Unsupported NBT tag type ${type}`);
  }
}

function writePayload(w, n) {
  switch(n.type){
    case TAG.BYTE: w.i8(n.value); break;
    case TAG.SHORT: w.i16(n.value); break;
    case TAG.INT: w.i32(n.value); break;
    case TAG.LONG: w.i64(n.value); break;
    case TAG.FLOAT: w.f32(n.value); break;
    case TAG.DOUBLE: w.f64(n.value); break;
    case TAG.BYTE_ARRAY: w.i32(n.value.length); w.bytes(n.value); break;
    case TAG.STRING: w.str(n.value); break;
    case TAG.LIST: w.push(n.elemType); w.i32(n.value.length); for(const x of n.value) writePayload(w,x); break;
    case TAG.COMPOUND:
      for(const e of n.value){ w.push(e.node.type); w.str(e.name); writePayload(w,e.node); }
      w.push(TAG.END); break;
    case TAG.INT_ARRAY: w.i32(n.value.length); for(const x of n.value)w.i32(x); break;
    case TAG.LONG_ARRAY: w.i32(n.value.length); for(const x of n.value)w.i64(x); break;
    default: throw new Error(`Unsupported write type ${n.type}`);
  }
}

export function parseLevelDat(bytes){
  const u8=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(u8.length<9) throw new Error('File is too small to be a Bedrock level.dat');
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  const version=dv.getInt32(0,true); const declared=dv.getUint32(4,true);
  if(declared>u8.length-8) throw new Error(`level.dat header declares ${declared} payload bytes but file only contains ${u8.length-8}`);
  const payload=u8.subarray(8,8+declared);
  const r=new Reader(payload);
  const type=r.u8(); if(type!==TAG.COMPOUND) throw new Error(`Root tag is ${TAG_NAMES[type]??type}, expected Compound`);
  const name=r.str(); const root=readPayload(r,type);
  return {version, declaredLength:declared, rootName:name, root, trailing:u8.slice(8+declared)};
}

export function buildLevelDat(doc){
  const pw=new Writer(); pw.push(TAG.COMPOUND); pw.str(doc.rootName??''); writePayload(pw,doc.root);
  const payload=pw.out(); const out=new Uint8Array(8+payload.length+(doc.trailing?.length||0));
  const dv=new DataView(out.buffer); dv.setInt32(0,doc.version??10,true); dv.setUint32(4,payload.length,true);
  out.set(payload,8); if(doc.trailing?.length)out.set(doc.trailing,8+payload.length); return out;
}

export function parseNBT(bytes, {rootNamed=true}={}){
  const r=new Reader(bytes); const type=r.u8(); if(type===TAG.END) return {rootName:'',root:node(TAG.END,null)};
  const name=rootNamed?r.str():''; const root=readPayload(r,type); return {rootName:name,root,bytesRead:r.o};
}
export function buildNBT(doc,{rootNamed=true}={}){ const w=new Writer(); w.push(doc.root.type); if(rootNamed)w.str(doc.rootName??''); writePayload(w,doc.root); return w.out(); }

export function getChild(compound,name){ if(!compound||compound.type!==TAG.COMPOUND)return null; return compound.value.find(e=>e.name===name)?.node??null; }
export function getEntry(compound,name){ if(!compound||compound.type!==TAG.COMPOUND)return null; return compound.value.find(e=>e.name===name)??null; }
export function setChild(compound,name,newNode){
  if(!compound||compound.type!==TAG.COMPOUND) throw new Error('setChild target must be a Compound');
  const e=compound.value.find(e=>e.name===name); if(e)e.node=newNode; else compound.value.push({name,node:newNode}); return newNode;
}
export function deleteChild(compound,name){ if(!compound||compound.type!==TAG.COMPOUND)return false; const i=compound.value.findIndex(e=>e.name===name); if(i<0)return false; compound.value.splice(i,1); return true; }

export function cloneNode(n){
  if(!n)return n;
  if(n.type===TAG.COMPOUND)return node(n.type,n.value.map(e=>({name:e.name,node:cloneNode(e.node)})));
  if(n.type===TAG.LIST)return node(n.type,n.value.map(cloneNode),{elemType:n.elemType});
  if(n.type===TAG.BYTE_ARRAY)return node(n.type,new Uint8Array(n.value));
  if(Array.isArray(n.value))return node(n.type,n.value.slice());
  return node(n.type,n.value);
}

export function scalarValue(n){ return n?.value; }
export function makeNode(typeName,value){
  const type=typeof typeName==='number'?typeName:TAG_NAMES.indexOf(typeName);
  if(type<0)throw new Error('Unknown tag type');
  if(type===TAG.LONG)value=BigInt(value);
  if(type===TAG.BYTE_ARRAY)value=value instanceof Uint8Array?value:Uint8Array.from(value||[]);
  if(type===TAG.COMPOUND)value=value||[];
  if(type===TAG.LIST)return node(type,value?.items||[],{elemType:value?.elemType??TAG.COMPOUND});
  return node(type,value);
}

export function nbtToPlain(n){
  if(!n)return null;
  switch(n.type){
    case TAG.COMPOUND: return Object.fromEntries(n.value.map(e=>[e.name,nbtToPlain(e.node)]));
    case TAG.LIST: return n.value.map(nbtToPlain);
    case TAG.BYTE_ARRAY: return Array.from(n.value);
    case TAG.LONG: return n.value.toString();
    case TAG.LONG_ARRAY: return n.value.map(x=>x.toString());
    default:return n.value;
  }
}

export { TAG, TAG_NAMES };
