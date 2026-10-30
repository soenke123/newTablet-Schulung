// verify_tree.js — Brettspiel 3x3 game tree verifier

function mirror(b){return b[2]+b[1]+b[0]+b[5]+b[4]+b[3]+b[8]+b[7]+b[6]}
function can(b){const m=mirror(b);return b<=m?b:m}
function winner(b){
  if(b[0]==='1'||b[1]==='1'||b[2]==='1')return 1;   // white pawn at row 0
  if(b[6]==='2'||b[7]==='2'||b[8]==='2')return -1;   // black pawn at row 2
  if(!b.includes('2'))return 1;                        // all black captured
  if(!b.includes('1'))return -1;                       // all white captured
  return 0;
}
function legalMoves(b,t){
  const res=[];
  for(let p=0;p<9;p++){
    if(b[p]!==String(t))continue;
    const r=Math.floor(p/3),c=p%3;
    const mk=(fr,to,v)=>{const x=b.split('');x[fr]='0';x[to]=String(v);return x.join('')};
    if(t===1){
      if(r>0&&b[p-3]==='0')res.push(mk(p,p-3,1));
      if(r>0&&c>0&&b[p-4]==='2')res.push(mk(p,p-4,1));
      if(r>0&&c<2&&b[p-2]==='2')res.push(mk(p,p-2,1));
    }else{
      if(r<2&&b[p+3]==='0')res.push(mk(p,p+3,2));
      if(r<2&&c>0&&b[p+2]==='1')res.push(mk(p,p+2,2));
      if(r<2&&c<2&&b[p+4]==='1')res.push(mk(p,p+4,2));
    }
  }
  return res;
}

// Build complete game tree via BFS
const computed={};
const queue=[['222000111',1,0]];
let qi=0;
while(qi<queue.length){
  const[b,t,d]=queue[qi++];
  const cb=can(b),k=cb+':'+t;
  if(computed[k])continue;
  computed[k]={board:cb,turn:t,depth:d,children:new Set(),wins:new Set()};
  const ms=legalMoves(cb,t),nt=t===1?2:1;
  if(ms.length===0){computed[k].wins.add(t===1?-1:1);continue}
  for(const mb of ms){
    const w=winner(mb);
    if(w!==0)computed[k].wins.add(w);
    else{const ck=can(mb)+':'+nt;computed[k].children.add(ck);queue.push([can(mb),nt,d+1])}
  }
}

// Minimax (non-canonical, works by symmetry)
const mmcache={};
function mm(b,t){
  const k=b+':'+t;if(k in mmcache)return mmcache[k];
  const w=winner(b);if(w)return mmcache[k]=w;
  const ms=legalMoves(b,t);if(!ms.length)return mmcache[k]=t===1?-1:1;
  const nt=t===1?2:1;let best=t===1?-2:2;
  for(const mb of ms){const v=mm(mb,nt);best=t===1?Math.max(best,v):Math.min(best,v)}
  return mmcache[k]=best;
}

const ckeys=Object.keys(computed).sort((a,b)=>computed[a].depth-computed[b].depth||a.localeCompare(b));
console.log('=== COMPUTED GAME TREE ===');
console.log('Total canonical nodes:',ckeys.length,'\n');
ckeys.forEach(k=>{
  const n=computed[k];
  n.mm=mm(n.board,n.turn);
  console.log(`${k}  depth=${n.depth}  mm=${n.mm}`);
  [...n.children].forEach(ck=>console.log(`  -> child: ${ck}`));
  [...n.wins].forEach(w=>console.log(`  -> WIN: ${w>0?'white':'black'}`));
});

// ——— Existing data ———
const EN=[{id:0,board:"222000111",turn:1,depth:0,mm:-1},{id:1,board:"222100011",turn:2,depth:1,mm:-1},{id:2,board:"222010101",turn:2,depth:1,mm:-1},{id:3,board:"202120011",turn:1,depth:2,mm:1},{id:4,board:"202200011",turn:1,depth:2,mm:-1},{id:5,board:"220102011",turn:1,depth:2,mm:1},{id:6,board:"022210101",turn:1,depth:2,mm:1},{id:7,board:"022020101",turn:1,depth:2,mm:-1},{id:9,board:"202110010",turn:2,depth:3,mm:-1},{id:10,board:"202210001",turn:2,depth:3,mm:-1},{id:11,board:"202100001",turn:2,depth:3,mm:-1},{id:12,board:"202201010",turn:2,depth:3,mm:-1},{id:14,board:"220112001",turn:2,depth:3,mm:1},{id:15,board:"220101001",turn:2,depth:3,mm:-1},{id:17,board:"022120001",turn:2,depth:3,mm:-1},{id:18,board:"022010001",turn:2,depth:3,mm:-1},{id:19,board:"022021100",turn:2,depth:3,mm:-1},{id:20,board:"022010100",turn:2,depth:3,mm:-1},{id:21,board:"002120010",turn:1,depth:4,mm:1},{id:22,board:"200112010",turn:1,depth:4,mm:1},{id:24,board:"002220001",turn:1,depth:4,mm:-1},{id:25,board:"200212001",turn:1,depth:4,mm:1},{id:26,board:"200220001",turn:1,depth:4,mm:-1},{id:31,board:"020122001",turn:1,depth:4,mm:1},{id:32,board:"200121001",turn:1,depth:4,mm:1},{id:33,board:"200201001",turn:1,depth:4,mm:1},{id:37,board:"020020001",turn:1,depth:4,mm:1},{id:40,board:"020012100",turn:1,depth:4,mm:-1},{id:44,board:"200111000",turn:2,depth:5,mm:1},{id:46,board:"002210000",turn:2,depth:5,mm:-1},{id:49,board:"200221000",turn:2,depth:5,mm:-1},{id:50,board:"200210000",turn:2,depth:5,mm:-1},{id:53,board:"020112000",turn:2,depth:5,mm:-1},{id:56,board:"020021000",turn:2,depth:5,mm:-1},{id:58,board:"000121000",turn:1,depth:6,mm:1},{id:59,board:"000212000",turn:1,depth:6,mm:1},{id:60,board:"202121010",turn:2,depth:3,mm:1},{id:61,board:"002021010",turn:1,depth:4,mm:-1},{id:62,board:"002201100",turn:1,depth:4,mm:-1},{id:63,board:"020012001",turn:1,depth:4,mm:-1},{id:64,board:"002221000",turn:2,depth:5,mm:-1},{id:65,board:"020010000",turn:2,depth:5,mm:1}];
const EE=[{from:0,to:1},{from:0,to:2},{from:1,to:5},{from:1,to:3},{from:1,to:4},{from:2,to:6},{from:2,to:7},{from:7,to:17},{from:7,to:18},{from:7,to:19},{from:7,to:20},{from:5,to:14},{from:5,to:15},{from:6,to:14},{from:4,to:12},{from:4,to:10},{from:4,to:11},{from:3,to:60},{from:3,to:9},{from:18,to:63},{from:18,to:37},{from:20,to:40},{from:20,to:37},{from:19,to:26},{from:15,to:32},{from:15,to:62},{from:15,to:33},{from:17,to:24},{from:17,to:31},{from:14,to:25},{from:14,to:31},{from:11,to:62},{from:9,to:22},{from:9,to:61},{from:9,to:21},{from:10,to:25},{from:10,to:26},{from:10,to:24},{from:26,to:49},{from:26,to:50},{from:32,to:44},{from:22,to:44},{from:24,to:64},{from:24,to:46},{from:40,to:53},{from:37,to:56},{from:37,to:65},{from:31,to:53},{from:44,to:58},{from:46,to:59},{from:53,to:59}];
const ET=[{from:5,win:1},{from:6,win:1},{from:19,win:-1},{from:17,win:-1},{from:10,win:-1},{from:12,win:-1},{from:60,win:1},{from:61,win:-1},{from:33,win:1},{from:21,win:1},{from:32,win:1},{from:62,win:-1},{from:22,win:1},{from:25,win:1},{from:63,win:-1},{from:31,win:1},{from:50,win:-1},{from:49,win:-1},{from:46,win:-1},{from:64,win:-1},{from:65,win:1},{from:56,win:-1},{from:53,win:-1},{from:58,win:1},{from:59,win:1}];

const nmap=new Map(EN.map(n=>[n.id,n]));
const idToKey={};EN.forEach(n=>{idToKey[n.id]=can(n.board)+':'+n.turn});
const keyToId={};EN.forEach(n=>{keyToId[can(n.board)+':'+n.turn]=n.id});

// Term edges by fromId (deduplicated)
const termByFrom={};
ET.forEach(t=>{if(!termByFrom[t.from])termByFrom[t.from]={};termByFrom[t.from][t.win]=true});

console.log('\n=== VERIFICATION ===\n');

// 1. Check existing nodes against computed
console.log('--- Existing nodes vs computed ---');
let nodeOk=true;
EN.forEach(n=>{
  const ck=can(n.board)+':'+n.turn;
  if(!computed[ck]){console.log(`MISSING in computed: id=${n.id} board=${n.board} can=${can(n.board)}:${n.turn}`);nodeOk=false}
  else{
    const cmm=mm(n.board,n.turn);
    if(n.mm!==cmm){console.log(`MM WRONG: id=${n.id} board=${n.board} existing=${n.mm} correct=${cmm}`);nodeOk=false}
  }
});

// 2. Check computed nodes against existing
ckeys.forEach(k=>{
  if(keyToId[k]===undefined){
    const n=computed[k];
    console.log(`EXTRA node in computed (not in existing): ${k} depth=${n.depth} mm=${n.mm}`);
    nodeOk=false;
  }
});
if(nodeOk)console.log('All nodes OK.');

// 3. Check EDGES_RAW
console.log('\n--- Edge verification ---');
let edgeOk=true;
EE.forEach(e=>{
  const fromN=nmap.get(e.from),toN=nmap.get(e.to);
  if(!fromN||!toN)return;
  const fk=can(fromN.board)+':'+fromN.turn;
  const tk=can(toN.board)+':'+toN.turn;
  const fn=computed[fk];
  if(!fn){console.log(`EDGE ${e.from}->${e.to}: from-node not in computed`);edgeOk=false;return}
  if(!fn.children.has(tk)){
    console.log(`INVALID EDGE ${e.from}->${e.to}: move not legal`);
    console.log(`  from ${fk} (${fromN.board})`);
    console.log(`  to   ${tk} (${toN.board})`);
    console.log(`  actual children: ${[...fn.children].join(' | ')}`);
    edgeOk=false;
  }
});

// 4. Check for missing edges
ckeys.forEach(k=>{
  const fn=computed[k];
  const fid=keyToId[k];
  if(fid===undefined)return;
  fn.children.forEach(ck=>{
    const cid=keyToId[ck];
    if(cid===undefined)return;
    const exists=EE.some(e=>e.from===fid&&e.to===cid);
    if(!exists){console.log(`MISSING EDGE: ${fid}->${cid}  (${k} -> ${ck})`);edgeOk=false}
  });
});
if(edgeOk)console.log('All edges OK.');

// 5. Check terminal edges
console.log('\n--- Terminal edge verification ---');
let termOk=true;
EN.forEach(n=>{
  const ck=can(n.board)+':'+n.turn;
  const fn=computed[ck];
  if(!fn)return;
  fn.wins.forEach(w=>{
    const hasIt=termByFrom[n.id]&&termByFrom[n.id][w];
    if(!hasIt){console.log(`MISSING TERM_EDGE: from=${n.id} (${n.board}) win=${w>0?'white(1)':'black(-1)'}`);termOk=false}
  });
  if(termByFrom[n.id]){
    Object.keys(termByFrom[n.id]).forEach(w=>{
      if(!fn.wins.has(Number(w))){console.log(`SPURIOUS TERM_EDGE: from=${n.id} (${n.board}) win=${w} — not valid`);termOk=false}
    });
  }
  // Check nodes with TERM edges but no regular edges (should still have them)
  const hasTermInData=!!termByFrom[n.id];
  const hasTermComputed=fn.wins.size>0;
  if(hasTermComputed&&!hasTermInData){console.log(`MISSING ALL TERM_EDGES for node ${n.id}`);termOk=false}
});
if(termOk)console.log('All terminal edges OK.');

console.log('\n=== DONE ===');
