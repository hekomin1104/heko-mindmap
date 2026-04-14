// drag-drop.js - ドラッグ&ドロップ（ノード移動・パン）

export class DragController {
  constructor(svgEl, renderer, mapData, { onNodeMoved, onPanned, markUnsaved }) {
    this.svg = svgEl;
    this.renderer = renderer;
    this.mapData = mapData;
    this.onNodeMoved = onNodeMoved;
    this.onPanned = onPanned;
    this.markUnsaved = markUnsaved;

    this.draggingNodeId = null;
    this.dragOffset = { x: 0, y: 0 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.panOrigin = { x: 0, y: 0 };

    this._bindEvents();
  }

  // mapData の参照を更新（マップ再読み込み時）
  setMapData(mapData) {
    this.mapData = mapData;
  }

  startNodeDrag(e, nodeId) {
    e.preventDefault?.();
    this.draggingNodeId = nodeId;

    const pos = this.renderer.clientToCanvas(e.clientX, e.clientY);
    const node = this.mapData.nodes.find((n) => n.id === nodeId);
    this.dragOffset = { x: pos.x - node.x, y: pos.y - node.y };

    this.svg.parentElement.classList.add('grabbing');
  }

  _bindEvents() {
    // パン開始（SVG背景のみ）
    this.svg.addEventListener('mousedown', (e) => {
      if (e.target !== this.svg && !e.target.closest('#canvas-container > svg')) return;
      if (e.target.closest('.node-group, .add-btn, .del-btn')) return;
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.panOrigin = { x: this.renderer.vx, y: this.renderer.vy };
      this.svg.parentElement.classList.add('grabbing');
    });

    // タッチパン
    this.svg.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      if (e.target.closest('.node-group')) return;
      const t = e.touches[0];
      this.isPanning = true;
      this.panStart = { x: t.clientX, y: t.clientY };
      this.panOrigin = { x: this.renderer.vx, y: this.renderer.vy };
    }, { passive: true });

    // 移動
    document.addEventListener('mousemove', (e) => {
      if (this.draggingNodeId) {
        this._handleNodeMove(e.clientX, e.clientY);
      } else if (this.isPanning) {
        this._handlePan(e.clientX, e.clientY);
      }
    });

    document.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (this.draggingNodeId) {
        e.preventDefault();
        this._handleNodeMove(t.clientX, t.clientY);
      } else if (this.isPanning) {
        this._handlePan(t.clientX, t.clientY);
      }
    }, { passive: false });

    // 終了
    const endDrag = () => {
      if (this.draggingNodeId) {
        const node = this.mapData.nodes.find((n) => n.id === this.draggingNodeId);
        if (node) this.onNodeMoved(node.id, node.x, node.y);
        this.markUnsaved();
      }
      this.draggingNodeId = null;
      this.isPanning = false;
      this.svg.parentElement.classList.remove('grabbing');
    };

    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
  }

  _handleNodeMove(clientX, clientY) {
    const pos = this.renderer.clientToCanvas(clientX, clientY);
    const node = this.mapData.nodes.find((n) => n.id === this.draggingNodeId);
    if (!node) return;

    node.x = pos.x - this.dragOffset.x;
    node.y = pos.y - this.dragOffset.y;

    // DOM更新（高速パス）
    this.renderer.moveNodeEl(this.draggingNodeId, node.x, node.y);
    this.renderer.updateEdgesFor(this.draggingNodeId, this.mapData);
  }

  _handlePan(clientX, clientY) {
    const dx = clientX - this.panStart.x;
    const dy = clientY - this.panStart.y;
    const nx = this.panOrigin.x + dx;
    const ny = this.panOrigin.y + dy;
    this.renderer.setViewport(nx, ny, this.renderer.scale);
    this.onPanned(nx, ny, this.renderer.scale);
  }
}
