export default {
  id: 50,
  system: "Stomata opening and closing",
  title: "Stomatal Breath",
  caption: "Two guard cells swell with light, parting to exhale the sky.",
  cols: 52,
  rows: 18,
  palette: "photosynth",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Oscillation: 0 = fully closed, 1 = fully open
    // Slow breath cycle ~8 s, hold open briefly, snap closed
    const raw = Math.sin(t * 0.78) * 0.5 + 0.5;
    const open = raw * raw; // ease-in: spends more time closed

    // Guard cell geometry
    const cy = rows / 2;
    const cx = cols / 2;

    // Guard cells are kidney-shaped blobs above/below the pore axis
    // Each cell is an ellipse offset from center, curved inward toward pore
    const cellOffsetY = rows * 0.25; // vertical separation of cell centers
    const cellRx = cols * 0.22;
    const cellRy = rows * 0.18;

    // Pore aperture: gap between inner edges of guard cells
    const poreHalf = open * rows * 0.13;   // max ~2.3 char half-gap
    const poreWidth = cols * 0.28 * (0.4 + 0.6 * open); // pore narrows when closed

    function inGuardCell(x, y, sign) {
      // sign: +1 = bottom cell, -1 = top cell
      const offY = sign * cellOffsetY;
      const dx = (x - cx) / cellRx;
      const dy = (y - (cy + offY)) / cellRy;
      return dx * dx + dy * dy;
    }

    function inPore(x, y) {
      const dx = x - cx;
      const dy = y - cy;
      return (dx * dx) / ((poreWidth / 2) * (poreWidth / 2)) +
             (dy * dy) / Math.max(0.01, poreHalf * poreHalf);
    }

    // Draw subsidiary cells (background epidermal cells, simple ellipses)
    const subCells = [
      { cx: cx - cols * 0.34, cy: cy - rows * 0.28, rx: cols * 0.16, ry: rows * 0.22 },
      { cx: cx + cols * 0.34, cy: cy - rows * 0.28, rx: cols * 0.16, ry: rows * 0.22 },
      { cx: cx - cols * 0.34, cy: cy + rows * 0.28, rx: cols * 0.16, ry: rows * 0.22 },
      { cx: cx + cols * 0.34, cy: cy + rows * 0.28, rx: cols * 0.16, ry: rows * 0.22 },
    ];

    for (const sc of subCells) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - sc.cx) / sc.rx;
          const dy = (y - sc.cy) / sc.ry;
          const r = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(r - 1) < 0.14) {
            g[y][x] = "-";
          }
        }
      }
    }

    // Draw the two guard cells
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // Top guard cell (sign = -1)
        const rTop = inGuardCell(x, y, -1);
        // Bottom guard cell (sign = +1)
        const rBot = inGuardCell(x, y, +1);

        const edgeTop = Math.abs(Math.sqrt(rTop) - 1);
        const edgeBot = Math.abs(Math.sqrt(rBot) - 1);

        // Outer wall — thick bright border
        if (edgeTop < 0.10 || edgeBot < 0.10) {
          g[y][x] = "@";
        }
        // Inner fill — chloroplasts animate as drifting dots
        else if (rTop < 0.85 || rBot < 0.85) {
          const phase = (rTop < 0.85) ? 0 : 7;
          const px = Math.floor(x), py = Math.floor(y);
          const drift = Math.floor(t * 2.5 + phase) % 13;
          if ((px * 5 + py * 9 + drift) % 11 === 0) {
            g[y][x] = "o";
          } else if ((px * 3 + py * 7 + drift) % 17 === 0) {
            g[y][x] = "*";
          } else {
            g[y][x] = (g[y][x] === " ") ? "." : g[y][x];
          }
        }
        // Thin halo / softer edge
        else if ((edgeTop < 0.22 || edgeBot < 0.22) && g[y][x] === " ") {
          g[y][x] = ":";
        }
      }
    }

    // Carve out the pore — clear cells inside pore aperture
    if (open > 0.04) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (inPore(x, y) < 1.0) {
            g[y][x] = " ";
          }
        }
      }

      // Pore inner edge — lining of pore (the ventral walls)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const pr = inPore(x, y);
          if (pr > 0.85 && pr < 1.18) {
            // Only mark where inside guard cell was, not outside
            const rTop = inGuardCell(x, y, -1);
            const rBot = inGuardCell(x, y, +1);
            if (rTop < 1.0 || rBot < 1.0) {
              g[y][x] = "|";
            }
          }
        }
      }

      // Gas / vapor diffusing through open pore
      // Small rising/falling particles when open
      if (open > 0.3) {
        const numParticles = Math.floor(open * 7);
        for (let i = 0; i < numParticles; i++) {
          // Deterministic "particles" based on t and index
          const phase = i * 2.718;
          const speed = 0.6 + (i % 3) * 0.3;
          const xOff = Math.sin(phase * 3.7) * poreWidth * 0.35;
          const yFloat = ((t * speed + phase) % 1.0) * 2 - 1; // -1..+1
          const px = Math.round(cx + xOff);
          const py = Math.round(cy + yFloat * poreHalf * 0.7);
          if (px >= 0 && px < cols && py >= 0 && py < rows) {
            const pr = inPore(px, py);
            if (pr < 0.8) {
              g[py][px] = (i % 2 === 0) ? "'" : "`";
            }
          }
        }
      }
    }

    // Pad each row to exactly cols chars
    return g.map((row) => {
      const s = row.join("");
      return s.length >= cols ? s.slice(0, cols) : s.padEnd(cols, " ");
    }).join("\n");
  }
};
