
/* =========================================================
   RASEM 2.0
   js/app.js

   Main Application Bootstrap

   Responsibilities:
   - Initialize application modules
   - Connect drawing engine and tools
   - Initialize storage and autosave
   - Initialize user interface
   - Manage pointer and multitouch events
   - Handle keyboard shortcuts
   - Expose public API
   - Cleanup application resources
========================================================= */

import {
  DrawingDocument,
  Camera,
  Scene,
  Coordinates,
  EventManager
} from "./core.js";

import {
  DrawingEngine
} from "./engine.js";

import {
  ToolManager
} from "./tools.js";

import {
  HistoryManager
} from "./layers-history.js";

import {
  StorageManager,
  Autosave,
  SVGExport,
  PNGExport,
  PDFExport
} from "./storage-export.js";

import {
  UIManager
} from "./ui.js";

// =========================================================
// CONFIGURATION
// =========================================================

const CONFIG = Object.freeze({
  name: "Rasem",
  version: "2.0",

  historyLimit: 100,

  autosaveDelay: 1000,

  themeKey: "rasem-theme",

  defaultTheme: "dark",

  canvasId: "drawingCanvas",
  viewportId: "viewport",
  drawingLayerId: "drawingLayer"
});

// =========================================================
// UTILITIES
// =========================================================

function getElement(id) {
  return document.getElementById(id);
}

function isInputElement(element) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element?.isContentEditable
  );
}

function distance(a, b) {
  return Math.hypot(
    b.x - a.x,
    b.y - a.y
  );
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

// =========================================================
// APPLICATION CLASS
// =========================================================

export class RasemApplication {

  constructor(options = {}) {
    if (RasemApplication.instance) {
      throw new Error(
        "Rasem application is already initialized"
      );
    }

    this.options = options;

    this.modules = {};

    this.initialized = false;
    this.destroyed = false;

    this.pointerGesture = null;

    this.cleanupCallbacks = [];

    this.toastTimer = null;

    this.elements = null;

    RasemApplication.instance = this;
  }

  // =======================================================
  // INITIALIZE
  // =======================================================

  init() {
    if (this.initialized) {
      return this;
    }

    if (this.destroyed) {
      throw new Error(
        "Cannot initialize a destroyed application"
      );
    }

    try {
      this.validateDOM();

      this.initializeDocument();
      this.initializeCamera();
      this.initializeRenderer();
      this.initializeCoordinates();

      this.initializeHistory();
      this.initializeEngine();
      this.initializeTools();

      this.initializeStorage();
      this.restoreDocument();

      this.initializeAutosave();
      this.initializeUI();

      this.initializeEvents();
      this.initializeControls();

      this.restoreTheme();

      this.initializeKeyboard();

      this.initialized = true;

      this.emit("rasem:ready", {
        version: CONFIG.version
      });

      console.info(
        `Rasem ${CONFIG.version} initialized`
      );

      return this;

    } catch (error) {
      console.error(
        "Rasem initialization failed:",
        error
      );

      this.destroy();

      throw error;
    }
  }

  // =======================================================
  // DOM VALIDATION
  // =======================================================

  validateDOM() {
    const svg = getElement(CONFIG.canvasId);
    const viewport = getElement(CONFIG.viewportId);
    const drawingLayer = getElement(CONFIG.drawingLayerId);

    if (!svg || !viewport || !drawingLayer) {
      throw new Error(
        "Missing required canvas elements: " +
        "drawingCanvas, viewport or drawingLayer"
      );
    }

    if (!svg.contains(viewport)) {
      throw new Error(
        "Viewport must be inside drawingCanvas"
      );
    }

    if (!viewport.contains(drawingLayer)) {
      throw new Error(
        "drawingLayer must be inside viewport"
      );
    }

    this.elements = {
      svg,
      viewport,
      drawingLayer,

      zoomLabel: getElement("zoomLabel"),
      undoButton: getElement("undoBtn"),
      redoButton: getElement("redoBtn"),

      zoomInButton: getElement("zoomInBtn"),
      zoomOutButton: getElement("zoomOutBtn"),

      clearButton: getElement("clearBtn"),
      saveButton: getElement("saveBtn"),

      themeButton: getElement("themeBtn"),
      toast: getElement("toast")
    };
  }

  // =======================================================
  // DOCUMENT
  // =======================================================

  initializeDocument() {
    this.modules.document = new DrawingDocument();
  }

  // =======================================================
  // CAMERA
  // =======================================================

  initializeCamera() {
    this.modules.camera = new Camera(
      this.elements.svg,
      this.elements.viewport,
      {
        document: this.modules.document
      }
    );

    const cameraState =
      this.modules.document.camera;

    if (cameraState) {
      this.modules.camera.restore(cameraState);
    }
  }

  // =======================================================
  // RENDERER
  // =======================================================

  initializeRenderer() {
    this.modules.renderer = new Scene(
      this.elements.svg,
      this.elements.viewport,
      this.elements.drawingLayer
    );
  }

  // =======================================================
  // COORDINATES
  // =======================================================

  initializeCoordinates() {
    this.modules.coordinates = new Coordinates(
      this.elements.svg,
      this.modules.camera
    );
  }

  // =======================================================
  // HISTORY
  // =======================================================

  initializeHistory() {
    this.modules.history = new HistoryManager(
      this.modules.document,
      this.modules.renderer,
      {
        limit: CONFIG.historyLimit,

        onChange: state => {
          this.updateHistoryControls(state);
        }
      }
    );
  }

  updateHistoryControls(state = {}) {
    if (this.elements.undoButton) {
      this.elements.undoButton.disabled =
        !state.canUndo;
    }

    if (this.elements.redoButton) {
      this.elements.redoButton.disabled =
        !state.canRedo;
    }
  }

  // =======================================================
  // DRAWING ENGINE
  // =======================================================

  initializeEngine() {
    this.modules.engine = new DrawingEngine(
      this.modules.document,
      this.modules.renderer,
      this.modules.history,
      this.modules.coordinates
    );
  }

  // =======================================================
  // TOOLS
  // =======================================================

  initializeTools() {
    this.modules.tools = new ToolManager(
      this.modules.engine,
      this.modules.camera
    );
  }

  // =======================================================
  // STORAGE
  // =======================================================

  initializeStorage() {
    this.modules.storage = new StorageManager(
      this.modules.document
    );
  }

  restoreDocument() {
    const restored = this.modules.storage.restore();

    if (restored) {
      this.modules.renderer.render(
        this.modules.document
      );

      if (this.modules.document.camera) {
        this.modules.camera.restore(
          this.modules.document.camera
        );
      }
    } else {
      this.modules.renderer.render(
        this.modules.document
      );
    }

    this.modules.history.reset();

    return restored;
  }

  // =======================================================
  // AUTOSAVE
  // =======================================================

  initializeAutosave() {
    this.modules.autosave = new Autosave(
      this.modules.storage,
      {
        delay: CONFIG.autosaveDelay,

        onSave: () => {
          this.emit("rasem:autosaved");
        },

        onError: error => {
          console.error(
            "Autosave failed:",
            error
          );

          this.emit("rasem:autosaveerror", {
            error
          });
        }
      }
    );
  }

  scheduleAutosave() {
    this.modules.autosave?.schedule?.();
  }

  flushAutosave() {
    this.modules.autosave?.flush?.();
  }

  // =======================================================
  // USER INTERFACE
  // =======================================================

  initializeUI() {
    this.modules.ui = new UIManager({
      engine: this.modules.engine,
      tools: this.modules.tools,
      document: this.modules.document,
      history: this.modules.history,
      renderer: this.modules.renderer,
      storage: this.modules.storage
    });
  }

  // =======================================================
  // POINTER EVENTS
  // =======================================================

  initializeEvents() {
    this.modules.events = new EventManager(
      this.elements.svg,
      {
        down: event => {
          this.handlePointerDown(event);
        },

        move: event => {
          this.handlePointerMove(event);
        },

        up: event => {
          this.handlePointerUp(event);
        },

        cancel: event => {
          this.handlePointerCancel(event);
        },

        multitouchStart: pointers => {
          this.handleMultitouchStart(pointers);
        },

        multitouch: pointers => {
          this.handleMultitouch(pointers);
        },

        multitouchEnd: () => {
          this.handleMultitouchEnd();
        },

        pointerCount: count => {
          this.emit("rasem:pointercount", {
            count
          });
        }
      }
    );
  }

  handlePointerDown(event) {
    if (this.destroyed) return;

    if (this.pointerGesture) return;

    this.modules.tools.handleDown(event);
  }

  handlePointerMove(event) {
    if (this.destroyed) return;

    this.modules.tools.handleMove(event);
  }

  handlePointerUp(event) {
    if (this.destroyed) return;

    this.modules.tools.handleUp(event);

    this.scheduleAutosave();
  }

  handlePointerCancel(event) {
    if (this.destroyed) return;

    this.modules.tools.handleCancel(event);
  }

  // =======================================================
  // MULTITOUCH / PINCH ZOOM
  // =======================================================

  handleMultitouchStart(pointers) {
    if (this.destroyed) return;

    if (this.modules.engine.drawing) {
      this.modules.engine.cancel();
    }

    if (pointers.length < 2) {
      this.pointerGesture = null;
      return;
    }

    const first = pointers[0];
    const second = pointers[1];

    this.pointerGesture = {
      distance: distance(first, second),

      center: midpoint(first, second)
    };
  }

  handleMultitouch(pointers) {
    if (
      this.destroyed ||
      !Array.isArray(pointers) ||
      pointers.length < 2
    ) {
      return;
    }

    const first = pointers[0];
    const second = pointers[1];

    const nextDistance = distance(
      first,
      second
    );

    const nextCenter = midpoint(
      first,
      second
    );

    if (
      !this.pointerGesture ||
      this.pointerGesture.distance <= 0
    ) {
      this.pointerGesture = {
        distance: nextDistance,
        center: nextCenter
      };

      return;
    }

    const factor =
      nextDistance / this.pointerGesture.distance;

    if (
      Number.isFinite(factor) &&
      factor > 0
    ) {
      this.modules.camera.zoomAt(
        factor,
        nextCenter.x,
        nextCenter.y
      );
    }

    this.pointerGesture = {
      distance: nextDistance,
      center: nextCenter
    };
  }

  handleMultitouchEnd() {
    this.pointerGesture = null;

    this.scheduleAutosave();
  }

  // =======================================================
  // UI CONTROLS
  // =======================================================


  // RASEM_UNDO_REDO_BUTTONS
  bindHistoryButtons() {
    const undo = this.elements.undoButton;
    const redo = this.elements.redoButton;

    if (!undo || !redo) {
      throw new Error("Undo/Redo buttons not found");
    }

    const runHistory = (action) => {
      if (this.destroyed) return;

      const history = this.modules.history;
      if (!history) return;

      const changed = action === "undo"
        ? history.undo()
        : history.redo();

      if (changed) {
        this.modules.renderer.render(this.modules.document);
        this.scheduleAutosave();
      }
    };

    const onUndo = () => runHistory("undo");
    const onRedo = () => runHistory("redo");

    undo.addEventListener("click", onUndo);
    redo.addEventListener("click", onRedo);

    this.cleanupCallbacks.push(() => {
      undo.removeEventListener("click", onUndo);
      redo.removeEventListener("click", onRedo);
    });
  }

  initializeControls() {
    this.bindHistoryButtons();

    this.bindClick(
      this.elements.zoomInButton,
      () => this.modules.camera.zoomIn()
    );

    this.bindClick(
      this.elements.zoomOutButton,
      () => this.modules.camera.zoomOut()
    );

    this.bindClick(
      this.elements.clearButton,
      () => this.clearCanvas()
    );

    this.bindClick(
      this.elements.saveButton,
      () => this.saveDocument()
    );

    this.bindClick(
      this.elements.themeButton,
      () => this.toggleTheme()
    );

    // RASEM_NEW_CANVAS_IMPLEMENTATION
    const newCanvasDialog = getElement("newCanvasDialog");

    this.bindClick(
      getElement("newCanvasBtn"),
      () => {
        if (newCanvasDialog && !newCanvasDialog.open) {
          newCanvasDialog.showModal();
        }
      }
    );

    this.bindClick(
      getElement("newCanvasSaveBtn"),
      () => {
        newCanvasDialog?.close();
        this.createNewCanvas(true);
      }
    );

    this.bindClick(
      getElement("newCanvasDiscardBtn"),
      () => {
        newCanvasDialog?.close();
        this.createNewCanvas(false);
      }
    );

    this.bindClick(
      getElement("newCanvasCancelBtn"),
      () => newCanvasDialog?.close()
    );



    const importButton = getElement("importBtn");
    const importInput = getElement("importFileInput");

    this.bindClick(importButton, () => {
      importInput?.click();
    });

    if (importInput) {
      const importHandler = async () => {
        const file = importInput.files?.[0];
        if (!file) return;

        await this.importDocumentFile(file);
        importInput.value = "";
      };

      importInput.addEventListener("change", importHandler);

      this.cleanupCallbacks.push(() => {
        importInput.removeEventListener("change", importHandler);
      });
    }

    const exportDialog = getElement("exportDialog");

    this.bindClick(
      getElement("exportBtn"),
      () => {
        if (!exportDialog) return;

        if (!exportDialog.open) {
          exportDialog.showModal();
        }
      }
    );

    this.bindClick(
      getElement("closeExportBtn"),
      () => exportDialog?.close()
    );

    if (exportDialog) {
      const exportHandler = async event => {
        const button = event.target.closest("[data-export]");

        if (!button || !exportDialog.contains(button)) return;

        const format = button.dataset.export;

        try {
          button.disabled = true;

          let result = false;

          if (format === "svg") {
            result = this.exportSVG();
          } else if (format === "png") {
            result = await this.exportPNG();
          } else if (format === "pdf") {
            result = await this.exportPDF();
          }

          if (result === false) {
            this.showToast("تعذر تصدير الرسم");
          } else {
            exportDialog.close();
            this.showToast("تم تجهيز التصدير");
          }

        } catch (error) {
          console.error("Export failed:", error);
          this.showToast("حدث خطأ أثناء التصدير");

        } finally {
          button.disabled = false;
        }
      };

      exportDialog.addEventListener("click", exportHandler);

      this.cleanupCallbacks.push(() => {
        exportDialog.removeEventListener("click", exportHandler);
      });
    }
  }

  bindClick(element, callback) {
    if (!element) return;

    const handler = event => {
      event.preventDefault();
      callback();
    };

    element.addEventListener(
      "click",
      handler
    );

    this.cleanupCallbacks.push(() => {
      element.removeEventListener(
        "click",
        handler
      );
    });
  }


  // RASEM_NEW_CANVAS_IMPLEMENTATION
  createNewCanvas(saveCurrent = false) {
    if (this.destroyed) return false;

    const documentModel = this.modules.document;

    if (!documentModel) return false;

    // حفظ المستند القديم قبل إنشاء الجديد عند اختيار الحفظ.
    if (saveCurrent && !this.saveDocument()) {
      this.showToast("تعذر حفظ اللوحة الحالية");
      return false;
    }

    // إلغاء أي حفظ تلقائي مؤجل للوحة القديمة.
    const autosave = this.modules.autosave;

    if (autosave) {
      autosave.setEnabled(false);
      autosave.setEnabled(true);
    }

    try {
      // إنشاء بيانات مستند افتراضي فارغ.
      const freshDocument = new documentModel.constructor();
      const freshData = freshDocument.toJSON();

      // الحفاظ على هوية كائن المستند المرتبط بالمحرك والتخزين.
      Object.assign(documentModel, freshData);

      // إعادة الكاميرا إلى الوضع الافتراضي.
      this.modules.camera.restore(
        documentModel.camera,
        false
      );

      documentModel.camera = this.modules.camera.state;

      // رسم اللوحة البيضاء والطبقة الفارغة.
      this.modules.renderer.render(documentModel);

      // تصفير التراجع والإعادة.
      this.modules.history.reset();

      // تحديث واجهة الطبقات وبقية المكونات.
      this.modules.ui?.refresh?.();

      const layerCount = getElement("layerCount");

      if (layerCount) {
        layerCount.textContent = "الطبقات: 1";
      }

      // إظهار مساحة الرسم.
      const canvasButton = getElement("openCanvasBtn");

      if (canvasButton) {
        canvasButton.click();
      }

      this.showToast("تم إنشاء لوحة جديدة بنجاح");

      return true;

    } catch (error) {
      console.error("New canvas creation failed:", error);
      this.showToast("تعذر إنشاء اللوحة الجديدة");
      return false;
    }
  }

  // =======================================================
  // CLEAR CANVAS
  // =======================================================

  clearCanvas() {
    if (this.destroyed) return false;

    const layer = this.modules.document.activeLayer;

    if (!layer || layer.locked) {
      this.showToast("الطبقة مقفلة");
      return false;
    }

    if (!layer.elements.length) {
      return false;
    }

    if (!window.confirm("هل تريد مسح الطبقة الحالية؟")) {
      return false;
    }

    const result = this.modules.engine.clear();

    if (result) {
      this.scheduleAutosave();

      this.showToast("تم مسح الطبقة");
    }

    return result;
  }


  // =======================================================
  // IMPORT DOCUMENT
  // =======================================================

  async importDocumentFile(file) {
    if (this.destroyed || !file) return false;

    let data;

    try {
      data = await this.modules.storage.importFile(file);

      const document = this.modules.document;
      const previous = document.toJSON();

      try {
        document.id = data.id;
        document.version = "2.0";
        document.name = data.name;
        document.camera = document.validateCamera(data.camera);
        document.layers = data.layers;
        document.activeLayerId = data.activeLayerId;
        document.createdAt = data.createdAt;
        document.updatedAt = data.updatedAt;

        this.modules.camera.restore(document.camera, false);
        this.modules.renderer.render(document);
        this.modules.history.reset();

        if (!this.modules.storage.save()) {
          throw new Error("تعذر حفظ المستند المستورد");
        }

        this.showToast("تم استيراد المستند بنجاح");
        return true;

      } catch (error) {
        document.id = previous.id;
        document.version = previous.version;
        document.name = previous.name;
        document.camera = previous.camera;
        document.layers = previous.layers;
        document.activeLayerId = previous.activeLayerId;
        document.createdAt = previous.createdAt;
        document.updatedAt = previous.updatedAt;

        this.modules.camera.restore(previous.camera, false);
        this.modules.renderer.render(document);
        this.modules.history.reset();

        this.modules.storage.save();

        throw error;
      }

    } catch (error) {
      console.error("Document import failed:", error);
      this.showToast(error.message || "تعذر استيراد المستند");
      return false;
    }
  }

  // =======================================================
  // SAVE DOCUMENT
  // =======================================================

  saveDocument() {
    if (this.destroyed) return false;

    this.flushAutosave();

    const result = this.modules.storage.save();

    this.showToast(
      result
        ? "تم حفظ المستند"
        : "تعذر حفظ المستند"
    );

    return result;
  }

  // =======================================================
  // EXPORT
  // =======================================================

  exportSVG(options = {}) {
    return SVGExport.download(
      this.modules.document.toJSON(),
      options
    );
  }

  async exportPNG(options = {}) {
    return PNGExport.download(
      this.modules.document.toJSON(),
      options
    );
  }

  async exportPDF(options = {}) {
    return PDFExport.export(
      this.modules.document.toJSON(),
      options
    );
  }

  // =======================================================
  // THEME
  // =======================================================

  restoreTheme() {
    let theme = CONFIG.defaultTheme;

    try {
      theme =
        localStorage.getItem(CONFIG.themeKey) ||
        CONFIG.defaultTheme;
    } catch (error) {
      console.warn("Theme restoration failed", error);
    }

    this.applyTheme(theme);
  }

  applyTheme(theme) {
    const light = theme === "light";

    document.body.classList.toggle(
      "light",
      light
    );

    if (this.elements.themeButton) {
      this.elements.themeButton.textContent =
        light ? "☾" : "☼";
    }
  }

  toggleTheme() {
    const light =
      !document.body.classList.contains("light");

    const theme = light ? "light" : "dark";

    this.applyTheme(theme);

    try {
      localStorage.setItem(
        CONFIG.themeKey,
        theme
      );
    } catch (error) {
      console.warn("Theme saving failed", error);
    }
  }

  // =======================================================
  // TOAST
  // =======================================================

  showToast(message, duration = 2000) {
    const element = this.elements?.toast;

    if (!element) return;

    element.textContent = String(message);

    element.classList.add("show");

    clearTimeout(this.toastTimer);

    this.toastTimer = setTimeout(() => {
      element.classList.remove("show");
    }, duration);
  }

  // =======================================================
  // KEYBOARD SHORTCUTS
  // =======================================================

  initializeKeyboard() {
    this.onKeyDown = event => {
      this.handleKeyboard(event);
    };

    document.addEventListener(
      "keydown",
      this.onKeyDown
    );

    this.cleanupCallbacks.push(() => {
      document.removeEventListener(
        "keydown",
        this.onKeyDown
      );
    });
  }

  handleKeyboard(event) {
    if (
      this.destroyed ||
      isInputElement(event.target)
    ) {
      return;
    }

    const command = event.ctrlKey || event.metaKey;

    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault();

      if (event.shiftKey) {
        this.modules.history.redo();
      } else {
        this.modules.history.undo();
      }

      this.modules.renderer.render(
        this.modules.document
      );

      this.scheduleAutosave();

      return;
    }

    if (command && event.key.toLowerCase() === "y") {
      event.preventDefault();

      this.modules.history.redo();

      this.modules.renderer.render(
        this.modules.document
      );

      this.scheduleAutosave();

      return;
    }

    if (event.key === "Escape") {
      this.modules.tools.handleCancel();
      return;
    }

    if (event.key === "Delete") {
      this.modules.tools.deleteSelection?.();

      this.scheduleAutosave();
      return;
    }

    if (
      event.code === "Space" &&
      !event.repeat
    ) {
      event.preventDefault();

      this.modules.tools.activate("hand");
    }
  }

  // =======================================================
  // EVENTS
  // =======================================================

  emit(name, detail = {}) {
    document.dispatchEvent(
      new CustomEvent(name, {
        detail
      })
    );
  }

  // =======================================================
  // PUBLIC API
  // =======================================================

  get api() {
    return {
      document: this.modules.document,
      camera: this.modules.camera,
      renderer: this.modules.renderer,
      coordinates: this.modules.coordinates,

      engine: this.modules.engine,
      history: this.modules.history,

      tools: this.modules.tools,

      storage: this.modules.storage,
      autosave: this.modules.autosave,

      ui: this.modules.ui,

      export: {
        svg: options => this.exportSVG(options),

        png: options => this.exportPNG(options),

        pdf: options => this.exportPDF(options)
      },

      save: () => this.saveDocument(),

      clear: () => this.clearCanvas(),

      undo: () => {
        const result = this.modules.history.undo();

        this.modules.renderer.render(
          this.modules.document
        );

        this.scheduleAutosave();

        return result;
      },

      redo: () => {
        const result = this.modules.history.redo();

        this.modules.renderer.render(
          this.modules.document
        );

        this.scheduleAutosave();

        return result;
      },

      setTool: tool => {
        return this.modules.tools.activate(tool);
      },

      setSettings: settings => {
        this.modules.engine.setSettings(settings);
      },

      destroy: () => this.destroy()
    };
  }

  // =======================================================
  // DESTROY
  // =======================================================

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;

    clearTimeout(this.toastTimer);

    // Commit or cancel any active drawing safely.
    try {
      this.modules.tools?.handleCancel?.();
    } catch (error) {
      console.error("Tool cleanup failed", error);
    }

    // Stop autosave.
    try {
      this.flushAutosave();
      this.modules.autosave?.destroy?.();
    } catch (error) {
      console.error("Autosave cleanup failed", error);
    }

    // Remove event listeners.
    for (const cleanup of this.cleanupCallbacks.splice(0)) {
      try {
        cleanup();
      } catch (error) {
        console.error("Cleanup failed", error);
      }
    }

    // Destroy modules in dependency order.
    const modules = [
      "events",
      "ui",
      "tools",
      "engine",
      "renderer",
      "camera",
      "storage"
    ];

    for (const name of modules) {
      try {
        this.modules[name]?.destroy?.();
      } catch (error) {
        console.error(
          `Failed to destroy ${name}`,
          error
        );
      }
    }

    this.modules = {};

    if (RasemApplication.instance === this) {
      RasemApplication.instance = null;
    }

    this.emit("rasem:destroyed");
  }
}

// =========================================================
// APPLICATION STARTUP
// =========================================================

export function createRasem(options = {}) {
  const app = new RasemApplication(options);

  app.init();

  return app;
}

// =========================================================
// BROWSER ENTRY POINT
// =========================================================

let rasemApp = null;

function startRasem() {
  if (rasemApp) return rasemApp;

  rasemApp = createRasem();

  window.rasem = rasemApp.api;

  return rasemApp;
}

function stopRasem() {
  if (!rasemApp) return;

  rasemApp.destroy();

  rasemApp = null;

  delete window.rasem;
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      startRasem,
      { once: true }
    );
  } else {
    startRasem();
  }
}

export {
  rasemApp
};
