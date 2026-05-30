export default {
  id: 78,
  system: "Photosynthetic oxygen bubbling",
  title: "O2 Rising",
  caption: "Sunlit chloroplasts exhale oxygen into the green deep.",
  cols: 52,
  rows: 20,
  palette: "photosynth",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- helpers ---
    function set(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function get(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // ---------------------------------------------------------------
    // 1. LEAF TISSUE — bottom 5 rows: packed cell walls
    // ---------------------------------------------------------------
    for (let y = rows - 5; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // cell wall lattice
        const cellX = x % 8, cellY = (y - (rows - 5)) % 4;
        if (cellX === 0 || cellY === 0) {
          g[y][x] = "-";
        } else {
          g[y][x] = ".";
        }
      }
      // overwrite lattice intersections with +
      for (let x = 0; x < cols; x += 8) {
        for (let ly = rows - 5; ly < rows; ly += 4) {
          if (ly < rows) g[ly][x] = "+";
        }
      }
    }

    // ---------------------------------------------------------------
    // 2. CHLOROPLASTS — small oval blobs pulsing with absorbed light
    //    positioned in the leaf zone, they pulse green
    // ---------------------------------------------------------------
    const chloroplasts = [
      { cx: 10, cy: rows - 3 },
      { cx: 22, cy: rows - 4 },
      { cx: 34, cy: rows - 3 },
      { cx: 46, cy: rows - 4 },
      { cx: 16, cy: rows - 2 },
      { cx: 40, cy: rows - 2 },
    ];

    for (const { cx, cy } of chloroplasts) {
      const pulse = Math.sin(t * 1.4 + cx * 0.3) * 0.3 + 0.7; // 0.4..1.0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const dist = (dx * dx) / 4 + dy * dy;
          if (dist <= 1) {
            const ch = dist < 0.3 ? (pulse > 0.85 ? "O" : "o") : "*";
            set(cx + dx, cy + dy, ch);
          }
        }
      }
    }

    // ---------------------------------------------------------------
    // 3. LIGHT RAYS — diagonal streaks from top, flickering
    // ---------------------------------------------------------------
    const numRays = 5;
    for (let r = 0; r < numRays; r++) {
      const baseX = 4 + r * 10;
      const flicker = Math.sin(t * 2.3 + r * 1.7) * 0.5 + 0.5;
      const rayLen = Math.floor(flicker * 6) + 4; // 4..10
      const angle = -0.3 + r * 0.15; // slight divergence
      for (let i = 0; i < rayLen; i++) {
        const rx = Math.round(baseX + i * Math.sin(angle) * 1.2);
        const ry = i;
        if (rx >= 0 && rx < cols && ry >= 0 && ry < rows - 5) {
          const ch = i === 0 ? "|" : (i % 3 === 0 ? "+" : ":");
          if (g[ry][rx] === " ") g[ry][rx] = ch;
        }
      }
    }

    // ---------------------------------------------------------------
    // 4. OXYGEN BUBBLES — rise from chloroplasts toward surface
    //    Each bubble is a small circle that drifts upward and wobbles
    // ---------------------------------------------------------------
    // We spawn bubbles at each chloroplast; phase offset = cx
    const bubbleStreams = [
      { bx: 10, phase: 0.0 },
      { bx: 22, phase: 1.1 },
      { bx: 34, phase: 2.2 },
      { bx: 46, phase: 3.3 },
      { bx: 16, phase: 0.7 },
      { bx: 40, phase: 1.8 },
    ];

    for (const { bx, phase } of bubbleStreams) {
      // multiple bubbles per stream at different vertical offsets
      for (let b = 0; b < 3; b++) {
        const period = 3.5 + b * 0.4; // seconds to rise full height
        const tOff = t + phase + b * (period / 3);
        const frac = (tOff % period) / period; // 0..1: bottom to top
        const by = (rows - 6) * (1 - frac); // y: leaf top → row 0
        const wobble = Math.sin(tOff * 2.1 + b) * 1.5; // gentle horizontal sway
        const bxW = bx + wobble;

        // size shrinks slightly as bubble rises (pressure drop)
        const size = 1.0 - frac * 0.3;

        // draw bubble as small circle
        const bxi = Math.round(bxW);
        const byi = Math.round(by);

        // choose character based on size and position
        if (frac < 0.05) {
          // just birthed — small dot
          set(bxi, byi, ".");
        } else if (size > 0.8) {
          // large bubble: draw circle outline
          set(bxi, byi - 1, "-");
          set(bxi - 1, byi, "(");
          set(bxi + 1, byi, ")");
          set(bxi, byi + 1, "-");
          // interior O2 label hint
          set(bxi, byi, "o");
        } else {
          // medium bubble
          set(bxi - 1, byi, "(");
          set(bxi + 1, byi, ")");
          set(bxi, byi, "o");
        }
      }
    }

    // ---------------------------------------------------------------
    // 5. WATER MEDIUM — subtle ripple texture in the middle zone
    // ---------------------------------------------------------------
    for (let y = 1; y < rows - 5; y++) {
      for (let x = 0; x < cols; x++) {
        if (g[y][x] === " ") {
          // gentle wave pattern
          const wave = Math.sin(x * 0.4 + t * 0.8 + y * 0.2) * 0.5 +
                       Math.sin(x * 0.7 - t * 0.5 + y * 0.5) * 0.3;
          if (wave > 0.72) g[y][x] = "~";
          else if (wave > 0.65) g[y][x] = "'";
        }
      }
    }

    // ---------------------------------------------------------------
    // 6. SURFACE — top row wave
    // ---------------------------------------------------------------
    for (let x = 0; x < cols; x++) {
      const sw = Math.sin(x * 0.5 + t * 1.1) * 0.5 + 0.5;
      g[0][x] = sw > 0.6 ? "~" : "-";
    }

    // ---------------------------------------------------------------
    // 7. O2 LABEL near surface when bubbles break through
    // ---------------------------------------------------------------
    for (const { bx, phase } of bubbleStreams) {
      for (let b = 0; b < 3; b++) {
        const period = 3.5 + b * 0.4;
        const tOff = t + phase + b * (period / 3);
        const frac = (tOff % period) / period;
        if (frac > 0.90) {
          // bubble breaching surface — show O2
          const wobble = Math.sin(tOff * 2.1 + b) * 1.5;
          const bxi = Math.round(bx + wobble);
          if (bxi >= 1 && bxi < cols - 1) {
            g[0][bxi - 1] = "O";
            g[0][bxi]     = "2";
          }
        }
      }
    }

    // pad every row to exactly cols chars and join
    return g.map(row => {
      const s = row.join("");
      return s.length < cols ? s + " ".repeat(cols - s.length) : s.slice(0, cols);
    }).join("\n");
  }
};
