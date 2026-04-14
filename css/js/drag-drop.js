// drag-drop.js - ドラッグ&ドロップ（ノード移動・パン・再接続）

import { isDescendant } from './mindmap-data.js';

const SNAP_DISTANCE = 120; // キャンバス座標でのスナップ距離

export class DragController {
  constructor(svgEl, renderer, mapData, { onNodeMoved, onReparent, onPanned, markUnsaved }) {
    this.svg = svgEl;
    this.renderer = renderer;
    this.mapData = mapData;
    this.onNodeMoved = onNodeMoved;
    this.onReparent = onReparent;
    this.onPanned = onPanned;
    this.markUnsaved = markUnsaved;

    this.draggingNodeId = null;
    this.dragOffset = { x: 0, y: 0 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.panOrigin = { x: 0, y: 0 };
    this._currentDropTarget = null;

    this._bindEvents();
  }

  setMapData(mapData) {
    this.mapData = mapData;
  }

  startNodeDrag(e, nodeId) {
    e.preventDefault?.();
    this.draggingNodeId = nodeId;

    const pos = this.renderer.clientToCanvas(e.clientX, e.clientY);
    const node = this.mapData.nodes.find((n) => n.id === nodeId);
    this.dragOffset = { x: pos.x - node.x, y: pos.y - node.y };
    this._currentDropTarget = null;

    this.svg.parentElement.classList.add('grabbing');
  }

  _bindEvents() {
    // パン開始（背景クリック）
    this.svg.addEventListener('mousedown', (e) => {
      if (e.target.closest('.node-group,.add-btn,.del-btn,.collapse-btn')) return;
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.panOrigin = { x: this.renderer.vx, y: this.renderer.vy };
      this.svg.parentElement.classList.add('grabbing');
    });

    this.svg.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      if (e.target.closest('.node-group')) return;
      const t = e.touches[0];
      this.isPanning = true;
      this.panStart = { x: t.clientX, y: t.clientY };
      this.panOrigin = { x: this.renderer.vx, y: this.renderer.vy };
    }, { passive: true });

    document.addEventListener('mousemove', (e) => {
      if (this.draggingNodeId) this._handleNodeMove(e.clientX, e.clientY);
      else if (this.isPanning) this._handlePan(e.clientX, e.clientY);
    });

    document.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (this.draggingNodeId) { e.preventDefault(); this._handleNodeMove(t.clientX, t.clientY); }
      else if (this.isPanning) this._handlePan(t.clientX, t.clientY);
    }, { passive: false });

    const endDrag = () => {
      if (this.draggingNodeId) {
        const dropTarget = this._currentDropTarget;
        if (dropTarget) {
          // 再接続
          this.renderer.clearDropHighlight();
          this.onReparent(this.draggingNodeId, dropTarget.id);
        } else {
          // 位置のみ更新
          const node = this.mapData.nodes.find((n) => n.id === this.draggingNodeId);
          if (node) this.onNodeMoved(node.id, node.x, node.y);
          this.markUnsaved();
        }
        this._currentDropTarget = null;
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

    this.renderer.moveNodeEl(this.draggingNodeId, node.x, node.y);
    this.renderer.updateEdgesFor(this.draggingNodeId, this.mapData);

    // スナップ対象を探す
    const target = this._findDropTarget(node);
    if (target?.id !== this._currentDropTarget?.id) {
      this._currentDropTarget = target;
      this.renderer.highlightDropTarget(target ? target.id : null);
    }
  }

  _handlePan(clientX, clientY) {
    const nx = this.panOrigin.x + (clientX - this.panStart.x);
    const ny = this.panOrigin.y + (clientY - this.panStart.y);
    this.renderer.setViewport(nx, ny, this.renderer.scale);
    this.onPanned(nx, ny, this.renderer.scale);
  }

  // ドロップ先候補ノードを探す（SNAP_DISTANCE 以内で最も近いもの）
  _findDropTarget(draggingNode) {
    let closest = null;
    let closestDist = SNAP_DISTANCE;

    for (const node of this.mapData.nodes) {
      if (node.id === draggingNode.id) continue;
      // 自分の子孫には接続できない（循環防止）
      if (isDescendant(this.mapData, node.id, draggingNode.id)) continue;

      const dx = node.x - draggingNode.x;
      const dy = node.y - draggingNode.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < closestDist) {
        closestDist = dist;
        closest = node;
      }
    }

    return closest;
  }
}
