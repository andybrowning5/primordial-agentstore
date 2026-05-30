export default {
  id: 76,
  system: "Gap junction exchange",
  title: "Gap Junction Flow",
  caption: "Ions and signals stream through connexin channels, cell to cell.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cy = rows / 2;
    // Two cell centers, slightly apart to leave room for channels
    const gap = 10; // half-gap between cell edges at center
    const cx1 = Math.round(cols * 0.27);
    const cx2 = Math.round(cols * 0.73);
    const rx = cols * 0.20;
    const ry = rows * 0.40;

    // Draw a cell membrane as an ellipse (outer edge and inner fill hints)
    function drawCell(cx) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          const r = Math.sqrt(dx * dx + dy * dy);
          const edge = Math.abs(r - 1.0);
          if (edge < 0.06) {
            // Membrane: pulsing thickness
            const pulse = 0.5 + 0.5 * Math.sin(t * 1.1 + dx * 3.0);
            g[y][x] = pulse > 0.6 ? "@" : "O";
          } else if (edge < 0.14) {
            g[y][x] = "o";
          } else if (r < 0.92) {
            // Interior cytoplasm: sparse animated noise
            const phase = (x * 5 + y * 11 + Math.floor(t * 3)) % 17;
            if (phase === 0) g[y][x] = ".";
            else if (phase === 1) g[y][x] = ":";
            else if (phase === 4) g[y][x] = "`";
          }
        }
      }
    }

    // Draw nucleus inside each cell
    function drawNucleus(cx) {
      const nr = 0.35; // nucleus radius fraction of rx
      const nrx = rx * nr, nry = ry * nr;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - cx) / nrx;
          const dy = (y - cy) / nry;
          const r = Math.sqrt(dx * dx + dy * dy);
          const edge = Math.abs(r - 1.0);
          if (edge < 0.14 && r <= 1.08) {
            g[y][x] = r < 0.88 ? "%" : "#";
          }
        }
      }
    }

    drawCell(cx1);
    drawCell(cx2);
    drawNucleus(cx1);
    drawNucleus(cx2);

    // Gap junction channels: a band of connexin pores bridging the two cells
    // Channel rows span a vertical window around cy
    const chanRows = 5; // number of channel rows
    const chanTop = Math.round(cy - Math.floor(chanRows / 2));
    // Find where the two membranes face each other
    // For each channel row, draw the tunnel and animate a particle through it
    for (let ci = 0; ci < chanRows; ci++) {
      const chy = chanTop + ci;
      if (chy < 0 || chy >= rows) continue;

      // The inner edge of each cell membrane at this y
      const dyFrac = (chy - cy) / ry;
      const ellipseX = Math.sqrt(Math.max(0, 1 - dyFrac * dyFrac)) * rx;
      const x1inner = Math.round(cx1 + ellipseX) + 1; // right edge of cell1
      const x2inner = Math.round(cx2 - ellipseX) - 1; // left edge of cell2

      if (x1inner >= x2inner) continue; // cells overlapping, skip

      // Draw channel walls (connexin proteins)
      for (let x = x1inner; x <= x2inner; x++) {
        if (x < 0 || x >= cols) continue;
        // Channel border: top and bottom row of the band get walls
        if (ci === 0 || ci === chanRows - 1) {
          g[chy][x] = "-";
        } else if (x === x1inner || x === x2inner) {
          g[chy][x] = "|";
        } else {
          // Channel interior — only draw if nothing else is there
          if (g[chy][x] === " ") g[chy][x] = "~";
        }
      }

      // Animate ions/molecules flowing through the channel
      // Each channel row has its own phase offset so they look independent
      const phaseOffset = ci * 0.7 + ci * 1.3;
      const chanLen = x2inner - x1inner;
      if (chanLen <= 0) continue;

      // Place 2 particles per channel at staggered positions
      for (let pi = 0; pi < 2; pi++) {
        const particleT = (t * 1.8 + phaseOffset + pi * 0.5) % 1.0;
        // Flow direction alternates by ci parity for visual richness
        const frac = (ci % 2 === 0) ? particleT : (1.0 - particleT);
        const px = Math.round(x1inner + 1 + frac * (chanLen - 2));
        if (px >= x1inner + 1 && px <= x2inner - 1 && px >= 0 && px < cols) {
          // Particle char varies with time for a shimmer effect
          const pchar = (Math.floor(t * 6 + pi + ci) % 3 === 0) ? "*" : (Math.floor(t * 6 + pi + ci) % 3 === 1 ? "o" : ".");
          g[chy][px] = pchar;
        }
      }
    }

    // Connexin docking ports at cell membrane edges (little brackets)
    const portY = [chanTop, chanTop + chanRows - 1];
    for (const py of portY) {
      if (py < 0 || py >= rows) continue;
      const dyFrac2 = (py - cy) / ry;
      const ex = Math.sqrt(Math.max(0, 1 - dyFrac2 * dyFrac2)) * rx;
      const p1 = Math.round(cx1 + ex);
      const p2 = Math.round(cx2 - ex);
      if (p1 >= 0 && p1 < cols) g[py][p1] = "+";
      if (p2 >= 0 && p2 < cols) g[py][p2] = "+";
    }

    // Signal wave: a vertical ripple that travels from cell1 to cell2
    // Shows electrical coupling — a wave front crossing through the junction
    const wavePhase = (t * 0.6) % 1.0;
    const waveX = Math.round(cx1 + wavePhase * (cx2 - cx1));
    for (let y = 1; y < rows - 1; y++) {
      const dy = (y - cy) / ry;
      const inCell1 = Math.sqrt(((waveX - cx1) / rx) ** 2 + dy * dy) < 0.85;
      const inCell2 = Math.sqrt(((waveX - cx2) / rx) ** 2 + dy * dy) < 0.85;
      const inChannel = (y >= chanTop && y <= chanTop + chanRows - 1);
      if ((inCell1 || inCell2 || inChannel) && waveX >= 0 && waveX < cols) {
        const cur = g[y][waveX];
        if (cur === "." || cur === ":" || cur === "`" || cur === "~" || cur === " ") {
          g[y][waveX] = "|";
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
