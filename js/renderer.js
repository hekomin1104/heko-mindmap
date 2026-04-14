// renderer.js - SVG描画エンジン

const SVG_NS = 'http://www.w3.org/2000/svg';

export class Renderer {
  constructor(svgEl, { onAddNode, onRemoveNode, onEditNode, onNodeMousedown }) {
    this.svg = svgEl;
    this.onAddNode = onAddNode;
    this.onRemoveNode = onRemoveNode;
    this.onEditNode = onEditNode;
    this.onNodeMousedown = onNodeMousedown;

    // レイヤー
    this.edgeLayer = this._createGroup('edges-layer');
    this.nodeLayer = this._createGroup('nodes-layer');
    this.svg.appendChild(this.edgeLayer);
    this.svg.appendChild(this.nodeLayer);

    // ビューポート（パン・ズーム用）
    this.vx = 0;
    this.vy = 0;
    this.scale = 1.0;
  }

  // マップ全体を描画
  render(mapData) {
    this.mapData = mapData;
    this.vx = mapData.viewport.x;
    this.vy = mapData.viewport.y;
    this.scale = mapData.viewport.scale;
    this.edgeLayer.innerHTML = '';
    this.nodeLayer.innerHTML = '';

    // エッジを先に描画
    for (const node of mapData.nodes) {
      for (const childId of node.childIds) {
        const child = mapData.nodes.find((n) => n.id === childId);
        if (child) this._renderEdge(node, child);
      }
    }

    // ノードを描画
    for (const node of mapData.nodes) {
      this._renderNode(node);
    }

    this._applyViewport();
  }

  // 単一ノードの再描画
  updateNode(nodeData) {
    const existing = this.nodeLayer.querySelector(`[data-node-id="${nodeData.id}"]`);
    if (existing) existing.remove();
    this._renderNode(nodeData);
  }

  // ノードの座標だけ更新（ドラッグ中の高速パス）
  moveNodeEl(nodeId, x, y) {
    const g = this.nodeLayer.querySelector(`[data-node-id="${nodeId}"]`);
    if (g) g.setAttribute('transform', `translate(${x},${y})`);
  }

  // 特定ノードに接続するエッジを再描画
  updateEdgesFor(nodeId, mapData) {
    this.mapData = mapData;
    // 関連エッジを削除
    this.edgeLayer.querySelectorAll(`[data-edge*="${nodeId}"]`).forEach((el) => el.remove());

    const node = mapData.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // 子へのエッジ
    for (const childId of node.childIds) {
      const child = mapData.nodes.find((n) => n.id === childId);
      if (child) this._renderEdge(node, child);
    }

    // 親へのエッジ
    if (node.parentId) {
      const parent = mapData.nodes.find((n) => n.id === node.parentId);
      if (parent) this._renderEdge(parent, node);
    }
  }

  // ノードをDOMから削除
  removeNodeEl(nodeId) {
    this.nodeLayer.querySelector(`[data-node-id="${nodeId}"]`)?.remove();
  }

  // エッジをDOMから削除
  removeEdgesFor(nodeId) {
    this.edgeLayer.querySelectorAll(`[data-edge*="${nodeId}"]`).forEach((el) => el.remove());
  }

  // ビューポートを適用
  setViewport(x, y, scale) {
    this.vx = x;
    this.vy = y;
    this.scale = scale;
    this._applyViewport();
  }

  // クライアント座標 → SVGキャンバス座標
  clientToCanvas(clientX, clientY) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.vx) / this.scale,
      y: (clientY - rect.top - this.vy) / this.scale,
    };
  }

  // ---- プライベート ----

  _renderNode(node) {
    const W = this._nodeWidth(node.label);
    const H = 40;
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'node-group');
    g.setAttribute('data-node-id', node.id);
    g.setAttribute('transform', `translate(${node.x},${node.y})`);

    // 本体
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'node-rect');
    rect.setAttribute('x', -W / 2);
    rect.setAttribute('y', -H / 2);
    rect.setAttribute('width', W);
    rect.setAttribute('height', H);
    rect.setAttribute('rx', 8);
    rect.setAttribute('fill', node.color || '#4A90E2');

    // テキスト
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('class', 'node-text');
    text.setAttribute('fill', node.textColor || '#ffffff');
    text.textContent = node.label;

    g.appendChild(rect);
    g.appendChild(text);

    // ＋ボタン（子ノード追加）
    const addBtn = this._createAddBtn(W / 2, node.id);
    g.appendChild(addBtn);

    // 削除ボタン（ルートは削除不可）
    if (!node.isRoot) {
      const delBtn = this._createDelBtn(-W / 2, node.id);
      g.appendChild(delBtn);
    }

    // ダブルクリックで編集
    g.addEventListener('dblclick', (e) => {
      if (e.target.closest('.add-btn, .del-btn')) return;
      e.stopPropagation();
      this._startEdit(g, node, W, H);
    });

    // マウスダウンでドラッグ開始
    g.addEventListener('mousedown', (e) => {
      if (e.target.closest('.add-btn, .del-btn')) return;
      this.onNodeMousedown(e, node.id);
    });

    // タッチ対応
    g.addEventListener('touchstart', (e) => {
      if (e.target.closest('.add-btn, .del-btn')) return;
      const t = e.touches[0];
      this.onNodeMousedown({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => {} }, node.id);
    }, { passive: false });

    this.nodeLayer.appendChild(g);
  }

  _createAddBtn(rightEdge, nodeId) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'add-btn');
    g.setAttribute('transform', `translate(${rightEdge + 14}, 0)`);

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', 'add-circle');
    circle.setAttribute('r', 11);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('class', 'add-icon');
    text.setAttribute('dy', '0.35em');
    text.textContent = '+';

    g.appendChild(circle);
    g.appendChild(text);
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onAddNode(nodeId);
    });
    g.addEventListener('touchend', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.onAddNode(nodeId);
    });
    return g;
  }

  _createDelBtn(leftEdge, nodeId) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'del-btn');
    g.setAttribute('transform', `translate(${leftEdge - 14}, 0)`);

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', 'del-circle');
    circle.setAttribute('r', 10);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('class', 'del-icon');
    text.setAttribute('dy', '0.35em');
    text.textContent = '×';

    g.appendChild(circle);
    g.appendChild(text);
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRemoveNode(nodeId);
    });
    return g;
  }

  _renderEdge(parent, child) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'edge');
    path.setAttribute('data-edge', `${parent.id}-${child.id}`);
    path.setAttribute('d', this._bezierPath(parent, child));
    this.edgeLayer.appendChild(path);
  }

  _bezierPath(parent, child) {
    const mx = (parent.x + child.x) / 2;
    return `M ${parent.x},${parent.y} C ${mx},${parent.y} ${mx},${child.y} ${child.x},${child.y}`;
  }

  _startEdit(groupEl, node, W, H) {
    // 既存テキストを非表示
    const textEl = groupEl.querySelector('text.node-text');
    textEl.style.visibility = 'hidden';

    const fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('x', -W / 2 + 4);
    fo.setAttribute('y', -H / 2 + 4);
    fo.setAttribute('width', W - 8);
    fo.setAttribute('height', H - 8);

    const input = document.createElement('input');
    input.value = node.label;
    input.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: transparent;
      text-align: center;
      font-size: 14px;
      font-family: inherit;
      color: ${node.textColor || '#ffffff'};
      outline: none;
    `;

    fo.appendChild(input);
    groupEl.appendChild(fo);

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    const finish = () => {
      const newLabel = input.value.trim() || node.label;
      fo.remove();
      textEl.style.visibility = '';
      this.onEditNode(node.id, newLabel);
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = node.label; input.blur(); }
    });
  }

  _nodeWidth(label) {
    const base = Math.max(100, label.length * 9 + 40);
    return Math.min(base, 240);
  }

  _createGroup(id) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('id', id);
    return g;
  }

  _applyViewport() {
    const transform = `translate(${this.vx}, ${this.vy}) scale(${this.scale})`;
    this.edgeLayer.setAttribute('transform', transform);
    this.nodeLayer.setAttribute('transform', transform);
  }
}
