/***************************************************
 *      APP.JS - FRONTEND LOGIC
 ***************************************************/

// =========== 1. Настройки поля  ===========
const BOARD_COLS = 8;
const BOARD_ROWS = 8;
const BOARD_CELL_SIZE = 45;
const BOARD_X = 45;
const BOARD_Y = 45;

const CANVAS_WIDTH  = 450;
const CANVAS_HEIGHT = 650;

// Куда кладём фигуры снизу (под поле)
const PREVIEW_Y = BOARD_Y + BOARD_ROWS*BOARD_CELL_SIZE + 40;
const PREVIEW_SCALE = 25/45;
const LEFT_MARGIN=10;
const RIGHT_MARGIN=10;

// Серверный endpoint (Cloud Functions или другой бэкенд)
const SERVER_URL = "https://<your-project-id>.cloudfunctions.net/gameApi"; 
// Замените <your-project-id> на реальное.

// =========== 2. Переменные  ===========
let canvas, ctx;
let board = [];         // храним цвет ячеек
let activePieces=[];    // три фигуры снизу
let draggingPiece=null;
let offsetX=0, offsetY=0;
let isGameOverFlag=false;

// Частицы (взрыв при очистке)
let particles=[];

// Floating texts (combo, +score)
let floatingTexts=[];

// Локально храним score, combo — если хотим «частично» локальный UI
let score=0;
let comboStreak=1;
let comboTurnsLeft=0;

// Ghost piece
let showGhost= true;
let ghostX=0, ghostY=0;
let ghostValid=false;
let ghostOverBoardEnough=false;

// sessionId с сервера
let sessionId= null;

// =========== 3. init  ===========
window.addEventListener('load', ()=>{
  canvas= document.getElementById("gameCanvas");
  ctx= canvas.getContext("2d");

  // Пустая доска
  for(let r=0;r<BOARD_ROWS;r++){
    board[r]=[];
    for(let c=0;c<BOARD_COLS;c++){
      board[r][c]=0;
    }
  }

  // Инициализируем UI
  document.getElementById("okBtn").addEventListener('click', onOk);
  document.getElementById("restartBtn").addEventListener('click', restartGame);

  // Навешиваем Drag & Drop
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup',   onMouseUp);

  // Запускаем анимационный цикл
  requestAnimationFrame(gameLoop);

  // Вызываем старт игры на сервере
  startGameOnServer();
});

// =========== 4. gameLoop  ===========
function gameLoop(){
  draw();
  updateParticles();
  updateFloatingTexts();
  requestAnimationFrame(gameLoop);
}

// =========== 5. SERVER LOGIC ===========
async function startGameOnServer(){
  // Запрашиваем startGame (sessionId)
  let resp= await fetch(SERVER_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'startGame' })
  });
  let data= await resp.json();
  sessionId= data.sessionId || null;

  // Генерируем три фигуры снизу
  generateNewPieces();
}
async function lineClearedOnServer(){
  if(!sessionId)return;
  let resp= await fetch(SERVER_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      action: 'lineCleared',
      sessionId: sessionId
    })
  });
  let data= await resp.json();
  // Сервер говорит новый score
  score= data.score;
  document.getElementById("scoreValue").textContent= score;
}
async function gameOverOnServer(playerName){
  if(!sessionId)return;
  let resp= await fetch(SERVER_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      action:'gameOver',
      sessionId: sessionId,
      playerName:playerName
    })
  });
  let data= await resp.json();
  // Возвращает finalScore
  alert("Your final score = " + data.finalScore);
}

// =========== 6. DRAW  ===========
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // Поле
  ctx.fillStyle="#1E3353";
  ctx.fillRect(BOARD_X, BOARD_Y, BOARD_COLS*BOARD_CELL_SIZE, BOARD_ROWS*BOARD_CELL_SIZE);

  // сетка
  ctx.strokeStyle="#314e7e";
  for(let r=0;r<BOARD_ROWS;r++){
    for(let c=0;c<BOARD_COLS;c++){
      let x= BOARD_X+ c*BOARD_CELL_SIZE;
      let y= BOARD_Y+ r*BOARD_CELL_SIZE;
      ctx.strokeRect(x,y,BOARD_CELL_SIZE,BOARD_CELL_SIZE);
    }
  }

  // ячейки
  for(let r=0;r<BOARD_ROWS;r++){
    for(let c=0;c<BOARD_COLS;c++){
      let cellVal= board[r][c];
      if(cellVal && cellVal.color){
        drawBlock3D(BOARD_X+c*BOARD_CELL_SIZE, BOARD_Y+r*BOARD_CELL_SIZE, BOARD_CELL_SIZE, cellVal.color);
      }
    }
  }

  // Частицы
  drawParticles();

  // Фигуры снизу
  for(let i=0;i<activePieces.length;i++){
    if(activePieces[i]!==draggingPiece){
      drawPiece(activePieces[i]);
    }
  }

  // Тащимая
  if(draggingPiece){
    drawPiece(draggingPiece);
  }

  // Призрачная
  if(showGhost && draggingPiece && ghostValid && ghostOverBoardEnough){
    drawGhostPiece(draggingPiece, ghostX, ghostY);
  }

  // FloatingTexts
  drawFloatingTexts();
}

// =========== 7. DRAG & DROP  ===========
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
      // top
      activePieces.splice(i,1);
      activePieces.push(piece);

      // fix "jump"
      draggingPiece.x= x-offsetX;
      draggingPiece.y= y-offsetY;

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

  // счётчик блоков
  let totalBlocks=0, blocksOver=0;
  for(let rr=0; rr<draggingPiece.shape.length; rr++){
    for(let cc=0; cc<draggingPiece.shape[rr].length; cc++){
      if(draggingPiece.shape[rr][cc]===1){
        totalBlocks++;
        let blockX= draggingPiece.x + cc*(BOARD_CELL_SIZE*scale);
        let blockY= draggingPiece.y + rr*(BOARD_CELL_SIZE*scale);
        let centerX= blockX+ (BOARD_CELL_SIZE*scale)/2;
        let centerY= blockY+ (BOARD_CELL_SIZE*scale)/2;
        if(centerX>=BOARD_X && centerX<= BOARD_X+ BOARD_COLS*BOARD_CELL_SIZE &&
           centerY>=BOARD_Y && centerY<= BOARD_Y+ BOARD_ROWS*BOARD_CELL_SIZE){
          blocksOver++;
        }
      }
    }
  }
  if(blocksOver> totalBlocks/2){
    ghostOverBoardEnough=true;
  }

  let col= Math.round((draggingPiece.x-BOARD_X)/(BOARD_CELL_SIZE*scale));
  let row= Math.round((draggingPiece.y-BOARD_Y)/(BOARD_CELL_SIZE*scale));
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
    if(idx!==-1){
      activePieces.splice(idx,1);
    }
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

// =========== 8. SNAP & CLEAR ===========
// локально проверяем, можно ли поставить
function snapPieceToBoard(piece){
  let scale= piece.inPreview? PREVIEW_SCALE:1;
  let col= Math.round((piece.x-BOARD_X)/BOARD_CELL_SIZE/scale);
  let row= Math.round((piece.y-BOARD_Y)/BOARD_CELL_SIZE/scale);

  if(row<0||col<0)return false;
  let maxCols= piece.shape.reduce((m, rowA)=> Math.max(m, rowA.length),0);
  if(row+ piece.shape.length> BOARD_ROWS) return false;
  if(col+ maxCols> BOARD_COLS) return false;

  // проверка занятости
  for(let rr=0; rr<piece.shape.length; rr++){
    for(let cc=0; cc<piece.shape[rr].length; cc++){
      if(piece.shape[rr][cc]===1){
        if(board[row+rr][col+cc]!==0)return false;
      }
    }
  }
  // ставим
  for(let rr=0; rr<piece.shape.length; rr++){
    for(let cc=0; cc<piece.shape[rr].length; cc++){
      if(piece.shape[rr][cc]===1){
        board[row+rr][col+cc]={ color: piece.color };
      }
    }
  }
  return true;
}
function checkAndClearLines(){
  // ищем полные строки
  let rowsCleared=[];
  for(let r=0;r<BOARD_ROWS;r++){
    let full=true;
    for(let c=0;c<BOARD_COLS;c++){
      if(board[r][c]===0){ full=false; break; }
    }
    if(full) rowsCleared.push(r);
  }
  // ищем полные столбцы
  let colsCleared=[];
  for(let c=0;c<BOARD_COLS;c++){
    let full=true;
    for(let r=0;r<BOARD_ROWS;r++){
      if(board[r][c]===0){ full=false; break; }
    }
    if(full) colsCleared.push(c);
  }

  let total= rowsCleared.length+ colsCleared.length;
  if(total>0){
    // убираем
    for(let row of rowsCleared){
      for(let cc=0; cc<BOARD_COLS; cc++){
        if(board[row][cc] && board[row][cc].color){
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

    // Combo (локально)
    if(comboTurnsLeft>0){
      comboStreak++;
    } else {
      comboStreak=2;
    }
    comboTurnsLeft=2;

    // Попросим сервер увеличить score (lineCleared)
    lineClearedOnServer();

    // Появится всплывающее "+10 (Combo x2)" и т.д. (но тут мы не знаем точный score, 
    // поэтому можно показывать что-то условное)
    let floatX= BOARD_X+ (BOARD_COLS*BOARD_CELL_SIZE)/2 - 40;
    let floatY= BOARD_Y+ (BOARD_ROWS*BOARD_CELL_SIZE)/2;
    let comboText="";
    if(total>1 && comboStreak>1){
      comboText=" (Combo x"+ comboStreak+")";
    }
    floatingTexts.push({
      x: floatX,
      y: floatY,
      text: "+(line cleared)"+ comboText,
      life:0,
      color:"#FFD700"
    });
    if(total>1 && comboStreak>1){
      floatingTexts.push({
        x: floatX,
        y: floatY+25,
        text:"Combo!",
        life:0,
        color:"#FFEF00"
      });
    }
  } else {
    // no lines => comboTurnsLeft--
    if(comboTurnsLeft>0){
      comboTurnsLeft--;
      if(comboTurnsLeft===0) comboStreak=1;
    }
  }
}

// =========== 9. GENERATE NEW PIECES ===========
function generateNewPieces(){
  activePieces=[];
  let shapesArr=[];
  for(let i=0;i<3;i++){
    let shape= ALL_FIGURES[Math.floor(Math.random()*ALL_FIGURES.length)];
    let shapeClone= shape.map(row=> [...row]);
    let color= COLORS[Math.floor(Math.random()*COLORS.length)];
    shapesArr.push({shape: shapeClone, color});
  }

  // левый
  {
    let {shape, color}= shapesArr[0];
    let maxCols= shape.reduce((m, row)=> Math.max(m, row.length),0);
    let shapeWidth= maxCols* BOARD_CELL_SIZE* PREVIEW_SCALE;
    let pieceLeft={
      shape,
      color,
      x: LEFT_MARGIN,
      y: PREVIEW_Y,
      originalX: LEFT_MARGIN,
      originalY: PREVIEW_Y,
      inPreview:true
    };
    activePieces.push(pieceLeft);
  }
  // правый
  {
    let {shape, color}= shapesArr[1];
    let maxCols= shape.reduce((m, row)=> Math.max(m, row.length),0);
    let shapeWidth= maxCols* BOARD_CELL_SIZE* PREVIEW_SCALE;
    let pieceRight={
      shape,
      color,
      x: CANVAS_WIDTH- RIGHT_MARGIN - shapeWidth,
      y: PREVIEW_Y,
      originalX: CANVAS_WIDTH- RIGHT_MARGIN - shapeWidth,
      originalY: PREVIEW_Y,
      inPreview:true
    };
    activePieces.push(pieceRight);
  }
  // центр
  {
    let {shape, color}= shapesArr[2];
    let maxCols= shape.reduce((m, row)=> Math.max(m, row.length),0);
    let shapeWidth= maxCols* BOARD_CELL_SIZE* PREVIEW_SCALE;
    let pieceCenter={
      shape,
      color,
      x: (CANVAS_WIDTH- shapeWidth)/2,
      y: PREVIEW_Y,
      originalX:(CANVAS_WIDTH- shapeWidth)/2,
      originalY:PREVIEW_Y,
      inPreview:true
    };
    activePieces.push(pieceCenter);
  }

  if(!canPlaceAnyPiece()){
    endGame();
  }
}
function canPlaceAnyPiece(){
  for(let p of activePieces){
    if(canPlaceThisPiece(p)) return true;
  }
  return false;
}
function canPlaceThisPiece(p){
  let h= p.shape.length;
  let w= p.shape.reduce((m, row)=> Math.max(m, row.length),0);
  for(let row=0; row<=BOARD_ROWS-h; row++){
    for(let col=0; col<=BOARD_COLS-w; col++){
      if(checkFit(p,row,col))return true;
    }
  }
  return false;
}
function checkFit(p, baseRow, baseCol){
  for(let r=0;r<p.shape.length;r++){
    for(let c=0;c<p.shape[r].length;c++){
      if(p.shape[r][c]===1){
        if(board[baseRow+r][baseCol+c]!==0)return false;
      }
    }
  }
  return true;
}

// =========== 10. PARTICLES & FLOAT TEXT ===========
function updateParticles(){
  for(let i=0;i<particles.length;i++){
    let p=particles[i];
    p.x+= p.vx;
    p.y+= p.vy;
    p.life++;
  }
  particles= particles.filter(p=> p.life< PARTICLE_LIFETIME);
}
function drawParticles(){
  for(let i=0;i<particles.length;i++){
    let p=particles[i];
    let alpha=1-(p.life/PARTICLE_LIFETIME);
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
  for(let i=0;i<PARTICLE_COUNT;i++){
    let angle= Math.random()*2*Math.PI;
    let speed= Math.random()*3+2;
    let vx= Math.cos(angle)*speed;
    let vy= Math.sin(angle)*speed;
    particles.push({
      x:centerX,
      y:centerY,
      vx,
      vy,
      color,
      life:0
    });
  }
}

function updateFloatingTexts(){
  for(let i=0;i<floatingTexts.length;i++){
    floatingTexts[i].life++;
    floatingTexts[i].y-=0.6;
  }
  floatingTexts= floatingTexts.filter(ft=> ft.life<90);
}
function drawFloatingTexts(){
  for(let i=0;i<floatingTexts.length;i++){
    let ft= floatingTexts[i];
    let alpha=1- (ft.life/90);
    ctx.save();
    ctx.globalAlpha= alpha;
    ctx.fillStyle= ft.color || "#fff";
    ctx.font= "bold 20px Arial";
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }
}

// =========== 11. GAME OVER + NAME INPUT ===========
function endGame(){
  isGameOverFlag=true;
  document.getElementById("gameOverMessage").style.display= "block";
}
async function onOk(){
  let nameInput= document.getElementById("nameInput");
  let playerName= nameInput.value.trim();
  if(!playerName) playerName="Anonymous";
  // Сообщим серверу, что Game Over
  await gameOverOnServer(playerName);

  // Спрячем окно
  document.getElementById("gameOverMessage").style.display="none";
}

function restartGame(){
  location.reload();
}

// =========== 12. Вспомогательное ===========
function revertPiece(piece){
  piece.x= piece.originalX;
  piece.y= piece.originalY;
  piece.inPreview=true;
}
function getMousePos(e){
  let rect= canvas.getBoundingClientRect();
  return {
    x: e.clientX- rect.left,
    y: e.clientY- rect.top
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
