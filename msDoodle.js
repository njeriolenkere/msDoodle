// -----------------------------
// DRAW APP (fixed & improved)
// -----------------------------

// Get DOM

const canvas = document.getElementById("drawingCanvas");
const ctx = canvas.getContext("2d");
const bgCanvas = document.getElementById("backgroundCanvas");
const bgCtx    = bgCanvas.getContext("2d");
const penBtn = document.getElementById("pen");
const eraserBtn = document.getElementById("eraser");
const bucketBtn = document.getElementById("bucket");
const clearBtn = document.getElementById("clear");
const undoBtn = document.getElementById("undo");
const redoBtn = document.getElementById("redo");
const colorPicker = document.getElementById("colorPicker");
const penSizeInput = document.getElementById("penSize");
const eraserSizeInput = document.getElementById("eraserSize");

let smoothEnabled = true;   // toggle smooth drawing
let points = [];            // stores last points for smoothing

// Resize all canvas
function resizeAll(){
    bgCanvas.width = canvas.width = window.innerWidth - 20;
    bgCanvas.height = canvas.height = window.innerHeight - 120;
}
resizeAll(); window.onresize = resizeAll;


// --- State ---
let currentTool = "pen";       // "pen" | "eraser" | "bucket"
let penColor = "#000000";
let penSize = parseInt(penSizeInput.value, 10) || 5;
let eraserSize = parseInt(eraserSizeInput.value, 10) || 10;
let drawing = false;

// --- History for undo/redo (ImageData copies) ---
const history = [];
const redoStack = [];
const MAX_HISTORY = 50;


// push current canvas state to history (ImageData)
function pushHistory() {
  try {
    if (history.length >= MAX_HISTORY) history.shift();
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    history.push(snapshot);
    // clear redo stack whenever new action occurs
    redoStack.length = 0;
    updateUndoRedoButtons();
  } catch (err) {
    console.warn("Unable to snapshot canvas for history:", err);
  }
}

function updateUndoRedoButtons() {
  undoBtn.disabled = history.length <= 1;
  redoBtn.disabled = redoStack.length === 0;
}

function undo() {
  if (history.length <= 1) return;
  const last = history.pop();
  redoStack.push(last);
  const previous = history[history.length - 1];
  ctx.putImageData(previous, 0, 0);
  updateUndoRedoButtons();
}

function redo() {
  if (redoStack.length === 0) return;
  const snapshot = redoStack.pop();
  history.push(snapshot);
  ctx.putImageData(snapshot, 0, 0);
  updateUndoRedoButtons();
}

// initialize history with blank canvas
pushHistory();

// --- Helpers ---
function setActiveButton(buttonEl) {
  // remove active from toolbar buttons
  [penBtn, eraserBtn, bucketBtn].forEach(b => b.classList.remove("active"));
  if (buttonEl) buttonEl.classList.add("active");
}

function getCanvasPosFromPointerEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.round(e.clientX - rect.left);
  const y = Math.round(e.clientY - rect.top);
  // Clamp to canvas bounds
  return {
    x: Math.max(0, Math.min(canvas.width - 1, x)),
    y: Math.max(0, Math.min(canvas.height - 1, y))
  };
}

// --- Pointer drawing (works for mouse/touch/stylus) ---
// ==============================
// POINTER DRAWING (smooth version)
// ==============================

// points array stores recent pointer positions for smoothing

canvas.addEventListener("pointerdown", (e) => {
    const pos = getCanvasPosFromPointerEvent(e);

    // If bucket tool is active, fill and exit
    if (currentTool === "bucket") {
        bucketFill(pos.x, pos.y, hexToRGBA(penColor), parseInt(document.getElementById("tolerance")?.value || 0, 10));
        pushHistory();
        return;
    }
//start drawing
    drawing = true;

    // start a new stroke: reset points array
    points = [pos];

    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.strokeStyle = (currentTool === "eraser") ? "#ffffff" : penColor;
    ctx.lineWidth = (currentTool === "eraser") ? eraserSize : penSize;
});

canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;

    const pos = getCanvasPosFromPointerEvent(e);
    points.push(pos); // add current pointer position

    if (points.length < 2) return; // need at least 2 points to draw

    // set current style depending on tool
    ctx.strokeStyle = (currentTool === "eraser") ? "#ffffff" : penColor;
    ctx.lineWidth = (currentTool === "eraser") ? eraserSize : penSize;

    if (smoothEnabled && points.length >= 3) {
        // ----------------------------
        // Smooth mode: quadratic curve
        // ----------------------------
        // Take the last 3 points: p0 -> p1 -> p2
        const p0 = points[points.length - 3];
        const p1 = points[points.length - 2];
        const p2 = points[points.length - 1];

        // Draw a quadratic curve from p0 to p2 with p1 as the control point
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
        ctx.stroke();
    } else {
        // ----------------------------
        // Normal mode: straight line
        // ----------------------------
        const last = points[points.length - 2];
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }
});

canvas.addEventListener("pointerup", () => {
    if (!drawing) return;

    drawing = false; // stop drawing
    points = [];     // reset points array
    pushHistory();   // save to undo/redo history
});

canvas.addEventListener("pointercancel", () => {
    if (!drawing) return;

    drawing = false; // stop drawing
    points = [];
    pushHistory();
});



// prevent two-finger pinch or scroll interfering
canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

// --- Bucket fill (flood fill) with optional tolerance ---
function bucketFill(startX, startY, fillColorRGBA, tolerance = 0) {
  // safety bounds
  if (startX < 0 || startY < 0 || startX >= canvas.width || startY >= canvas.height) return;

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  const width = canvas.width;
  const height = canvas.height;

  const getIndex = (x, y) => (y * width + x) * 4;

  const targetIdx = getIndex(startX, startY);
  const targetColor = [
    data[targetIdx],
    data[targetIdx + 1],
    data[targetIdx + 2],
    data[targetIdx + 3]
  ];

  // If target color is already the fill color (within tolerance), exit
  if (colorMatch(targetColor, fillColorRGBA, tolerance)) return;

  const stack = [[startX, startY]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    const idx = getIndex(cx, cy);
    const curColor = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    if (colorMatch(curColor, targetColor, tolerance)) {
      // set pixel to fill color
      data[idx] = fillColorRGBA[0];
      data[idx + 1] = fillColorRGBA[1];
      data[idx + 2] = fillColorRGBA[2];
      data[idx + 3] = fillColorRGBA[3];

      // push neighbors (4-way)
      if (cx + 1 < width) stack.push([cx + 1, cy]);
      if (cx - 1 >= 0) stack.push([cx - 1, cy]);
      if (cy + 1 < height) stack.push([cx, cy + 1]);
      if (cy - 1 >= 0) stack.push([cx, cy - 1]);
    }
  }

  ctx.putImageData(img, 0, 0);
}

// color compare with tolerance (0 = exact)
function colorMatch(a, b, tol = 0) {
  return Math.abs(a[0] - b[0]) <= tol &&
         Math.abs(a[1] - b[1]) <= tol &&
         Math.abs(a[2] - b[2]) <= tol &&
         Math.abs(a[3] - b[3]) <= tol;
}

// hex to RGBA array
function hexToRGBA(hex) {
  if (!hex) return [0,0,0,255];
  hex = hex.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map(s => s + s).join("");
  }
  const v = parseInt(hex, 16);
  return [ (v >> 16) & 255, (v >> 8) & 255, v & 255, 255 ];
}
//smooth edges
const smoothToggleBtn = document.getElementById("smoothToggle");
smoothToggleBtn.addEventListener("click", () => {
    smoothEnabled = !smoothEnabled;
    smoothToggleBtn.textContent = `Smooth: ${smoothEnabled ? "ON" : "OFF"}`;
});


//save img
document.getElementById("saveImage").addEventListener("click", function () {
    const format = document.getElementById("saveFormat").value;
    const link = document.createElement("a");

    // create temporary canvas to merge
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tmpCtx = tmp.getContext("2d");

    // 1️⃣ draw background
    tmpCtx.drawImage(bgCanvas, 0, 0);

    // 2️⃣ draw drawing
    tmpCtx.drawImage(canvas, 0, 0);

    // export
    if (format === "png") {
        link.download = "drawing.png";
        link.href = tmp.toDataURL("image/png");
        link.click();
    } else if (format === "jpg") {
        link.download = "drawing.jpg";
        link.href = tmp.toDataURL("image/jpeg", 0.9);
        link.click();
    } else if (format === "pdf") {
        const imgData = tmp.toDataURL("image/png");
        const win = window.open("");
        win.document.write(`
            <html><head><title>PDF Export</title></head>
            <body style="margin:0">
                <img src="${imgData}" style="width:100%;"/>
                <script>window.print();</script>
            </body></html>
        `);
    }
});

//to remove imag
let bgHistory = [];  // background undo stack
let bgRedoStack = [];

document.getElementById("imageUpload").addEventListener("change", function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = function () {
        // draw background only
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgCtx.drawImage(img, 0, 0, bgCanvas.width, bgCanvas.height);
        bgHistory.push(bgCtx.getImageData(0,0,bgCanvas.width,bgCanvas.height));
    };
    img.src = URL.createObjectURL(file);
});

// remove background image (keep drawing)
document.getElementById("removeImage").addEventListener("click", function () {
    if(bgCanvas.width && bgCanvas.height) {
        bgHistory.push(bgCtx.getImageData(0,0,bgCanvas.width,bgCanvas.height));
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgRedoStack = []; // reset redo
    }
});

// undo background removal
function undoBackground() {
    if(bgHistory.length <= 0) return;
    const last = bgHistory.pop();
    bgRedoStack.push(bgCtx.getImageData(0,0,bgCanvas.width,bgCanvas.height));
    bgCtx.putImageData(last,0,0);
}

// redo background
function redoBackground() {
    if(bgRedoStack.length <=0) return;
    const data = bgRedoStack.pop();
    bgHistory.push(bgCtx.getImageData(0,0,bgCanvas.width,bgCanvas.height));
    bgCtx.putImageData(data,0,0);
}
document.getElementById("undoBg").addEventListener("click", undoBackground);
document.getElementById("redoBg").addEventListener("click", redoBackground);



// --- UI wiring & fixes ---

// Ensure parsed integer values for sizes (fixes slider issue)
penSizeInput.addEventListener("input", (e) => {
  penSize = parseInt(e.target.value, 10) || 1;
});
eraserSizeInput.addEventListener("input", (e) => {
  eraserSize = parseInt(e.target.value, 10) || 5;
});

// Color change — does NOT reset bucket tool anymore
colorPicker.addEventListener("input", (e) => {
  penColor = e.target.value;

  // Only auto-switch to pen IF you're using the eraser
  if (currentTool === "eraser") {
      currentTool = "pen";
      setActiveToolButton(penBtn);
  }

  // If current tool = bucket → KEEP bucket active
  if (currentTool === "bucket") {
      setActiveToolButton(bucketBtn); // keep highlight
  }
});


// Tool buttons: set currentTool consistently and update UI
function setActiveToolButton(buttonEl) {
  [penBtn, eraserBtn, bucketBtn].forEach(b => b.classList.remove("active"));
  if (buttonEl) buttonEl.classList.add("active");
}

penBtn.addEventListener("click", () => {
  currentTool = "pen";
  setActiveToolButton(penBtn);
});

eraserBtn.addEventListener("click", () => {
  currentTool = "eraser";
  setActiveToolButton(eraserBtn);
});

bucketBtn.addEventListener("click", () => {
  currentTool = "bucket";
  setActiveToolButton(bucketBtn);
});

// Clear button
clearBtn.addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  pushHistory();
});

// Undo/Redo
undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);

// initialize UI state
setActiveToolButton(penBtn);
colorPicker.value = penColor;
updateUndoRedoButtons();

/* ============================================================
   SIMPLE BRUSH PREVIEW SYSTEM (ONE OVERLAY, VERY LIGHTWEIGHT)
============================================================ */
const preview = document.createElement("div");
preview.style.position = "absolute";
preview.style.pointerEvents = "none";
preview.style.display = "none";
preview.style.zIndex = 99999;
document.body.appendChild(preview);

// update preview style depending on tool
function updatePreview() {
    let size = (currentTool === "eraser") ? eraserSize : penSize;
    preview.style.width = size + "px";
    preview.style.height = size + "px";
    preview.style.border = "2px solid red";
    preview.style.borderRadius = (currentTool === "pen") ? "50%" : "0"; // circle vs square
}

// show brush preview ONLY when cursor is on canvas
canvas.addEventListener("pointerenter", () => preview.style.display = "block");
canvas.addEventListener("pointerleave", () => preview.style.display = "none");

// move preview with pointer
canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    preview.style.left = (e.clientX - preview.offsetWidth/2) + "px";
    preview.style.top  = (e.clientY - preview.offsetHeight/2) + "px";
});

// update preview when size or tool changes
penSizeInput.addEventListener("input", updatePreview);
eraserSizeInput.addEventListener("input", updatePreview);
penBtn.addEventListener("click", updatePreview);
eraserBtn.addEventListener("click", updatePreview);
bucketBtn.addEventListener("click", () => preview.style.display = "none"); // hide for fill

updatePreview();  // initial visual

// upLoad image onto canvas
document.getElementById("imageUpload").addEventListener("change", function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
        bgCtx.clearRect(0,0,bgCanvas.width,bgCanvas.height);
        bgCtx.drawImage(img,0,0,bgCanvas.width,bgCanvas.height);
    };

    img.src = URL.createObjectURL(file);

    // RESET FILE SELECT NAME (fix your problem)
    e.target.value = "";
});
//REMOVE IMAGE ONLY (Drawing stays)
document.getElementById("removeImage").addEventListener("click", () =>{
    bgCtx.clearRect(0,0,bgCanvas.width,bgCanvas.height);
});
//CLEAR DRAWING ONLY
document.getElementById("clearDrawing").addEventListener("click", () =>{
    ctx.clearRect(0,0,canvas.width,canvas.height);
});
//SAVE FINAL RESULT (merges both layers)
document.getElementById("saveMerged").addEventListener("click", ()=>{
    const merge = document.createElement("canvas");
    merge.width = canvas.width;
    merge.height = canvas.height;
    
    const m = merge.getContext("2d");
    m.drawImage(bgCanvas,0,0);
    m.drawImage(canvas,0,0);

    const link = document.createElement("a");
    link.download = "merged.png";
    link.href = merge.toDataURL("image/png");
    link.click();
});




