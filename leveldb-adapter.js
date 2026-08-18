import {loadChunkedGzip,importSource} from './chunk-loader.js?v=0.6.1';
const s=await loadChunkedGzip(['./chunks/leveldb-00.bin','./chunks/leveldb-01.bin','./chunks/leveldb-02.bin']);const m=await importSource(s);
export const BedrockLevelDBAdapter=m.BedrockLevelDBAdapter,LevelDBInternals=m.LevelDBInternals,setLevelDBIntegrityCore=m.setLevelDBIntegrityCore;
