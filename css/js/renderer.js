// renderer.js - SVG描画エンジン

import { getVisibleNodeIds } from './mindmap-data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class Renderer {
  constructor(svgEl, { onAddNode, onRemoveNode, onEditNode, onNodeMousedown, onCollapseToggle }) {
    this.svg = svgEl;
    this.onAddNode = onAddNode;
    this.onRemoveNode = onRemoveNode;
    this.onEditNode = onEditNode;
    this.onNodeMousedown = onNodeMousedown;
    this.onCollapseToggle = onCollapseToggle;

    this.edgeLayer = this._mkGroup('edges-layer');
    this.nodeLayer = this._mkGroup('nodes-layer');
    this.svg.appendChild(this.edgeLayer);
    this.svg.appendChild(this.nodeLayer);

    this.vx = 0;
    this.vy = 0;
    this.scale = 1.0;
    this._dropTargetId = null;
  }

  render(mapData) {
    this.mapData = mapData;
    this.vx = mapData.viewport.x;
    this.vy = mapData.viewport.y;
    this.scale = mapData.viewport.scale;

    this.edgeLayer.innerHTML = '';
    this.nodeLayer.innerHTML = '';

    const visible = getVisibleNodeIds(mapData);

    // エッジ（表示ノード間のみ）
    for (const node of mapData.nodes) {
      if (!visible.has(node.id)) continue;
      for (const cid of node.childIds) {
        if (visible.has(cid)) {
          const child = mapData.nodes.find((n) => n.id === cid);
          if (child) this._renderEdge(node, child);
        }
      }
    }

    // ノード
    for (const node of mapData.nodes) {
      if (visible.has(node.id)) this._renderNode(node, mapData);
    }

    this._applyViewport();
  }

  // ドラッグ中のノード位置を高速更新
  moveNodeEl(nodeId, x, y) {
    const g = this.nodeLayer.querySelector(`[data-node-id="${nodeId}"]`);
    if (g) g.setAttribute('transform', `translate(${x},${y})`);
  }

  // 接続エッジのみ再描画
  updateEdgesFor(nodeId, mapData) {
    this.mapData = mapData;
    this.edgeLayer.querySelectorAll(`[data-edge*="${nodeId}"]`).forEach((el) => el.remove());
    const node = mapData.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    for (const cid of node.childIds) {
      const child = mapData.nodes.find((n) => n.id === cid);
      if (child) this._renderEdge(node, child);
    }
    if (node.parentId) {
      const parent = mapData.nodes.find((n) => n.id === node.parentId);
      if (parent) this._renderEdge(parent, node);
    }
  }

  // ドロップターゲットをハイライト
  highlightDropTarget(nodeId) {
    if (this._dropTargetId === nodeId) return;
    this.clearDropHighlight();
    this._dropTargetId = nodeId;
    if (!nodeId) return;
    const g = this.nodeLayer.querySelector(`[data-node-id="${nodeId}"]`);
    if (g) {
      g.querySelector('.node-rect')?.classList.add('drop-target');
    }
  }

  clearDropHighlight() {
    if (!this._dropTargetId) return;
    const g = this.nodeLayer.querySelector(`[data-node-id="${this._dropTargetId}"]`);
    if (g) g.querySelector('.node-rect')?.classList.remove('drop-target');
    this._dropTargetId = null;
  }

  setViewport(x, y, scale) {
    this.vx = x;
    this.vy = y;
    this.scale = scale;
    this._applyViewport();
  }

  // クライアント座標 → キャンバス座標
  clientToCanvas(clientX, clientY) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.vx) / this.scale,
      y: (clientY - rect.top - this.vy) / this.scale,
    };
  }

  // ---- プライベート ----

  _renderNode(node, mapData) {
    const W = this._nodeWidth(node.label);
    const H = 40;
    const hasChildren = node.childIds.length > 0;

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'node-group');
    g.setAttribute('data-node-id', node.id);
    g.setAttribute('transform', `translate(${node.x},${node.y})`);

    // 影用の rect
    const shadow = document.createElementNS(SVG_NS, 'rect');
    shadow.setAttribute('x', -W / 2 + 2);
    shadow.setAttribute('y', -H / 2 + 3);
    shadow.setAttribute('width', W);
    shadow.setAttribute('height', H);
    shadow.setAttribute('rx', 8);
    shadow.setAttribute('fill', 'rgba(0,0,0,0.12)');
    shadow.setAttribute('pointer-events', 'none');

    // 本体
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'node-rect');
    rect.setAttribute('x', -W / 2);
    rect.setAttribute('y', -H / 2);
    rect.setAttribute('width', W);
    rect.setAttribute('height', H);
    rect.setAttribute('rx', 8);
    rect.setAttribute('fill', node.color || '#4A90E2');
    if (this._dropTargetId === node.id) rect.classList.add('drop-target');

    // テキスト
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('class', 'node-text');
    text.setAttribute('fill', node.textColor || '#ffffff');
    text.textContent = this._truncate(node.label, 22);

    g.appendChild(shadow);
    g.appendChild(rect);
    g.appendChild(text);

    // 折りたたみボタン（子あり）
    if (hasChildren) {
      g.appendChild(this._createCollapseBtn(W / 2, node.id, node.collapsed, node.childIds.length));
    }

    // ＋ボタン
    if (!node.collapsed) {
      g.appendChild(this._createAddBtn(W / 2, node.id));
    }

    // 削除ボタン（ルート以外）
    if (!node.isRoot) {
      g.appendChild(this._createDelBtn(-W / 2, node.id));
    }

    // ダブルクリックでテキスト編集
    g.addEventListener('dblclick', (e) => {
      if (e.target.closest('.add-btn,.del-btn,.collapse-btn')) return;
      e.stopPropagation();
      this._startEdit(g, node, W, H);
    });

    // マウスダウン → ドラッグ開始
    g.addEventListener('mousedown', (e) => {
      if (e.target.closest('.add-btn,.del-btn,.collapse-btn')) return;
      this.onNodeMousedown(e, node.id);
    });

    g.addEventListener('touchstart', (e) => {
      if (e.target.closest('.add-btn,.del-btn,.collapse-btn')) return;
      e.preventDefault();
      const t = e.touches[0];
      this.onNodeMousedown({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => {} }, node.id);
    }, { passive: false });

    this.nodeLayer.appendChild(g);
  }

  _createCollapseBtn(rightEdge, nodeId, collapsed, childCount) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'collapse-btn');
    // ノード右端のすぐ右・下にバッジとして配置
    g.setAttribute('transform', `translate(${rightEdge + 14}, 22)`);

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('r', 10);
    circle.setAttribute('fill', collapsed ? '#95a5a6' : '#bdc3c7');
    circle.setAttribute('class', 'collapse-circle');

    const icon = document.createElementNS(SVG_NS, 'text');
    icon.setAttribute('dy', '0.35em');
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('font-size', '10');
    icon.setAttribute('fill', '#fff');
    icon.setAttribute('pointer-events', 'none');
    icon.setAttribute('font-family', 'sans-serif');
    icon.textContent = collapsed ? `+${childCount}` : '▾';

    g.appendChild(circle);
    g.appendChild(icon);

    g.addEventListener('click', (e) => { e.stopPropagation(); this.onCollapseToggle(nodeId); });
    g.addEventListener('mousedown', (e) => e.stopPropagation());
    g.addEventListener('touchend', (e) => { e.stopPropagation(); e.preventDefault(); this.onCollapseToggle(nodeId); });
    return g;
  }

  _createAddBtn(rightEdge, nodeId) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'add-btn');
    g.setAttribute('transform', `translate(${rightEdge + 14}, -8)`);

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('r', 11);
    circle.setAttribute('class', 'add-circle');

    const icon = document.createElementNS(SVG_NS, 'text');
    icon.setAttribute('dy', '0.35em');
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('font-size', '16');
    icon.setAttribute('fill', '#fff');
    icon.setAttribute('pointer-events', 'none');
    icon.textContent = '+';

    g.appendChild(circle);
    g.appendChild(icon);
    g.addEventListener('click', (e) => { e.stopPropagation(); this.onAddNode(nodeId); });
    g.addEventListener('mousedown', (e) => e.stopPropagation());
    g.addEventListener('touchend', (e) => { e.stopPropagation(); e.preventDefault(); this.onAddNode(nodeId); });
    return g;
  }

  _createDelBtn(leftEdge, nodeId) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'del-btn');
    g.setAttribute('transform', `translate(${leftEdge - 14}, 0)`);

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('r', 10);
    circle.setAttribute('class', 'del-circle');

    const icon = document.createElementNS(SVG_NS, 'text');
    icon.setAttribute('dy', '0.35em');
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('font-size', '14');
    icon.setAttribute('fill', '#fff');
    icon.setAttribute('pointer-events', 'none');
    icon.textContent = '×';

    g.appendChild(circle);
    g.appendChild(icon);
    g.addEventListener('click', (e) => { e.stopPropagation(); this.onRemoveNode(nodeId); });
    g.addEventListener('mousedown', (e) => e.stopPropagation());
    return g;
  }

  _renderEdge(parent, child) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'edge');
    path.setAttribute('data-edge', `${parent.id}-${child.id}`);
    path.setAttribute('d', this._bezier(parent, child));
    this.edgeLayer.appendChild(path);
  }

  _bezier(p, c) {
    const mx = (p.x + c.x) / 2;
    return `M ${p.x},${p.y} C ${mx},${p.y} ${mx},${c.y} ${c.x},${c.y}`;
  }

  _startEdit(groupEl, node, W, H) {
    const textEl = groupEl.querySelector('text.node-text');
    textEl.style.visibility = 'hidden';

    const fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('x', -W / 2 + 6);
    fo.setAttribute('y', -H / 2 + 5);
    fo.setAttribute('width', W - 12);
    fo.setAttribute('height', H - 10);

    const input = document.createElement('input');
    input.value = node.label;
    input.style.cssText = `width:100%;height:100%;border:none;background:transparent;text-align:center;font-size:14px;font-family:inherit;color:${node.textColor||'#fff'};outline:none;`;

    fo.appendChild(input);
    groupEl.appendChild(fo);
    setTimeout(() => { input.focus(); input.select(); }, 0);

    const finish = () => {
      const val = input.value.trim() || node.label;
      fo.remove();
      textEl.style.visibility = '';
      this.onEditNode(node.id, val);
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = node.label; input.blur(); }
    });
  }

  _nodeWidth(label) {
    return Math.min(Math.max(100, label.length * 9 + 40), 240);
  }

  _truncate(label, max) {
    return label.length > max ? label.slice(0, max) + '…' : label;
  }

  _mkGroup(id) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('id', id);
    return g;
  }

  _applyViewport() {
    const t = `translate(${this.vx},${this.vy}) scale(${this.scale})`;
    this.edgeLayer.setAttribute('transform', t);
    this.nodeLayer.setAttribute('transform', t);
  }
}
