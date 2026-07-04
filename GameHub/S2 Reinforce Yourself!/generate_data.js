// generate_data.js — produces corrected NODES, EDGES_RAW, TERM_EDGES

function mirror(b){return b[2]+b[1]+b[0]+b[5]+b[4]+b[3]+b[8]+b[7]+b[6]}
function can(b){const m=mirror(b);return b<=m?b:m}
function winner(b){
  if(b[0]==='1'||b[1]==='1'||b[2]==='1')return 1;
  if(b[6]==='2'||b[7]==='2'||b[8]==='2')return -1;
  if(!b.includes('2'))return 1;
  if(!b.includes('1'))return -1;
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

// Build tree
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

// Minimax
const mmc={};
function mm(b,t){
  const k=b+':'+t;if(k in mmc)return mmc[k];
  const w=winner(b);if(w)return mmc[k]=w;
  const ms=legalMoves(b,t);if(!ms.length)return mmc[k]=t===1?-1:1;
  const nt=t===1?2:1;let best=t===1?-2:2;
  for(const mb of ms){const v=mm(mb,nt);best=t===1?Math.max(best,v):Math.min(best,v)}
  return mmc[k]=best;
}

// Existing nodes — preserve their IDs and board strings
const EN=[{id:0,board:"222000111",turn:1},{id:1,board:"222100011",turn:2},{id:2,board:"222010101",turn:2},{id:3,board:"202120011",turn:1},{id:4,board:"202200011",turn:1},{id:5,board:"220102011",turn:1},{id:6,board:"022210101",turn:1},{id:7,board:"022020101",turn:1},{id:9,board:"202110010",turn:2},{id:10,board:"202210001",turn:2},{id:11,board:"202100001",turn:2},{id:12,board:"202201010",turn:2},{id:14,board:"220112001",turn:2},{id:15,board:"220101001",turn:2},{id:17,board:"022120001",turn:2},{id:18,board:"022010001",turn:2},{id:19,board:"022021100",turn:2},{id:20,board:"022010100",turn:2},{id:21,board:"002120010",turn:1},{id:22,board:"200112010",turn:1},{id:24,board:"002220001",turn:1},{id:25,board:"200212001",turn:1},{id:26,board:"200220001",turn:1},{id:31,board:"020122001",turn:1},{id:32,board:"200121001",turn:1},{id:33,board:"200201001",turn:1},{id:37,board:"020020001",turn:1},{id:40,board:"020012100",turn:1},{id:44,board:"200111000",turn:2},{id:46,board:"002210000",turn:2},{id:49,board:"200221000",turn:2},{id:50,board:"200210000",turn:2},{id:53,board:"020112000",turn:2},{id:56,board:"020021000",turn:2},{id:58,board:"000121000",turn:1},{id:59,board:"000212000",turn:1}];

const keyToExistingId={};
const existingBoard={};
EN.forEach(n=>{
  const k=can(n.board)+':'+n.turn;
  keyToExistingId[k]=n.id;
  existingBoard[k]=n.board; // preserve original board string
});

// Assign IDs
const usedIds=new Set(EN.map(n=>n.id));
let nextId=60;
const keyToId={};
const ckeys=Object.keys(computed).sort((a,b)=>computed[a].depth-computed[b].depth||a.localeCompare(b));
ckeys.forEach(k=>{
  if(keyToExistingId[k]!==undefined){keyToId[k]=keyToExistingId[k]}
  else{while(usedIds.has(nextId))nextId++;keyToId[k]=nextId;usedIds.add(nextId);nextId++}
});

// Build NODES
const NODES_OUT=ckeys.map(k=>{
  const n=computed[k];
  return{id:keyToId[k],board:existingBoard[k]||n.board,turn:n.turn,depth:n.depth,mm:mm(n.board,n.turn)};
}).sort((a,b)=>a.id-b.id);

// Build EDGES_RAW
const EDGES_OUT=[];
ckeys.forEach(k=>{
  const fid=keyToId[k];
  computed[k].children.forEach(ck=>EDGES_OUT.push({from:fid,to:keyToId[ck]}));
});

// Build TERM_EDGES (win:1=white wins, win:-1=black wins)
const TERMS_OUT=[];
ckeys.forEach(k=>{
  const fid=keyToId[k];
  computed[k].wins.forEach(w=>TERMS_OUT.push({from:fid,win:w}));
});

console.log('const NODES='+JSON.stringify(NODES_OUT)+';');
console.log('const EDGES_RAW='+JSON.stringify(EDGES_OUT)+';');
console.log('const TERM_EDGES='+JSON.stringify(TERMS_OUT)+';');

// Summary of changes
console.log('\n// New nodes added:');
ckeys.forEach(k=>{
  if(keyToExistingId[k]===undefined){
    const n=computed[k];
    console.log('//  id='+keyToId[k]+' board='+n.board+' turn='+n.turn+' depth='+n.depth+' mm='+mm(n.board,n.turn));
  }
});
