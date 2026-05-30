export default {
  id: 1,
  system: "Mitosis",
  title: "Cell Division",
  caption: "One cell becomes two — life's oldest act of renewal.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cy = rows / 2;
    const cx = cols / 2;

    // Full cycle: ~12 seconds, then loops
    const cycle = 12;
    const phase = (t % cycle) / cycle; // 0..1

    // Helper: clamp to grid
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        g[yi][xi] = ch;
      }
    }

    // Draw an ellipse outline (and optional fill) at (ecx, ecy) with radii rx, ry
    function drawCell(ecx, ecy, rx, ry, outline, inner) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - ecx) / rx;
          const dy = (y - ecy) / ry;
          const r2 = dx * dx + dy * dy;
          const r = Math.sqrt(r2);
          const edge = Math.abs(r - 1.0);
          if (edge < 0.12) {
            g[y][x] = outline;
          } else if (r < 0.88 && inner) {
            // sparse cytoplasm dots — deterministic via position + time
            const tick = Math.floor(t * 4);
            if ((x * 17 + y * 11 + tick) % 19 === 0) g[y][x] = inner;
          }
        }
      }
    }

    // Draw a small nucleus at (ncx, ncy) with radius nr
    function drawNucleus(ncx, ncy, nr) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - ncx) / (nr * 1.6);
          const dy = (y - ncy) / nr;
          const r = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(r - 1.0) < 0.18) g[y][x] = "o";
          else if (r < 0.82) g[y][x] = "*";
        }
      }
    }

    // Draw condensed chromosomes as short horizontal bars near center
    function drawChromosomes(basex, basey, count, spread, wobble) {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + wobble;
        const ox = Math.sin(angle) * spread * 1.8;
        const oy = Math.cos(angle) * spread * 0.8;
        const cx2 = basex + ox;
        const cy2 = basey + oy;
        // each chromosome is a short bar of 3 chars
        put(cx2 - 1, cy2, "=");
        put(cx2,     cy2, "#");
        put(cx2 + 1, cy2, "=");
      }
    }

    // Draw spindle fibers radiating from poles to center
    function drawSpindle(ecx, ecy, rx, ry, fibers) {
      const poleL = ecx - rx * 0.85;
      const poleR = ecx + rx * 0.85;
      for (let i = 0; i < fibers; i++) {
        const frac = (i + 1) / (fibers + 1);
        const midY = ecy + (frac - 0.5) * ry * 1.6;
        // left pole to equator
        const steps = 14;
        for (let s = 0; s <= steps; s++) {
          const fx = poleL + (ecx - poleL) * (s / steps);
          const fy = ecy + (midY - ecy) * (s / steps);
          put(fx, fy, (s % 3 === 0) ? "-" : ".");
        }
        // right pole to equator
        for (let s = 0; s <= steps; s++) {
          const fx = poleR + (ecx - poleR) * (s / steps);
          const fy = ecy + (midY - ecy) * (s / steps);
          put(fx, fy, (s % 3 === 0) ? "-" : ".");
        }
      }
      // pole markers
      put(poleL, ecy, ">");
      put(poleR, ecy, "<");
    }

    // Draw cleavage furrow (pinch in the middle)
    function drawFurrow(ecx, ecy, rx, ry, depth) {
      // Indent the top and bottom of the cell at the equator
      const indent = depth * rx * 0.55;
      const steps = Math.ceil(ry * 1.0);
      for (let s = -steps; s <= steps; s++) {
        const fy = ecy + s;
        const yi = Math.round(fy);
        if (yi < 0 || yi >= rows) continue;
        // How much of the furrow to show depends on distance from equator
        const distFrac = Math.abs(s) / steps;
        const fIndent = indent * (1.0 - distFrac * 0.7);
        if (fIndent < 1) continue;
        // Stamp the furrow indent chars
        const lx = Math.round(ecx - fIndent);
        const rx2 = Math.round(ecx + fIndent);
        if (lx >= 0 && lx < cols) g[yi][lx] = ")";
        if (rx2 >= 0 && rx2 < cols) g[yi][rx2] = "(";
      }
    }

    // ── Phase-based animation ──────────────────────────────────────────

    if (phase < 0.15) {
      // INTERPHASE: single resting cell with visible nucleus, slow cytoplasm pulse
      const pulse = 1.0 + Math.sin(t * 1.8) * 0.03;
      drawCell(cx, cy, cols * 0.28 * pulse, rows * 0.42 * pulse, "@", ".");
      drawNucleus(cx, cy, rows * 0.16);

    } else if (phase < 0.30) {
      // PROPHASE: nucleus dissolves, chromosomes condense, cell slightly elongates
      const p = (phase - 0.15) / 0.15; // 0..1
      const cellRx = cols * (0.28 + p * 0.04);
      const cellRy = rows * (0.42 - p * 0.04);
      drawCell(cx, cy, cellRx, cellRy, "@", ".");
      // Nucleus fades out: draw it while p < 0.6
      if (p < 0.6) {
        const nr = rows * 0.16 * (1 - p * 0.8);
        if (nr > 0.5) drawNucleus(cx, cy, nr);
      }
      // Chromosomes condense in
      const wobble = t * 1.2;
      drawChromosomes(cx, cy, 6, p * rows * 0.12, wobble);

    } else if (phase < 0.48) {
      // METAPHASE: chromosomes align at equator, spindle forms, cell elongated
      const p = (phase - 0.30) / 0.18;
      const cellRx = cols * (0.32 + p * 0.03);
      const cellRy = rows * (0.38 - p * 0.04);
      drawCell(cx, cy, cellRx, cellRy, "@", ".");
      drawSpindle(cx, cy, cellRx, cellRy, 4);
      // Chromosomes at equator (metaphase plate)
      for (let i = 0; i < 6; i++) {
        const offset = (i - 2.5) * 1.4;
        put(cx - 1, cy + offset, "=");
        put(cx,     cy + offset, "#");
        put(cx + 1, cy + offset, "=");
      }

    } else if (phase < 0.62) {
      // ANAPHASE: chromosomes pulled to poles
      const p = (phase - 0.48) / 0.14;
      const cellRx = cols * 0.35;
      const cellRy = rows * (0.34 - p * 0.02);
      drawCell(cx, cy, cellRx, cellRy, "@", ".");
      drawSpindle(cx, cy, cellRx, cellRy, 3);
      // Two groups of chromosomes moving to poles
      const poleOffset = p * rows * 0.28;
      for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * 1.3;
        // top group
        put(cx - 1, cy - poleOffset + offset, "=");
        put(cx,     cy - poleOffset + offset, "#");
        put(cx + 1, cy - poleOffset + offset, "=");
        // bottom group
        put(cx - 1, cy + poleOffset + offset, "=");
        put(cx,     cy + poleOffset + offset, "#");
        put(cx + 1, cy + poleOffset + offset, "=");
      }

    } else if (phase < 0.78) {
      // TELOPHASE: cleavage furrow forms, cell pinches
      const p = (phase - 0.62) / 0.16;
      const cellRx = cols * 0.35;
      const cellRy = rows * 0.32;
      drawCell(cx, cy, cellRx, cellRy, "@", ".");
      // New nuclear envelopes forming at poles
      const nr = rows * 0.10 * p;
      if (nr > 0.5) {
        drawNucleus(cx, cy - rows * 0.22, nr);
        drawNucleus(cx, cy + rows * 0.22, nr);
      }
      // Furrow deepening
      drawFurrow(cx, cy, cellRx, cellRy, p);

    } else if (phase < 0.92) {
      // CYTOKINESIS: two daughter cells separating
      const p = (phase - 0.78) / 0.14;
      // Smooth ease-out for separation
      const sep = p * p * cols * 0.20;
      const shrinkR = 1.0 - p * 0.08;
      const dRx = cols * 0.22 * shrinkR;
      const dRy = rows * 0.32 * shrinkR;
      drawCell(cx - sep, cy, dRx, dRy, "@", ".");
      drawCell(cx + sep, cy, dRx, dRy, "@", ".");
      const nr = rows * 0.10;
      drawNucleus(cx - sep, cy, nr);
      drawNucleus(cx + sep, cy, nr);
      // Thin midbody/bridge between them while still close
      if (p < 0.55) {
        const bridge = Math.round(sep);
        const midY = Math.round(cy);
        if (midY >= 0 && midY < rows) {
          for (let bx = Math.round(cx) - bridge + 1; bx < Math.round(cx) + bridge; bx++) {
            if (bx >= 0 && bx < cols) g[midY][bx] = "-";
          }
        }
      }

    } else {
      // TRANSITION: daughter cells settle, gentle pulse before loop restart
      const p = (phase - 0.92) / 0.08;
      const sep = cols * 0.20 * (1 - p * 0.15);
      const pulse = 1.0 + Math.sin(t * 2.2) * 0.02;
      const dRx = cols * 0.22 * 0.92 * pulse;
      const dRy = rows * 0.32 * 0.92 * pulse;
      drawCell(cx - sep, cy, dRx, dRy, "@", ".");
      drawCell(cx + sep, cy, dRx, dRy, "@", ".");
      const nr = rows * 0.10;
      drawNucleus(cx - sep, cy, nr);
      drawNucleus(cx + sep, cy, nr);
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
