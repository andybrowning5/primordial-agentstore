export default {
  id: 31,
  system: "Action potential travelling along an axon",
  title: "Action Potential",
  caption: "A voltage spike races down the axon, flipping the membrane.",
  cols: 54,
  rows: 18,
  palette: "neuron",
  frame(t) {
    const cols = 54, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Axon membrane: two horizontal rails
    const memTop = 6;
    const memBot = 11;
    const axonStart = 2;
    const axonEnd = cols - 2;

    // Action potential wave position (travels left to right, loops)
    const period = 5.0;
    const phase = (t % period) / period; // 0..1
    const waveX = axonStart + phase * (axonEnd - axonStart);

    // Draw the axon membrane rails with varying characters based on proximity to wave
    for (let x = axonStart; x <= axonEnd; x++) {
      const dist = x - waveX;

      // Top membrane
      let topChar = "-";
      // Bottom membrane
      let botChar = "-";

      // Depolarized zone (just behind the wave front)
      if (dist > -8 && dist < 0) {
        topChar = "=";
        botChar = "=";
      }
      // Repolarizing zone (further behind)
      if (dist > -18 && dist < -8) {
        topChar = "~";
        botChar = "~";
      }
      // Refractory zone
      if (dist > -28 && dist < -18) {
        topChar = ".";
        botChar = ".";
      }

      // Wave front: the spike
      if (Math.abs(dist) < 1.5) {
        topChar = "#";
        botChar = "#";
      }

      if (memTop >= 0 && memTop < rows && x >= 0 && x < cols) g[memTop][x] = topChar;
      if (memBot >= 0 && memBot < rows && x >= 0 && x < cols) g[memBot][x] = botChar;
    }

    // Draw vertical spike at wave front
    const spikeX = Math.round(waveX);
    if (spikeX >= axonStart && spikeX <= axonEnd) {
      // Spike rises above membrane (depolarization) and dips below
      const spikeHeight = 5;
      for (let dy = 1; dy <= spikeHeight; dy++) {
        const sy = memTop - dy;
        if (sy >= 0 && sy < rows) {
          const ch = dy === spikeHeight ? "^" : (dy >= 3 ? "|" : "I");
          g[sy][spikeX] = ch;
        }
      }
      // Slight hyperpolarization dip below bottom membrane
      if (memBot + 1 < rows) g[memBot + 1][spikeX] = "v";
      if (memBot + 2 < rows) g[memBot + 2][spikeX] = ".";
    }

    // Sodium ions rushing in near the wave front (Na+ flood)
    for (let i = 0; i < 6; i++) {
      const offset = i * 1.5;
      const ionX = Math.round(waveX - offset);
      const ionPhase = ((t * 3 + i * 1.1) % (Math.PI * 2));
      const ionY = Math.round(((memTop + memBot) / 2) + Math.sin(ionPhase) * 1.5);
      if (ionX >= axonStart && ionX <= axonEnd && ionY > memTop && ionY < memBot) {
        g[ionY][ionX] = "+";
      }
    }

    // Potassium ions rushing out during repolarization (K+ efflux)
    for (let i = 0; i < 5; i++) {
      const offset = 10 + i * 1.8;
      const ionX = Math.round(waveX - offset);
      const ionPhase = ((t * 2.5 + i * 0.9) % (Math.PI * 2));
      // K+ go outward — above top membrane or below bottom
      const outside = Math.sin(ionPhase) > 0;
      const ionY = outside
        ? Math.round(memTop - 1 - Math.abs(Math.sin(ionPhase)) * 1.5)
        : Math.round(memBot + 1 + Math.abs(Math.sin(ionPhase)) * 1.5);
      if (ionX >= axonStart && ionX <= axonEnd && ionY >= 0 && ionY < rows) {
        g[ionY][ionX] = "o";
      }
    }

    // Axon interior — resting ions and cytoplasm texture
    for (let x = axonStart; x <= axonEnd; x++) {
      for (let y = memTop + 1; y < memBot; y++) {
        const dist = x - waveX;
        // Slight background shimmer in resting zone
        if (dist < -30 || dist > 2) {
          const pat = (Math.floor(x * 3 + y * 7 + t * 1.5)) % 23;
          if (pat === 0) g[y][x] = ":";
          else if (pat === 1) g[y][x] = "'";
        }
      }
    }

    // Axon end caps
    if (memTop < rows && axonStart - 1 >= 0) g[memTop][axonStart - 1] = "(";
    if (memBot < rows && axonStart - 1 >= 0) g[memBot][axonStart - 1] = "(";
    if (memTop < rows && axonEnd + 1 < cols)  g[memTop][axonEnd + 1] = ")";
    if (memBot < rows && axonEnd + 1 < cols)  g[memBot][axonEnd + 1] = ")";

    // Voltage label — small indicator top-left area
    const voltLabel = [" mV", "  ^", "  |"];
    for (let li = 0; li < voltLabel.length; li++) {
      const row = li;
      if (row < rows) {
        for (let ci = 0; ci < voltLabel[li].length; ci++) {
          if (ci < cols) g[row][ci] = voltLabel[li][ci];
        }
      }
    }

    // Direction arrow hint
    const arrowRow = 3;
    const arrowCols = [cols - 6, cols - 5, cols - 4];
    const arrowChars = ["-", "-", ">"];
    for (let i = 0; i < arrowCols.length; i++) {
      if (arrowCols[i] >= 0 && arrowCols[i] < cols && arrowRow < rows) {
        g[arrowRow][arrowCols[i]] = arrowChars[i];
      }
    }

    // Trailing refractory glow dots above/below membrane far behind wave
    for (let x = axonStart; x <= axonEnd; x++) {
      const dist = x - waveX;
      if (dist > -32 && dist < -25) {
        if (memTop - 1 >= 0) g[memTop - 1][x] = ".";
        if (memBot + 1 < rows) g[memBot + 1][x] = ".";
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
