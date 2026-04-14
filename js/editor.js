// editor.js - マインドマップ編集画面のメインロジック

import { getFile, putFile } from './github-api.js';
import { isConfigured, getConfig } from './storage.js';
import { addNode, removeNode, updateNodeLabel, updateNodePosition, updateMapInIndex } from './mindmap-data.js';
import { Renderer } from './renderer.js';
import { DragController } from './drag-drop.js';

// ---- DOM参照 ----
const svgEl = document.getElementById('mindmap-svg');
const titleEl = document.getElementById('map-title');
const unsavedEl = document.getElementById('unsaved-indicator');
const saveBtnEl = document.getElementById('save-btn');
const canvasLoading = document.getElementById('canvas-loading');
const setupPrompt = document.getElementById('setup-prompt');
const toastEl = document.getElementById('toast');

// ---- 状態 ----
let mapData = null;
let mapSha = null;
let indexData = null;
let indexSha = null;
let unsaved = false;
let renderer = null;
let drag = null;

// ---- 初期化 ----
async function init() {
  if (!isConfigured()) {
    canvasLoading.classList.add('hidden');
    setupPrompt.classList.remove('hidden');
    return;
  }

  const params = new URLSearchParams(location.search);
  const mapId = params.get('id');
  if (!mapId) {
    location.href = 'index.html';
    return;
  }

  try {
    // index と map を並列取得
    const [idxResult, mapResult] = await Promise.all([
      getFile('data/index.json'),
      getFile(`data/map-${mapId}.json`),
    ]);

    if (!mapResult) {
      showToast('マインドマップが見つかりません', 'error');
      setTimeout(() => { location.href = 'index.html'; }, 2000);
      return;
    }

    if (idxResult) {
      indexData = idxResult.content;
      indexSha = idxResult.sha;
    }

    mapData = mapResult.content;
    mapSha = mapResult.sha;

    canvasLoading.classList.add('hidden');
    document.getElementById('canvas-container').classList.remove('hidden');

    titleEl.textContent = mapData.title;

    renderer = new Renderer(svgEl, {
      onAddNode: handleAddNode,
      onRemoveNode: handleRemoveNode,
      onEditNode: handleEditNode,
      onNodeMousedown: (e, nodeId) => drag.startNodeDrag(e, nodeId),
    });

    drag = new DragController(svgEl, renderer, mapData, {
      onNodeMoved: (id, x, y) => updateNodePosition(mapData, id, x, y),
      onPanned: (x, y, s) => {
        mapData.viewport = { x, y, scale: s };
      },
      markUnsaved,
    });

    renderer.render(mapData);
    bindZoom();
    bindTitle();

  } catch (err) {
    canvasLoading.textContent = 'エラーが発生しました: ' + err.message;
  }
}

// ---- ノード操作 ----
function handleAddNode(parentId) {
  const label = promptInline('新しいノードのラベルを入力') || '新しいノード';
  const node = addNode(mapData, parentId, label);
  if (!node) return;
  renderer.render(mapData);
  markUnsaved();
}

function handleRemoveNode(nodeId) {
  if (!confirm('このノードとその子ノードをすべて削除しますか？')) return;
  removeNode(mapData, nodeId);
  renderer.render(mapData);
  markUnsaved();
}

function handleEditNode(nodeId, newLabel) {
  updateNodeLabel(mapData, nodeId, newLabel);
  renderer.render(mapData);
  markUnsaved();
}

// ---- 保存 ----
async function save() {
  if (!unsaved) return;
  saveBtnEl.disabled = true;
  saveBtnEl.textContent = '保存中…';

  try {
    const now = new Date().toISOString();
    mapData.updatedAt = now;

    const msg = `Update mindmap: ${mapData.title} (${new Date().toLocaleString('ja-JP')})`;
    const result = await putFile(`data/map-${mapData.id}.json`, mapData, mapSha, msg);
    mapSha = result.sha;

    // index.json を更新
    if (indexData && indexSha) {
      updateMapInIndex(indexData, mapData);
      const idxResult = await putFile('data/index.json', indexData, indexSha, `Update index: ${mapData.title}`);
      indexSha = idxResult.sha;
    }

    markSaved();
    showToast('保存しました', 'success');
  } catch (err) {
    showToast('保存に失敗しました: ' + err.message, 'error');
  } finally {
    saveBtnEl.disabled = false;
    saveBtnEl.textContent = '保存';
  }
}

// ---- ズーム ----
function bindZoom() {
  const step = 0.15;
  document.getElementById('zoom-in').addEventListener('click', () => applyZoom(step));
  document.getElementById('zoom-out').addEventListener('click', () => applyZoom(-step));
  document.getElementById('zoom-reset').addEventListener('click', () => {
    renderer.setViewport(0, 0, 1.0);
    if (mapData) mapData.viewport = { x: 0, y: 0, scale: 1.0 };
  });

  svgEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    applyZoom(e.deltaY < 0 ? step : -step);
  }, { passive: false });
}

function applyZoom(delta) {
  const s = Math.max(0.2, Math.min(3.0, renderer.scale + delta));
  const rect = svgEl.getBoundingClientRect();
  // ビューポート中央を基準にズーム
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const nx = cx - (cx - renderer.vx) * (s / renderer.scale);
  const ny = cy - (cy - renderer.vy) * (s / renderer.scale);
  renderer.setViewport(nx, ny, s);
  if (mapData) mapData.viewport = { x: nx, y: ny, scale: s };
}

// ---- タイトル編集 ----
function bindTitle() {
  titleEl.addEventListener('click', () => {
    const input = document.createElement('input');
    input.value = mapData.title;
    input.style.cssText = 'font-size:15px;font-weight:600;border:none;outline:1px solid #4A90E2;border-radius:4px;padding:2px 6px;width:200px;';
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const finish = () => {
      const newTitle = input.value.trim() || mapData.title;
      mapData.title = newTitle;
      const root = mapData.nodes.find((n) => n.isRoot);
      if (root && root.label === titleEl.textContent) {
        updateNodeLabel(mapData, root.id, newTitle);
        renderer.render(mapData);
      }
      titleEl.textContent = newTitle;
      input.replaceWith(titleEl);
      markUnsaved();
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = mapData.title; input.blur(); }
    });
  });
}

// ---- UI ヘルパー ----
function markUnsaved() {
  unsaved = true;
  unsavedEl.classList.remove('hidden');
}

function markSaved() {
  unsaved = false;
  unsavedEl.classList.add('hidden');
}

function showToast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = type ? `show ${type}` : 'show';
  setTimeout(() => { toastEl.className = type; }, 2500);
}

// インラインプロンプトの代わりにカスタムダイアログを使用（iframe対応）
function promptInline(message) {
  return window.prompt(message);
}

// ---- イベントバインド ----
saveBtnEl.addEventListener('click', save);

document.getElementById('btn-open-tab').addEventListener('click', () => {
  window.open(location.href, '_blank');
});

// 未保存警告（Notion iframeではbeforeunloadが効かない場合あり）
window.addEventListener('beforeunload', (e) => {
  if (unsaved) {
    e.preventDefault();
    e.returnValue = '';
  }
});

init();
