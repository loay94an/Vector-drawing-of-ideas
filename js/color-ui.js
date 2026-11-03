const $ = (id) => document.getElementById(id);

const input = $("colorPicker");
const openBtn = $("colorMenuBtn");
const popup = $("colorPickerPopup");
const closeBtn = $("closeColorPopup");
const wheel = $("hueWheel");
const wheelMarker = $("hueMarker");
const svArea = $("svArea");
const svMarker = $("svMarker");
const hexInput = $("colorHexInput");

if (!input || !openBtn || !popup || !wheel || !svArea) {
  console.error("Rasem Color UI: عناصر منتقي الألوان غير مكتملة.");
} else {
  let hue = 0;
  let saturation = 1;
  let value = 0.07;
  let currentColor = input.value || "#111111";

  const HISTORY_KEY = "rasem-color-history-v1";

  function hsvToHex(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let rgb;

    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];

    return "#" + rgb.map(n =>
      Math.round((n + m) * 255)
        .toString(16).padStart(2, "0")
    ).join("").toUpperCase();
  }

  function hexToHsv(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }

    return {
      h: (h + 360) % 360,
      s: max === 0 ? 0 : d / max,
      v: max
    };
  }

  function updateMarkers() {
    const rect = wheel.getBoundingClientRect();
    const radius = rect.width / 2 - 11;
    const angle = hue * Math.PI / 180;

    wheelMarker.style.left =
      (rect.width / 2 + Math.sin(angle) * radius) + "px";
    wheelMarker.style.top =
      (rect.height / 2 - Math.cos(angle) * radius) + "px";

    svMarker.style.left = (saturation * 100) + "%";
    svMarker.style.top = ((1 - value) * 100) + "%";

    svArea.style.backgroundColor = `hsl(${hue},100%,50%)`;
  }

  function saveHistory(color) {
    let history = [];

    try {
      history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
      history = [];
    }

    history = [
      color,
      ...history.filter(c => c !== color)
    ].slice(0, 12);

    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {}

    renderHistory();
  }

  function renderHistory() {
    const list = $("recentColorList");
    if (!list) return;

    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {}

    list.replaceChildren();

    history.forEach(color => {
      if (!/^#[0-9a-f]{6}$/i.test(color)) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.backgroundColor = color;
      btn.title = color;
      btn.setAttribute("aria-label", color);

      btn.addEventListener("click", () => {
        setColor(color);
      });

      list.appendChild(btn);
    });
  }

  function setColor(color, remember = false) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;

    currentColor = color.toUpperCase();

    // مزامنة مع منتقي الألوان القديم ومحرك الرسم.
    input.value = currentColor;
    input.dispatchEvent(new Event("input", { bubbles: true }));

    openBtn.style.setProperty("--selected-color", currentColor);
    $("colorMenuPreview").style.backgroundColor = currentColor;
    $("colorPopupPreview").style.backgroundColor = currentColor;
    hexInput.value = currentColor;

    const hsv = hexToHsv(currentColor);
    hue = hsv.h;
    saturation = hsv.s;
    value = hsv.v;

    updateMarkers();

    if (remember) saveHistory(currentColor);
  }

  function updateFromHSV() {
    setColor(hsvToHex(hue, saturation, value));
  }

  function updateHue(event) {
    const rect = wheel.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);

    hue = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    updateFromHSV();
  }

  function updateSV(event) {
    const rect = svArea.getBoundingClientRect();

    saturation = Math.max(0, Math.min(
      1, (event.clientX - rect.left) / rect.width
    ));

    value = 1 - Math.max(0, Math.min(
      1, (event.clientY - rect.top) / rect.height
    ));

    updateFromHSV();
  }

  function addDrag(element, callback, onEnd) {
    let dragging = false;

    element.addEventListener("pointerdown", event => {
      if (element === wheel && svArea.contains(event.target)) return;
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      dragging = true;
      element.setPointerCapture(event.pointerId);
      callback(event);
    });

    element.addEventListener("pointermove", event => {
      if (dragging) {
        event.preventDefault();
        callback(event);
      }
    });

    element.addEventListener("pointerup", () => {
      if (dragging) onEnd?.();
      dragging = false;
    });

    element.addEventListener("pointercancel", () => {
      dragging = false;
    });
  }

  addDrag(wheel, updateHue, () => saveHistory(currentColor));
  addDrag(svArea, updateSV, () => saveHistory(currentColor));

  hexInput.addEventListener("change", () => {
    const color = hexInput.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      setColor(color, true);
    } else {
      hexInput.value = currentColor;
    }
  });

  function openPopup() {
    popup.hidden = false;
    openBtn.setAttribute("aria-expanded", "true");
    updateMarkers();
  }

  function closePopup() {
    popup.hidden = true;
    openBtn.setAttribute("aria-expanded", "false");
  }

  openBtn.addEventListener("click", () => {
    if (popup.hidden) openPopup();
    else closePopup();
  });

  closeBtn.addEventListener("click", closePopup);

  document.addEventListener("pointerdown", event => {
    if (
      !popup.hidden &&
      !popup.contains(event.target) &&
      !openBtn.contains(event.target)
    ) {
      closePopup();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closePopup();
  });

  // مزامنة أي تغيير قادم من منتقي اللون القديم.
  input.addEventListener("input", () => {
    const color = input.value;
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      currentColor = color.toUpperCase();

      $("colorMenuPreview").style.backgroundColor = currentColor;
      $("colorPopupPreview").style.backgroundColor = currentColor;

      const hsv = hexToHsv(currentColor);
      hue = hsv.h;
      saturation = hsv.s;
      value = hsv.v;

      hexInput.value = currentColor;
      updateMarkers();
    }
  });

  setColor(currentColor, false);
  renderHistory();

  console.log("Rasem Color UI initialized.");
}

/* Smooth pointer interaction */
document.addEventListener("DOMContentLoaded", () => {
  const wheel = document.getElementById("hueWheel");
  const area = document.getElementById("svArea");

  [wheel, area].forEach(el => {
    if (!el) return;
    el.style.touchAction = "none";
    el.style.userSelect = "none";
    el.style.webkitUserSelect = "none";
  });
});
