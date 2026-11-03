
/* =========================================================
   RASEM 2.0
   ENGINE MODULE
   Smoothing + Pressure + StrokeBuilder
   + HitTesting + DrawingEngine
========================================================= */

const EngineUtils = {
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  number(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  },

  validPoint(point) {
    return Boolean(
      point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y)
    );
  },

  distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  },

  createId(prefix = "stroke") {
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
  }
};

/* =========================================================
   1. SMOOTHING
========================================================= */

export class Smoothing {
  constructor(options = {}) {
    this.strength = EngineUtils.clamp(
      EngineUtils.number(options.strength, 0.35),
      0,
      1
    );

    this.minDistance = EngineUtils.clamp(
      EngineUtils.number(options.minDistance, 0.35),
      0,
      100
    );
  }

  distance(a, b) {
    return EngineUtils.distance(a, b);
  }

  midpoint(a, b) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      pressure: (
        EngineUtils.number(a.pressure, 0.5) +
        EngineUtils.number(b.pressure, 0.5)
      ) / 2
    };
  }

  simplify(points) {
    if (!Array.isArray(points) || points.length <= 2) {
      return Array.isArray(points) ? [...points] : [];
    }

    const result = [points[0]];

    for (let i = 1; i < points.length - 1; i++) {
      if (
        this.distance(
          result[result.length - 1],
          points[i]
        ) >= this.minDistance
      ) {
        result.push(points[i]);
      }
    }

    const last = points[points.length - 1];

    if (result[result.length - 1] !== last) {
      result.push(last);
    }

    return result;
  }

  filter(points) {
    if (!Array.isArray(points) || points.length <= 2) {
      return Array.isArray(points)
        ? points.map(p => ({ ...p }))
        : [];
    }

    const result = [{ ...points[0] }];

    for (let i = 1; i < points.length - 1; i++) {
      const previous = points[i - 1];
      const current = points[i];
      const next = points[i + 1];

      const s = this.strength;

      result.push({
        ...current,

        x: current.x * (1 - s) +
          ((previous.x + next.x) / 2) * s,

        y: current.y * (1 - s) +
          ((previous.y + next.y) / 2) * s
      });
    }

    result.push({
      ...points[points.length - 1]
    });

    return result;
  }

  process(points) {
    return this.filter(this.simplify(points));
  }

  toPath(points) {
    if (!Array.isArray(points) || !points.length) {
      return "";
    }

    if (points.length === 1) {
      const p = points[0];
      return `M ${p.x} ${p.y} l 0.01 0`;
    }

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const current = points[i];
      const next = points[i + 1];

      if (next) {
        const mid = this.midpoint(current, next);

        path +=
          ` Q ${current.x} ${current.y}` +
          ` ${mid.x} ${mid.y}`;
      } else {
        path += ` L ${current.x} ${current.y}`;
      }
    }

    return path;
  }
}

/* =========================================================
   2. PRESSURE
========================================================= */

export class Pressure {
  constructor(options = {}) {
    this.min = EngineUtils.clamp(
      EngineUtils.number(options.min, 0.05),
      0,
      1
    );

    this.max = EngineUtils.clamp(
      EngineUtils.number(options.max, 1),
      this.min,
      1
    );

    this.smoothing = EngineUtils.clamp(
      EngineUtils.number(options.smoothing, 0.35),
      0,
      1
    );

    this.fallback = EngineUtils.clamp(
      EngineUtils.number(options.fallback, 0.5),
      this.min,
      this.max
    );

    this.lastPressure = this.fallback;
  }

  read(event = {}) {
    let pressure = event.pressure;

    if (
      event.pointerType !== "pen" ||
      !Number.isFinite(pressure) ||
      pressure <= 0
    ) {
      pressure = this.fallback;
    }

    pressure = EngineUtils.clamp(pressure, 0, 1);

    this.lastPressure +=
      (pressure - this.lastPressure) * this.smoothing;

    return EngineUtils.clamp(
      this.lastPressure,
      this.min,
      this.max
    );
  }

  normalize(value) {
    return EngineUtils.clamp(
      EngineUtils.number(value, this.fallback),
      0,
      1
    );
  }

  width(pressure, size, sensitivity = 1) {
    const p = this.normalize(pressure);

    const factor =
      1 - EngineUtils.clamp(sensitivity, 0, 1) +
      EngineUtils.clamp(sensitivity, 0, 1) * p;

    return Math.max(
      0.5,
      EngineUtils.number(size, 1) * factor
    );
  }

  reset() {
    this.lastPressure = this.fallback;
  }
}

/* =========================================================
   3. STROKE BUILDER
========================================================= */

export class StrokeBuilder {
  constructor(options = {}) {
    this.smoothing = new Smoothing({
      strength: options.smoothing ?? 0.3,
      minDistance: options.minDistance ?? 0.35
    });

    this.pressure = new Pressure();
    this.reset();
  }

  reset() {
    this.id = null;
    this.points = [];

    this.baseSize = 5;
    this.color = "#111111";
    this.opacity = 1;
    this.tool = "pen";

    this.sensitivity = 0.8;
    this.pressureEnabled = true;
    this.brushStyle = {
      lineCap: "round",
      dashArray: "",
      image: null
    };
    this.active = false;

    this.pressure.reset();
  }

  begin(point, settings = {}) {
    if (!EngineUtils.validPoint(point)) {
      return false;
    }

    this.reset();

    this.id = EngineUtils.createId();

    this.baseSize = EngineUtils.clamp(
      EngineUtils.number(settings.size, 5),
      0.5,
      500
    );

    this.color = settings.color || "#111111";

    this.opacity = EngineUtils.clamp(
      EngineUtils.number(settings.opacity, 1),
      0,
      1
    );

    this.tool = settings.tool || "pen";

    this.sensitivity = EngineUtils.clamp(
      EngineUtils.number(settings.sensitivity, 0.8),
      0,
      1
    );

    this.pressureEnabled =
      settings.pressureEnabled !== false;

    this.active = true;

    return this.addPoint(point);
  }

  addPoint(point) {
    if (!this.active || !EngineUtils.validPoint(point)) {
      return false;
    }

    const previous = this.points.at(-1);

    if (
      previous &&
      EngineUtils.distance(previous, point) < 0.2
    ) {
      return false;
    }

    const pressure = this.pressureEnabled
      ? this.pressure.normalize(point.pressure)
      : 1;

    this.points.push({
      x: point.x,
      y: point.y,
      pressure,
      time: EngineUtils.number(point.time, Date.now())
    });

    return true;
  }

  getFilteredPoints() {
    return this.smoothing.process(this.points);
  }

  getCenterPath() {
    return this.smoothing.toPath(
      this.getFilteredPoints()
    );
  }

  getVariableWidthOutline() {
    const points = this.getFilteredPoints();

    if (!points.length) return "";

    if (points.length === 1) {
      const p = points[0];

      const radius = Math.max(
        0.25,
        this.pressure.width(
          p.pressure,
          this.baseSize,
          this.sensitivity
        ) / 2
      );

      return [
        `M ${p.x - radius} ${p.y}`,
        `a ${radius} ${radius} 0 1 0 ${radius * 2} 0`,
        `a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`
      ].join(" ");
    }

    const left = [];
    const right = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      const previous = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];

      let dx = next.x - previous.x;
      let dy = next.y - previous.y;

      let length = Math.hypot(dx, dy);

      if (length < 0.0001) {
        dx = 1;
        dy = 0;
        length = 1;
      }

      const nx = -dy / length;
      const ny = dx / length;

      const radius = Math.max(
        0.25,
        this.pressure.width(
          p.pressure,
          this.baseSize,
          this.sensitivity
        ) / 2
      );

      left.push({
        x: p.x + nx * radius,
        y: p.y + ny * radius
      });

      right.push({
        x: p.x - nx * radius,
        y: p.y - ny * radius
      });
    }

    const outline = [
      ...left,
      ...right.reverse()
    ];

    return outline.map((p, index) =>
      `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`
    ).join(" ") + " Z";
  }

  build(options = {}) {
    if (!this.id || !this.points.length) {
      return null;
    }

    const pressureEnabled =
      options.pressureEnabled ?? this.pressureEnabled;

    const variableWidth =
      pressureEnabled &&
      this.tool !== "marker" &&
      this.tool !== "pencil";

    const path = variableWidth
      ? this.getVariableWidthOutline()
      : this.getCenterPath();

    if (!path) return null;

    return {
      id: this.id,
      type: "stroke",
      tool: this.tool,

      points: this.points.map(p => ({ ...p })),

      path,

      renderMode: variableWidth ? "fill" : "stroke",

      style: {
        color: this.color,
        size: this.baseSize,
        opacity: this.opacity,
        fill: variableWidth ? this.color : "none",
        lineCap: "round",
        lineJoin: "round"
      }
    };
  }
}

/* =========================================================
   4. HIT TESTING
========================================================= */

export class HitTesting {
  static distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return EngineUtils.distance(point, a);
    }

    const t = EngineUtils.clamp(
      (
        (point.x - a.x) * dx +
        (point.y - a.y) * dy
      ) / lengthSquared,
      0,
      1
    );

    const nearest = {
      x: a.x + t * dx,
      y: a.y + t * dy
    };

    return EngineUtils.distance(point, nearest);
  }

  static distanceToPolyline(point, points) {
    if (!Array.isArray(points) || !points.length) {
      return Infinity;
    }

    if (points.length === 1) {
      return EngineUtils.distance(point, points[0]);
    }

    let minimum = Infinity;

    for (let i = 1; i < points.length; i++) {
      minimum = Math.min(
        minimum,
        this.distanceToSegment(
          point,
          points[i - 1],
          points[i]
        )
      );
    }

    return minimum;
  }

  static pointInPolygon(point, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) {
      return false;
    }

    let inside = false;

    for (
      let i = 0, j = polygon.length - 1;
      i < polygon.length;
      j = i++
    ) {
      const a = polygon[i];
      const b = polygon[j];

      const intersects =
        (a.y > point.y) !== (b.y > point.y) &&
        point.x <
          (b.x - a.x) * (point.y - a.y) /
          ((b.y - a.y) || 0.0000001) + a.x;

      if (intersects) inside = !inside;
    }

    return inside;
  }

  static getElementDistance(element, point) {
    if (!element || !EngineUtils.validPoint(point)) {
      return Infinity;
    }

    const points = element.points;

    if (Array.isArray(points) && points.length) {
      const distance = this.distanceToPolyline(point, points);

      const size = EngineUtils.number(
        element.style?.size,
        1
      );

      return Math.max(0, distance - size / 2);
    }

    const geometry = element.geometry || {};

    if (element.type === "shape") {
      const x = EngineUtils.number(geometry.x, 0);
      const y = EngineUtils.number(geometry.y, 0);
      const width = EngineUtils.number(geometry.width, 0);
      const height = EngineUtils.number(geometry.height, 0);

      if (
        width > 0 &&
        height > 0 &&
        point.x >= x &&
        point.x <= x + width &&
        point.y >= y &&
        point.y <= y + height
      ) {
        return 0;
      }
    }

    return Infinity;
  }

  static hitTest(elements, point, tolerance = 8) {
    if (
      !Array.isArray(elements) ||
      !EngineUtils.validPoint(point)
    ) {
      return null;
    }

    const safeTolerance = Math.max(
      0,
      EngineUtils.number(tolerance, 8)
    );

    // البحث من الأعلى إلى الأسفل حسب ترتيب الرسم.
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];

      if (!element || element.visible === false) {
        continue;
      }

      const distance = this.getElementDistance(
        element,
        point
      );

      if (distance <= safeTolerance) {
        return element;
      }
    }

    return null;
  }
}

/* =========================================================
   5. DRAWING ENGINE
========================================================= */

export class DrawingEngine {
  constructor(documentModel, renderer, history, coordinates) {
    if (!documentModel || !renderer || !history || !coordinates) {
      throw new TypeError(
        "DrawingEngine requires document, renderer, history and coordinates"
      );
    }

    this.document = documentModel;
    this.renderer = renderer;
    this.history = history;
    this.coordinates = coordinates;

    this.settings = {
      tool: "pen",
      color: "#111111",
      size: 3,
      opacity: 1,
      pressureEnabled: true,
      sensitivity: 0.8,
      minDistance: 0.08,
      smoothing: 0.35,
      eraserSize: 12
    };

    this.builder = new StrokeBuilder({
      smoothing: this.settings.smoothing,
      minDistance: this.settings.minDistance
    });

    this.drawing = false;
    this.activePointer = null;

    this.currentElement = null;
    this.points = [];

    this.lastPoint = null;
    this.changed = false;

    this.erasedIds = new Set();
    this.destroyed = false;
  }

  get activeLayer() {
    return this.document?.activeLayer ?? null;
  }

  canDraw() {
    const layer = this.activeLayer;

    return Boolean(
      !this.destroyed &&
      layer &&
      !layer.locked &&
      layer.visible !== false &&
      Array.isArray(layer.elements)
    );
  }

  getWorldPoint(event) {
    if (
      !event ||
      !Number.isFinite(event.clientX) ||
      !Number.isFinite(event.clientY)
    ) {
      return null;
    }

    const point = this.coordinates.screenToWorld(
      event.clientX,
      event.clientY
    );

    return EngineUtils.validPoint(point) ? point : null;
  }

  setSettings(settings = {}) {
    if (!settings || typeof settings !== "object") {
      return false;
    }

    if (typeof settings.tool === "string") {
      this.settings.tool = settings.tool;
    }

    if (
      typeof settings.color === "string" &&
      /^#[0-9a-f]{6}$/i.test(settings.color)
    ) {
      this.settings.color = settings.color;
    }

    if (Number.isFinite(settings.size)) {
      this.settings.size = EngineUtils.clamp(
        settings.size,
        0.1,
        500
      );
    }

    if (Number.isFinite(settings.opacity)) {
      this.settings.opacity = EngineUtils.clamp(
        settings.opacity,
        0,
        1
      );
    }

    if (Number.isFinite(settings.minDistance)) {
      this.settings.minDistance = EngineUtils.clamp(
        settings.minDistance,
        0,
        10
      );
    }

    if (Number.isFinite(settings.smoothing)) {
      this.settings.smoothing = EngineUtils.clamp(
        settings.smoothing,
        0,
        1
      );
    }

    if (Number.isFinite(settings.sensitivity)) {
      this.settings.sensitivity = EngineUtils.clamp(
        settings.sensitivity,
        0,
        1
      );
    }

    if (Number.isFinite(settings.eraserSize)) {
      this.settings.eraserSize = EngineUtils.clamp(
        settings.eraserSize,
        1,
        500
      );
    }

    if (typeof settings.pressureEnabled === "boolean") {
      this.settings.pressureEnabled = settings.pressureEnabled;
    }


    if (settings.brushStyle && typeof settings.brushStyle === "object") {
      const cap = settings.brushStyle.lineCap;
      const dash = settings.brushStyle.dashArray;

      this.brushStyle = {
        lineCap: ["round", "butt", "square"].includes(cap)
          ? cap : "round",
        dashArray: typeof dash === "string" &&
          /^[\d\s.,-]*$/.test(dash) ? dash : "",
        image: typeof settings.brushStyle.image === "string" &&
          /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(settings.brushStyle.image)
          ? settings.brushStyle.image
          : null
      };
    }

    this.builder.smoothing.strength =
      this.settings.smoothing;

    this.builder.smoothing.minDistance =
      this.settings.minDistance;

    return true;
  }

  getPressure(event = {}) {
    if (!this.settings.pressureEnabled) {
      return 1;
    }

    return this.builder.pressure.read(event);
  }

  start(event, pointerData = null) {
    if (
      this.destroyed ||
      this.drawing ||
      !this.canDraw()
    ) {
      return false;
    }

    if (
      this.activePointer !== null &&
      event?.pointerId !== undefined
    ) {
      return false;
    }

    const point = this.getWorldPoint(event);

    if (!point) return false;

    this.drawing = true;
    this.activePointer = event.pointerId ?? null;

    this.points = [];
    this.lastPoint = null;
    this.changed = false;
    this.erasedIds.clear();

    if (this.settings.tool === "eraser") {
      this.eraseAt(point);
      return true;
    }

    const input = pointerData || event;

    this.builder.begin({
      ...point,
      pressure: this.getPressure(input),
      time: input.timeStamp
    }, {
      tool: this.settings.tool,
      color: this.settings.color,
      size: this.settings.size,
      opacity: this.settings.opacity,
      sensitivity: this.settings.sensitivity,
      pressureEnabled: this.settings.pressureEnabled,
      brushStyle: { ...this.brushStyle }
    });

    this.points = this.builder.points;

    this.currentElement = {
      id: this.builder.id,
      type: "stroke",
      tool: this.settings.tool,
      points: this.points,
      path: "",
      style: {
        color: this.settings.color,
        size: this.settings.size,
        opacity: this.settings.opacity,
        fill: "none",
        lineCap: "round",
        lineJoin: "round"
      }
    };

    this.renderCurrent();

    return true;
  }

  addPoint(point, event = {}, force = false) {
    if (!EngineUtils.validPoint(point)) {
      return false;
    }

    if (
      this.lastPoint &&
      !force &&
      EngineUtils.distance(point, this.lastPoint) <
        this.settings.minDistance
    ) {
      return false;
    }

    const sample = {
      ...point,
      pressure: this.settings.pressureEnabled
        ? this.getPressure(event)
        : 1,
      time: EngineUtils.number(event.timeStamp, Date.now())
    };

    const added = this.builder.addPoint(sample);

    if (!added) return false;

    this.points = this.builder.points;
    this.lastPoint = sample;

    return true;
  }

  move(event, pointerData = null) {
    if (!this.drawing || this.destroyed) {
      return false;
    }

    if (
      this.activePointer !== null &&
      event.pointerId !== this.activePointer
    ) {
      return false;
    }

    const point = this.getWorldPoint(event);

    if (!point) return false;

    if (this.settings.tool === "eraser") {
      return this.eraseAt(point);
    }

    const input = pointerData || event;

    const added = this.addPoint(point, input);

    if (added) {
      this.renderCurrent();
    }

    return added;
  }

  buildPath(points) {
    return this.builder.smoothing.toPath(
      this.builder.smoothing.process(points)
    );
  }

  renderCurrent() {
    if (!this.currentElement) return false;

    const built = this.builder.build();

    if (!built) return false;

    this.currentElement = {
      ...this.currentElement,
      ...built,
      points: this.builder.points
    };

    return this.renderer.updateElement(
      this.currentElement
    );
  }

  end(event = {}) {
    if (!this.drawing || this.destroyed) {
      return false;
    }

    if (
      this.activePointer !== null &&
      event.pointerId !== undefined &&
      event.pointerId !== this.activePointer
    ) {
      return false;
    }

    const layer = this.activeLayer;
    let committed = false;

    if (
      layer &&
      !layer.locked &&
      layer.visible !== false
    ) {
      if (this.settings.tool === "eraser") {
        if (this.changed) {
          this.commitHistory();
          committed = true;
        }
      } else if (this.currentElement && this.points.length) {
        const element = this.builder.build();

        if (element) {
          const brushStyle = this.brushStyle || {
            lineCap: "round",
            dashArray: ""
          };

          element.style = {
            ...(element.style || {}),
            lineCap: brushStyle.lineCap,
            dashArray: brushStyle.dashArray,
            customBrush: brushStyle.image || null
          };

          const exists = layer.elements.some(
            item => item.id === element.id
          );

          if (!exists) {
            if (typeof this.document.addElement === "function") {
              committed = this.document.addElement(element);
            } else {
              layer.elements.push(EngineUtils.clone(element));

              this.document.touch?.();
              committed = true;
            }

            if (committed) {
              this.commitHistory();
            }
          }
        }
      }
    }

    this.renderer.clearPreview();

    if (committed) {
      this.renderer.render(this.document);
    }

    this.reset();

    return committed;
  }

  cancel() {
    if (!this.drawing) return false;

    this.renderer.clearPreview();

    // الممحاة تعدل العناصر مباشرة، لذلك نحفظ
    // عملية الحذف حتى عند إلغاء المؤشر.
    if (
      this.settings.tool === "eraser" &&
      this.changed
    ) {
      this.commitHistory();
      this.renderer.render(this.document);
    }

    this.reset();

    return true;
  }

  interrupt(commit = true) {
    if (!this.drawing) return false;

    if (commit) {
      return this.end({
        pointerId: this.activePointer
      });
    }

    return this.cancel();
  }

  getEraserTolerance() {
    const zoom = EngineUtils.number(
      this.coordinates.camera?.zoom ??
      this.coordinates.camera?.scale,
      1
    );

    return this.settings.eraserSize /
      Math.max(0.01, zoom);
  }

  eraseAt(point) {
    const layer = this.activeLayer;

    if (
      !layer ||
      layer.locked ||
      layer.visible === false ||
      !EngineUtils.validPoint(point)
    ) {
      return false;
    }

    const result = HitTesting.hitTest(
      layer.elements,
      point,
      this.getEraserTolerance()
    );

    if (!result || this.erasedIds.has(result.id)) {
      return false;
    }

    const index = layer.elements.findIndex(
      element => element.id === result.id
    );

    if (index === -1) return false;

    layer.elements.splice(index, 1);

    this.erasedIds.add(result.id);
    this.changed = true;

    this.document.touch?.();

    this.renderer.renderActiveLayer(layer);

    return true;
  }

  hitTest(point, tolerance = 8) {
    const layer = this.activeLayer;

    if (!layer || !EngineUtils.validPoint(point)) {
      return null;
    }

    const zoom = EngineUtils.number(
      this.coordinates.camera?.zoom ??
      this.coordinates.camera?.scale,
      1
    );

    const worldTolerance =
      EngineUtils.number(tolerance, 8) /
      Math.max(0.01, zoom);

    return HitTesting.hitTest(
      layer.elements,
      point,
      worldTolerance
    );
  }

  removeElement(id) {
    const layer = this.activeLayer;

    if (!layer || layer.locked || !id) {
      return false;
    }

    const index = layer.elements.findIndex(
      element => element.id === id
    );

    if (index === -1) return false;

    layer.elements.splice(index, 1);

    this.document.touch?.();

    this.commitHistory();
    this.renderer.render(this.document);

    return true;
  }

  clear() {
    const layer = this.activeLayer;

    if (
      !layer ||
      layer.locked ||
      !layer.elements.length
    ) {
      return false;
    }

    layer.elements = [];

    this.document.touch?.();

    this.commitHistory();
    this.renderer.render(this.document);

    return true;
  }

  commitHistory() {
    if (typeof this.history.commit === "function") {
      this.history.commit();
      return true;
    }

    return false;
  }

  onCommit() {
    this.commitHistory();
    this.renderer.render(this.document);
  }

  reset() {
    this.drawing = false;
    this.activePointer = null;

    this.currentElement = null;
    this.points = [];
    this.lastPoint = null;

    this.changed = false;
    this.erasedIds.clear();

    this.builder.reset();
  }

  destroy() {
    if (this.destroyed) return;

    if (this.drawing) {
      this.cancel();
    }

    this.reset();

    this.document = null;
    this.renderer = null;
    this.history = null;
    this.coordinates = null;

    this.destroyed = true;
  }
}
