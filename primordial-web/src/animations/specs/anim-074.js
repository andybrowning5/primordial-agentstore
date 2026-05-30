export default {
  id: 74,
  system: "Hormone signaling",
  title: "Chemical Messenger",
  caption: "Hormones drift through the blood, each key seeking its lock.",
  cols: 52,
  rows: 18,
  palette: "blood",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: safe grid write
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function get(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // --- GLAND (source) on the left ---
    // Pulsing oval gland at x~8, vertically centered
    const gx = 8, gy = rows / 2;
    const pulse = Math.sin(t * 1.8) * 0.5 + 0.5; // 0..1
    const grx = 5 + pulse * 1.2, gry = 3.5 + pulse * 0.6;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - gx) / grx, dy = (y - gy) / gry;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 0.55) {
          // Interior fill — stippled
          if ((x * 3 + y * 5 + Math.floor(t * 3)) % 7 < 2) g[y][x] = "+";
          else g[y][x] = ":";
        } else if (r < 0.85) {
          g[y][x] = "o";
        } else if (r < 1.0) {
          g[y][x] = "@";
        }
      }
    }

    // --- TARGET CELL (receptor) on the right ---
    // Large cell at x~42, mid-height, with receptor grooves
    const tx = 43, ty = rows / 2;
    const trx = 6.5, try_ = 4.2;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - tx) / trx, dy = (y - ty) / try_;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 0.6) {
          if ((x * 5 + y * 3 + Math.floor(t * 2)) % 9 < 2) g[y][x] = ".";
          else g[y][x] = " ";
        } else if (r < 0.82) {
          g[y][x] = "o";
        } else if (r < 1.0) {
          g[y][x] = "O";
        }
      }
    }

    // Receptor sites: small notches on the left face of the target cell
    // Three receptor slots, evenly spaced vertically
    for (let slot = 0; slot < 3; slot++) {
      const ry = ty - 2.5 + slot * 2.5;
      // Notch: overwrite a few chars on the cell's left edge
      const notchX = Math.round(tx - trx * 0.85);
      const yi = Math.round(ry);
      if (yi >= 0 && yi < rows && notchX >= 0 && notchX < cols) {
        g[yi][notchX] = "[";
        if (notchX - 1 >= 0) g[yi][notchX - 1] = "=";
      }
    }

    // --- HORMONE MOLECULES traveling left to right ---
    // Several molecules at different phase offsets, following a wavy path
    const numHormones = 6;
    for (let i = 0; i < numHormones; i++) {
      const phase = (i / numHormones) * Math.PI * 2;
      // x travels from just past the gland to the target cell surface
      const travelLen = tx - trx - gx - grx - 1;
      const rawX = ((t * 4.5 + phase * 2.8) % (travelLen + 4));
      const hx = gx + grx + 1 + rawX;
      // Wavy y path with unique frequency per molecule
      const freq = 0.9 + (i % 3) * 0.35;
      const amp = 2.5 + (i % 2) * 1.5;
      const hy = gy + Math.sin(t * freq * 1.4 + phase) * amp;

      if (hx < tx - trx - 0.5) {
        // In transit — draw small diamond molecule
        put(hx,     hy,     "*");
        put(hx - 1, hy,     "-");
        put(hx + 1, hy,     "-");
        put(hx,     hy - 1, "|");
        put(hx,     hy + 1, "|");
      } else {
        // Arriving at receptor — flash bright on binding
        const bindSlot = i % 3;
        const bindY = ty - 2.5 + bindSlot * 2.5;
        const bindX = tx - trx - 1.5;
        const blink = Math.sin(t * 6 + phase) > 0.3 ? "#" : "@";
        put(bindX,     bindY,     blink);
        put(bindX - 1, bindY,     "=");
      }
    }

    // --- BLOODSTREAM flow lines (background) ---
    // Faint horizontal flow lines between gland and cell
    const flowY1 = Math.round(gy - 5), flowY2 = Math.round(gy + 5);
    const flowXstart = Math.round(gx + grx + 1);
    const flowXend   = Math.round(tx - trx - 1);
    for (let fy = flowY1; fy <= flowY2; fy += 2) {
      if (fy < 0 || fy >= rows) continue;
      for (let fx = flowXstart; fx <= flowXend; fx++) {
        if (g[fy][fx] === " ") {
          // Subtle drifting dots
          const drift = Math.floor(t * 3 + fx * 0.4 + fy * 1.7) % 11;
          if (drift === 0) g[fy][fx] = "~";
          else if (drift === 5) g[fy][fx] = ".";
        }
      }
    }

    // --- SIGNAL RIPPLE from receptor when binding occurs ---
    // A radial ripple that pulses outward from the cell interior
    const rippleR = ((t * 2.5) % 4.5);
    const rippleAlpha = Math.max(0, 1 - rippleR / 4.0);
    if (rippleAlpha > 0.25) {
      const steps = 24;
      for (let s = 0; s < steps; s++) {
        const angle = (s / steps) * Math.PI * 2;
        const rx2 = tx + Math.cos(angle) * rippleR * (trx / 4.0);
        const ry2 = ty + Math.sin(angle) * rippleR * (try_ / 4.0);
        const xi = Math.round(rx2), yi = Math.round(ry2);
        if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
          if (g[yi][xi] === " " || g[yi][xi] === "." || g[yi][xi] === ":") {
            g[yi][xi] = rippleAlpha > 0.6 ? "o" : ".";
          }
        }
      }
    }

    // Ensure every row is exactly cols wide
    return g.map(row => row.join("").padEnd(cols).slice(0, cols)).join("\n");
  }
};
