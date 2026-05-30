export default {
  id: 37,
  system: "Blood flow in a capillary",
  title: "Capillary Current",
  caption: "Red cells squeeze single-file through a vessel thinner than a hair.",
  cols: 52,
  rows: 18,
  palette: "blood",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Capillary center and half-width (slightly pulsing)
    const cy = rows / 2;
    const pulse = Math.sin(t * 2.2) * 0.6;
    const hw = 3.2 + pulse; // half-width of lumen in rows

    // Draw vessel walls — top and bottom, with slight wave
    for (let x = 0; x < cols; x++) {
      const wave = Math.sin(x * 0.18 - t * 1.4) * 0.5;
      const topY = Math.round(cy - hw - 1.5 + wave);
      const botY = Math.round(cy + hw + 1.5 + wave);

      // Outer wall (thick)
      for (let dy = -1; dy <= 0; dy++) {
        const ty = topY + dy;
        const by = botY - dy;
        if (ty >= 0 && ty < rows) g[ty][x] = dy === 0 ? "=" : "-";
        if (by >= 0 && by < rows) g[by][x] = dy === 0 ? "=" : "-";
      }

      // Inner lumen boundary
      const innerTop = Math.round(cy - hw + wave);
      const innerBot = Math.round(cy + hw + wave);
      if (innerTop >= 0 && innerTop < rows && g[innerTop][x] === " ") g[innerTop][x] = "~";
      if (innerBot >= 0 && innerBot < rows && g[innerBot][x] === " ") g[innerBot][x] = "~";
    }

    // Plasma flow streaks — thin dashes travelling left to right
    const numStreaks = 5;
    for (let i = 0; i < numStreaks; i++) {
      const phase = (i / numStreaks) * cols;
      const xPos = ((t * 10 + phase) % (cols + 8)) - 4;
      const yOff = (Math.sin(i * 2.3) * 0.8);
      const y = Math.round(cy + yOff);
      if (y >= 0 && y < rows) {
        for (let dx = 0; dx < 3; dx++) {
          const sx = Math.round(xPos) + dx;
          if (sx >= 0 && sx < cols && g[y][sx] === " ") {
            g[y][sx] = dx === 1 ? "-" : ".";
          }
        }
      }
    }

    // Red blood cells — biconcave discs squeezing through single-file
    // Each cell is a small oval shape, deformed slightly as it travels
    const numCells = 4;
    const cellSpacing = cols / numCells;

    for (let i = 0; i < numCells; i++) {
      const phase = (i / numCells) * cols;
      // Cells travel left to right, wrapping around
      const cx = ((t * 7.5 + phase) % (cols + 6)) - 3;

      // Slight vertical bob as cell moves
      const bob = Math.sin(t * 2.2 + i * 1.57) * 0.3;
      // Deformation: cells squish slightly when near vessel wall (always near center here)
      const squeeze = 1.0 + Math.sin(t * 4.4 + i * 0.9) * 0.15;

      // Cell body: filled ellipse, biconcave (indented top and bottom center)
      const cRx = 3.2 / squeeze;  // horizontal radius
      const cRy = 1.5 * squeeze;  // vertical radius (squeezes down)

      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const px = Math.round(cx) + dx;
          const py = Math.round(cy + bob) + dy;
          if (px < 0 || px >= cols || py < 0 || py >= rows) continue;
          if (g[py][px] !== " " && g[py][px] !== "~") continue;

          const nx = dx / cRx;
          const ny = dy / cRy;
          const r = Math.sqrt(nx * nx + ny * ny);

          if (r > 1.0) continue;

          // Biconcave indent: dip in center top/bottom
          const indentFactor = 1.0 - 0.55 * Math.exp(-nx * nx * 2.5);
          const rim = Math.abs(ny) > 0.85 * indentFactor;

          if (r > 0.82) {
            // Outer membrane ring
            g[py][px] = "O";
          } else if (rim && Math.abs(ny) > 0.55) {
            // Biconcave indentation zone — dimple
            g[py][px] = "o";
          } else {
            // Cell interior — denser toward edges
            const interior = r > 0.5 ? "@" : (r > 0.25 ? "o" : ".");
            g[py][px] = interior;
          }
        }
      }

      // Highlight glint on leading edge
      const glintX = Math.round(cx) + Math.round(cRx);
      const glintY = Math.round(cy + bob) - 1;
      if (glintX >= 0 && glintX < cols && glintY >= 0 && glintY < rows) {
        if (g[glintY][glintX] === "O" || g[glintY][glintX] === "o") {
          g[glintY][glintX] = "*";
        }
      }
    }

    // Pad each row to exactly cols characters
    return g.map(row => row.join("").padEnd(cols, " ").slice(0, cols)).join("\n");
  }
};
