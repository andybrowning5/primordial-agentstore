export default {
  id: 21,
  system: "Electron transport chain",
  title: "Proton Cascade",
  caption: "Electrons tumble down the chain, pumping life across the membrane.",
  cols: 54,
  rows: 18,
  palette: "energy",
  frame(t) {
    const cols = 54, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // === Layout ===
    // Row 2: intermembrane space (top)
    // Row 4: inner membrane (top edge)
    // Rows 5-12: membrane bilayer
    // Row 13: inner membrane (bottom edge)
    // Row 15: matrix (bottom)

    // Membrane bilayer — two horizontal lines
    const memTop = 4;
    const memBot = 13;

    // Draw membrane lines
    for (let x = 0; x < cols; x++) {
      g[memTop][x] = "=";
      g[memBot][x] = "=";
    }

    // === Protein complexes along the membrane ===
    // Complex I at x~6, Complex III at x~20, Complex IV at x~34, ATP Synthase at x~48
    const complexes = [
      { x: 6,  label: "I",   height: 5 },
      { x: 20, label: "III", height: 5 },
      { x: 34, label: "IV",  height: 5 },
      { x: 48, label: "F",   height: 6, atp: true },
    ];

    function drawComplex(cx, label, height, atp) {
      const halfH = Math.floor(height / 2);
      // Straddle the membrane
      for (let dy = -halfH; dy <= halfH; dy++) {
        const y = Math.round((memTop + memBot) / 2) + dy;
        if (y < 0 || y >= rows) continue;
        const ch = (dy === -halfH || dy === halfH) ? "+" : "|";
        if (cx - 1 >= 0) g[y][cx - 1] = ch;
        if (cx + 1 < cols) g[y][cx + 1] = ch;
      }
      // Label inside at center
      const midY = Math.round((memTop + memBot) / 2);
      for (let i = 0; i < label.length; i++) {
        const lx = cx - Math.floor(label.length / 2) + i;
        if (lx >= 0 && lx < cols) g[midY][lx] = label[i];
      }
      // ATP synthase rotor — spinning character below membrane
      if (atp) {
        const rotorChars = ["-", "\\", "|", "/"];
        const spin = Math.floor(t * 4) % 4;
        const ry = midY + 2;
        if (ry < rows) g[ry][cx] = rotorChars[spin];
        const ry2 = midY + 3;
        const spinSlow = Math.floor(t * 2) % 4;
        if (ry2 < rows) g[ry2][cx] = rotorChars[spinSlow];
      }
    }

    for (const c of complexes) {
      drawComplex(c.x, c.label, c.height, c.atp);
    }

    // === Electron carriers (ubiquinone) drifting along membrane ===
    // 3 carriers oscillate laterally between complexes
    const carrierPositions = [
      { baseX: 13, phase: 0.0,  speed: 0.7, range: 5 },
      { baseX: 27, phase: 2.1,  speed: 0.65, range: 5 },
      { baseX: 41, phase: 4.2,  speed: 0.72, range: 5 },
    ];

    for (const c of carrierPositions) {
      const ox = Math.round(Math.sin(t * c.speed + c.phase) * c.range);
      const cx = c.baseX + ox;
      // Carrier sits in the membrane
      const y1 = memTop + 2;
      const y2 = memBot - 2;
      if (cx >= 0 && cx < cols) {
        g[y1][cx] = "Q";
        g[y2][cx] = "q";
      }
    }

    // === Electrons flowing as '*' along the top of the protein complexes ===
    // Electrons travel left-to-right at intermembrane side (row memTop-1)
    const eRow = memTop - 1;
    const complexXs = complexes.map(c => c.x);
    for (let i = 0; i < 3; i++) {
      // Each electron progresses from Complex I toward IV
      const startX = complexXs[0];
      const endX = complexXs[2] + 2;
      const span = endX - startX;
      const ex = startX + ((t * 6 + i * (span / 3)) % span);
      const ix = Math.round(ex);
      if (ix >= 0 && ix < cols && eRow >= 0 && eRow < rows) {
        // Don't draw on top of complex columns
        const onComplex = complexes.some(c => Math.abs(ix - c.x) <= 1);
        if (!onComplex) g[eRow][ix] = "*";
      }
    }

    // === Proton pumping — H+ particles rising from matrix into intermembrane space ===
    // Each complex pumps protons upward; show them as '+' or 'H' pulsing
    const pumpComplexes = [complexes[0], complexes[1], complexes[2]];
    for (const c of pumpComplexes) {
      // Two protons per complex, staggered in phase
      for (let p = 0; p < 2; p++) {
        const phase = p * Math.PI;
        // Proton rises from matrix (below memBot) into IMS (above memTop)
        // Normalise to 0..1, map to y range
        const progress = ((t * 0.8 + phase + c.x * 0.05) % (2 * Math.PI)) / (2 * Math.PI);
        // Journey: from row (memBot+2) up to row (memTop-2)
        const yStart = memBot + 2;
        const yEnd = memTop - 2;
        if (yStart >= rows || yEnd < 0) continue;
        const py = Math.round(yStart + (yEnd - yStart) * progress);
        const px = c.x + (p === 0 ? -1 : 1);
        if (py >= 0 && py < rows && px >= 0 && px < cols) {
          // Only draw in transit (outside the membrane itself)
          if (py < memTop || py > memBot) {
            g[py][px] = "+";
          }
        }
      }
    }

    // === ATP synthase — show ATP being produced below in matrix ===
    const atpC = complexes[3];
    // Pulses an "ATP" label below the rotor
    const pulse = Math.floor(t * 1.5) % 4;
    if (pulse < 3) {
      const atpRow = memBot + 2 + pulse;
      const atpLabel = "ATP";
      for (let i = 0; i < atpLabel.length; i++) {
        const ax = atpC.x - 1 + i;
        if (atpRow < rows && ax >= 0 && ax < cols) {
          g[atpRow][ax] = atpLabel[i];
        }
      }
    }

    // === Oxygen sink — O2 consumed at Complex IV ===
    const ivC = complexes[2];
    // Water (H2O) produced — show 'O' drifting down from Complex IV into matrix
    for (let w = 0; w < 2; w++) {
      const wPhase = w * Math.PI;
      const wProgress = ((t * 0.6 + wPhase) % (2 * Math.PI)) / (2 * Math.PI);
      const wyStart = memBot + 1;
      const wyEnd = rows - 1;
      if (wyStart >= rows) continue;
      const wy = Math.round(wyStart + (wyEnd - wyStart) * wProgress);
      const wx = ivC.x + (w === 0 ? -2 : 2);
      if (wy >= 0 && wy < rows && wx >= 0 && wx < cols) {
        g[wy][wx] = "o";
      }
    }

    // === Ambient dots in IMS and matrix to suggest crowded biochemical space ===
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (g[y][x] !== " ") continue;
        const inIMS = y < memTop;
        const inMatrix = y > memBot;
        if (!inIMS && !inMatrix) continue;
        // Sparse background ions
        const seed = (x * 17 + y * 31 + Math.floor(t * 3)) % 97;
        if (inIMS && seed === 1) g[y][x] = ".";
        if (inMatrix && seed === 3) g[y][x] = ".";
      }
    }

    // === Zone labels (tiny, fixed) ===
    const imsLabel = "IMS";
    const matLabel = "MATRIX";
    for (let i = 0; i < imsLabel.length; i++) {
      if (1 >= 0 && 1 < rows && i < cols) g[1][i] = imsLabel[i];
    }
    for (let i = 0; i < matLabel.length; i++) {
      if (rows - 2 >= 0 && rows - 2 < rows && i < cols) g[rows - 2][i] = matLabel[i];
    }

    // === NADH label flowing in on left edge above membrane ===
    const nadhVisible = Math.sin(t * 0.4) > 0;
    if (nadhVisible) {
      const nadhLabel = "NADH";
      for (let i = 0; i < nadhLabel.length; i++) {
        const nx = i;
        const ny = memTop - 2;
        if (ny >= 0 && ny < rows && nx < cols && g[ny][nx] === " ") {
          g[ny][nx] = nadhLabel[i];
        }
      }
    }

    // === NAD+ label drifting off right edge ===
    const nadVisible = Math.sin(t * 0.4) < 0;
    if (nadVisible) {
      const nadLabel = "NAD+";
      for (let i = 0; i < nadLabel.length; i++) {
        const nx = cols - nadLabel.length + i;
        const ny = memTop - 2;
        if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && g[ny][nx] === " ") {
          g[ny][nx] = nadLabel[i];
        }
      }
    }

    // Pad each row to exactly cols characters and join
    return g.map(row => row.join("").padEnd(cols, " ").slice(0, cols)).join("\n");
  }
};
