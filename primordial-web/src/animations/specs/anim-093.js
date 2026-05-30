export default {
  id: 93,
  system: "Insulin-glucose feedback",
  title: "Blood Sugar Loop",
  caption: "Insulin pulses from the pancreas, sweeping glucose into cells.",
  cols: 52,
  rows: 18,
  palette: "energy",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    function set(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function get(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // --- Pancreatic beta cell (left side, pulsing) ---
    const pulse = Math.sin(t * 1.4) * 0.5 + 0.5;          // 0..1 release rhythm
    const cellCx = 10, cellCy = 9;
    const cellRx = 4.5 + pulse * 0.6;
    const cellRy = 3.8 + pulse * 0.4;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cellCx) / cellRx;
        const dy = (y - cellCy) / cellRy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 1.0) {
          const edgeDist = 1.0 - r;
          if (edgeDist < 0.12) {
            g[y][x] = "#";
          } else if (edgeDist < 0.25) {
            g[y][x] = "O";
          } else {
            // Interior granules (insulin stored)
            const gran = (Math.floor(x * 3 + t * 2) + Math.floor(y * 2)) % 7;
            if (gran === 0) g[y][x] = "*";
            else if (gran === 3) g[y][x] = "o";
            else g[y][x] = ".";
          }
        }
      }
    }

    // Beta cell label
    set(cellCx - 1, cellCy, "B");
    set(cellCx,     cellCy, "e");
    set(cellCx + 1, cellCy, "t");
    set(cellCx + 2, cellCy, "a");

    // --- Insulin release wave (bursts outward during pulse peak) ---
    // Multiple insulin molecules travel rightward in waves
    const numWaves = 4;
    for (let w = 0; w < numWaves; w++) {
      const wPhase = w / numWaves;
      // wave starts when pulse is near peak, travels rightward
      const wt = ((t * 1.4 / (2 * Math.PI) + wPhase) % 1.0);
      if (wt < 0.7) {
        const wx = cellCx + cellRx + 1 + wt * (cols - cellCx - cellRx - 14);
        const wy = cellCy - 1 + Math.sin(wt * Math.PI * 2 + wPhase * Math.PI) * 2.5;
        // insulin symbol — Y-shape approximated
        set(wx, wy, "Y");
        set(wx - 1, wy, "~");
        set(wx + 1, wy, "~");
      }
    }

    // --- Blood vessel (horizontal channel across middle) ---
    for (let x = cellCx + 5; x < cols - 5; x++) {
      if (g[5][x] === " ") g[5][x] = "-";
      if (g[12][x] === " ") g[12][x] = "-";
    }
    // vessel walls
    set(cellCx + 5, 5, "|"); set(cellCx + 5, 12, "|");
    set(cols - 6, 5, "|");   set(cols - 6, 12, "|");

    // --- Glucose molecules flowing through vessel ---
    const numGlucose = 7;
    for (let gi = 0; gi < numGlucose; gi++) {
      const gPhase = gi / numGlucose;
      // glucose flows left-to-right through the vessel lane (rows 6-11)
      // speed is modulated by insulin pulse — higher insulin => slower (uptake)
      const speed = 0.55 * (1.0 - pulse * 0.55);
      const gx = ((t * speed + gPhase) % 1.0) * (cols - 20) + cellCx + 7;
      const gy = 6 + (gi % 6);
      const glucChar = (Math.floor(t * 3 + gi) % 3 === 0) ? "G" :
                       (Math.floor(t * 3 + gi) % 3 === 1) ? "o" : "0";
      set(gx, gy, glucChar);
      // small ring around glucose
      set(gx - 1, gy, "(");
      set(gx + 1, gy, ")");
    }

    // --- Target cell (right side, absorbing glucose) ---
    const absorbPulse = Math.sin(t * 1.4 + 1.2) * 0.5 + 0.5; // slightly offset
    const tcCx = cols - 9, tcCy = 9;
    const tcRx = 5.0 + absorbPulse * 0.7;
    const tcRy = 4.2 + absorbPulse * 0.5;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - tcCx) / tcRx;
        const dy = (y - tcCy) / tcRy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 1.0 && g[y][x] === " ") {
          const edgeDist = 1.0 - r;
          if (edgeDist < 0.12) {
            g[y][x] = "%";
          } else if (edgeDist < 0.28) {
            g[y][x] = "O";
          } else {
            // absorbed glucose filling interior
            const fill = (Math.floor(x * 2 + y * 3 + Math.floor(t * 1.5)) % 9);
            if (fill < Math.floor(absorbPulse * 4)) g[y][x] = "+";
            else g[y][x] = ".";
          }
        }
      }
    }

    // Receptor spikes on left side of target cell
    const numSpikes = 3;
    for (let s = 0; s < numSpikes; s++) {
      const sy = tcCy - 2 + s * 2;
      const sLen = 2 + Math.round(absorbPulse);
      for (let d = 1; d <= sLen; d++) {
        set(tcCx - Math.round(tcRx) - d, sy, d === sLen ? ">" : "-");
      }
    }

    // --- Feedback arrow from cell back to pancreas (bottom arc) ---
    // A curved dotted line suggesting negative feedback signal
    const fbSegments = 10;
    for (let s = 0; s < fbSegments; s++) {
      const prog = s / fbSegments;
      const fbt = prog * Math.PI;
      const fbx = cellCx + 3 + prog * (tcCx - cellCx - 6);
      const fby = rows - 2 - Math.sin(fbt) * 2.0;
      const fbPhase = Math.floor(t * 2 + s) % 4;
      const fbCh = fbPhase === 0 ? "<" : (s % 3 === 0 ? "." : "·"[0] || "-");
      if (g[Math.round(fby)][Math.round(fbx)] === " ")
        set(fbx, fby, fbPhase === 0 ? "<" : (s % 2 === 0 ? "." : "-"));
    }

    // Feedback label
    set(cols / 2 - 4, rows - 1, "f");
    set(cols / 2 - 3, rows - 1, "e");
    set(cols / 2 - 2, rows - 1, "e");
    set(cols / 2 - 1, rows - 1, "d");
    set(cols / 2,     rows - 1, "b");
    set(cols / 2 + 1, rows - 1, "a");
    set(cols / 2 + 2, rows - 1, "c");
    set(cols / 2 + 3, rows - 1, "k");

    return g.map(row => row.join("")).join("\n");
  }
};
