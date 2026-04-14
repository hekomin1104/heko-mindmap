// list.js - マップ一覧画面のメインロジック

import { getFile, putFile, deleteFile } from './github-api.js';
import { isConfigured, getConfig } from './storage.js';
import { createMap, createIndex, addMapToIndex, removeMapFromIndex } from './mindmap-data.js';

// ---- DOM参照 ----
const gridEl = document.getElementById('map-grid');
const loadingEl = document.getElementById('loading');
const newMapDialog = document.getElementById('new-map-dialog');
const newMapInput = document.getElementById('new-map-title');
const deleteDialog = document.getElementById('delete-dialog');
const deleteNameEl = document.getElementById('delete-map-name');
const toastEl = document.getElementById('toast');

// ---- 状態 ----
let indexData = null;
let indexSha = null;
let pendingDeleteId = null;

// ---- 初期化 ----
async function init() {
  if (!isConfigured()) {
    location.href = 'setup.html';
    return;
  }

  await loadIndex();
}

async function loadIndex() {
  loadingEl.classList.remove('hidden');
  gridEl.innerHTML = '';

  try {
    const result = await getFile('data/index.json');

    if (!result) {
      // index.json がまだ存在しない → 作成
      indexData = createIndex();
      const res = await putFile('data/index.json', indexData, null, 'Initialize mindmap index');
      indexSha = res.sha;
    } else {
      indexData = result.content;
      indexSha = result.sha;
    }

    renderGrid();
  } catch (err) {
    loadingEl.textContent = 'エラー: ' + err.message;
    return;
  }

  loadingEl.classList.add('hidden');
}

// ---- グリッド描画 ----
function renderGrid() {
  gridEl.innerHTML = '';

  if (indexData.maps.length === 0) {
    gridEl.innerHTML = `
      <div class="empty-state">
        <p>マインドマップがまだありません。<br>「+ 新規作成」ボタンで最初のマップを作りましょう！</p>
      </div>`;
    return;
  }

  // 更新日時の新しい順に表示
  const sorted = [...indexData.maps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  for (const entry of sorted) {
    gridEl.appendChild(createCard(entry));
  }
}

function createCard(entry) {
  const card = document.createElement('div');
  card.className = 'map-card';
  card.dataset.mapId = entry.id;

  const date = formatDate(entry.updatedAt);
  const editorUrl = `editor.html?id=${entry.id}`;

  card.innerHTML = `
    <div class="map-card__preview">🗺</div>
    <div class="map-card__body">
      <div class="map-card__title" title="${escapeHtml(entry.title)}">${escapeHtml(entry.title)}</div>
      <div class="map-card__date">更新: ${date}</div>
      <div class="map-card__actions">
        <button class="btn btn-primary btn-open">開く</button>
        <button class="btn btn-ghost btn-copy">URLコピー</button>
        <button class="btn btn-danger btn-delete">削除</button>
      </div>
    </div>`;

  card.querySelector('.btn-open').addEventListener('click', () => {
    location.href = editorUrl;
  });

  card.querySelector('.btn-copy').addEventListener('click', () => {
    const { owner, repo } = getConfig();
    const url = `https://${owner}.github.io/${repo}/editor.html?id=${entry.id}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Notion埋め込み用URLをコピーしました', 'success');
    });
  });

  card.querySelector('.btn-delete').addEventListener('click', () => {
    pendingDeleteId = entry.id;
    deleteNameEl.textContent = entry.title;
    deleteDialog.classList.remove('hidden');
  });

  return card;
}

// ---- 新規作成 ----
async function createNewMap(title) {
  const mapData = createMap(title);
  const filename = `data/map-${mapData.id}.json`;

  try {
    // マップファイル作成
    await putFile(filename, mapData, null, `Create mindmap: ${title}`);

    // index.json 更新
    addMapToIndex(indexData, mapData);
    const res = await putFile('data/index.json', indexData, indexSha, `Add to index: ${title}`);
    indexSha = res.sha;

    showToast(`「${title}」を作成しました`, 'success');
    renderGrid();

    // 作成後すぐにエディタへ
    location.href = `editor.html?id=${mapData.id}`;
  } catch (err) {
    showToast('作成に失敗しました: ' + err.message, 'error');
  }
}

// ---- 削除 ----
async function deleteMap(mapId) {
  const entry = indexData.maps.find((m) => m.id === mapId);
  if (!entry) return;

  try {
    // マップファイルを削除
    const fileResult = await getFile(entry.filename);
    if (fileResult) {
      await deleteFile(entry.filename, fileResult.sha, `Delete mindmap: ${entry.title}`);
    }

    // index.json から除去
    removeMapFromIndex(indexData, mapId);
    const res = await putFile('data/index.json', indexData, indexSha, `Remove from index: ${entry.title}`);
    indexSha = res.sha;

    showToast(`「${entry.title}」を削除しました`);
    renderGrid();
  } catch (err) {
    showToast('削除に失敗しました: ' + err.message, 'error');
  }
}

// ---- イベント ----
document.getElementById('btn-new-map').addEventListener('click', () => {
  newMapInput.value = '';
  newMapDialog.classList.remove('hidden');
  setTimeout(() => newMapInput.focus(), 50);
});

document.getElementById('btn-create-confirm').addEventListener('click', async () => {
  const title = newMapInput.value.trim() || '新しいマインドマップ';
  newMapDialog.classList.add('hidden');
  await createNewMap(title);
});

document.getElementById('btn-create-cancel').addEventListener('click', () => {
  newMapDialog.classList.add('hidden');
});

newMapInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-create-confirm').click();
  if (e.key === 'Escape') document.getElementById('btn-create-cancel').click();
});

document.getElementById('btn-delete-confirm').addEventListener('click', async () => {
  deleteDialog.classList.add('hidden');
  if (pendingDeleteId) await deleteMap(pendingDeleteId);
  pendingDeleteId = null;
});

document.getElementById('btn-delete-cancel').addEventListener('click', () => {
  deleteDialog.classList.add('hidden');
  pendingDeleteId = null;
});

document.getElementById('btn-settings').addEventListener('click', () => {
  location.href = 'setup.html';
});

// ---- ヘルパー ----
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = type ? `show ${type}` : 'show';
  setTimeout(() => { toastEl.className = type; }, 2500);
}

init();
