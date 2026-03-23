const board = document.getElementById("board");
const canvas = document.getElementById("drawLayer");
const ctx = canvas.getContext("2d");
const toggleDrawButton = document.getElementById("toggleDraw");
const addCommentButton = document.getElementById("addComment");
const clearLinesButton = document.getElementById("clearLines");
const resetMarkersButton = document.getElementById("resetMarkers");
const colorButtons = document.querySelectorAll(".color-swatch");
const lineWidthInput = document.getElementById("lineWidth");
const lineWidthValue = document.getElementById("lineWidthValue");

let drawMode = false;
let currentColor = "#ffffff";
let currentLineWidth = 3;
let isDrawing = false;
let currentStroke = null;
let selectedComment = null;
const strokes = [];
const initialPositions = [];

function resizeCanvas() {
  const rect = board.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  redraw();
}

function redraw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ratio = window.devicePixelRatio || 1;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const stroke of strokes) {
    if (stroke.points.length < 2) {
      continue;
    }

    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length; i += 1) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }

    ctx.stroke();
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getBoardPoint(event) {
  const rect = board.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function setMarkerPosition(marker, xPercent, yPercent) {
  marker.style.setProperty("--x", xPercent.toFixed(2));
  marker.style.setProperty("--y", yPercent.toFixed(2));
  marker.dataset.x = xPercent.toFixed(2);
  marker.dataset.y = yPercent.toFixed(2);
}

function getMarkers() {
  return document.querySelectorAll(".marker");
}

function syncInitialPositions() {
  getMarkers().forEach((marker) => {
    const x = Number(marker.dataset.x);
    const y = Number(marker.dataset.y);
    initialPositions.push({ marker, x, y });
    setMarkerPosition(marker, x, y);
  });
}

function syncDrawButton() {
  toggleDrawButton.textContent = `描画モード: ${drawMode ? "ON" : "OFF"}`;
  toggleDrawButton.classList.toggle("primary", drawMode);
  toggleDrawButton.style.background = drawMode ? "var(--accent)" : "rgba(255, 255, 255, 0.09)";
  toggleDrawButton.style.color = drawMode ? "#ffffff" : "var(--text)";
}

function toggleDrawMode() {
  drawMode = !drawMode;
  syncDrawButton();
}

function startStroke(event) {
  if (!drawMode) {
    return;
  }

  event.preventDefault();
  isDrawing = true;
  currentStroke = {
    color: currentColor,
    width: currentLineWidth,
    points: [getBoardPoint(event)],
  };
  strokes.push(currentStroke);
}

function extendStroke(event) {
  if (!drawMode || !isDrawing || !currentStroke) {
    return;
  }

  currentStroke.points.push(getBoardPoint(event));
  redraw();
}

function endStroke() {
  isDrawing = false;
  currentStroke = null;
}

function clearLines() {
  strokes.length = 0;
  redraw();
}

function setSelectedComment(comment) {
  if (selectedComment) {
    selectedComment.classList.remove("selected");
  }

  selectedComment = comment;

  if (selectedComment) {
    selectedComment.classList.add("selected");
  }
}

function resetMarkers() {
  initialPositions.forEach(({ marker, x, y }) => {
    setMarkerPosition(marker, x, y);
  });
}

function enableDragging(marker) {
  let dragging = false;

  marker.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dragging = true;
    marker.classList.add("dragging");
    marker.setPointerCapture(event.pointerId);
  });

  marker.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }

    const rect = board.getBoundingClientRect();
    const xPercent = clamp(((event.clientX - rect.left) / rect.width) * 100, 2, 98);
    const yPercent = clamp(((event.clientY - rect.top) / rect.height) * 100, 2, 98);
    setMarkerPosition(marker, xPercent, yPercent);
  });

  function stopDragging(event) {
    if (!dragging) {
      return;
    }

    dragging = false;
    marker.classList.remove("dragging");
    if (marker.hasPointerCapture(event.pointerId)) {
      marker.releasePointerCapture(event.pointerId);
    }
  }

  marker.addEventListener("pointerup", stopDragging);
  marker.addEventListener("pointercancel", stopDragging);
}

function attachCommentEditor(comment) {
  comment.tabIndex = 0;

  comment.addEventListener("pointerdown", () => {
    setSelectedComment(comment);
  });

  comment.addEventListener("dblclick", () => {
    const nextText = window.prompt("コメントを編集してください", comment.textContent);
    if (nextText === null) {
      return;
    }

    const trimmed = nextText.trim();
    if (!trimmed) {
      if (selectedComment === comment) {
        setSelectedComment(null);
      }
      comment.remove();
      return;
    }

    comment.textContent = trimmed;
  });
}

function addComment() {
  const text = window.prompt("コメントを入力してください", "ここにコメント");
  if (!text) {
    return;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  const comment = document.createElement("div");
  comment.className = "marker comment";
  comment.dataset.role = "COMMENT";
  board.appendChild(comment);
  setMarkerPosition(comment, 62, 76);
  comment.textContent = trimmed;
  enableDragging(comment);
  attachCommentEditor(comment);
}

toggleDrawButton.addEventListener("click", toggleDrawMode);
addCommentButton.addEventListener("click", addComment);
clearLinesButton.addEventListener("click", clearLines);
resetMarkersButton.addEventListener("click", resetMarkers);

colorButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentColor = button.dataset.color;
    colorButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});

lineWidthInput.addEventListener("input", () => {
  currentLineWidth = Number(lineWidthInput.value);
  lineWidthValue.textContent = `${currentLineWidth}px`;
});

board.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".marker")) {
    return;
  }

  setSelectedComment(null);
  board.setPointerCapture(event.pointerId);
  startStroke(event);
});

board.addEventListener("pointermove", extendStroke);
board.addEventListener("pointerup", (event) => {
  endStroke();
  if (board.hasPointerCapture(event.pointerId)) {
    board.releasePointerCapture(event.pointerId);
  }
});
board.addEventListener("pointerleave", endStroke);
board.addEventListener("pointercancel", (event) => {
  endStroke();
  if (board.hasPointerCapture(event.pointerId)) {
    board.releasePointerCapture(event.pointerId);
  }
});

getMarkers().forEach(enableDragging);
syncInitialPositions();
syncDrawButton();
resizeCanvas();

document.addEventListener("keydown", (event) => {
  if ((event.key !== "Delete" && event.key !== "Backspace") || !selectedComment) {
    return;
  }

  event.preventDefault();
  selectedComment.remove();
  setSelectedComment(null);
});

window.addEventListener("resize", resizeCanvas);
