import { TAG, parseNBT, buildNBT, getChild } from './nbt.js?v=0.6.1';

function asBytes(value){
  if(value instanceof Uint8Array)return value;
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  return new TextEncoder().encode(String(value??''));
}

export function bytesToHex(value){
  let out='';
  for(const byte of asBytes(value))out+=byte.toString(16).padStart(2,'0');
  return out;
}

export function parseBedrockDbKey(value){
  const bytes=asBytes(value);
  if(bytes.length!==9&&bytes.length<13)return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return {
    x:view.getInt32(0,true),
    z:view.getInt32(4,true),
    dimension:bytes.length>=13?view.getInt32(8,true):0,
    type:bytes[bytes.length===9?8:12],
    raw:bytes.slice(),
  };
}

function parseSequenceDocument(bytes,offset){
  if(bytes[offset]!==TAG.COMPOUND)throw new Error(`Tile NBT at byte ${offset} is not a compound root.`);
  const likelyNamed=offset+2<bytes.length&&bytes[offset+1]===0&&bytes[offset+2]===0;
  let lastError=null;
  for(const rootNamed of likelyNamed?[true,false]:[false,true]){
    try{
      const doc=parseNBT(bytes.subarray(offset),{rootNamed});
      if(doc.root?.type!==TAG.COMPOUND||!Number.isInteger(doc.bytesRead)||doc.bytesRead<=0)continue;
      doc._rootNamed=rootNamed;
      return doc;
    }catch(error){lastError=error;}
  }
  throw lastError||new Error(`Could not parse tile NBT at byte ${offset}.`);
}

export function parseNbtSequence(value){
  const bytes=asBytes(value);
  const docs=[];
  let offset=0;
  while(offset<bytes.length){
    const rest=bytes.subarray(offset);
    if(rest.every(byte=>byte===0))break;
    const doc=parseSequenceDocument(bytes,offset);
    if(offset+doc.bytesRead>bytes.length)throw new Error('Tile NBT extends beyond its LevelDB value.');
    docs.push(doc);
    offset+=doc.bytesRead;
  }
  return docs;
}

export function buildNbtSequence(docs){
  const parts=(docs||[]).map(doc=>buildNBT(doc,{rootNamed:doc?._rootNamed!==false}));
  const length=parts.reduce((sum,part)=>sum+part.length,0);
  const output=new Uint8Array(length);
  let offset=0;
  for(const part of parts){output.set(part,offset);offset+=part.length;}
  return output;
}

function scalar(node,names,fallback){
  for(const name of names){
    const child=getChild(node,name);
    if(child&&child.value!==undefined&&child.value!==null)return child.value;
  }
  return fallback;
}

export function tileId(node){
  return String(scalar(node,['id','Id','identifier','Identifier'],'Unknown tile'));
}

export function tilePos(node){
  return {
    x:Number(scalar(node,['x','X'],0)),
    y:Number(scalar(node,['y','Y'],0)),
    z:Number(scalar(node,['z','Z'],0)),
  };
}

export function containerSlotCount(node){
  const id=tileId(node).toLowerCase().replace(/[^a-z]/g,'');
  const sizes=[
    ['chiseledbookshelf',6],['brewingstand',5],['blastfurnace',3],
    ['furnace',3],['smoker',3],['hopper',5],['dispenser',9],
    ['dropper',9],['crafter',9],['campfire',4],['lectern',1],
    ['jukebox',1],['chest',27],['barrel',27],['shulkerbox',27],
  ];
  const configured=sizes.find(([name])=>id.includes(name))?.[1]||0;
  const items=getChild(node,'Items');
  let observed=0;
  if(items?.type===TAG.LIST){
    observed=items.value.length;
    for(const item of items.value){
      const slot=Number(scalar(item,['Slot','slot'],-1));
      if(Number.isInteger(slot)&&slot>=0)observed=Math.max(observed,slot+1);
    }
  }
  return Math.max(1,configured||observed||27,observed);
}
