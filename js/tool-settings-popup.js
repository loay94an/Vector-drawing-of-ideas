
(() => {
  "use strict";

  const popup = document.getElementById("toolSettingsPopup");
  const title = document.getElementById("toolSettingsTitle");
  const close = document.getElementById("closeToolSettings");
  const toolbar = document.getElementById("toolbar");

  if (!popup || !toolbar || !close) return;

  const names = {
    pen: "إعدادات القلم",
    pencil: "إعدادات الرصاص",
    marker: "إعدادات الماركر"
  };

  const ids = {
    size: "brushSize",
    opacity: "brushOpacity",
    smoothing: "smoothing",
    pressureEnabled: "pressureEnabled"
  };

  const presets = {
    round: { lineCap: "round", dashArray: "" },
    square: { lineCap: "square", dashArray: "" },
    dash: { lineCap: "round", dashArray: "8 5" },
    soft: { lineCap: "round", dashArray: "" }
  };

  const labels = {
    round: "دائرية",
    square: "مربعة",
    dash: "متقطعة",
    soft: "ناعمة"
  };

  const STORAGE = "rasem-per-tool-settings-v1";

  let settings = {};
  let activeTool = "pen";
  let timer = null;
  let pointer = null;
  let startX = 0;
  let startY = 0;
  let opened = false;

  try {
    Object.assign(
      settings,
      JSON.parse(localStorage.getItem(STORAGE) || "{}")
    );
  } catch {}

  function read() {
    const result = {};

    for (const [key, id] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (!el) continue;

      result[key] = el.type === "checkbox"
        ? el.checked
        : Number(el.value);
    }

    result.brush = settings[activeTool]?.brush || "round";

    return result;
  }

  function save() {
    settings[activeTool] = read();

    try {
      localStorage.setItem(STORAGE, JSON.stringify(settings));
    } catch {}

    apply();
  }

  function apply() {
    const current = settings[activeTool] || {};
    const brush = current.brush || "round";

    const style = presets[brush] || presets.round;

    window.dispatchEvent(new CustomEvent("rasem:brush-style", {
      detail: {
        name: brush,
        style,
        tool: activeTool
      }
    }));

    popup.querySelectorAll("[data-brush]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.brush === brush
      );
    });

    const preview = document.getElementById("toolBrushPreview");

    if (preview) {
      preview.textContent = "الشكل الحالي: " + labels[brush];
    }
  }

  function updateOutputs() {
    for (const [id, outputId, suffix, percent] of [
      ["brushSize", "brushSizeValue", "", false],
      ["brushOpacity", "brushOpacityValue", "%", true],
      ["smoothing", "smoothingValue", "%", true]
    ]) {
      const input = document.getElementById(id);
      const output = document.getElementById(outputId);

      if (!input || !output) continue;

      const value = Number(input.value);

      output.textContent = percent
        ? Math.round(value * 100) + suffix
        : value;
    }
  }

  function restore(tool) {
    activeTool = tool;

    if (!settings[tool]) {
      const base = read();

      if (tool === "pencil") {
        base.pressureEnabled = false;
        base.smoothing = 0.65;
      }

      if (tool === "marker") {
        base.pressureEnabled = false;
        base.opacity = 0.4;
        base.size = Math.max(8, base.size || 5.5);
        base.smoothing = 0.5;
      }

      base.brush = "round";
      settings[tool] = base;
    }

    const current = settings[tool];

    for (const [key, id] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (!el || !(key in current)) continue;

      if (el.type === "checkbox") {
        el.checked = Boolean(current[key]);
      } else {
        el.value = String(current[key]);
      }

      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    updateOutputs();
    apply();
  }

  function open(button) {
    const tool = button.dataset.tool;
    if (!names[tool]) return;

    const active = toolbar.querySelector("[data-tool].active");

    if (active) {
      restore(active.dataset.tool);
    }

    title.textContent = names[tool];
    popup.hidden = false;
    opened = true;
  }

  function hide() {
    save();
    popup.hidden = true;
    opened = false;
    clearTimeout(timer);
    pointer = null;
  }



  // Custom PNG brush support
  const pngInput = document.getElementById("customBrushPNG");
  const pngPreview = document.getElementById("customBrushPreview");

  if (pngInput) {
    pngInput.addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (file.type !== "image/png") {
        alert("يرجى اختيار صورة PNG فقط");
        pngInput.value = "";
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        alert("حجم الصورة يجب ألا يتجاوز 2 ميجابايت");
        pngInput.value = "";
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        const imageData = reader.result;

        if (!settings[activeTool]) {
          settings[activeTool] = {};
        }

        settings[activeTool].customBrush = imageData;
        settings[activeTool].brush = "custom";

        try {
          localStorage.setItem(STORAGE, JSON.stringify(settings));
        } catch (error) {
          alert("تعذر حفظ الفرشاة: مساحة التخزين غير كافية");
          return;
        }

        pngPreview.src = imageData;
        pngPreview.hidden = false;

        window.dispatchEvent(new CustomEvent("rasem:brush-style", {
          detail: {
            name: "custom",
            image: imageData,
            tool: activeTool
          }
        }));

        const preview = document.getElementById("toolBrushPreview");
        if (preview) preview.textContent = "الفرشاة المخصصة";

        popup.querySelectorAll("[data-brush]").forEach(button => {
          button.classList.remove("active");
        });
      };

      reader.readAsDataURL(file);
    });
  }

  close.addEventListener("click", hide);

  popup.addEventListener("click", event => {
    const button = event.target.closest("[data-brush]");
    if (!button) return;

    if (!settings[activeTool]) settings[activeTool] = {};

    settings[activeTool].brush = button.dataset.brush;

    save();
    updateOutputs();
  });

  popup.addEventListener("input", event => {
    if (event.target.matches("[data-brush]")) return;
    save();
    updateOutputs();
  });

  popup.addEventListener("change", save);


  // Double-click tool settings interaction
  let lastToolClick = null;
  let lastToolTime = 0;

  const indicatorStyle = document.createElement("style");
  indicatorStyle.textContent = `
    #toolbar [data-tool].settings-pending {
      background: #51447e !important;
      color: #ffffff !important;
      border-color: #b9a7ff !important;
      box-shadow: 0 0 0 2px #a99aff,
                  0 0 12px rgba(169,154,255,.8) !important;
    }
  `;
  document.head.appendChild(indicatorStyle);

  document.addEventListener("click", event => {
    const button = event.target.closest(
      '#toolbar [data-tool="pen"], ' +
      '#toolbar [data-tool="pencil"], ' +
      '#toolbar [data-tool="marker"]'
    );

    if (button) {
      const tool = button.dataset.tool;
      const now = Date.now();

      const secondClick =
        lastToolClick === tool &&
        now - lastToolTime <= 900;

      toolbar.querySelectorAll(".settings-pending")
        .forEach(el => el.classList.remove("settings-pending"));

      if (secondClick) {
        lastToolClick = null;
        lastToolTime = 0;
        open(button);
      } else {
        lastToolClick = tool;
        lastToolTime = now;

        button.classList.add("settings-pending");

        requestAnimationFrame(() => {
          const active = toolbar.querySelector("[data-tool].active");

          if (active && names[active.dataset.tool]) {
            restore(active.dataset.tool);
          }
        });
      }

      return;
    }

    lastToolClick = null;
    lastToolTime = 0;

    toolbar.querySelectorAll(".settings-pending")
      .forEach(el => el.classList.remove("settings-pending"));

    if (
      opened &&
      !popup.contains(event.target) &&
      !toolbar.contains(event.target)
    ) {
      hide();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && opened) hide();
  });

  restore("pen");
  updateOutputs();

})();
