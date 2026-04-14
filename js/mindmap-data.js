// mindmap-data.js - マインドマップのデータモデル操作

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
        x: 600,
        y: 300,
        isRoot: true,
        parentId: null,
        childIds: [],
        color: '#4A90E2',
        textColor: '#ffffff',
      },
    ],
  };
}

export function createNode(label, parentId, x, y) {
  return {
    id: generateId(),
    label,
    x,
    y,
    isRoot: false,
    parentId,
    childIds: [],
    color: '#7ED321',
    textColor: '#ffffff',
  };
}

export function getNode(mapData, nodeId) {
  return mapData.nodes.find((n) => n.id === nodeId) || null;
}

export function addNode(mapData, parentId, label) {
  const parent = getNode(mapData, parentId);
  if (!parent) return null;

  // 親の右側にオフセットを置く
  const offsetX = 180;
  const offsetY = parent.childIds.length * 70 - (parent.childIds.length > 0 ? 35 : 0);
  const node = createNode(label, parentId, parent.x + offsetX, parent.y + offsetY);

  mapData.nodes.push(node);
  parent.childIds.push(node.id);
  mapData.updatedAt = new Date().toISOString();
  return node;
}

export function removeNode(mapData, nodeId) {
  const node = getNode(mapData, nodeId);
  if (!node || node.isRoot) return false;

  // 子ノードを再帰的に削除
  const toRemove = collectDescendants(mapData, nodeId);
  toRemove.push(nodeId);

  // 親の childIds から除去
  if (node.parentId) {
    const parent = getNode(mapData, node.parentId);
    if (parent) {
      parent.childIds = parent.childIds.filter((id) => id !== nodeId);
    }
  }

  mapData.nodes = mapData.nodes.filter((n) => !toRemove.includes(n.id));
  mapData.updatedAt = new Date().toISOString();
  return true;
}

function collectDescendants(mapData, nodeId) {
  const node = getNode(mapData, nodeId);
  if (!node) return [];
  let result = [];
  for (const childId of node.childIds) {
    result.push(childId);
    result = result.concat(collectDescendants(mapData, childId));
  }
  return result;
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

// マップ一覧（index.json）操作
export function createIndex() {
  return { version: '1.0', maps: [] };
}

export function addMapToIndex(index, mapData) {
  const entry = {
    id: mapData.id,
    title: mapData.title,
    createdAt: mapData.createdAt,
    updatedAt: mapData.updatedAt,
    filename: `data/map-${mapData.id}.json`,
  };
  index.maps.push(entry);
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

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
