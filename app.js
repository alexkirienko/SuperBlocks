/************************************************************
 *   APP.JS
 *   - Все механики (Ghost Piece, Combo, Drag&Drop и т.д.)
 *   - Подсчет очков на сервере (actions: startGame, lineCleared, gameOver)
 *   - Лидерборд хранится Тоже на сервере (actions: getLeaderboard, addScore)
 ************************************************************/

////////////////////////////////////////////////////////////
// 1. CONSTANTS & GLOBALS
////////////////////////////////////////////////////////////
const BOARD_COLS=8, BOARD_ROWS=8, BOARD_CELL_SIZE=45;
const BOARD_X=45, BOARD_Y=45;
const CANVAS_WIDTH=450, CANVAS_HEIGHT=650;

const PREVIEW_Y= BOARD_Y+ BOARD_ROWS*BOARD_CELL_SIZE+ 40;
const PREVIEW_SCALE= 25/45;
const LEFT_MARGIN=10, RIGHT_MARGIN=10;

let canvas, ctx;
let board=[];
let activePieces=[];
let draggingPiece=null;
let offsetX=0, offsetY=0;
let isGameOverFlag=false;

// Particles (explosion)
let particles=[];

// Floating texts
let floatingTexts=[];

// Локальная combo (частично)
let comboStreak=1, comboTurnsLeft=0;

// Ghost piece
let showGhost=true;
let ghostX=0, ghostY=0;
let ghostValid=false;
let ghostOverBoardEnough=false;

// Score - хранит текущее значение, вернется с сервера
let score=0;
let sessionId=null;

// SERVER ENDPOINT
const SERVER_URL="https://<your-project-id>.cloudfunctions.net/gameApi"; 
// Замените <your-project-id> на реальный

////////////////////////////////////////////////////////////
// 2. INIT
////////////////////////////////////////////////////////////
window.addEventListener('load', ()=>{
  canvas= document.getElementById("gameCanvas");
  ctx= canvas.getContext("2d");

  // пустая доска
  for(let r=0;r<BOARD_ROWS;r++){
    board[r]=[];
    for(let c=0;c<BOARD_COLS;c++){
      board[r][c]=0;
    }
  }

  // UI
  document.getElementById("okBtn").addEventListener('click', onOk);
  document.getElementById("restartBtn").addEventListener('click', restartGame);

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup',   onMouseUp);

  // start anim
  requestAnimationFrame(gameLoop);

  // 1) Запускаем игру на сервере + загружаем актуальный лидерборд
  startGameOnServer();
  loadLeaderboardFromServer();
});

////////////////////////////////////////////////////////////
// 3. GAME LOOP
////////////////////////////////////////////////////////////
function gameLoop(){
  draw();
  updateParticles();
  updateFloatingTexts();
  requestAnimationFrame(gameLoop);
}

////////////////////////////////////////////////////////////
// 4. SERVER METHODS
////////////////////////////////////////////////////////////

// --- START GAME ---
async function startGameOnServer(){
  try{
    let resp= await fetch(SERVER_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'startGame' })
    });
    let data= await resp.json();
    sessionId= data.sessionId;
    console.log("Got sessionId:", sessionId);

    // Генерируем три фигуры
    generateNewPieces();
  } catch(err){
    console.error("startGameOnServer error:", err);
  }
}

// --- LINE CLEARED ---
async function lineClearedOnServer(){
  if(!sessionId)return;
  try{
    let resp= await fetch(SERVER_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        action:'lineCleared',
        sessionId:sessionId
      })
    });
    let data= await resp.json();
    score= data.score; // вернулся новый счёт
    document.getElementById("scoreValue").textContent= score;
  } catch(err){
    console.error("lineClearedOnServer error:", err);
  }
}

// --- GAME OVER ---
async function gameOverOnServer(playerName){
  if(!sessionId)return;
  try{
    let resp= await fetch(SERVER_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        action:'gameOver',
        sessionId: sessionId,
        playerName: playerName
      })
    });
    let data= await resp.json();
    let finalScore= data.finalScore;
    console.log("Game Over finalScore = ", finalScore);

    // после этого - добавим запись в leaderboard
    await addScoreToServer(playerName, finalScore);

    // перегрузим leaderboard
    await loadLeaderboardFromServer();
  } catch(err){
    console.error("gameOverOnServer error:", err);
  }
}

// --- LEADERBOARD LOGIC ---

// 1) Загрузить весь список лидеров
async function loadLeaderboardFromServer(){
  try{
    let resp= await fetch(SERVER_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'getLeaderboard' })
    });
    let lb= await resp.json();
    renderLeaderboard(lb);
  }catch(err){
    console.error("loadLeaderboardFromServer error:",err);
  }
}

// 2) Добавить запись (name, score)
async function addScoreToServer(name, scoreVal){
  try{
    await fetch(SERVER_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        action:'addScore',
        name,
        score:scoreVal
      })
    });
  } catch(err){
    console.error("addScoreToServer error:", err);
  }
}

function renderLeaderboard(lbArray){
  let lbDiv= document.getElementById("lb-entries");
  lbDiv.innerHTML="";
  lbArray.forEach((entry, index)=>{
    let div= document.createElement("div");
    div.classList.add("lb-entry");
    let place=index+1;
    if(place===1) div.classList.add("gold");
    if(place===2) div.classList.add("silver");
    if(place===3) div.classList.add("bronze");
    div.textContent= place+". "+ entry.name+" — "+ entry.score;
    lbDiv.appendChild(div);
  });
}

////////////////////////////////////////////////////////////
// 5. RENDER & ANIMATION
////////////////////////////////////////////////////////////
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // поле
  ctx.fillStyle="#1E3353";
  ctx.fillRect(BOARD_X,BOARD_Y, BOARD_COLS*BOARD_CELL_SIZE, BOARD_ROWS*BOARD_CELL_SIZE);

  // сетка
  ctx.strokeStyle="#314e7e";
  for(let r=0;r<BOARD_ROWS;r++){
    for(let c=0;c<BOARD_COLS;c++){
      let x= BOARD_X+ c*BOARD_CELL_SIZE;
      let y= BOARD_Y+ r*BOARD_CELL_SIZE;
      ctx.strokeRect(x,y,BOARD_CELL_SIZE,BOARD_CELL_SIZE);
    }
  }

  // клетки
  for(let r=0;r<BOARD_ROWS;r++){
    for(let c=0;c<BOARD_COLS;c++){
      let val= board[r][c];
      if(val && val.color){
        drawBlock3D(BOARD_X+c*BOARD_CELL_SIZE, BOARD_Y+r*BOARD_CELL_SIZE, BOARD_CELL_SIZE, val.color);
      }
    }
  }

  drawParticles();

  // три фигуры
  for(let i=0;i<activePieces.length;i++){
    if(activePieces[i]!== draggingPiece){
      drawPiece(activePieces[i]);
    }
  }

  // тащимая
  if(draggingPiece){
    drawPiece(draggingPiece);
  }

  // Ghost
  if(showGhost && draggingPiece && ghostValid && ghostOverBoardEnough){
    drawGhostPiece(draggingPiece, ghostX, ghostY);
  }

  drawFloatingTexts();
}

//  -- drawBlock3D --
function drawBlock3D(x,y,size,color){
  let grad= ctx.createLinearGradient(x,y,x+size,y+size);
  grad.addColorStop(0, lighten(color,0.4));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, darken(color,0.3));
  ctx.fillStyle= grad;
  ctx.fillRect(x,y,size,size);

  ctx.strokeStyle= darken(color,0.6);
  ctx.lineWidth=1.2;
  ctx.strokeRect(x+0.5,y+0.5,size-1,size-1);
}
function lighten(hex, ratio){
  let c= parseInt(hex.slice(1),16);
  let r=(c>>16)&0xFF, g=(c>>8)&0xFF, b=c&0xFF;
  r+=(255-r)*ratio; g+=(255-g)*ratio; b+=(255-b)*ratio;
  r=Math.round(r); g=Math.round(g); b=Math.round(b);
  return "#"+ ((r<<16)|(g<<8)|b).toString(16).padStart(6,"0");
}
function darken(hex, ratio){
  let c= parseInt(hex.slice(1),16);
  let r=(c>>16)&0xFF, g=(c>>8)&0xFF, b=c&0xFF;
  r=Math.round(r*(1-ratio));
  g=Math.round(g*(1-ratio));
  b=Math.round(b*(1-ratio));
  return "#"+ ((r<<16)|(g<<8)|b).toString(16).padStart(6,"0");
}
function drawPiece(piece){
  let scale= piece.inPreview? PREVIEW_SCALE:1;
  for(let r=0;r<piece.shape.length;r++){
    for(let c=0;c<piece.shape[r].length;c++){
      if(piece.shape[r][c]===1){
        let x= piece.x+ c* BOARD_CELL_SIZE*scale;
        let y= piece.y+ r* BOARD_CELL_SIZE*scale;
        drawBlock3D(x,y, BOARD_CELL_SIZE*scale, piece.color);
      }
    }
  }
}
function drawGhostPiece(piece,gx,gy){
  ctx.save();
  ctx.globalAlpha=0.3;
  let scale= piece.inPreview? PREVIEW_SCALE:1;
  for(let r=0;r<piece.shape.length;r++){
    for(let c=0;c<piece.shape[r].length;c++){
      if(piece.shape[r][c]===1){
        let cellX= gx+ c* BOARD_CELL_SIZE*scale;
        let cellY= gy+ r* BOARD_CELL_SIZE*scale;
        drawBlock3D(cellX, cellY, BOARD_CELL_SIZE*scale, piece.color);
      }
    }
  }
  ctx.restore();
}

////////////////////////////////////////////////////////////
// 6. DRAG & DROP
////////////////////////////////////////////////////////////
function onMouseDown(e){
  if(isGameOverFlag)return;
  e.preventDefault();
  let {x,y}= getMousePos(e);
  for(let i= activePieces.length-1;i>=0;i--){
    let piece= activePieces[i];
    if(isPointerOnPiece(piece,x,y)){
      draggingPiece= piece;
      offsetX= x- piece.x;
      offsetY= y- piece.y;
      piece.inPreview=false;
      activePieces.splice(i,1);
      activePieces.push(piece);

      draggingPiece.x= x- offsetX;
      draggingPiece.y= y- offsetY;

      onMouseMove(e);
      break;
    }
  }
}
function onMouseMove(e){
  if(!draggingPiece||isGameOverFlag)return;
  e.preventDefault();
  let {x,y}= getMousePos(e);
  draggingPiece.x= x-offsetX;
  draggingPiece.y= y-offsetY;

  ghostValid=false;
  ghostOverBoardEnough=false;
  let scale= draggingPiece.inPreview? PREVIEW_SCALE:1;
  let totalBlocks=0, blocksOver=0;

  for(let rr=0; rr<draggingPiece.shape.length; rr++){
    for(let cc=0; cc<draggingPiece.shape[rr].length; cc++){
      if(draggingPiece.shape[rr][cc]===1){
        totalBlocks++;
        let blockX= draggingPiece.x + cc*(BOARD_CELL_SIZE*scale);
        let blockY= draggingPiece.y + rr*(BOARD_CELL_SIZE*scale);
        let centerX= blockX+ (BOARD_CELL_SIZE*scale)/2;
        let centerY= blockY+ (BOARD_CELL_SIZE*scale)/2;
        if(centerX>=BOARD_X && centerX<= BOARD_X+BOARD_CELL_SIZE*BOARD_COLS &&
           centerY>=BOARD_Y && centerY<= BOARD_Y+BOARD_CELL_SIZE*BOARD_ROWS){
          blocksOver++;
        }
      }
    }
  }
  if(blocksOver> totalBlocks/2){
    ghostOverBoardEnough=true;
  }

  let col= Math.round((draggingPiece.x- BOARD_X)/(BOARD_CELL_SIZE*scale));
  let row= Math.round((draggingPiece.y- BOARD_Y)/(BOARD_CELL_SIZE*scale));
  let maxCols= draggingPiece.shape.reduce((m, rowA)=> Math.max(m, rowA.length),0);

  if(row>=0 && col>=0 &&
     row+ draggingPiece.shape.length<= BOARD_ROWS &&
     col+ maxCols<= BOARD_COLS){
    if(checkBlocksEmpty(draggingPiece,row,col)){
      ghostValid=true;
      ghostX= BOARD_X+ col*BOARD_CELL_SIZE;
      ghostY= BOARD_Y+ row*BOARD_CELL_SIZE;
    }
  }
}
function onMouseUp(e){
  if(!draggingPiece||isGameOverFlag)return;
  e.preventDefault();
  if(snapPieceToBoard(draggingPiece)){
    let idx= activePieces.indexOf(draggingPiece);
    if(idx!==-1) activePieces.splice(idx,1);
    checkAndClearLines();
    if(activePieces.length>0 && !canPlaceAnyPiece()){
      endGame();
    } else if(activePieces.length===0){
      generateNewPieces();
    }
  } else {
    revertPiece(draggingPiece);
  }
  draggingPiece=null;
}

////////////////////////////////////////////////////////////
// 7. SNAP & CLEAR
////////////////////////////////////////////////////////////
function snapPieceToBoard(piece){
  let scale= piece.inPreview? PREVIEW_SCALE:1;
  let col= Math.round((piece.x-BOARD_X)/(BOARD_CELL_SIZE*scale));
  let row= Math.round((piece.y-BOARD_Y)/(BOARD_CELL_SIZE*scale));
  if(row<0||col<0)return false;
  let maxCols= piece.shape.reduce((m, rowA)=> Math.max(m, rowA.length),0);
  if(row+ piece.shape.length> BOARD_ROWS)return false;
  if(col+ maxCols> BOARD_COLS)return false;

  for(let rr=0; rr<piece.shape.length; rr++){
    for(let cc=0; cc<piece.shape[rr].length; cc++){
      if(piece.shape[rr][cc]===1){
        if(board[row+rr][col+cc]!==0)return false;
      }
    }
  }
  for(let rr=0; rr<piece.shape.length; rr++){
    for(let cc=0; cc<piece.shape[rr].length; cc++){
      if(piece.shape[rr][cc]===1){
        board[row+rr][col+cc]= { color: piece.color };
      }
    }
  }
  return true;
}
function checkAndClearLines(){
  let rowsCleared=[];
  for(let r=0;r<BOARD_ROWS;r++){
    let full=true;
    for(let c=0;c<BOARD_COLS;c++){
      if(board[r][c]===0){ full=false; break; }
    }
    if(full) rowsCleared.push(r);
  }
  let colsCleared=[];
  for(let c=0;c<BOARD_COLS;c++){
    let full=true;
    for(let r=0;r<BOARD_ROWS;r++){
      if(board[r][c]===0){ full=false; break; }
    }
    if(full) colsCleared.push(c);
  }
  let total= rowsCleared.length + colsCleared.length;
  if(total>0){
    for(let row of rowsCleared){
      for(let cc=0; cc<BOARD_COLS; cc++){
        if(board[row][cc]&& board[row][cc].color){
          spawnExplosion(row,cc, board[row][cc].color);
        }
        board[row][cc]=0;
      }
    }
    for(let col of colsCleared){
      for(let rr=0; rr<BOARD_ROWS; rr++){
        if(board[rr][col] && board[rr][col].color){
          spawnExplosion(rr,col, board[rr][col].color);
        }
        board[rr][col]=0;
      }
    }

    // локальный combo
    if(comboTurnsLeft>0){ comboStreak++; } else { comboStreak=2; }
    comboTurnsLeft=2;

    // говорим серверу: lineCleared => увеличит score
    lineClearedOnServer();

    // всплывающая надпись
    let floatX= BOARD_X+ (BOARD_COLS*BOARD_CELL_SIZE)/2 -40;
    let floatY= BOARD_Y+ (BOARD_ROWS*BOARD_CELL_SIZE)/2;
    let comboText="";
    if(total>1 && comboStreak>1){
      comboText=" (Combo x"+ comboStreak+")";
    }
    floatingTexts.push({
      x: floatX, y: floatY,
      text:"+Line"+ comboText,
      life:0,
      color:"#FFD700"
    });
    if(total>1 && comboStreak>1){
      floatingTexts.push({
        x:floatX, y:floatY+25,
        text:"Combo!",
        life:0,
        color:"#FFEF00"
      });
    }
  } else {
    if(comboTurnsLeft>0){
      comboTurnsLeft--;
      if(comboTurnsLeft===0){
        comboStreak=1;
      }
    }
  }
}

////////////////////////////////////////////////////////////
// 8. PARTICLES + FLOATING TEXT
////////////////////////////////////////////////////////////
function updateParticles(){
  for(let i=0;i<particles.length;i++){
    let p=particles[i];
    p.x+= p.vx;
    p.y+= p.vy;
    p.life++;
  }
  particles= particles.filter(p=> p.life<30);
}
function drawParticles(){
  for(let i=0;i<particles.length;i++){
    let p= particles[i];
    let alpha= 1- (p.life/30);
    let size=5*alpha;
    ctx.save();
    ctx.globalAlpha= alpha;
    ctx.fillStyle= p.color;
    ctx.beginPath();
    ctx.arc(p.x,p.y,size,0,2*Math.PI);
    ctx.fill();
    ctx.restore();
  }
}
function spawnExplosion(row,col,color){
  let centerX= BOARD_X+ (col+0.5)*BOARD_CELL_SIZE;
  let centerY= BOARD_Y+ (row+0.5)*BOARD_CELL_SIZE;
  for(let i=0;i<12;i++){
    let angle= Math.random()*2*Math.PI;
    let speed= Math.random()*3+2;
    let vx= Math.cos(angle)*speed;
    let vy= Math.sin(angle)*speed;
    particles.push({
      x:centerX,
      y:centerY,
      vx,vy,color,
      life:0
    });
  }
}

function updateFloatingTexts(){
  for(let i=0;i<floatingTexts.length;i++){
    let ft= floatingTexts[i];
    ft.life++;
    ft.y-=0.6;
  }
  floatingTexts= floatingTexts.filter(ft=> ft.life<90);
}
function drawFloatingTexts(){
  for(let i=0;i<floatingTexts.length;i++){
    let ft= floatingTexts[i];
    let alpha= 1 - ft.life/90;
    ctx.save();
    ctx.globalAlpha= alpha;
    ctx.fillStyle= ft.color||"#fff";
    ctx.font="bold 20px Arial";
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

////////////////////////////////////////////////////////////
// 9. GAME OVER + NAME
////////////////////////////////////////////////////////////
function endGame(){
  isGameOverFlag=true;
  document.getElementById("gameOverMessage").style.display="block";
}
async function onOk(){
  let nameInput= document.getElementById("nameInput");
  let playerName= nameInput.value.trim()||"Anonymous";

  // говорим серверу: gameOver => вернёт finalScore + запись в leaderboard
  await gameOverOnServer(playerName);

  // Спрячем окно
  document.getElementById("gameOverMessage").style.display="none";
}

function restartGame(){
  location.reload();
}

////////////////////////////////////////////////////////////
// 10. UTILS
////////////////////////////////////////////////////////////
function revertPiece(piece){
  piece.x= piece.originalX;
  piece.y= piece.originalY;
  piece.inPreview=true;
}
function getMousePos(e){
  let rect= canvas.getBoundingClientRect();
  return {
    x:e.clientX- rect.left,
    y:e.clientY- rect.top
  };
}
function isPointerOnPiece(piece, x,y){
  let scale= piece.inPreview? PREVIEW_SCALE:1;
  let maxCols= piece.shape.reduce((m, row)=> Math.max(m, row.length),0);
  let w= maxCols* BOARD_CELL_SIZE* scale;
  let h= piece.shape.length* BOARD_CELL_SIZE* scale;
  return (x>= piece.x && x<= piece.x+ w &&
          y>= piece.y && y<= piece.y+ h);
}
function checkBlocksEmpty(piece, baseRow, baseCol){
  for(let rr=0; rr<piece.shape.length; rr++){
    for(let cc=0; cc<piece.shape[rr].length; cc++){
      if(piece.shape[rr][cc]===1){
        if(board[baseRow+rr][baseCol+cc]!==0)return false;
      }
    }
  }
  return true;
}
