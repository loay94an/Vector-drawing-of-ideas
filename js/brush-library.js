
(() => {
  "use strict";

  const presets = {
    round: { lineCap: "round", dashArray: "" },
    square: { lineCap: "square", dashArray: "" },
    dash: { lineCap: "round", dashArray: "8 5" },
    soft: { lineCap: "round", dashArray: "" }
  };

  function connect() {
    const engine = window.rasem?.engine;

    if (!engine || typeof engine.setSettings !== "function") {
      return false;
    }

    if (window.__rasemUnifiedBrushConnected) return true;

    window.__rasemUnifiedBrushConnected = true;

    window.addEventListener("rasem:brush-style", event => {
      const detail = event.detail || {};
      const style = detail.style || {};

      engine.setSettings({
        brushStyle: {
          lineCap: style.lineCap || "round",
          dashArray: style.dashArray || "",
          image: detail.image || style.image || null
        }
      });
    });

    return true;
  }

  window.addEventListener("rasem:ready", connect);
  connect();

})();
