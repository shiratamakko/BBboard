const board = document.getElementById("board");
const canvas = document.getElementById("drawLayer");
const ctx = canvas.getContext("2d");
const toggleDrawButton = document.getElementById("toggleDraw");
const addCommentButton = document.getElementById("addComment");
const clearLinesButton = document.getElementById("clearLines");
const resetMarkersButton = document.getElementById("resetMarkers");
const commentToolbar = document.getElementById("commentToolbar");
const toolbarEditButton = document.getElementById("toolbarEdit");
const toolbarDeleteButton = document.getElementById("toolbarDelete");
const commentEditorModal = document.getElementById("commentEditorModal");
const commentEditorInput = document.getElementById("commentEditorInput");
const commentEditorCount = document.getElementById("commentEditorCount");
const commentEditorError = document.getElementById("commentEditorError");
const cancelCommentEditButton = document.getElementById("cancelCommentEdit");
const saveCommentEditButton = document.getElementById("saveCommentEdit");
const colorButtons = document.querySelectorAll(".color-swatch");
const lineWidthInput = document.getElementById("lineWidth");
const lineWidthValue = document.getElementById("lineWidthValue");

let drawMode = false;
let currentColor = "#ffffff";
let currentLineWidth = 3;
let isDrawing = false;
let currentStroke = null;
let selectedComment = null;
let editingComment = null;
const strokes = [];
const initialPositions = [];
const MAX_COMMENT_LENGTH = 50;
const MIN_BOARD_SCALE = 1;
const MAX_BOARD_SCALE = 2.4;
const activePointers = new Map();
let boardScale = 1;
let boardTranslate = { x: 0, y: 0 };
let pinchStartDistance = 0;
let pinchStartScale = 1;
let isPanning = false;
let panStartPoint = null;
let panStartTranslate = null;

function resizeCanvas() {
  const rect = board.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  redraw();
  clampBoardTranslate();
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

function distanceBetween(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function setBoardScale(scale) {
  boardScale = clamp(scale, MIN_BOARD_SCALE, MAX_BOARD_SCALE);
  board.style.setProperty("--board-scale", boardScale.toFixed(3));
  clampBoardTranslate();
  if (selectedComment) {
    scheduleCommentBoundsCheck(selectedComment);
  }
}

function setBoardTranslate(x, y) {
  boardTranslate = { x, y };
  board.style.setProperty("--board-tx", `${x.toFixed(1)}px`);
  board.style.setProperty("--board-ty", `${y.toFixed(1)}px`);
}

function getMaxTranslate() {
  const rect = board.getBoundingClientRect();
  const baseWidth = rect.width / boardScale;
  const baseHeight = rect.height / boardScale;
  return {
    x: ((boardScale - 1) * baseWidth) / 2,
    y: ((boardScale - 1) * baseHeight) / 2,
  };
}

function clampBoardTranslate() {
  const limits = getMaxTranslate();
  const nextX = clamp(boardTranslate.x, -limits.x, limits.x);
  const nextY = clamp(boardTranslate.y, -limits.y, limits.y);
  setBoardTranslate(nextX, nextY);
}

function updatePointerPosition(event) {
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
}

function handleZoomPointerDown(event) {
  if (event.pointerType !== "touch") {
    return;
  }

  updatePointerPosition(event);
  if (activePointers.size === 2) {
    const points = Array.from(activePointers.values());
    pinchStartDistance = distanceBetween(points[0], points[1]) || 1;
    pinchStartScale = boardScale;
  }
}

function handleZoomPointerMove(event) {
  if (event.pointerType !== "touch") {
    return;
  }

  if (!activePointers.has(event.pointerId)) {
    return;
  }

  updatePointerPosition(event);
  if (activePointers.size === 2) {
    event.preventDefault();
    const points = Array.from(activePointers.values());
    const distance = distanceBetween(points[0], points[1]);
    const nextScale = pinchStartScale * (distance / pinchStartDistance);
    setBoardScale(nextScale);
    if (isPanning) {
      isPanning = false;
    }
  }
}

function handleZoomPointerEnd(event) {
  if (event.pointerType !== "touch") {
    return;
  }

  if (!activePointers.has(event.pointerId)) {
    return;
  }

  activePointers.delete(event.pointerId);
  if (activePointers.size < 2) {
    pinchStartDistance = 0;
  }
}

function canPanBoard(event) {
  if (drawMode) {
    return false;
  }
  if (boardScale <= 1) {
    return false;
  }
  if (event.target.closest(".marker") || event.target.closest(".comment-toolbar")) {
    return false;
  }
  return true;
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

function ensureCommentContent(comment) {
  let content = comment.querySelector(".comment-content");
  if (!content) {
    content = document.createElement("div");
    content.className = "comment-content";
    comment.appendChild(content);
  }
  return content;
}

function getCommentText(comment) {
  return ensureCommentContent(comment).textContent;
}

function setCommentText(comment, text) {
  ensureCommentContent(comment).textContent = text;
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

  if (activePointers.size > 1) {
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
  syncCommentToolbar();
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
    if (marker === selectedComment) {
      syncCommentToolbar();
    }
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

function syncCommentToolbar() {
  if (!selectedComment) {
    commentToolbar.hidden = true;
    return;
  }

  const commentRect = selectedComment.getBoundingClientRect();
  const boardRect = board.getBoundingClientRect();
  const toolbarWidth = commentToolbar.offsetWidth || 110;
  const toolbarHeight = commentToolbar.offsetHeight || 42;
  const left = clamp(
    commentRect.left - boardRect.left + commentRect.width / 2 - toolbarWidth / 2,
    8,
    boardRect.width - toolbarWidth - 8,
  );
  const topCandidate = commentRect.top - boardRect.top - toolbarHeight - 12;
  const top = topCandidate < 8 ? commentRect.bottom - boardRect.top + 12 : topCandidate;

  commentToolbar.hidden = false;
  commentToolbar.style.left = `${left}px`;
  commentToolbar.style.top = `${top}px`;
}

function keepCommentInBounds(comment) {
  if (!comment) {
    return;
  }

  const boardRect = board.getBoundingClientRect();
  const commentRect = comment.getBoundingClientRect();
  const currentCenterX = ((commentRect.left - boardRect.left) + (commentRect.width / 2));
  const currentCenterY = ((commentRect.top - boardRect.top) + (commentRect.height / 2));
  const minCenterX = (commentRect.width / 2) + 8;
  const maxCenterX = boardRect.width - (commentRect.width / 2) - 8;
  const minCenterY = (commentRect.height / 2) + 8;
  const maxCenterY = boardRect.height - (commentRect.height / 2) - 8;
  const nextX = clamp((clamp(currentCenterX, minCenterX, maxCenterX) / boardRect.width) * 100, 2, 98);
  const nextY = clamp((clamp(currentCenterY, minCenterY, maxCenterY) / boardRect.height) * 100, 2, 98);
  setMarkerPosition(comment, nextX, nextY);
}

function scheduleCommentBoundsCheck(comment) {
  if (!comment) {
    return;
  }

  requestAnimationFrame(() => {
    keepCommentInBounds(comment);
    syncCommentToolbar();
  });

  window.setTimeout(() => {
    keepCommentInBounds(comment);
    syncCommentToolbar();
  }, 120);

  window.setTimeout(() => {
    keepCommentInBounds(comment);
    syncCommentToolbar();
  }, 260);
}

function updateCommentCount() {
  const length = commentEditorInput.value.length;
  commentEditorCount.textContent = `${length} / ${MAX_COMMENT_LENGTH}`;
  const isOver = length > MAX_COMMENT_LENGTH;
  commentEditorCount.classList.toggle("over", isOver);
  commentEditorError.hidden = !isOver;
  saveCommentEditButton.disabled = isOver;
}

function closeCommentEditor() {
  if (editingComment?.dataset.newComment === "true" && !getCommentText(editingComment).trim()) {
    if (selectedComment === editingComment) {
      setSelectedComment(null);
    }
    editingComment.remove();
  }
  commentEditorModal.hidden = true;
  commentEditorError.hidden = true;
  saveCommentEditButton.disabled = false;
  editingComment = null;
}

function openCommentEditor(comment) {
  if (!comment) {
    return;
  }

  editingComment = comment;
  commentEditorInput.value = getCommentText(comment);
  updateCommentCount();
  commentEditorModal.hidden = false;
  commentEditorInput.focus();
  commentEditorInput.setSelectionRange(
    commentEditorInput.value.length,
    commentEditorInput.value.length,
  );
}

function saveCommentEdit() {
  if (!editingComment) {
    return;
  }

  const rawText = commentEditorInput.value;
  if (rawText.length > MAX_COMMENT_LENGTH) {
    commentEditorError.hidden = false;
    saveCommentEditButton.disabled = true;
    commentEditorInput.focus();
    return;
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    if (selectedComment === editingComment) {
      setSelectedComment(null);
    }
    editingComment.remove();
    closeCommentEditor();
    return;
  }

  const comment = editingComment;
  setCommentText(comment, trimmed);
  if (comment.dataset.newComment === "true") {
    setMarkerPosition(comment, 50, 62);
    comment.classList.remove("is-draft");
    delete comment.dataset.newComment;
  }
  closeCommentEditor();
  setSelectedComment(comment);
  scheduleCommentBoundsCheck(comment);
}

function requestSaveCommentEdit() {
  if (!editingComment) {
    return;
  }

  commentEditorInput.blur();
  window.setTimeout(() => {
    updateCommentCount();
    if (commentEditorInput.value.length > MAX_COMMENT_LENGTH) {
      return;
    }
    saveCommentEdit();
  }, 0);
}

function handleSaveEditorPointerDown(event) {
  event.preventDefault();
  requestSaveCommentEdit();
}

function handleCancelEditorPointerDown(event) {
  event.preventDefault();
  closeCommentEditor();
}

function attachCommentEditor(comment) {
  comment.tabIndex = 0;

  comment.addEventListener("pointerdown", () => {
    setSelectedComment(comment);
  });

  comment.addEventListener("dblclick", () => {
    openCommentEditor(comment);
  });
}

function addComment() {
  const comment = document.createElement("div");
  comment.className = "marker comment is-draft";
  comment.dataset.role = "COMMENT";
  comment.dataset.newComment = "true";
  board.appendChild(comment);
  setMarkerPosition(comment, 50, 62);
  setCommentText(comment, "");
  enableDragging(comment);
  attachCommentEditor(comment);
  setSelectedComment(comment);
  openCommentEditor(comment);
}

toggleDrawButton.addEventListener("click", toggleDrawMode);
addCommentButton.addEventListener("click", addComment);
clearLinesButton.addEventListener("click", clearLines);
resetMarkersButton.addEventListener("click", resetMarkers);
toolbarEditButton.addEventListener("click", () => {
  openCommentEditor(selectedComment);
});
toolbarDeleteButton.addEventListener("click", () => {
  if (!selectedComment) {
    return;
  }

  selectedComment.remove();
  setSelectedComment(null);
});

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

cancelCommentEditButton.addEventListener("click", closeCommentEditor);
cancelCommentEditButton.addEventListener("pointerdown", handleCancelEditorPointerDown);
saveCommentEditButton.addEventListener("click", requestSaveCommentEdit);
saveCommentEditButton.addEventListener("pointerdown", handleSaveEditorPointerDown);
commentEditorInput.addEventListener("input", updateCommentCount);
commentEditorInput.addEventListener("change", updateCommentCount);
commentEditorInput.addEventListener("keyup", updateCommentCount);
commentEditorInput.addEventListener("compositionend", updateCommentCount);
commentEditorModal.addEventListener("pointerdown", (event) => {
  if (event.target.classList.contains("comment-editor-backdrop")) {
    closeCommentEditor();
  }
});

board.addEventListener("pointerdown", (event) => {
  handleZoomPointerDown(event);
  if (event.target.closest(".marker") || event.target.closest(".comment-toolbar")) {
    return;
  }

  if (activePointers.size > 1) {
    return;
  }

  if (event.pointerType === "touch" && canPanBoard(event)) {
    isPanning = true;
    panStartPoint = { x: event.clientX, y: event.clientY };
    panStartTranslate = { ...boardTranslate };
    board.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }

  setSelectedComment(null);
  board.setPointerCapture(event.pointerId);
  startStroke(event);
}, { passive: false });

board.addEventListener("pointermove", (event) => {
  handleZoomPointerMove(event);
  if (isPanning && panStartPoint && panStartTranslate) {
    event.preventDefault();
    const dx = event.clientX - panStartPoint.x;
    const dy = event.clientY - panStartPoint.y;
    setBoardTranslate(panStartTranslate.x + dx, panStartTranslate.y + dy);
    clampBoardTranslate();
    return;
  }
  extendStroke(event);
}, { passive: false });
board.addEventListener("pointerup", (event) => {
  endStroke();
  handleZoomPointerEnd(event);
  if (isPanning) {
    isPanning = false;
    panStartPoint = null;
    panStartTranslate = null;
  }
  if (board.hasPointerCapture(event.pointerId)) {
    board.releasePointerCapture(event.pointerId);
  }
});
board.addEventListener("pointerleave", endStroke);
board.addEventListener("pointercancel", (event) => {
  endStroke();
  handleZoomPointerEnd(event);
  if (isPanning) {
    isPanning = false;
    panStartPoint = null;
    panStartTranslate = null;
  }
  if (board.hasPointerCapture(event.pointerId)) {
    board.releasePointerCapture(event.pointerId);
  }
});

getMarkers().forEach(enableDragging);
syncInitialPositions();
syncDrawButton();
resizeCanvas();
setBoardScale(1);
setBoardTranslate(0, 0);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !commentEditorModal.hidden) {
    closeCommentEditor();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !commentEditorModal.hidden) {
    event.preventDefault();
    requestSaveCommentEdit();
    return;
  }

  if (!commentEditorModal.hidden) {
    return;
  }

  if ((event.key !== "Delete" && event.key !== "Backspace") || !selectedComment) {
    return;
  }

  event.preventDefault();
  selectedComment.remove();
  setSelectedComment(null);
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("resize", syncCommentToolbar);

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    if (selectedComment) {
      scheduleCommentBoundsCheck(selectedComment);
    }
  });
}
