import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unzip, zip } from '../zip.js';
import { parseNBT, buildNBT, TAG, getChild, getEntry } from '../nbt.js';
import { BedrockLevelDBAdapter, LevelDBInternals } from '../leveldb-adapter.js';

const here=dirname(fileURLToPath(import.meta.url));
const root=dirname(here);
const fixture=(name)=>new Uint8Array(fs.readFileSync(join(root,'test-fixtures',name)));
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};

const te=new TextEncoder();
assert(LevelDBInternals.crc32c(te.encode('123456789'))===0xe3069283,'CRC32C standard vector failed');

const playerBytes=fixture('demo-player.nbt');
const player=parseNBT(playerBytes,{rootNamed:true});
assert(player.root.type===TAG.COMPOUND,'Player fixture root is not a compound');
assert(getChild(player.root,'Inventory')?.type===TAG.LIST,'Player fixture has no Inventory list');
const playerRoundTrip=buildNBT(player,{rootNamed:true});
assert(playerRoundTrip.length===playerBytes.length && playerRoundTrip.every((b,i)=>b===playerBytes[i]),'NBT round-trip changed bytes');

const originalMap=await unzip(fixture('demo-world-leveldb.mcworld'));
const db=new BedrockLevelDBAdapter();
await db.open(originalMap);
const before=await db.get('~local_player');
assert(before && before.sequence===100n,'Could not recover expected ~local_player sequence 100');
const edited=parseNBT(before.value,{rootNamed:true});
const lvl=getEntry(edited.root,'PlayerLevel');
if(lvl)lvl.node.value=77;
await db.put('~local_player',buildNBT(edited,{rootNamed:true}));
const overlay=await db.exportFiles();
assert(Object.keys(overlay).length===1,'Expected one recovery WAL overlay');
const editedMap={...originalMap,...overlay};
const db2=new BedrockLevelDBAdapter();
await db2.open(editedMap);
const after=await db2.get('~local_player');
assert(after && after.sequence===101n,'Recovery WAL did not supersede original player record');
if(lvl){
  const reopened=parseNBT(after.value,{rootNamed:true});
  assert(Number(getChild(reopened.root,'PlayerLevel').value)===77,'Edited player level was not recovered');
}
const repacked=await zip(editedMap,{compress:true});
const reopenedMap=await unzip(repacked);
assert(Object.keys(reopenedMap).length===Object.keys(editedMap).length,'ZIP repack lost files');

const big=new Uint8Array(100000); for(let i=0;i<big.length;i++)big[i]=i&255;
const fragDb=new BedrockLevelDBAdapter(); await fragDb.open({'db/000010.log':new Uint8Array()});
await fragDb.put('large-test-record',big); const fragOverlay=await fragDb.exportFiles();
const fragDb2=new BedrockLevelDBAdapter(); await fragDb2.open({'db/000010.log':new Uint8Array(),...fragOverlay});
const frag=await fragDb2.get('large-test-record');
assert(frag?.value.length===big.length,'Fragmented WAL value length mismatch');
for(const i of [0,32767,32768,65535,99999])assert(frag.value[i]===big[i],`Fragmented WAL mismatch at ${i}`);

console.log('Bedrock Web Editor v0.2.1-alpha self-test: PASS');
console.log(`  local player: seq ${before.sequence} -> ${after.sequence}`);
console.log(`  overlay: ${Object.keys(overlay)[0]}`);
console.log(`  fragmented WAL: ${big.length} bytes`);
console.log(`  repacked archive: ${repacked.length} bytes`);
