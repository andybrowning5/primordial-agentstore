export default {
  id: 7,
  system: "Osmosis across a membrane",
  title: "Water Seeks Balance",
  caption: "Water flows through pores toward the thirsty, solute-rich side.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Membrane is a vertical band near center
    const memX = Math.floor(cols / 2);
    const porePositions = [3, 6, 9, 12];  // row offsets from top (relative to membrane area)

    // Water level on the right side rises over time (osmotic pressure effect)
    // Left side has low solute (high water), right has high solute (low water)
    // Water flows LEFT -> RIGHT through membrane
    const flowPhase = (t * 0.7) % (Math.PI * 2);

    // --- Draw membrane ---
    for (let y = 1; y < rows - 1; y++) {
      // Check if this row is a pore
      const isPore = porePositions.some(p => y === p + 2 || y === p + 3);
      if (isPore) {
        // Pore: gap with channel markers
        if (y >= 0 && y < rows) {
          g[y][memX - 1] = "(";
          g[y][memX + 1] = ")";
        }
      } else {
        // Solid membrane wall
        g[y][memX - 1] = "|";
        g[y][memX]     = "|";
        g[y][memX + 1] = "|";
      }
    }
    // Membrane top/bottom caps
    g[0][memX - 1] = "+"; g[0][memX] = "="; g[0][memX + 1] = "+";
    g[rows - 1][memX - 1] = "+"; g[rows - 1][memX] = "="; g[rows - 1][memX + 1] = "+";

    // --- LEFT side: dilute (high water, few solutes) ---
    // Scattered water molecules as small dots, fairly uniform
    const leftCols = memX - 2;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < leftCols; x++) {
        // Pseudo-random placement derived deterministically from position
        const seed = (x * 17 + y * 31) % 97;
        if (seed < 8) {
          // Water molecule, gently drifting using sin
          const drift = Math.sin(t * 1.1 + seed * 0.7) * 0.5 + 0.5;
          const cx = Math.floor(x + drift * 1.5) % leftCols;
          if (cx >= 1 && cx < leftCols && g[y][cx] === " ") {
            g[y][cx] = "o";
          }
        }
        // Sparse solute on left
        const seed2 = (x * 11 + y * 43) % 101;
        if (seed2 < 3 && g[y][x] === " ") {
          g[y][x] = ".";
        }
      }
    }

    // --- RIGHT side: concentrated (low water, many solutes) ---
    const rightStart = memX + 3;
    for (let y = 1; y < rows - 1; y++) {
      for (let x = rightStart; x < cols - 1; x++) {
        const seed = (x * 19 + y * 37) % 89;
        // Dense solute particles (@, O, #)
        if (seed < 18) {
          const soluteChars = ["@", "O", "#", "%", "0"];
          const ci = seed % soluteChars.length;
          // Gentle Brownian-like wobble
          const wobble = Math.sin(t * 0.8 + seed * 1.3 + x * 0.4) * 0.4;
          const wx = Math.min(cols - 2, Math.max(rightStart, Math.floor(x + wobble)));
          if (g[y][wx] === " ") {
            g[y][wx] = soluteChars[ci];
          }
        }
        // Fewer water molecules on right (water has left)
        const seed3 = (x * 13 + y * 53) % 107;
        if (seed3 < 4 && g[y][x] === " ") {
          const drift = Math.sin(t * 1.3 + seed3 * 0.9) * 0.3;
          const wx = Math.min(cols - 2, Math.max(rightStart, Math.floor(x + drift)));
          if (g[y][wx] === " ") g[y][wx] = "o";
        }
      }
    }

    // --- Flowing water molecules through pores (LEFT -> RIGHT) ---
    // Each pore row gets 1-2 water molecules travelling across the membrane
    porePositions.forEach((pOff, pi) => {
      const py1 = pOff + 2;
      const py2 = pOff + 3;
      [py1, py2].forEach((py, li) => {
        if (py < 1 || py >= rows - 1) return;
        // Molecule position: travels from left of membrane to right
        const speed = 0.6 + pi * 0.15 + li * 0.1;
        const phase = (t * speed + pi * 1.7 + li * 0.9) % 1.0;
        // Travel range: from memX-5 to memX+6
        const travelLen = 11;
        const mx = Math.floor((memX - 5) + phase * travelLen);
        if (mx >= 1 && mx < cols - 1 && g[py][mx] === " ") {
          // Use different chars to show molecule in transit
          if (mx >= memX - 1 && mx <= memX + 1) {
            g[py][mx] = "*";  // inside pore = bright
          } else if (mx > memX + 1) {
            g[py][mx] = "o";  // arrived on right
          } else {
            g[py][mx] = "o";  // approaching on left
          }
        }
        // Trailing dots show direction/flow
        const trailX = mx - 1;
        if (trailX >= 1 && trailX < memX - 1 && g[py][trailX] === " ") {
          g[py][trailX] = ".";
        }
      });
    });

    // --- Water level indicator on right side rising ---
    // A subtle "tide mark" line that pulses upward on right
    const tidePulse = Math.sin(t * 0.5) * 0.5 + 0.5;  // 0..1
    const tideRow = Math.floor(rows * 0.6 + tidePulse * rows * 0.2);
    if (tideRow >= 1 && tideRow < rows - 1) {
      for (let x = rightStart; x < cols - 1; x++) {
        if (g[tideRow][x] === " ") {
          g[tideRow][x] = "~";
        }
      }
    }

    // --- Labels / legend row at top ---
    // Left label: "dilute" indicator
    const leftLabel  = "H2O";
    const rightLabel = "solute";
    for (let i = 0; i < leftLabel.length; i++) {
      const lx = Math.floor(leftCols / 2) - 1 + i;
      if (lx >= 1 && lx < leftCols) g[0][lx] = leftLabel[i];
    }
    for (let i = 0; i < rightLabel.length; i++) {
      const rx = rightStart + 1 + i;
      if (rx < cols - 1) g[0][rx] = rightLabel[i];
    }

    // --- Flow arrows between membrane pores ---
    porePositions.forEach((pOff, pi) => {
      const py = pOff + 2;
      if (py < 1 || py >= rows - 1) return;
      // Pulsing arrow pointing right, sits just left of membrane
      const arrowPulse = Math.sin(t * 1.4 + pi * 0.8) > 0;
      const ax = memX - 3;
      if (ax >= 1 && g[py][ax] === " ") {
        g[py][ax] = arrowPulse ? ">" : "-";
      }
    });

    return g.map(row => row.join("")).join("\n");
  }
};
