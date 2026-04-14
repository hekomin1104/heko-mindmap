// mindmap-data.js - マインドマップのデータモデル操作

const LEVEL_COLORS = ['#4A90E2', '#27AE60', '#E67E22', '#8E44AD', '#E74C3C'];
const LEVEL_GAP = 220;
const NODE_GAP = 80;

export function createMap(title) {
  const id = generateId();
  const now = new Date().toISOString();
  return {
    version: '1.0',
    id,
    title,
    createdAt: now,
    updatedAt: now,
    viewport: { x: 0, y: 0, scale: 1.0 },
    nodes: [
      {
        id: 'node-root',
        label: title,
        x: 300,
        y: 400,
        isRoot: true,
        parentId: null,
        childIds: [],
        collapsed: false,
        color: LEVEL_COLORS[0],
        textColor: '#ffffff',
      },
    ],
  };
}

export function getNode(mapData, nodeId) {
  return mapData.nodes.find((n) => n.id === nodeId) || null;
}

export function addNode(mapData, parentId, label) {
  const parent = getNode(mapData, parentId);
  if (!parent) return null;

  // レベルに応じた色
  const level = getNodeLevel(mapData, parentId) + 1;
  const color = LEVEL_COLORS[Math.min(level, LEVEL_COLORS.length - 1)];

  const node = {
    id: generateId(),
    label,
    x: parent.x + LEVEL_GAP,
    y: parent.y + parent.childIds.length * NODE_GAP,
    isRoot: false,
    parentId,
    childIds: [],
    collapsed: false,
    color,
    textColor: '#ffffff',
  };

  mapData.nodes.push(node);
  parent.childIds.push(node.id);
  mapData.updatedAt = new Date().toISOString();
  return node;
}

export function removeNode(mapData, nodeId) {
  const node = getNode(mapData, nodeId);
  if (!node || node.isRoot) return false;

  const toRemove = [nodeId, ...collectDescendants(mapData, nodeId)];

  if (node.parentId) {
    const parent = getNode(mapData, node.parentId);
    if (parent) parent.childIds = parent.childIds.filter((id) => id !== nodeId);
  }

  mapData.nodes = mapData.nodes.filter((n) => !toRemove.includes(n.id));
  mapData.updatedAt = new Date().toISOString();
  return true;
}

export function updateNodeLabel(mapData, nodeId, label) {
  const node = getNode(mapData, nodeId);
  if (!node) return;
  node.label = label;
  mapData.updatedAt = new Date().toISOString();
}

export function updateNodePosition(mapData, nodeId, x, y) {
  const node = getNode(mapData, nodeId);
  if (!node) return;
  node.x = x;
  node.y = y;
  mapData.updatedAt = new Date().toISOString();
}

// ---- 再接続 ----

// nodeId が ancestorId の子孫かどうか（自身含む）
export function isDescendant(mapData, nodeId, ancestorId) {
  if (nodeId === ancestorId) return true;
  const ancestor = getNode(mapData, ancestorId);
  if (!ancestor) return false;
  return ancestor.childIds.some((cid) => isDescendant(mapData, nodeId, cid));
}

// nodeId を newParentId の子として再接続。同一親なら末尾へ移動
export function reparentNode(mapData, nodeId, newParentId) {
  if (nodeId === newParentId) return false;
  if (isDescendant(mapData, newParentId, nodeId)) return false; // 循環防止

  const node = getNode(mapData, nodeId);
  if (!node || node.isRoot) return false;

  // 旧親から除去
  if (node.parentId) {
    const oldParent = getNode(mapData, node.parentId);
    if (oldParent) oldParent.childIds = oldParent.childIds.filter((id) => id !== nodeId);
  }

  // 新親へ追加
  const newParent = getNode(mapData, newParentId);
  if (!newParent) return false;
  node.parentId = newParentId;
  newParent.childIds.push(nodeId);

  // レベルに応じた色を更新
  updateSubtreeColors(mapData, nodeId);

  mapData.updatedAt = new Date().toISOString();
  return true;
}

// ---- 折りたたみ ----

export function toggleCollapse(mapData, nodeId) {
  const node = getNode(mapData, nodeId);
  if (!node) return;
  node.collapsed = !node.collapsed;
  mapData.updatedAt = new Date().toISOString();
}

// 表示すべきノードIDのセットを返す（折りたたまれた子孫は含まない）
export function getVisibleNodeIds(mapData) {
  const visible = new Set();
  function traverse(nodeId) {
    visible.add(nodeId);
    const node = getNode(mapData, nodeId);
    if (!node || node.collapsed) return;
    for (const cid of node.childIds) traverse(cid);
  }
  const root = mapData.nodes.find((n) => n.isRoot);
  if (root) traverse(root.id);
  return visible;
}

// ---- 自動レイアウト ----

// サブツリーが占める縦幅を返す（折りたたみ考慮）
function subtreeHeight(mapData, nodeId) {
  const node = getNode(mapData, nodeId);
  if (!node || node.collapsed || node.childIds.length === 0) return NODE_GAP;
  return node.childIds.reduce((sum, cid) => sum + subtreeHeight(mapData, cid), 0);
}

function layoutSubtree(mapData, nodeId, x, y) {
  const node = getNode(mapData, nodeId);
  if (!node) return;
  node.x = x;
  node.y = y;
  if (node.collapsed || node.childIds.length === 0) return;

  const totalH = subtreeHeight(mapData, nodeId);
  let curY = y - totalH / 2;
  for (const cid of node.childIds) {
    const h = subtreeHeight(mapData, cid);
    layoutSubtree(mapData, cid, x + LEVEL_GAP, curY + h / 2);
    curY += h;
  }
}

export function autoLayout(mapData) {
  const root = mapData.nodes.find((n) => n.isRoot);
  if (!root) return;

  root.x = 300;
  root.y = 400;

  if (!root.collapsed && root.childIds.length > 0) {
    const totalH = root.childIds.reduce((sum, cid) => sum + subtreeHeight(mapData, cid), 0);
    let curY = root.y - totalH / 2;
    for (const cid of root.childIds) {
      const h = subtreeHeight(mapData, cid);
      layoutSubtree(mapData, cid, root.x + LEVEL_GAP, curY + h / 2);
      curY += h;
    }
  }

  mapData.updatedAt = new Date().toISOString();
}

// ---- マップ一覧（index.json）操作 ----

export function createIndex() {
  return { version: '1.0', maps: [] };
}

export function addMapToIndex(index, mapData) {
  index.maps.push({
    id: mapData.id,
    title: mapData.title,
    createdAt: mapData.createdAt,
    updatedAt: mapData.updatedAt,
    filename: `data/map-${mapData.id}.json`,
  });
}

export function removeMapFromIndex(index, mapId) {
  index.maps = index.maps.filter((m) => m.id !== mapId);
}

export function updateMapInIndex(index, mapData) {
  const entry = index.maps.find((m) => m.id === mapData.id);
  if (entry) {
    entry.title = mapData.title;
    entry.updatedAt = mapData.updatedAt;
  }
}

// ---- ユーティリティ ----

function collectDescendants(mapData, nodeId) {
  const node = getNode(mapData, nodeId);
  if (!node) return [];
  return node.childIds.flatMap((cid) => [cid, ...collectDescendants(mapData, cid)]);
}

function getNodeLevel(mapData, nodeId) {
  let level = 0;
  let cur = getNode(mapData, nodeId);
  while (cur && cur.parentId) {
    level++;
    cur = getNode(mapData, cur.parentId);
  }
  return level;
}

function updateSubtreeColors(mapData, nodeId) {
  const node = getNode(mapData, nodeId);
  if (!node) return;
  const level = getNodeLevel(mapData, nodeId);
  node.color = LEVEL_COLORS[Math.min(level, LEVEL_COLORS.length - 1)];
  for (const cid of node.childIds) updateSubtreeColors(mapData, cid);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
