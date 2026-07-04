// renumber.js — renumber nodes 0–41 sequentially, sorted by (depth, old_id)

const OLD_NODES=[{id:0,board:"222000111",turn:1,depth:0,mm:-1},{id:1,board:"222100011",turn:2,depth:1,mm:-1},{id:2,board:"222010101",turn:2,depth:1,mm:-1},{id:3,board:"202120011",turn:1,depth:2,mm:1},{id:4,board:"202200011",turn:1,depth:2,mm:-1},{id:5,board:"220102011",turn:1,depth:2,mm:1},{id:6,board:"022210101",turn:1,depth:2,mm:1},{id:7,board:"022020101",turn:1,depth:2,mm:-1},{id:9,board:"202110010",turn:2,depth:3,mm:-1},{id:10,board:"202210001",turn:2,depth:3,mm:-1},{id:11,board:"202100001",turn:2,depth:3,mm:-1},{id:12,board:"202201010",turn:2,depth:3,mm:-1},{id:14,board:"220112001",turn:2,depth:3,mm:1},{id:15,board:"220101001",turn:2,depth:3,mm:-1},{id:17,board:"022120001",turn:2,depth:3,mm:-1},{id:18,board:"022010001",turn:2,depth:3,mm:-1},{id:19,board:"022021100",turn:2,depth:3,mm:-1},{id:20,board:"022010100",turn:2,depth:3,mm:-1},{id:21,board:"002120010",turn:1,depth:4,mm:1},{id:22,board:"200112010",turn:1,depth:4,mm:1},{id:24,board:"002220001",turn:1,depth:4,mm:-1},{id:25,board:"200212001",turn:1,depth:4,mm:1},{id:26,board:"200220001",turn:1,depth:4,mm:-1},{id:31,board:"020122001",turn:1,depth:4,mm:1},{id:32,board:"200121001",turn:1,depth:4,mm:1},{id:33,board:"200201001",turn:1,depth:4,mm:1},{id:37,board:"020020001",turn:1,depth:4,mm:1},{id:40,board:"020012100",turn:1,depth:4,mm:-1},{id:44,board:"200111000",turn:2,depth:5,mm:1},{id:46,board:"002210000",turn:2,depth:5,mm:-1},{id:49,board:"200221000",turn:2,depth:5,mm:-1},{id:50,board:"200210000",turn:2,depth:5,mm:-1},{id:53,board:"020112000",turn:2,depth:5,mm:-1},{id:56,board:"020021000",turn:2,depth:5,mm:-1},{id:58,board:"000121000",turn:1,depth:6,mm:1},{id:59,board:"000212000",turn:1,depth:6,mm:1},{id:60,board:"202121010",turn:2,depth:3,mm:1},{id:61,board:"002021010",turn:1,depth:4,mm:-1},{id:62,board:"002201100",turn:1,depth:4,mm:-1},{id:63,board:"020012001",turn:1,depth:4,mm:-1},{id:64,board:"002221000",turn:2,depth:5,mm:-1},{id:65,board:"020010000",turn:2,depth:5,mm:1}];

const OLD_EDGES=[{from:0,to:1},{from:0,to:2},{from:1,to:5},{from:1,to:3},{from:1,to:4},{from:2,to:6},{from:2,to:7},{from:7,to:17},{from:7,to:18},{from:7,to:19},{from:7,to:20},{from:5,to:14},{from:5,to:15},{from:6,to:14},{from:4,to:12},{from:4,to:10},{from:4,to:11},{from:3,to:60},{from:3,to:9},{from:18,to:63},{from:18,to:37},{from:20,to:40},{from:20,to:37},{from:19,to:26},{from:15,to:32},{from:15,to:62},{from:15,to:33},{from:17,to:24},{from:17,to:31},{from:14,to:25},{from:14,to:31},{from:11,to:62},{from:9,to:22},{from:9,to:61},{from:9,to:21},{from:10,to:25},{from:10,to:26},{from:10,to:24},{from:26,to:49},{from:26,to:50},{from:32,to:44},{from:22,to:44},{from:24,to:64},{from:24,to:46},{from:40,to:53},{from:37,to:56},{from:37,to:65},{from:31,to:53},{from:44,to:58},{from:46,to:59},{from:53,to:59}];

const OLD_TERMS=[{from:5,win:1},{from:6,win:1},{from:19,win:-1},{from:17,win:-1},{from:10,win:-1},{from:12,win:-1},{from:60,win:1},{from:61,win:-1},{from:33,win:1},{from:21,win:1},{from:32,win:1},{from:62,win:-1},{from:22,win:1},{from:25,win:1},{from:63,win:-1},{from:31,win:1},{from:50,win:-1},{from:49,win:-1},{from:46,win:-1},{from:64,win:-1},{from:65,win:1},{from:56,win:-1},{from:53,win:-1},{from:58,win:1},{from:59,win:1}];

// Sort by depth, then by old id
const sorted=[...OLD_NODES].sort((a,b)=>a.depth-b.depth||a.id-b.id);

// Build mapping old_id -> new sequential id
const remap={};
sorted.forEach((n,i)=>remap[n.id]=i);

// New NODES
const NODES=sorted.map(n=>({id:remap[n.id],board:n.board,turn:n.turn,depth:n.depth,mm:n.mm}));

// New EDGES
const EDGES=OLD_EDGES.map(e=>({from:remap[e.from],to:remap[e.to]}));

// New TERMS
const TERMS=OLD_TERMS.map(t=>({from:remap[t.from],win:t.win}));

console.log('const NODES='+JSON.stringify(NODES)+';');
console.log('const EDGES_RAW='+JSON.stringify(EDGES)+';');
console.log('const TERM_EDGES='+JSON.stringify(TERMS)+';');

// Print mapping for reference
console.log('\n// ID remapping (old -> new):');
Object.entries(remap).sort((a,b)=>Number(a[0])-Number(b[0])).forEach(([o,n])=>console.log(`//  ${o} -> ${n}`));
