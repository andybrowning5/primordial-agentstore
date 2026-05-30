export default {
  id: 40,
  system: "Red blood cells in single file",
  title: "Capillary Transit",
  caption: "Biconcave discs squeeze single-file through a narrow vessel.",
  cols: 52,
  rows: 18,
  palette: "blood",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Vessel walls — top and bottom, slightly wavy
    const wallTop = Math.floor(rows * 0.18);
    const wallBot = Math.floor(rows * 0.82);

    // Draw vessel wall lines
    for (let x = 0; x < cols; x++) {
      const wave = Math.sin(x * 0.3 - t * 0.4) * 0.6;
      const wt = Math.round(wallTop + wave);
      const wb = Math.round(wallBot - wave);
      if (wt >= 0 && wt < rows) g[wt][x] = "=";
      if (wb >= 0 && wb < rows) g[wb][x] = "=";
      // Vessel lumen shading just inside walls
      const wt2 = wt + 1;
      const wb2 = wb - 1;
      if (wt2 >= 0 && wt2 < rows) g[wt2][x] = "-";
      if (wb2 >= 0 && wb2 < rows) g[wb2][x] = "-";
    }

    // RBC parameters
    // Each cell is an ellipse (biconcave when viewed from side: wider than tall)
    // They flow left to right (or appear to scroll rightward)
    // Spacing between cells
    const cellSpacing = 13;   // columns apart
    const numCells = 6;
    const cy = (rows - 1) / 2; // vertical center of lumen

    // RBC half-widths and heights (squeeze slightly as they travel)
    const baseRx = 4.2;   // half-width in cols
    const baseRy = 2.1;   // half-height in rows

    for (let i = 0; i < numCells; i++) {
      // Offset each cell in time so they flow through
      // t * speed gives continuous travel; modulo cols keeps them looping
      const speed = 5.0;
      const rawX = ((t * speed + i * cellSpacing) % (cols + cellSpacing * 2)) - cellSpacing;
      const cx = rawX;

      // Slight vertical wobble as cell squeezes through vessel
      const wobble = Math.sin(t * 1.8 + i * 2.1) * 0.35;
      const cellCy = cy + wobble;

      // Pulse the cell slightly (cells are slightly elastic)
      const pulse = Math.sin(t * 2.2 + i * 1.5) * 0.12 + 1.0;
      const rx = baseRx * pulse;
      const ry = baseRy * (2.0 - pulse) * 0.95; // squeeze in one axis = expand other

      // Draw the RBC: biconcave disc viewed from side
      // Outer ellipse boundary and inner depression
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cellCy) / ry;
          const r2 = dx * dx + dy * dy;

          // Only draw inside vessel lumen
          const wallOffset = 1.5 + Math.sin(x * 0.3 - t * 0.4) * 0.6;
          const yTop = wallTop + wallOffset + 1.5;
          const yBot = wallBot - wallOffset - 1.5;
          if (y < yTop || y > yBot) continue;

          if (r2 <= 1.0) {
            // Inside the cell
            // Biconcave: the center is indented on both faces
            // Simulate by making center region lighter (dimple)
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            const dimple = absDx < 0.45 && absDy < 0.45;

            const edgeDist = Math.sqrt(r2);
            if (edgeDist > 0.82) {
              // Outer rim — dense
              g[y][x] = "@";
            } else if (edgeDist > 0.60) {
              g[y][x] = "O";
            } else if (dimple) {
              // Central dimple (biconcave depression)
              if (edgeDist < 0.25) {
                g[y][x] = ".";
              } else {
                g[y][x] = "o";
              }
            } else {
              g[y][x] = "0";
            }
          }
        }
      }
    }

    // Plasma flow dots between cells (small particles drifting in plasma)
    const plasmaParticles = 8;
    for (let p = 0; p < plasmaParticles; p++) {
      const speed2 = 4.2;
      const pOffset = p * (cols / plasmaParticles) + 3.5;
      const px = Math.floor(((t * speed2 + pOffset) % cols));
      const pyFrac = cy + Math.sin(t * 1.3 + p * 1.7) * 1.2;
      const py = Math.round(pyFrac);

      // Check vessel bounds
      const wallOff = 1.5 + Math.sin(px * 0.3 - t * 0.4) * 0.6;
      const yTop2 = Math.ceil(wallTop + wallOff + 2.5);
      const yBot2 = Math.floor(wallBot - wallOff - 2.5);

      if (px >= 0 && px < cols && py >= yTop2 && py <= yBot2) {
        if (g[py][px] === " ") {
          g[py][px] = (p % 3 === 0) ? "'" : ".";
        }
      }
    }

    // Ensure every row is exactly cols wide
    return g.map(row => {
      const line = row.join("");
      return line.length >= cols ? line.slice(0, cols) : line.padEnd(cols, " ");
    }).join("\n");
  }
};
