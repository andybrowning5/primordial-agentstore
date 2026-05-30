export default {
  id: 70,
  system: "Mitotic spindle fibers",
  title: "Spindle Assembly",
  caption: "Fiber arrays reach from pole to pole, hauling chromosomes apart.",
  cols: 52,
  rows: 18,
  palette: "dna",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cy = (rows - 1) / 2;
    const cx = (cols - 1) / 2;

    // Spindle poles — left and right asters
    const poleX1 = Math.round(cx - cols * 0.30);
    const poleX2 = Math.round(cx + cols * 0.30);
    const poleY  = Math.round(cy);

    // Chromosome plate oscillates subtly at metaphase plate (center)
    // Then anaphase separation: chromosomes pulled to poles
    // Use a slow sine to simulate the metaphase → hint-of-anaphase cycle
    const phase  = (t * 0.35) % (Math.PI * 2);
    const anaphaseFrac = Math.max(0, Math.sin(phase - Math.PI * 0.3)) * 0.55;
    const chrOffset = anaphaseFrac * cols * 0.18;

    // Helper: safely set a char only if it's a "higher priority" glyph
    const priority = " .,:~-=+*oO0@#";
    function put(y, x, ch) {
      if (x < 0 || x >= cols || y < 0 || y >= rows) return;
      const cur = g[y][x];
      if (priority.indexOf(ch) > priority.indexOf(cur)) g[y][x] = ch;
    }

    // ── Draw spindle fibers (microtubules) from each pole to chromosomes ──
    // The spindle has a biconvex / lens / football shape.
    // Fibers fan out from the poles and converge at the metaphase plate.
    // We draw individual fiber lines as Bresenham-like interpolations.

    // Chromosome attachment points along the metaphase plate / moving toward poles
    const numChrs = 6;
    for (let ci = 0; ci < numChrs; ci++) {
      // y-positions of chromosomes spread around equator
      const spread = rows * 0.38;
      const chrY = cy + (ci - (numChrs - 1) / 2) * (spread / (numChrs - 1)) * 2;

      // Left chromosome arm moves toward pole1, right toward pole2
      const chrX1 = cx - chrOffset;
      const chrX2 = cx + chrOffset;

      // Draw kinetochore fiber from pole1 to left chromosome
      const steps = 38;
      for (let s = 0; s <= steps; s++) {
        const frac = s / steps;
        // Slight lateral bow in the fiber
        const bow = Math.sin(frac * Math.PI) * (chrY - poleY) * 0.18;
        const fx = poleX1 + (chrX1 - poleX1) * frac;
        const fy = poleY  + (chrY  - poleY)  * frac + bow;
        const glyph = frac < 0.08 || frac > 0.92 ? "+" : (s % 4 === 0 ? "|" : ".");
        put(Math.round(fy), Math.round(fx), glyph);
      }

      // Draw kinetochore fiber from pole2 to right chromosome
      for (let s = 0; s <= steps; s++) {
        const frac = s / steps;
        const bow = Math.sin(frac * Math.PI) * (chrY - poleY) * 0.18;
        const fx = poleX2 + (chrX2 - poleX2) * frac;
        const fy = poleY  + (chrY  - poleY)  * frac + bow;
        const glyph = frac < 0.08 || frac > 0.92 ? "+" : (s % 4 === 0 ? "|" : ".");
        put(Math.round(fy), Math.round(fx), glyph);
      }

      // Draw chromosome pair at the plate (two sister chromatids)
      const pulse = Math.sin(t * 1.4 + ci * 1.1) * 0.5 + 0.5;
      const chrGlyph = pulse > 0.6 ? "O" : "o";
      put(Math.round(chrY), Math.round(chrX1), chrGlyph);
      put(Math.round(chrY), Math.round(chrX2), chrGlyph);
      // Tiny cohesin bridge between sisters (only visible before full separation)
      if (chrOffset < cols * 0.06) {
        put(Math.round(chrY), Math.round(cx), "=");
      }
    }

    // ── Astral microtubules radiating from poles (aster arrays) ──
    const asterRays = 10;
    for (let ri = 0; ri < asterRays; ri++) {
      // Full 360° fan; angle drifts slowly with t
      const angle = (ri / asterRays) * Math.PI * 2 + t * 0.25;
      const len   = 4.5 + Math.sin(t * 0.9 + ri * 0.7) * 1.2;

      // Left aster
      for (let d = 1; d <= Math.ceil(len); d++) {
        const frac = d / len;
        const ax = Math.round(poleX1 + Math.cos(angle) * d * 1.05);
        const ay = Math.round(poleY  + Math.sin(angle) * d * 0.65);
        const ach = frac > 0.85 ? "." : (d === 1 ? "*" : "-");
        put(ay, ax, ach);
      }

      // Right aster (mirrored angle drift)
      const angle2 = (ri / asterRays) * Math.PI * 2 - t * 0.25 + Math.PI;
      for (let d = 1; d <= Math.ceil(len); d++) {
        const frac = d / len;
        const ax = Math.round(poleX2 + Math.cos(angle2) * d * 1.05);
        const ay = Math.round(poleY  + Math.sin(angle2) * d * 0.65);
        const ach = frac > 0.85 ? "." : (d === 1 ? "*" : "-");
        put(ay, ax, ach);
      }
    }

    // ── Polar microtubules (overlap zone near center, antiparallel) ──
    // These run pole-to-pole through the spindle midzone and push poles apart.
    const polarLines = 3;
    for (let pl = 0; pl < polarLines; pl++) {
      const yOff = (pl - 1) * 1.5;
      const fy   = Math.round(cy + yOff);
      if (fy < 0 || fy >= rows) continue;
      const tick = Math.floor(t * 2.5 + pl * 3) % 7; // flowing motion
      for (let x = poleX1 + 2; x <= poleX2 - 2; x++) {
        const pos = ((x - poleX1) + tick) % 7;
        const ch  = pos === 0 ? "=" : (pos === 3 ? "-" : (pos === 6 ? "=" : "."));
        put(fy, x, ch);
      }
    }

    // ── Pole bodies (centrosomes / MTOCs) ──
    put(poleY,     poleX1,     "#");
    put(poleY - 1, poleX1,     "@");
    put(poleY + 1, poleX1,     "@");
    put(poleY,     poleX1 - 1, "@");
    put(poleY,     poleX1 + 1, "+");

    put(poleY,     poleX2,     "#");
    put(poleY - 1, poleX2,     "@");
    put(poleY + 1, poleX2,     "@");
    put(poleY,     poleX2 + 1, "@");
    put(poleY,     poleX2 - 1, "+");

    // ── Spindle envelope outline (faint lens shape) ──
    // Trace the outer boundary of the biconvex spindle
    const spindleRows = rows * 0.85;
    for (let y = 0; y < rows; y++) {
      const dy    = (y - cy) / (spindleRows / 2);
      if (Math.abs(dy) > 1) continue;
      const halfW = Math.sqrt(1 - dy * dy) * (poleX2 - poleX1) * 0.48;
      const lx    = Math.round(cx - halfW);
      const rx2   = Math.round(cx + halfW);
      put(y, lx,  ":");
      put(y, rx2, ":");
    }

    return g.map(row => row.join("")).join("\n");
  }
};
