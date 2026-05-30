export default {
  id: 9,
  system: "Sodium-potassium pump",
  title: "Na⁺/K⁺ Ion Pump",
  caption: "Three sodium out, two potassium in — ATP-driven life.",
  cols: 52,
  rows: 20,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Pump cycle: 0..1 represents one full conformational cycle
    const cycle = (t * 0.5) % 1; // one full cycle every 2 seconds

    // Helper: clamp to grid bounds
    function set(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function get(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // --- Membrane bilayer (horizontal, center) ---
    const memY1 = 8;  // outer leaflet
    const memY2 = 11; // inner leaflet
    for (let x = 0; x < cols; x++) {
      // Outer leaflet
      g[memY1][x] = "=";
      g[memY2][x] = "=";
      // Lipid tails (dashes between leaflets)
      for (let y = memY1 + 1; y < memY2; y++) {
        if (x % 4 === 0) g[y][x] = "|";
        else if (x % 4 === 2) g[y][x] = ":";
        else g[y][x] = ".";
      }
    }

    // --- Pump protein spanning the membrane ---
    // Protein body occupies cols 20..31, rows memY1-1 to memY2+1
    const pLeft = 20, pRight = 31;
    const pTop = memY1 - 1, pBot = memY2 + 1;

    // Conformational state drives the pump aperture
    // E1: open to intracellular (cycle 0..0.4) — binds 3 Na+
    // E1->E2: phosphorylation/closure (cycle 0.4..0.6)
    // E2: open to extracellular (cycle 0.6..0.85) — releases Na+, binds K+
    // E2->E1: dephosphorylation/reset (cycle 0.85..1.0)

    // Smoothstep helper
    function smoothstep(a, b, x) {
      const t2 = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t2 * t2 * (3 - 2 * t2);
    }

    // Opening angle for extracellular gate (top) and intracellular gate (bottom)
    const extraOpen = smoothstep(0.6, 0.75, cycle) - smoothstep(0.85, 1.0, cycle);
    const intraOpen = smoothstep(0.0, 0.15, cycle) - smoothstep(0.4, 0.55, cycle);

    // Draw protein walls
    for (let y = pTop; y <= pBot; y++) {
      // Left wall
      const lx = pLeft - (y < memY1 ? Math.round(extraOpen * 2) : y > memY2 ? Math.round(intraOpen * 2) : 0);
      const rx = pRight + (y < memY1 ? Math.round(extraOpen * 2) : y > memY2 ? Math.round(intraOpen * 2) : 0);
      const wallChar = (y === pTop || y === pBot) ? "+" : "|";
      set(lx, y, wallChar);
      set(rx, y, wallChar);
    }

    // Top and bottom edges of protein
    for (let x = pLeft; x <= pRight; x++) {
      set(x, pTop, "-");
      set(x, pBot, "-");
    }
    // Corners
    set(pLeft, pTop, "+"); set(pRight, pTop, "+");
    set(pLeft, pBot, "+"); set(pRight, pBot, "+");

    // Interior channel label & phosphorylation indicator
    const pLabel = cycle > 0.35 && cycle < 0.9 ? "~P~" : "   ";
    const pLabelX = Math.floor((pLeft + pRight) / 2) - 1;
    const pLabelY = memY1 + 1; // center of membrane
    if (pLabel !== "   ") {
      set(pLabelX,     pLabelY, "~");
      set(pLabelX + 1, pLabelY, "P");
      set(pLabelX + 2, pLabelY, "~");
    }

    // --- Ions ---
    // 3 Na+ ions: start intracellular (below membrane), travel through pump, exit extracellular
    // 2 K+ ions: start extracellular (above membrane), travel through pump, exit intracellular

    const cx = (pLeft + pRight) / 2; // pump center x

    // Na+ ion travel: cycle 0.0..0.65
    for (let i = 0; i < 3; i++) {
      const offset = i * 0.08; // stagger ions slightly
      const ionCycle = (cycle + offset) % 1;

      let ix, iy, ch;
      if (ionCycle < 0.15) {
        // Approach pump from inside (bottom)
        const prog = ionCycle / 0.15;
        const startX = cx + (i - 1) * 4;
        ix = startX + (cx - startX) * prog;
        iy = rows - 2 - prog * (rows - 2 - (pBot + 1));
        ch = "+";
      } else if (ionCycle < 0.45) {
        // Inside pump, moving up
        const prog = (ionCycle - 0.15) / 0.30;
        ix = cx + (i - 1) * 1.5 * (1 - prog);
        iy = (pBot + 1) - prog * (pBot - pTop + 1);
        ch = "+";
      } else if (ionCycle < 0.65) {
        // Exiting to extracellular (top)
        const prog = (ionCycle - 0.45) / 0.20;
        const endX = cx + (i - 1) * 5;
        ix = cx + (endX - cx) * prog;
        iy = (pTop - 1) - prog * 4;
        ch = "+";
      } else {
        // Rest / diffusing away
        ix = cx + (i - 1) * 6 + Math.sin(t * 1.1 + i) * 1.5;
        iy = 1.5 + Math.cos(t * 0.7 + i * 2) * 1.0;
        ch = "+";
      }

      // Draw Na label near ion cluster (extracellular side, when exiting)
      if (ionCycle >= 0.45 && ionCycle < 0.65) {
        const labelIy = Math.round(iy);
        const labelIx = Math.round(ix);
        if (i === 1) { // center ion carries label
          set(labelIx - 1, labelIy, "N");
          set(labelIx,     labelIy, "a");
          set(labelIx + 1, labelIy, ch);
        } else {
          set(ix, iy, ch);
        }
      } else {
        set(ix, iy, ch);
      }
    }

    // K+ ion travel: cycle 0.65..1.0 (enter from outside, exit inside)
    for (let i = 0; i < 2; i++) {
      const offset = i * 0.07;
      const ionCycle = (cycle + offset) % 1;

      let ix, iy, ch;
      if (ionCycle >= 0.65 && ionCycle < 0.78) {
        // Approach from extracellular (top)
        const prog = (ionCycle - 0.65) / 0.13;
        const startX = cx + (i === 0 ? -3 : 3);
        ix = startX + (cx - startX) * prog;
        iy = 1 + prog * (pTop - 2);
        ch = "o";
      } else if (ionCycle >= 0.78 && ionCycle < 0.95) {
        // Inside pump, moving down
        const prog = (ionCycle - 0.78) / 0.17;
        ix = cx + (i === 0 ? -1 : 1) * (1 - prog);
        iy = (pTop - 1) + prog * (pBot - pTop + 2);
        ch = "o";
      } else if (ionCycle >= 0.95) {
        // Exiting intracellular (bottom)
        const prog = (ionCycle - 0.95) / 0.05;
        const endX = cx + (i === 0 ? -4 : 4);
        ix = cx + (endX - cx) * prog;
        iy = (pBot + 1) + prog * 3;
        ch = "o";
      } else {
        // Resting intracellular
        ix = cx + (i === 0 ? -5 : 5) + Math.sin(t * 0.9 + i) * 1.2;
        iy = rows - 2 + Math.cos(t * 0.6 + i) * 0.5;
        ch = "o";
      }

      // K label when exiting intracellular
      if (ionCycle >= 0.95 && i === 0) {
        set(Math.round(ix), Math.round(iy), "K");
        set(Math.round(ix) + 1, Math.round(iy), ch);
      } else {
        set(ix, iy, ch);
      }
    }

    // --- ATP -> ADP indicator (lower-left, pulses when phosphorylation fires) ---
    const atpPhase = smoothstep(0.33, 0.42, cycle);
    const atpStr = atpPhase > 0.5 ? "ATP->ADP" : "  ATP   ";
    const atpX = 1, atpY = rows - 2;
    for (let c = 0; c < atpStr.length; c++) set(atpX + c, atpY, atpStr[c]);

    // --- Labels: Na+ extracellular, K+ intracellular banners ---
    // Extracellular label (top area)
    const extraLabel = "[ extracellular ]";
    const eStart = Math.floor((cols - extraLabel.length) / 2);
    for (let c = 0; c < extraLabel.length; c++) set(eStart + c, 0, extraLabel[c]);

    // Intracellular label (bottom area)
    const intraLabel = "[ intracellular ]";
    const iStart = Math.floor((cols - intraLabel.length) / 2);
    for (let c = 0; c < intraLabel.length; c++) set(iStart + c, rows - 1, intraLabel[c]);

    // --- Phosphorylation flash in membrane region ---
    if (cycle > 0.38 && cycle < 0.62) {
      const flashIntensity = Math.sin((cycle - 0.38) / 0.24 * Math.PI);
      const flashChar = flashIntensity > 0.7 ? "*" : (flashIntensity > 0.4 ? "o" : ".");
      set(cx, memY1 + 1, flashChar);
      set(cx, memY2 - 1, flashChar);
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
