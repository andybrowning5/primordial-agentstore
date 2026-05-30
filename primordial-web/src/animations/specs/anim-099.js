export default {
  id: 99,
  system: "Cell colony forming",
  title: "Colony Formation",
  caption: "Cells divide and spread, weaving a living mat of growth.",
  cols: 52,
  rows: 18,
  palette: "immune",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Colony center drifts very slowly
    const cx = cols * 0.5 + Math.sin(t * 0.11) * 2;
    const cy = rows * 0.5 + Math.cos(t * 0.13) * 1.2;

    // Seed cells: fixed angular positions that spread outward over time
    // "colony radius" pulses to simulate growth
    const baseR = 3.5 + Math.sin(t * 0.4) * 0.6;
    const numCells = 12;

    // Precompute a deterministic cell layout: each cell has a "birth angle"
    // and a radial distance that grows with a per-cell phase offset
    const cells = [];
    for (let i = 0; i < numCells; i++) {
      const birthAngle = (i / numCells) * Math.PI * 2;
      const phase = (i * 1.618) % (Math.PI * 2);
      // Each cell slowly drifts outward and orbits a little
      const drift = 1 + 0.5 * ((Math.sin(t * 0.35 + phase) * 0.5 + 0.5));
      const angle = birthAngle + Math.sin(t * 0.18 + phase) * 0.25;
      const scaleX = cols / rows; // aspect correction
      const rx = (baseR + drift * 2.8) * scaleX * 0.52;
      const ry = (baseR + drift * 2.8) * 0.88;
      const px = cx + Math.cos(angle) * rx;
      const py = cy + Math.sin(angle) * ry;
      cells.push({ px, py, phase, drift });
    }

    // Draw each cell as a small oval
    function drawCell(cellX, cellY, ph, size) {
      const crx = size * 1.9;
      const cry = size * 1.0;
      for (let y = Math.max(0, Math.floor(cellY - cry - 1)); y <= Math.min(rows - 1, Math.ceil(cellY + cry + 1)); y++) {
        for (let x = Math.max(0, Math.floor(cellX - crx - 1)); x <= Math.min(cols - 1, Math.ceil(cellX + crx + 1)); x++) {
          const dx = (x - cellX) / crx;
          const dy = (y - cellY) / cry;
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r < 0.35) {
            // Nucleus — pulses
            const nPulse = Math.sin(t * 1.1 + ph) * 0.5 + 0.5;
            g[y][x] = nPulse > 0.6 ? "O" : "o";
          } else if (r < 0.72) {
            // Cytoplasm interior
            const interior = (Math.floor(x * 3 + y * 5 + t * 2 + ph * 4) % 7);
            g[y][x] = interior === 0 ? ":" : interior === 1 ? "." : g[y][x] === " " ? "·" : g[y][x];
          } else if (r < 1.0) {
            // Cell wall
            const wallChar = r > 0.88 ? "@" : "o";
            g[y][x] = wallChar;
          }
        }
      }
    }

    // Draw central mother colony — denser cluster at center
    const colonyPulse = Math.sin(t * 0.5) * 0.5 + 0.5;
    const colonyRx = (3.2 + colonyPulse * 0.6) * (cols / rows) * 0.5;
    const colonyRy = (3.2 + colonyPulse * 0.6) * 0.88;
    for (let y = Math.max(0, Math.floor(cy - colonyRy - 2)); y <= Math.min(rows - 1, Math.ceil(cy + colonyRy + 2)); y++) {
      for (let x = Math.max(0, Math.floor(cx - colonyRx - 2)); x <= Math.min(cols - 1, Math.ceil(cx + colonyRx + 2)); x++) {
        const dx = (x - cx) / colonyRx;
        const dy = (y - cy) / colonyRy;
        const r = Math.sqrt(dx * dx + dy * dy);
        const edgeDist = Math.abs(r - 1.0);
        if (edgeDist < 0.12) {
          g[y][x] = "#";
        } else if (r < 0.88) {
          const fill = (Math.floor(x * 5 + y * 7 + t * 3) % 9);
          if (fill === 0) g[y][x] = "@";
          else if (fill <= 2) g[y][x] = "o";
          else if (fill <= 4) g[y][x] = ":";
          else if (fill <= 5) g[y][x] = ".";
        }
      }
    }

    // Nucleus of mother colony
    const nucRx = 1.1 * (cols / rows) * 0.5;
    const nucRy = 1.1 * 0.88;
    for (let y = Math.max(0, Math.floor(cy - nucRy - 1)); y <= Math.min(rows - 1, Math.ceil(cy + nucRy + 1)); y++) {
      for (let x = Math.max(0, Math.floor(cx - nucRx - 1)); x <= Math.min(cols - 1, Math.ceil(cx + nucRx + 1)); x++) {
        const dx = (x - cx) / nucRx;
        const dy = (y - cy) / nucRy;
        if (Math.sqrt(dx * dx + dy * dy) < 1.0) {
          g[y][x] = Math.sin(t * 1.4) > 0 ? "%" : "&";
        }
      }
    }

    // Draw daughter cells spreading outward
    for (const cell of cells) {
      const sz = 0.75 + cell.drift * 0.1;
      drawCell(cell.px, cell.py, cell.phase, sz);
    }

    // Draw faint trailing filaments connecting daughter cells to colony
    for (const cell of cells) {
      const steps = 6;
      for (let s = 1; s < steps; s++) {
        const frac = s / steps;
        const fx = cx + (cell.px - cx) * frac;
        const fy = cy + (cell.py - cy) * frac;
        const xi = Math.round(fx);
        const yi = Math.round(fy);
        if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
          if (g[yi][xi] === " ") {
            g[yi][xi] = frac > 0.6 ? "'" : ".";
          }
        }
      }
    }

    // Replace middle-dot with period for safe ASCII
    return g.map((row) =>
      row.map((ch) => (ch === "·" ? "." : ch)).join("")
    ).join("\n");
  }
};
