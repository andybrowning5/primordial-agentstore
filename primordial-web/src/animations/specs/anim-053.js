export default {
  id: 53,
  system: "Embryo cleavage",
  title: "First Divisions",
  caption: "One cell becomes many — the ancient arithmetic of life.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Cleavage stage cycles: 1-cell -> 2-cell -> 4-cell -> 8-cell, then loop
    // Each stage lasts ~3s, full cycle ~12s
    const cycleDur = 12;
    const phase = (t % cycleDur) / cycleDur; // 0..1

    // Division progress within current stage (0..1, pulses then splits)
    const stageT = (t % (cycleDur / 4)) / (cycleDur / 4); // 0..1 per stage
    const stageIdx = Math.floor(((t % cycleDur) / cycleDur) * 4); // 0,1,2,3

    // Smooth split easing: slow start, fast split, hold
    function easeInOut(x) {
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    }
    const splitProg = easeInOut(Math.min(stageT * 1.6, 1)); // 0..1 split
    const holdProg = Math.max(0, stageT - 0.7) / 0.3;       // 0..1 hold/breathe

    // Gentle breathing pulse on each blob
    const breathe = 1 + 0.06 * Math.sin(t * 3.1);

    // Draw a single blob (ellipse) at (cx, cy) with radii (rx, ry)
    // innerChar scattered for cytoplasm texture, phase offset for shimmering
    function drawBlob(cx, cy, rx, ry, phaseOff) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          const r = Math.sqrt(dx * dx + dy * dy);
          const edge = Math.abs(r - 1);

          if (edge < 0.07) {
            // Membrane: solid ring, shimmer with t
            const shim = Math.sin(t * 2.5 + x * 0.4 + y * 0.3 + phaseOff);
            g[y][x] = shim > 0.3 ? "@" : "O";
          } else if (edge < 0.18 && g[y][x] === " ") {
            // Outer membrane glow
            g[y][x] = "o";
          } else if (r < 0.88) {
            // Cytoplasm: sparse internal detail
            const hash = (Math.floor(x * 3.7 + phaseOff * 1.1) + Math.floor(y * 5.3 + t * 2 + phaseOff)) % 17;
            if (hash === 0) g[y][x] = "*";
            else if (hash === 1) g[y][x] = ".";
            else if (g[y][x] === " ") g[y][x] = " ";
          } else if (r < 0.96 && g[y][x] === " ") {
            // Inner membrane fade
            const hash2 = (Math.floor(x * 2.9) + Math.floor(y * 4.1 + t * 1.5 + phaseOff)) % 9;
            if (hash2 < 2) g[y][x] = ":";
          }

          // Nucleus: small bright dot near center
          const ndx = (x - cx) / (rx * 0.28);
          const ndy = (y - cy) / (ry * 0.28);
          const nr = Math.sqrt(ndx * ndx + ndy * ndy);
          if (nr < 1) {
            const ned = Math.abs(nr - 0.85);
            if (ned < 0.25) g[y][x] = "#";
            else if (nr < 0.6) g[y][x] = "+";
          }
        }
      }
    }

    // Draw cleavage furrow line between two cells during split
    function drawFurrow(cx, cy, rx, ry, prog, isVert) {
      if (prog < 0.05) return;
      const furrowLen = prog; // 0..1 how deep the furrow cuts
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r > 1.05) continue;

          if (isVert) {
            // Vertical cleavage furrow
            const distToLine = Math.abs(x - cx);
            const distFromPole = Math.abs(dy); // 0 at equator, 1 at poles
            if (distToLine < 0.9 && distFromPole > (1 - furrowLen) * 0.92) {
              if (distToLine < 0.55) g[y][x] = "|";
            }
          } else {
            // Horizontal cleavage furrow
            const distToLine = Math.abs(y - cy);
            const distFromPole = Math.abs(dx);
            if (distToLine < 0.7 && distFromPole > (1 - furrowLen) * 0.88) {
              if (distToLine < 0.5) g[y][x] = "-";
            }
          }
        }
      }
    }

    const cy = rows / 2 - 0.5;
    const cx = cols / 2;

    if (stageIdx === 0) {
      // Stage 0: Single cell, breathing, about to divide
      const rx = 10 * breathe;
      const ry = 7.5 * breathe;
      // Equatorial belt tightening as division approaches
      const squeeze = 1 - 0.18 * splitProg;
      drawBlob(cx, cy, rx * squeeze, ry, 0);
      // Draw forming furrow
      drawFurrow(cx, cy, rx * squeeze, ry, splitProg * 0.7, true);

    } else if (stageIdx === 1) {
      // Stage 1: Two cells side by side (first cleavage complete)
      const sep = splitProg * 8.5;
      const rx = (9.0 - splitProg * 1.0) * breathe;
      const ry = (7.0 + splitProg * 0.4) * breathe;
      drawBlob(cx - sep, cy, rx, ry, 0);
      drawBlob(cx + sep, cy, rx, ry, 5);
      // Draw forming furrow in each cell (second cleavage starting)
      if (splitProg > 0.5) {
        const fp = (splitProg - 0.5) * 2;
        drawFurrow(cx - sep, cy, rx, ry, fp * 0.6, false);
        drawFurrow(cx + sep, cy, rx, ry, fp * 0.6, false);
      }

    } else if (stageIdx === 2) {
      // Stage 2: Four cells (2x2 grid)
      const sepX = 7.5 + splitProg * 1.5;
      const sepY = 4.5 + splitProg * 1.0;
      const rx = (7.2 - splitProg * 0.5) * breathe;
      const ry = (5.0 - splitProg * 0.3) * breathe;
      const positions = [
        [cx - sepX, cy - sepY, 0],
        [cx + sepX, cy - sepY, 3],
        [cx - sepX, cy + sepY, 7],
        [cx + sepX, cy + sepY, 11],
      ];
      for (const [bx, by, ph] of positions) {
        drawBlob(bx, by, rx, ry, ph);
      }
      // Third cleavage furrows forming
      if (splitProg > 0.45) {
        const fp = (splitProg - 0.45) * 1.8;
        for (const [bx, by] of positions) {
          drawFurrow(bx, by, rx, ry, Math.min(fp * 0.55, 0.55), true);
        }
      }

    } else {
      // Stage 3: Eight cells (morula-like cluster)
      const bx = breathe;
      const sepX = 8.0;
      const sepY = 4.8;
      const rx = 6.0 * bx;
      const ry = 4.2 * bx;
      // 4 front cells + 4 back cells (suggest 3D by slight offset)
      const offsets = [
        [cx - sepX, cy - sepY, 0],
        [cx + sepX, cy - sepY, 4],
        [cx - sepX, cy + sepY, 8],
        [cx + sepX, cy + sepY, 12],
      ];
      for (const [bxc, byc, ph] of offsets) {
        // Draw back cell (slightly offset, reduced brightness represented by "o" outer)
        drawBlob(bxc + 1.5, byc - 0.8, rx * 0.88, ry * 0.88, ph + 2);
      }
      for (const [bxc, byc, ph] of offsets) {
        drawBlob(bxc, byc, rx, ry, ph);
      }
    }

    return g.map((row) => {
      const line = row.join("");
      return line.length < cols ? line + " ".repeat(cols - line.length) : line.slice(0, cols);
    }).join("\n");
  }
};
