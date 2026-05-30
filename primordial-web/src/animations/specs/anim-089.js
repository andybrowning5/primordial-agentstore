export default {
  id: 89,
  system: "Nitrogen-fixing root nodule",
  title: "N₂ Root Nodule",
  caption: "Rhizobia drink the sky, breathing fixed nitrogen into roots.",
  cols: 52,
  rows: 18,
  palette: "immune",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- Nodule body: oval bulge centered low on the grid ---
    const ncx = cols / 2;
    const ncy = rows * 0.58;
    const nrx = cols * 0.22;
    const nry = rows * 0.30;

    // Outer nodule membrane — pulsing gently
    const pulse = 1 + 0.04 * Math.sin(t * 1.4);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - ncx) / (nrx * pulse);
        const dy = (y - ncy) / (nry * pulse);
        const r = Math.sqrt(dx * dx + dy * dy);
        const edge = Math.abs(r - 1);
        if (edge < 0.07) {
          g[y][x] = "@";
        } else if (edge < 0.18 && g[y][x] === " ") {
          // Dashed membrane texture
          const angle = Math.atan2(dy, dx);
          const seg = Math.floor((angle + Math.PI) / (Math.PI / 8));
          g[y][x] = seg % 2 === 0 ? "O" : "o";
        } else if (r < 0.88) {
          // Interior bacteroid zone — flickering colonies
          const bx = Math.floor(x);
          const by = Math.floor(y);
          const phase = ((bx * 7 + by * 13) % 17) / 17;
          const tick = Math.floor(t * 2.5 + phase * 6) % 6;
          if (tick === 0) g[y][x] = "*";
          else if (tick === 1) g[y][x] = "+";
          else if (tick === 2 && (bx + by) % 3 === 0) g[y][x] = ".";
          else if (r < 0.55 && tick === 3) g[y][x] = ":";
        }
      }
    }

    // --- Leghemoglobin core blush: pink-ish "O" ring at centre ---
    const lhcx = ncx;
    const lhcy = ncy - nry * 0.1;
    const lhrx = nrx * 0.30;
    const lhry = nry * 0.35;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - lhcx) / lhrx;
        const dy = (y - lhcy) / lhry;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 1) g[y][x] = "0";
      }
    }

    // --- Root stem entering nodule from top ---
    const stemX = Math.round(ncx);
    const stemTop = 0;
    const stemBot = Math.round(ncy - nry * pulse * 0.82);
    for (let y = stemTop; y <= stemBot; y++) {
      if (y >= 0 && y < rows) {
        const w = y < stemBot - 1 ? 1 : 2;
        for (let dx = -w; dx <= w; dx++) {
          const sx = stemX + dx;
          if (sx >= 0 && sx < cols) g[y][sx] = "|";
        }
      }
    }
    // Root caps / edges
    for (let y = stemTop; y <= stemBot; y++) {
      if (y >= 0 && y < rows) {
        const lx = stemX - 2, rx = stemX + 2;
        if (lx >= 0 && lx < cols && g[y][lx] !== "@") g[y][lx] = "|";
        if (rx >= 0 && rx < cols && g[y][rx] !== "@") g[y][rx] = "|";
      }
    }

    // --- Nitrogen molecules (N≡N) drifting downward into nodule ---
    const nMols = 6;
    for (let i = 0; i < nMols; i++) {
      const phase = (i / nMols) * 2 * Math.PI;
      // Each molecule has an x-lane spread around the root
      const laneOffset = ((i % 3) - 1) * 7;
      const mx = Math.round(ncx + laneOffset + 3 * Math.sin(t * 0.7 + phase));
      // Travel from top toward nodule top, looping
      const ySpeed = 1.8 + 0.3 * Math.sin(phase);
      const my = Math.floor(((t * ySpeed + (i / nMols) * rows) % (ncy - 1)));
      if (my >= 0 && my < rows && mx >= 0 && mx < cols) {
        g[my][mx] = "N";
        if (mx + 1 < cols && g[my][mx + 1] === " ") g[my][mx + 1] = "N";
      }
    }

    // --- Ammonia (NH₃) tokens rising from nodule into root ---
    const nAm = 5;
    for (let i = 0; i < nAm; i++) {
      const phase = (i / nAm) * 2 * Math.PI + Math.PI;
      const ax = Math.round(ncx + ((i % 3) - 1) * 4 + 2 * Math.sin(t * 1.1 + phase));
      // Rise from nodule center upward, looping within root zone
      const riseHeight = ncy - stemTop;
      const ay = Math.round(ncy - ((t * 2.2 + (i / nAm) * riseHeight) % riseHeight));
      if (ay >= 0 && ay < rows && ax >= 0 && ax < cols && g[ay][ax] === " ") {
        g[ay][ax] = "^";
      }
    }

    // --- Bacteroids: small rod-shapes rotating inside nodule ---
    const nBact = 8;
    for (let i = 0; i < nBact; i++) {
      const bPhase = (i / nBact) * 2 * Math.PI;
      const orbitR = 0.45;
      const angle = bPhase + t * (0.4 + 0.05 * (i % 3));
      const bx = Math.round(lhcx + nrx * orbitR * Math.cos(angle) * 0.7);
      const by = Math.round(lhcy + nry * orbitR * Math.sin(angle));
      if (by >= 0 && by < rows && bx >= 0 && bx < cols) {
        g[by][bx] = "%";
      }
      // Elongated rod: one cell ahead in direction of travel
      const bx2 = Math.round(lhcx + nrx * orbitR * Math.cos(angle + 0.3) * 0.7);
      const by2 = Math.round(lhcy + nry * orbitR * Math.sin(angle + 0.3));
      if (by2 >= 0 && by2 < rows && bx2 >= 0 && bx2 < cols && g[by2][bx2] !== "@") {
        g[by2][bx2] = "-";
      }
    }

    // --- Ensure nodule boundary re-drawn on top of internals ---
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - ncx) / (nrx * pulse);
        const dy = (y - ncy) / (nry * pulse);
        const r = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(r - 1) < 0.07) g[y][x] = "@";
      }
    }

    return g.map(row => row.join("")).join("\n");
  }
};
