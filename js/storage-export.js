
/* =========================================================
   RASEM 2.0
   STORAGE & EXPORT MODULE

   Includes:
   - DocumentFormat
   - StorageManager
   - Autosave
   - SVGExport
   - PNGExport
   - PDFExport

   No external dependencies required.
========================================================= */

const RASEM_FORMAT = "rasem-document";
const RASEM_VERSION = "2.0";
const DEFAULT_STORAGE_KEY = "rasem-2-document";

const SVG_NS = "http://www.w3.org/2000/svg";


// =========================================================
// SHARED HELPERS
// =========================================================

function cloneData(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ??
    `rasem-${Date.now()}-${Math.random()
      .toString(36).slice(2)}`;
}

function escapeXML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function downloadBlob(blob, filename) {
  if (!(blob instanceof Blob)) {
    throw new TypeError("Invalid export Blob");
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return true;
}

function normalizeFilename(name, extension) {
  const safeName = String(name || "rasem-drawing")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim();

  const base = safeName || "rasem-drawing";

  return base.toLowerCase().endsWith(`.${extension}`)
    ? base
    : `${base}.${extension}`;
}


// =========================================================
// 1. DOCUMENT FORMAT
// =========================================================

export class DocumentFormat {

  static VERSION = RASEM_VERSION;

  static create(data = {}) {
    const now = Date.now();

    return {
      format: RASEM_FORMAT,
      version: RASEM_VERSION,

      id: data.id || createId(),

      name: String(data.name || "رسم جديد"),

      camera: {
        x: safeNumber(data.camera?.x),
        y: safeNumber(data.camera?.y),
        zoom: clamp(
          safeNumber(data.camera?.zoom, 1),
          0.05,
          100
        ),
        rotation: safeNumber(data.camera?.rotation)
      },

      activeLayerId: data.activeLayerId || null,

      layers: Array.isArray(data.layers)
        ? cloneData(data.layers)
        : [],

      createdAt: safeNumber(data.createdAt, now),
      updatedAt: now
    };
  }

  static validate(data) {
    if (!isObject(data)) {
      return {
        valid: false,
        errors: ["المستند ليس كائناً صالحاً"]
      };
    }

    const errors = [];

    if (
      data.format !== undefined &&
      data.format !== RASEM_FORMAT
    ) {
      errors.push("صيغة المستند غير مدعومة");
    }

    if (!Array.isArray(data.layers)) {
      errors.push("قائمة الطبقات غير صالحة");
    }

    if (Array.isArray(data.layers)) {
      const ids = new Set();

      data.layers.forEach((layer, index) => {
        if (!isObject(layer)) {
          errors.push(`الطبقة ${index} غير صالحة`);
          return;
        }

        if (
          typeof layer.id !== "string" ||
          !layer.id.trim()
        ) {
          errors.push(`معرف الطبقة ${index} غير صالح`);
        } else if (ids.has(layer.id)) {
          errors.push(`معرف الطبقة ${index} مكرر`);
        } else {
          ids.add(layer.id);
        }

        if (!Array.isArray(layer.elements)) {
          errors.push(
            `عناصر الطبقة ${index} غير صالحة`
          );
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static normalize(data) {
    if (!isObject(data)) {
      throw new TypeError("Invalid document data");
    }

    const source = cloneData(data);

    const layers = Array.isArray(source.layers)
      ? source.layers
      : [];

    const normalizedLayers = [];
    const layerIds = new Set();

    for (const layer of layers) {
      if (!isObject(layer)) continue;

      if (
        typeof layer.id !== "string" ||
        !layer.id.trim() ||
        layerIds.has(layer.id)
      ) {
        continue;
      }

      layerIds.add(layer.id);

      const elements = Array.isArray(layer.elements)
        ? layer.elements.filter(element =>
            isObject(element) &&
            typeof element.id === "string" &&
            element.id.length > 0
          )
        : [];

      normalizedLayers.push({
        ...layer,

        name: String(layer.name || "طبقة"),

        visible: layer.visible !== false,

        locked: layer.locked === true,

        opacity: clamp(
          safeNumber(layer.opacity, 1),
          0,
          1
        ),

        elements
      });
    }

    if (!normalizedLayers.length) {
      const id = createId();

      normalizedLayers.push({
        id,
        name: "الطبقة الأولى",
        visible: true,
        locked: false,
        opacity: 1,
        elements: []
      });
    }

    const activeLayer = normalizedLayers.find(
      layer => layer.id === source.activeLayerId
    );

    const now = Date.now();

    return {
      format: RASEM_FORMAT,
      version: RASEM_VERSION,

      id: String(source.id || createId()),

      name: String(source.name || "رسم جديد"),

      camera: {
        x: safeNumber(source.camera?.x),
        y: safeNumber(source.camera?.y),

        zoom: clamp(
          safeNumber(source.camera?.zoom, 1),
          0.05,
          100
        ),

        rotation: safeNumber(
          source.camera?.rotation
        )
      },

      activeLayerId: activeLayer
        ? activeLayer.id
        : normalizedLayers[0].id,

      layers: normalizedLayers,

      createdAt: safeNumber(source.createdAt, now),
      updatedAt: safeNumber(source.updatedAt, now)
    };
  }

  static serialize(documentData, pretty = false) {
    const normalized = this.normalize(documentData);

    return JSON.stringify(
      normalized,
      null,
      pretty ? 2 : 0
    );
  }

  static parse(json) {
    if (typeof json !== "string") {
      throw new TypeError("Document JSON must be a string");
    }

    const parsed = JSON.parse(json);

    const result = this.validate(parsed);

    if (!result.valid) {
      throw new Error(
        `Invalid document: ${result.errors.join(", ")}`
      );
    }

    return this.normalize(parsed);
  }

  static importFile(file) {
    if (!(file instanceof Blob)) {
      return Promise.reject(
        new TypeError("Invalid import file")
      );
    }

    return file.text().then(text => this.parse(text));
  }

  static exportFile(documentData) {
    const json = this.serialize(documentData, true);

    return new Blob(
      [json],
      { type: "application/json;charset=utf-8" }
    );
  }
}


// =========================================================
// 2. STORAGE MANAGER
// =========================================================

export class StorageManager {

  constructor(documentModel, options = {}) {
    if (!documentModel) {
      throw new TypeError(
        "StorageManager requires a document model"
      );
    }

    this.document = documentModel;

    this.storage = options.storage ??
      globalThis.localStorage;

    this.key = options.key || DEFAULT_STORAGE_KEY;

    this.backupKey = `${this.key}-backup`;

    this.destroyed = false;
  }

  getDocumentData() {
    if (typeof this.document.toJSON === "function") {
      return this.document.toJSON();
    }

    return cloneData(this.document);
  }

  save() {
    if (this.destroyed) return false;

    try {
      const data = this.getDocumentData();

      const json = DocumentFormat.serialize(data);

      // الاحتفاظ بالنسخة السابقة قبل استبدالها.
      const previous = this.storage.getItem(this.key);

      if (previous) {
        this.storage.setItem(
          this.backupKey,
          previous
        );
      }

      this.storage.setItem(this.key, json);

      return true;

    } catch (error) {
      console.error("Rasem save failed:", error);
      return false;
    }
  }

  load() {
    if (this.destroyed) return null;

    try {
      const json = this.storage.getItem(this.key);

      if (!json) return null;

      const data = DocumentFormat.parse(json);

      if (!data || typeof data !== "object") {
        throw new Error("Invalid saved document");
      }

      return data;

    } catch (error) {
      console.error("Rasem load failed:", error);
      return null;
    }
  }

  restore() {
    const data = this.load();

    if (!data) {
      return false;
    }

    try {
      if (typeof this.document.fromJSON === "function") {
        this.document.fromJSON(data);
      } else {
        if (
          !Array.isArray(this.document.layers)
        ) {
          return false;
        }

        this.document.id = data.id;
        this.document.name = data.name;
        this.document.camera = data.camera;
        this.document.layers = data.layers;
        this.document.activeLayerId =
          data.activeLayerId;
        this.document.createdAt = data.createdAt;
        this.document.updatedAt = data.updatedAt;
      }

      return true;

    } catch (error) {
      console.error("Rasem restore failed:", error);
      return false;
    }
  }

  restoreBackup() {
    if (this.destroyed) return false;

    try {
      const json = this.storage.getItem(
        this.backupKey
      );

      if (!json) return false;

      const data = DocumentFormat.parse(json);

      if (typeof this.document.fromJSON === "function") {
        this.document.fromJSON(data);
      } else {
        Object.assign(this.document, data);
      }

      return true;

    } catch (error) {
      console.error("Backup restore failed:", error);
      return false;
    }
  }

  importFile(file) {
    return DocumentFormat.importFile(file);
  }

  exportFile() {
    try {
      return DocumentFormat.exportFile(
        this.getDocumentData()
      );
    } catch (error) {
      console.error("Document export failed:", error);
      return null;
    }
  }

  download() {
    const blob = this.exportFile();

    if (!blob) return false;

    try {
      const data = this.getDocumentData();

      return downloadBlob(
        blob,
        normalizeFilename(data.name, "rasem")
          .replace(/\.rasem$/, ".json")
      );

    } catch (error) {
      console.error("Download failed:", error);
      return false;
    }
  }

  clear() {
    if (this.destroyed) return false;

    try {
      this.storage.removeItem(this.key);
      this.storage.removeItem(this.backupKey);

      return true;

    } catch (error) {
      console.error("Storage clear failed:", error);
      return false;
    }
  }

  hasSavedDocument() {
    if (this.destroyed) return false;

    try {
      return this.storage.getItem(this.key) !== null;
    } catch {
      return false;
    }
  }

  destroy() {
    this.document = null;
    this.storage = null;
    this.destroyed = true;
  }
}


// =========================================================
// 3. AUTOSAVE
// =========================================================

export class Autosave {

  constructor(storageManager, options = {}) {
    if (!storageManager) {
      throw new TypeError(
        "Autosave requires StorageManager"
      );
    }

    this.storage = storageManager;

    this.delay = clamp(
      safeNumber(options.delay, 1000),
      100,
      60000
    );

    this.enabled = options.enabled !== false;

    this.timer = null;

    this.destroyed = false;

    this.saving = false;

    this.onSave = options.onSave || null;
    this.onError = options.onError || null;
  }

  schedule() {
    if (this.destroyed || !this.enabled) {
      return false;
    }

    clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      this.timer = null;

      if (this.destroyed || !this.enabled) {
        return;
      }

      this.save();
    }, this.delay);

    return true;
  }

  save() {
    if (
      this.destroyed ||
      !this.enabled ||
      this.saving
    ) {
      return false;
    }

    this.saving = true;

    try {
      const success = this.storage.save();

      if (success) {
        this.onSave?.();
      } else {
        this.onError?.(
          new Error("Autosave failed")
        );
      }

      return success;

    } catch (error) {
      this.onError?.(error);
      return false;

    } finally {
      this.saving = false;
    }
  }

  flush() {
    if (this.destroyed) return false;

    clearTimeout(this.timer);
    this.timer = null;

    return this.save();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);

    if (!this.enabled) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    return this.enabled;
  }

  destroy() {
    if (this.destroyed) return;

    clearTimeout(this.timer);

    this.timer = null;

    this.storage = null;

    this.onSave = null;
    this.onError = null;

    this.destroyed = true;
  }
}


// =========================================================
// 4. SVG EXPORT
// =========================================================

export class SVGExport {

  static getDimensions(documentData, options = {}) {
    const width = Math.max(
      1,
      safeNumber(options.width, 1920)
    );

    const height = Math.max(
      1,
      safeNumber(options.height, 1080)
    );

    return { width, height };
  }

  static getGeometry(element) {
    const tag = element.svgTag ||
      (element.type === "shape"
        ? element.shape
        : "path");

    const allowed = new Set([
      "path",
      "line",
      "rect",
      "circle",
      "ellipse",
      "polygon",
      "polyline"
    ]);

    return allowed.has(tag) ? tag : "path";
  }

  static renderElement(element) {
    if (!isObject(element)) return "";

    const tag = this.getGeometry(element);

    const style = element.style || {};
    const geometry = element.geometry || {};

    const attributes = {
      "data-id": element.id,

      d: geometry.d ?? element.path,

      x: geometry.x,
      y: geometry.y,
      x1: geometry.x1,
      y1: geometry.y1,
      x2: geometry.x2,
      y2: geometry.y2,

      cx: geometry.cx,
      cy: geometry.cy,

      r: geometry.r,
      rx: geometry.rx,
      ry: geometry.ry,

      width: geometry.width,
      height: geometry.height,

      points: geometry.points,

      fill: style.fill ?? "none",
      stroke: style.color ?? "#111111",

      "stroke-width": safeNumber(style.size, 2),

      "stroke-opacity": clamp(
        safeNumber(style.opacity, 1),
        0,
        1
      ),

      "fill-opacity": style.fill &&
        style.fill !== "none"
        ? clamp(safeNumber(style.opacity, 1), 0, 1)
        : undefined,

      "stroke-linecap": style.lineCap || "round",
      "stroke-linejoin": style.lineJoin || "round",

      "stroke-dasharray": style.dashArray,

      transform: element.transform,

      visibility: element.visible === false
        ? "hidden"
        : "visible"
    };

    const validAttributes = Object.entries(attributes)
      .filter(([name, value]) => {
        if (value === undefined || value === null) {
          return false;
        }

        // منع إدراج سمات غير معروفة.
        return /^[a-zA-Z][a-zA-Z0-9-]*$/.test(name);
      })
      .map(([name, value]) =>
        `${name}="${escapeXML(value)}"`
      )
      .join(" ");

    return `<${tag} ${validAttributes}/>`;
  }

  static renderLayer(layer) {
    if (!layer || layer.visible === false) {
      return "";
    }

    const elements = Array.isArray(layer.elements)
      ? layer.elements
      : [];

    const content = elements
      .map(element => this.renderElement(element))
      .join("");

    return [
      `<g data-layer-id="${escapeXML(layer.id)}"`,
      ` opacity="${clamp(safeNumber(layer.opacity, 1), 0, 1)}">`,
      content,
      "</g>"
    ].join("");
  }

  static generate(documentData, options = {}) {
    const data = DocumentFormat.normalize(documentData);

    const { width, height } = this.getDimensions(
      data,
      options
    );

    const layers = data.layers
      .map(layer => this.renderLayer(layer))
      .join("");

    const background = options.background
      ? `<rect width="100%" height="100%" fill="${escapeXML(options.background)}"/>`
      : "";

    const content = background + layers;

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="${SVG_NS}"`,
      ` width="${width}" height="${height}"`,
      ` viewBox="0 0 ${width} ${height}">`,
      content,
      "</svg>"
    ].join("");
  }

  static export(documentData, options = {}) {
    const svg = this.generate(documentData, options);

    return new Blob(
      [svg],
      { type: "image/svg+xml;charset=utf-8" }
    );
  }

  static download(documentData, options = {}) {
    try {
      const blob = this.export(documentData, options);

      return downloadBlob(
        blob,
        normalizeFilename(
          documentData.name,
          "svg"
        )
      );

    } catch (error) {
      console.error("SVG export failed:", error);
      return false;
    }
  }
}


// =========================================================
// 5. PNG EXPORT
// =========================================================

export class PNGExport {

  static async export(documentData, options = {}) {
    const width = Math.max(
      1,
      Math.round(safeNumber(options.width, 1920))
    );

    const height = Math.max(
      1,
      Math.round(safeNumber(options.height, 1080))
    );

    const scale = clamp(
      safeNumber(options.scale, 1),
      0.1,
      8
    );

    const svg = SVGExport.generate(
      documentData,
      {
        width,
        height,
        background: options.background
      }
    );

    const svgBlob = new Blob(
      [svg],
      { type: "image/svg+xml;charset=utf-8" }
    );

    const url = URL.createObjectURL(svgBlob);

    try {
      const image = new Image();

      image.decoding = "async";

      await new Promise((resolve, reject) => {
        image.onload = resolve;

        image.onerror = () => reject(
          new Error("Unable to load SVG image")
        );

        image.src = url;
      });

      const canvas = document.createElement("canvas");

      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);

      const context = canvas.getContext("2d", {
        alpha: true
      });

      if (!context) {
        throw new Error("Canvas context unavailable");
      }

      if (options.background) {
        context.fillStyle = options.background;

        context.fillRect(
          0,
          0,
          canvas.width,
          canvas.height
        );
      }

      context.drawImage(
        image,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          result => {
            if (!result) {
              reject(new Error("PNG encoding failed"));
              return;
            }

            resolve(result);
          },
          "image/png"
        );
      });

      return blob;

    } finally {
      URL.revokeObjectURL(url);
    }
  }

  static async download(documentData, options = {}) {
    try {
      const blob = await this.export(
        documentData,
        options
      );

      return downloadBlob(
        blob,
        normalizeFilename(
          documentData.name,
          "png"
        )
      );

    } catch (error) {
      console.error("PNG export failed:", error);
      return false;
    }
  }
}


// =========================================================
// 6. PDF EXPORT
// =========================================================

export class PDFExport {

  static async export(documentData, options = {}) {
    /*
      Uses the browser print dialog.
      The user can choose "Save as PDF".

      No PDF library is required.
    */

    const printWindow = window.open(
      "",
      "_blank"
    );

    if (!printWindow) {
      throw new Error(
        "تعذر فتح نافذة الطباعة. تحقق من السماح بالنوافذ المنبثقة."
      );
    }

    try {
      const width = Math.max(
        1,
        safeNumber(options.width, 1920)
      );

      const height = Math.max(
        1,
        safeNumber(options.height, 1080)
      );

      const svg = SVGExport.generate(
        documentData,
        {
          width,
          height,
          background: options.background || "#ffffff"
        }
      );

      const blob = new Blob(
        [svg],
        { type: "image/svg+xml;charset=utf-8" }
      );

      const url = URL.createObjectURL(blob);

      const title = escapeXML(
        documentData.name || "Rasem Drawing"
      );

      const orientation = width >= height
        ? "landscape"
        : "portrait";

      printWindow.document.open();

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">

          <title>${title}</title>

          <style>
            * {
              box-sizing: border-box;
            }

            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              background: white;
            }

            body {
              display: flex;
              align-items: center;
              justify-content: center;
            }

            img {
              display: block;
              max-width: 100%;
              max-height: 100%;
              object-fit: contain;
            }

            @page {
              size: A4 ${orientation};
              margin: 10mm;
            }

            @media print {
              html, body {
                width: 100%;
                height: 100%;
              }

              img {
                width: 100%;
                height: 100%;
                object-fit: contain;
              }
            }
          </style>
        </head>

        <body>
          <img id="rasem-export" alt="${title}">
        </body>
        </html>
      `);

      printWindow.document.close();

      const image = printWindow.document.getElementById(
        "rasem-export"
      );

      await new Promise((resolve, reject) => {
        image.onload = resolve;

        image.onerror = () => reject(
          new Error("PDF preview image failed to load")
        );

        image.src = url;
      });

      printWindow.focus();

      // تأخير قصير للسماح للمتصفح بتجهيز الصفحة.
      await new Promise(resolve =>
        setTimeout(resolve, 300)
      );

      printWindow.print();

      // لا نغلق النافذة مباشرة حتى لا تتأثر نافذة الطباعة.
      printWindow.addEventListener(
        "afterprint",
        () => {
          URL.revokeObjectURL(url);
          printWindow.close();
        },
        { once: true }
      );

      return true;

    } catch (error) {
      printWindow.close();
      throw error;
    }
  }
}


// =========================================================
// END OF STORAGE & EXPORT MODULE
// =========================================================
