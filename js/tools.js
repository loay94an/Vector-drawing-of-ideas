
/* =========================================================
   RASEM 2.0
   TOOLS MODULE

   Pen
   Pencil
   Marker
   Eraser
   Selector
   Lasso
   Shapes
   Hand
   ToolManager
========================================================= */

import { HitTesting } from "./engine.js";

/* =========================================================
   1. TOOL UTILITIES
========================================================= */

const ToolUtils = {
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  validPoint(point) {
    return Boolean(
      point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y)
    );
  },

  distance(a, b) {
    return Math.hypot(
      b.x - a.x,
      b.y - a.y
    );
  },

  id(prefix = "element") {
    if (globalThis.crypto?.randomUUID) {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random()
      .toString(36).slice(2)}`;
  },

  clone(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  },

  eventPoint(engine, event) {
    if (!event) return null;

    const point = engine.getWorldPoint(event);

    return this.validPoint(point) ? point : null;
  }
};

/* =========================================================
   2. BASE TOOL
========================================================= */

export class BaseTool {
  constructor(engine, camera = null) {
    if (!engine) {
      throw new TypeError("Tool requires DrawingEngine");
    }

    this.engine = engine;
    this.camera = camera;
    this.name = "base";
    this.active = false;
  }

  activate() {
    this.active = true;
  }

  deactivate() {
    this.active = false;
  }

  down() {
    return false;
  }

  move() {
    return false;
  }

  up() {
    return false;
  }

  cancel() {
    return false;
  }

  destroy() {
    this.deactivate();
    this.engine = null;
    this.camera = null;
  }
}

/* =========================================================
   3. PEN
========================================================= */

export class Pen extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);
    this.name = "pen";
  }

activate() {
    super.activate();
    this.engine.setSettings({
      tool: "pen"
    });
  }

  down(event) {
    return this.engine.start(event);
  }

  move(event) {
    return this.engine.move(event);
  }

  up(event) {
    return this.engine.end(event);
  }

  cancel() {
    return this.engine.cancel();
  }
}

/* =========================================================
   4. PENCIL
========================================================= */

export class Pencil extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);
    this.name = "pencil";
  }

activate() {
    super.activate();
    this.engine.setSettings({
      tool: "pencil"
    });
  }

  down(event) {
    return this.engine.start(event);
  }

  move(event) {
    return this.engine.move(event);
  }

  up(event) {
    return this.engine.end(event);
  }

  cancel() {
    return this.engine.cancel();
  }
}

/* =========================================================
   5. MARKER
========================================================= */

export class Marker extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);
    this.name = "marker";
  }

activate() {
    super.activate();
    this.engine.setSettings({
      tool: "marker"
    });
  }

  down(event) {
    return this.engine.start(event);
  }

  move(event) {
    return this.engine.move(event);
  }

  up(event) {
    return this.engine.end(event);
  }

  cancel() {
    return this.engine.cancel();
  }
}

/* =========================================================
   6. ERASER
========================================================= */

export class Eraser extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);
    this.name = "eraser";
  }

  activate() {
    super.activate();

    this.engine.setSettings({
      tool: "eraser",
      pressureEnabled: false
    });
  }

  down(event) {
    return this.engine.start(event);
  }

  move(event) {
    return this.engine.move(event);
  }

  up(event) {
    return this.engine.end(event);
  }

  cancel() {
    return this.engine.cancel();
  }
}

/* =========================================================
   7. SELECTOR
========================================================= */

export class Selector extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);

    this.name = "selector";

    this.selectedIds = new Set();

    this.pointerDown = false;
    this.startPoint = null;
    this.lastPoint = null;

    this.originalTransforms = new Map();
    this.moved = false;
  }

  getLayer() {
    return this.engine.activeLayer;
  }

  select(id, additive = false) {
    const layer = this.getLayer();

    if (!layer) return false;

    const element = layer.elements.find(
      item => item.id === id
    );

    if (!element) return false;

    if (!additive) {
      this.selectedIds.clear();
    }

    if (additive && this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }

    return true;
  }

  clearSelection() {
    this.selectedIds.clear();
    this.originalTransforms.clear();
    this.moved = false;
  }

  getSelectedElements() {
    const layer = this.getLayer();

    if (!layer) return [];

    return layer.elements.filter(
      element => this.selectedIds.has(element.id)
    );
  }

  down(event) {
    const point = ToolUtils.eventPoint(
      this.engine,
      event
    );

    if (!point) return false;

    const hit = this.engine.hitTest(point, 8);

    if (!hit) {
      if (!event.shiftKey) {
        this.clearSelection();
      }

      this.pointerDown = false;
      return false;
    }

    this.select(hit.id, event.shiftKey);

    this.pointerDown = true;
    this.startPoint = point;
    this.lastPoint = point;
    this.moved = false;

    this.originalTransforms.clear();

    for (const element of this.getSelectedElements()) {
      this.originalTransforms.set(
        element.id,
        element.transform || ""
      );
    }

    return true;
  }

  move(event) {
    if (!this.pointerDown) return false;

    const point = ToolUtils.eventPoint(
      this.engine,
      event
    );

    if (!point) return false;

    const dx = point.x - this.lastPoint.x;
    const dy = point.y - this.lastPoint.y;

    if (Math.hypot(dx, dy) < 0.0001) {
      return false;
    }

    const layer = this.getLayer();

    if (!layer || layer.locked) return false;

    for (const element of this.getSelectedElements()) {
      const original =
        this.originalTransforms.get(element.id) || "";

      element.transform =
        `${original} translate(${dx} ${dy})`.trim();
    }

    this.lastPoint = point;
    this.moved = true;

    this.engine.document.touch?.();

    this.engine.renderer.renderActiveLayer(layer);

    return true;
  }

  up() {
    if (!this.pointerDown) return false;

    this.pointerDown = false;

    if (this.moved) {
      this.engine.commitHistory();
      this.engine.renderer.render(this.engine.document);
    }

    this.startPoint = null;
    this.lastPoint = null;
    this.originalTransforms.clear();

    const changed = this.moved;
    this.moved = false;

    return changed;
  }

  cancel() {
    if (!this.pointerDown) return false;

    const layer = this.getLayer();

    for (const element of this.getSelectedElements()) {
      element.transform =
        this.originalTransforms.get(element.id) || "";
    }

    this.pointerDown = false;
    this.moved = false;

    this.startPoint = null;
    this.lastPoint = null;
    this.originalTransforms.clear();

    if (layer) {
      this.engine.renderer.renderActiveLayer(layer);
    }

    return true;
  }

  deleteSelection() {
    const layer = this.getLayer();

    if (!layer || layer.locked || !this.selectedIds.size) {
      return false;
    }

    const before = layer.elements.length;

    layer.elements = layer.elements.filter(
      element => !this.selectedIds.has(element.id)
    );

    if (layer.elements.length === before) {
      return false;
    }

    this.engine.document.touch?.();
    this.clearSelection();

    this.engine.commitHistory();
    this.engine.renderer.render(this.engine.document);

    return true;
  }

  destroy() {
    this.clearSelection();
    super.destroy();
  }
}

/* =========================================================
   8. LASSO
========================================================= */

export class Lasso extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);

    this.name = "lasso";

    this.points = [];
    this.selectedIds = new Set();

    this.drawing = false;
    this.previewId = "lasso-preview";
  }

  down(event) {
    const point = ToolUtils.eventPoint(
      this.engine,
      event
    );

    if (!point) return false;

    this.points = [point];
    this.drawing = true;

    return true;
  }

  move(event) {
    if (!this.drawing) return false;

    const point = ToolUtils.eventPoint(
      this.engine,
      event
    );

    if (!point) return false;

    const previous = this.points.at(-1);

    if (ToolUtils.distance(previous, point) < 1) {
      return false;
    }

    this.points.push(point);

    return true;
  }

  up(event) {
    if (!this.drawing) return false;

    const point = ToolUtils.eventPoint(
      this.engine,
      event
    );

    if (point) {
      this.points.push(point);
    }

    this.drawing = false;

    const layer = this.engine.activeLayer;

    if (!layer) return false;

    this.selectedIds.clear();

    if (this.points.length >= 3) {
      for (const element of layer.elements) {
        if (!Array.isArray(element.points)) continue;

        const intersects = element.points.some(
          p => HitTesting.pointInPolygon(
            p,
            this.points
          )
        );

        if (intersects) {
          this.selectedIds.add(element.id);
        }
      }
    }

    this.points = [];

    return this.selectedIds.size > 0;
  }

  cancel() {
    if (!this.drawing) return false;

    this.drawing = false;
    this.points = [];

    this.engine.renderer.clearPreview(this.previewId);

    return true;
  }

  getSelection() {
    const layer = this.engine.activeLayer;

    if (!layer) return [];

    return layer.elements.filter(
      element => this.selectedIds.has(element.id)
    );
  }

  clearSelection() {
    this.selectedIds.clear();
  }

  destroy() {
    this.cancel();
    this.clearSelection();
    super.destroy();
  }
}

/* =========================================================
   9. SHAPES
========================================================= */

export class Shapes extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);

    this.name = "shapes";

    this.shape = "rect";
    this.startPoint = null;
    this.currentPoint = null;

    this.drawing = false;
    this.previewId = null;
  }

  setShape(shape) {
    const allowed = [
      "rect",
      "ellipse",
      "circle",
      "line",
      "triangle",
      "square",
      "diamond",
      "curve",
      "arrow"
    ];

    if (!allowed.includes(shape)) {
      return false;
    }

    this.shape = shape;

    return true;
  }

  activate() {
    super.activate();

    this.engine.setSettings({
      tool: "shape",
      pressureEnabled: false
    });
  }

  createShape(a, b) {
    const style = {
      color: this.engine.settings.color,
      size: this.engine.settings.size,
      opacity: this.engine.settings.opacity,
      fill: "none",
      lineCap: "round",
      lineJoin: "round"
    };

    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);

    const width = Math.abs(b.x - a.x);
    const height = Math.abs(b.y - a.y);

    const base = {
      id: this.previewId,
      type: "shape",
      tool: "shapes",
      style
    };

    if (this.shape === "rect") {
      return {
        ...base,
        svgTag: "rect",
        geometry: {
          x: left,
          y: top,
          width,
          height
        }
      };
    }


    // Square: equal width and height
    if (this.shape === "square") {
      const side = Math.max(width, height);
      return {
        ...base,
        svgTag: "rect",
        geometry: {
          x: a.x <= b.x ? a.x : a.x - side,
          y: a.y <= b.y ? a.y : a.y - side,
          width: side,
          height: side
        }
      };
    }

    // Triangle
    if (this.shape === "triangle") {
      return {
        ...base,
        svgTag: "polygon",
        geometry: {
          points: `${(a.x+b.x)/2},${top} ${left+width},${top+height} ${left},${top+height}`
        }
      };
    }

    // Diamond
    if (this.shape === "diamond") {
      return {
        ...base,
        svgTag: "polygon",
        geometry: {
          points: `${(a.x+b.x)/2},${top} ${left+width},${(a.y+b.y)/2} ${(a.x+b.x)/2},${top+height} ${left},${(a.y+b.y)/2}`
        }
      };
    }

    // Curved line
    if (this.shape === "curve") {
      const controlX = (a.x+b.x)/2;
      const controlY = Math.min(a.y,b.y) - height * 0.5;

      return {
        ...base,
        svgTag: "path",
        geometry: {
          d: `M ${a.x} ${a.y} Q ${controlX} ${controlY} ${b.x} ${b.y}`
        }
      };
    }

    // Arrow
    if (this.shape === "arrow") {
      const dx = b.x-a.x;
      const dy = b.y-a.y;
      const length = Math.hypot(dx,dy) || 1;
      const ux = dx/length;
      const uy = dy/length;
      const head = Math.min(20,length*0.3);
      const px = -uy*head*0.5;
      const py = ux*head*0.5;
      const bx = b.x-ux*head;
      const by = b.y-uy*head;

      return {
        ...base,
        svgTag: "path",
        geometry: {
          d: `M ${a.x} ${a.y} L ${b.x} ${b.y} M ${bx+px} ${by+py} L ${b.x} ${b.y} L ${bx-px} ${by-py}`
        }
      };
    }

    if (this.shape === "ellipse") {
      return {
        ...base,
        svgTag: "ellipse",
        geometry: {
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
          rx: width / 2,
          ry: height / 2
        }
      };
    }

    if (this.shape === "circle") {
      const radius = Math.min(width, height) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;

      return {
        ...base,
        svgTag: "ellipse",
        geometry: {
          cx: a.x + Math.sign(dx || 1) * radius,
          cy: a.y + Math.sign(dy || 1) * radius,
          rx: radius,
          ry: radius
        }
      };
    }

    return {
      ...base,
      svgTag: "line",
      geometry: {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y
      }
    };
  }

  down(event) {
    const point = ToolUtils.eventPoint(
      this.engine,
      event
    );

    if (!point) return false;

    this.startPoint = point;
    this.currentPoint = point;

    this.previewId = ToolUtils.id("shape-preview");
    this.drawing = true;

    return true;
  }

  move(event) {
    if (!this.drawing) return false;

    const point = ToolUtils.eventPoint(
      this.engine,
      event
    );

    if (!point) return false;

    this.currentPoint = point;

    const shape = this.createShape(
      this.startPoint,
      this.currentPoint
    );

    return this.engine.renderer.updateElement(shape);
  }

  up(event) {
    if (!this.drawing) return false;

    const point = ToolUtils.eventPoint(
      this.engine,
      event
    );

    if (point) {
      this.currentPoint = point;
    }

    const layer = this.engine.activeLayer;

    if (!layer || layer.locked || layer.visible === false) {
      this.cancel();
      return false;
    }

    const distance = ToolUtils.distance(
      this.startPoint,
      this.currentPoint
    );

    if (distance < 0.5) {
      this.cancel();
      return false;
    }

    const shape = this.createShape(
      this.startPoint,
      this.currentPoint
    );

    // إزالة معرف المعاينة واستبداله بمعرف نهائي.
    shape.id = ToolUtils.id("shape");

    let added = false;

    if (typeof this.engine.document.addElement === "function") {
      added = this.engine.document.addElement(shape);
    } else {
      layer.elements.push(ToolUtils.clone(shape));
      this.engine.document.touch?.();
      added = true;
    }

    this.engine.renderer.clearPreview(this.previewId);

    if (added) {
      this.engine.commitHistory();
      this.engine.renderer.render(this.engine.document);
    }

    this.reset();

    return added;
  }

  reset() {
    this.drawing = false;
    this.startPoint = null;
    this.currentPoint = null;
    this.previewId = null;
  }

  cancel() {
    if (!this.drawing) return false;

    this.engine.renderer.clearPreview(this.previewId);

    this.reset();

    return true;
  }
}

/* =========================================================
   10. HAND
========================================================= */

export class Hand extends BaseTool {
  constructor(engine, camera) {
    super(engine, camera);

    if (!camera) {
      throw new TypeError("Hand requires Camera");
    }

    this.name = "hand";

    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
  }

  down(event) {
    if (
      !Number.isFinite(event.clientX) ||
      !Number.isFinite(event.clientY)
    ) {
      return false;
    }

    this.dragging = true;

    this.lastX = event.clientX;
    this.lastY = event.clientY;

    return true;
  }

  move(event) {
    if (!this.dragging) return false;

    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;

    this.lastX = event.clientX;
    this.lastY = event.clientY;

    return this.camera.panScreen(dx, dy);
  }

  up() {
    const wasDragging = this.dragging;

    this.dragging = false;

    return wasDragging;
  }

  cancel() {
    const wasDragging = this.dragging;

    this.dragging = false;

    return wasDragging;
  }
}

/* =========================================================
   11. TOOL MANAGER
========================================================= */

export class ToolManager {
  constructor(engine, camera) {
    if (!engine || !camera) {
      throw new TypeError(
        "ToolManager requires DrawingEngine and Camera"
      );
    }

    this.engine = engine;
    this.camera = camera;

    this.tools = new Map();

    this.activeTool = null;
    this.activeToolName = null;

    this.destroyed = false;

    this.registerDefaults();

    this.activate("pen");
  }

  registerDefaults() {
    this.register("pen", new Pen(this.engine, this.camera));
    this.register("pencil", new Pencil(this.engine, this.camera));
    this.register("marker", new Marker(this.engine, this.camera));
    this.register("eraser", new Eraser(this.engine, this.camera));

    this.register("selector", new Selector(this.engine, this.camera));
    this.register("lasso", new Lasso(this.engine, this.camera));

    this.register("shapes", new Shapes(this.engine, this.camera));
    this.register("hand", new Hand(this.engine, this.camera));
  }

  register(name, tool) {
    if (
      this.destroyed ||
      typeof name !== "string" ||
      !name ||
      !tool
    ) {
      return false;
    }

    const previous = this.tools.get(name);

    if (previous) {
      previous.destroy?.();
    }

    this.tools.set(name, tool);

    return true;
  }

  activate(name) {
    if (this.destroyed) return false;

    const shapeAliases = {
      line: "line",
      rect: "rect",
      circle: "circle",
      ellipse: "ellipse",
      triangle: "triangle",
      square: "square",
      diamond: "diamond",
      curve: "curve",
      arrow: "arrow"
    };

    if (Object.prototype.hasOwnProperty.call(shapeAliases, name)) {
      const shapesTool = this.tools.get("shapes");
      if (!shapesTool) return false;

      shapesTool.setShape(shapeAliases[name]);

      if (this.activeTool !== shapesTool) {
        this.activeTool?.deactivate();

        if (this.engine.drawing) {
          this.engine.cancel();
        }

        this.activeTool = shapesTool;
        this.activeToolName = name;
        shapesTool.activate();
      } else {
        this.activeToolName = name;
      }

      return true;
    }

    const tool = this.tools.get(name);

    if (!tool) return false;

    if (this.activeTool === tool) return true;

    this.activeTool?.deactivate();

    // لا نترك عملية رسم معلقة عند تبديل الأداة.
    if (this.engine.drawing) {
      this.engine.cancel();
    }

    this.activeTool = tool;
    this.activeToolName = name;

    tool.activate();

    return true;
  }

  setTool(name) {
    return this.activate(name);
  }

  getTool(name) {
    return this.tools.get(name) || null;
  }

  handleDown(event) {
    if (this.destroyed || !this.activeTool) {
      return false;
    }

    return this.activeTool.down(event);
  }

  handleMove(event) {
    if (this.destroyed || !this.activeTool) {
      return false;
    }

    return this.activeTool.move(event);
  }

  handleUp(event) {
    if (this.destroyed || !this.activeTool) {
      return false;
    }

    return this.activeTool.up(event);
  }

  handleCancel() {
    if (this.destroyed || !this.activeTool) {
      return false;
    }

    return this.activeTool.cancel();
  }

  handleMultitouch() {
    if (this.destroyed) return false;

    if (this.engine.drawing) {
      this.engine.cancel();
    }

    this.activeTool?.cancel();

    return true;
  }

  setShape(shape) {
    const tool = this.getTool("shapes");

    return tool?.setShape(shape) ?? false;
  }

  deleteSelection() {
    const selector = this.getTool("selector");
    const lasso = this.getTool("lasso");

    let changed = false;

    if (selector?.selectedIds.size) {
      changed = selector.deleteSelection();
    } else if (lasso?.selectedIds.size) {
      const layer = this.engine.activeLayer;

      if (!layer || layer.locked) return false;

      const ids = lasso.selectedIds;

      const before = layer.elements.length;

      layer.elements = layer.elements.filter(
        element => !ids.has(element.id)
      );

      changed = layer.elements.length !== before;

      if (changed) {
        this.engine.document.touch?.();
        this.engine.commitHistory();
        this.engine.renderer.render(this.engine.document);
      }

      lasso.clearSelection();
    }

    return changed;
  }

  getSelectedElements() {
    const selector = this.getTool("selector");
    const lasso = this.getTool("lasso");

    if (selector?.selectedIds.size) {
      return selector.getSelectedElements();
    }

    if (lasso?.selectedIds.size) {
      return lasso.getSelection();
    }

    return [];
  }

  destroy() {
    if (this.destroyed) return;

    this.activeTool?.cancel();

    for (const tool of this.tools.values()) {
      tool.destroy?.();
    }

    this.tools.clear();

    this.activeTool = null;
    this.activeToolName = null;

    this.engine = null;
    this.camera = null;

    this.destroyed = true;
  }
}
