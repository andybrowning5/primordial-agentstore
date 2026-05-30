export default {
  id: 98,
  system: "Telomere shortening",
  title: "Eroding Endcaps",
  caption: "Each division strips another rung; the chromosome grows old.",
  cols: 52,
  rows: 18,
  palette: "dna",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Time cycles: one full erosion/reset cycle every 8 seconds
    const cycle = (t % 8) / 8; // 0..1
    // Erosion progress: 0 = full telomere, 1 = fully eroded
    // Use a smooth ramp that resets sharply
    const erode = cycle < 0.85 ? cycle / 0.85 : 1 - (cycle - 0.85) / 0.15;

    // ---- Double-strand DNA backbone runs vertically down the center ----
    // The chromosome occupies columns cx-3 .. cx+3
    const cx = Math.floor(cols / 2); // 26

    // Total strand length: rows 2..15 (14 rows of backbone)
    const strandTop = 2;
    const strandBot = 15;
    const strandLen = strandBot - strandTop + 1; // 14

    // Telomere cap at TOP: erodes from above (shrinks downward)
    // Full telomere: 6 rows of cap chars; eroded: 0 rows
    const fullCapLen = 6;
    const capLen = Math.round(fullCapLen * (1 - erode)); // 6..0

    // Pulse on the backbone for visual life
    const pulse = Math.sin(t * 2.5) * 0.5 + 0.5;

    // ---- Draw the DNA double helix backbone ----
    // Left strand at cx-2, right strand at cx+2
    // Rungs connecting them
    for (let row = strandTop; row <= strandBot; row++) {
      const inCap = (row - strandTop) < capLen;
      const isEroding = (row - strandTop) === capLen && capLen < fullCapLen;

      // Pick backbone char based on position
      let leftChar, rightChar;
      if (inCap) {
        leftChar = "O";
        rightChar = "O";
      } else if (isEroding) {
        // Fraying edge — animate with flickering chars
        const fray = Math.floor(t * 8) % 3;
        leftChar  = fray === 0 ? "o" : fray === 1 ? "." : "*";
        rightChar = fray === 0 ? "." : fray === 1 ? "o" : "*";
      } else {
        leftChar  = "|";
        rightChar = "|";
      }

      // Protect bounds
      if (row >= 0 && row < rows) {
        if (cx - 2 >= 0) g[row][cx - 2] = leftChar;
        if (cx + 2 < cols) g[row][cx + 2] = rightChar;
      }

      // Rungs: every 2 rows, draw a rung in the non-cap region
      if (!inCap && row % 2 === 0) {
        const rungChar = (Math.floor(t * 4 + row) % 5 === 0) ? "=" : "-";
        for (let x = cx - 1; x <= cx + 1; x++) {
          if (x >= 0 && x < cols && row >= 0 && row < rows) {
            g[row][x] = rungChar;
          }
        }
      }
    }

    // ---- Draw the telomere cap (top protective block) ----
    // Cap renders as a solid bracket/block above strandTop or covering topmost rows
    const capStart = strandTop;
    const capEnd   = strandTop + capLen - 1;

    for (let row = capStart; row <= capEnd && row < rows; row++) {
      // Cap column span grows slightly wider than the backbone
      for (let x = cx - 4; x <= cx + 4; x++) {
        if (x < 0 || x >= cols) continue;
        const dist = Math.abs(x - cx);
        if (dist === 4) {
          g[row][x] = (row === capStart) ? "+" : "|";
        } else if (dist === 3) {
          g[row][x] = (row === capStart || row === capEnd) ? "=" : "#";
        } else {
          // Inner cap fill — pulse slightly
          const fill = (Math.floor(t * 3 + row + x) % 7 === 0) ? "*" : "#";
          g[row][x] = (row === capStart || row === capEnd) ? "=" : fill;
        }
      }
      // Overwrite cap corners
      if (row === capStart && capStart < rows) {
        if (cx - 4 >= 0) g[row][cx - 4] = "+";
        if (cx + 4 < cols) g[row][cx + 4] = "+";
      }
      if (row === capEnd && capEnd < rows && capEnd !== capStart) {
        if (cx - 4 >= 0) g[row][cx - 4] = "+";
        if (cx + 4 < cols) g[row][cx + 4] = "+";
      }
    }

    // ---- Bottom cap (stable — telomeres erode asymmetrically; show one end shortening) ----
    for (let x = cx - 4; x <= cx + 4; x++) {
      if (x < 0 || x >= cols) continue;
      const dist = Math.abs(x - cx);
      const row = strandBot;
      if (row < rows) {
        if (dist === 4) g[row][x] = "+";
        else if (dist >= 2) g[row][x] = "=";
        else g[row][x] = "#";
      }
      if (row + 1 < rows) {
        if (dist === 4) g[row + 1][x] = "|";
        else if (dist === 3) g[row + 1][x] = "#";
        else g[row + 1][x] = "#";
      }
      if (row + 2 < rows) {
        if (dist === 4) g[row + 2][x] = "+";
        else if (dist >= 2) g[row + 2][x] = "=";
        else g[row + 2][x] = "#";
      }
    }

    // ---- Floating "lost" telomere fragments drift leftward as erosion progresses ----
    // Fragments appear when capLen < fullCapLen
    if (erode > 0.05 && erode < 0.92) {
      const fragCount = Math.floor(erode * 5) + 1;
      for (let i = 0; i < fragCount && i < 4; i++) {
        // Each fragment travels left and fades over time
        const seed = (i + 1) * 17;
        const speed = 0.6 + i * 0.25;
        const fragX = Math.floor(((cx - 6) - ((t * speed + seed) % (cx - 4))) + cols) % cols;
        const fragY = (strandTop + i * 2) % rows;
        if (fragY >= 0 && fragY < rows && fragX >= 0 && fragX < cols) {
          g[fragY][fragX] = "o";
        }
        if (fragY >= 0 && fragY < rows && fragX + 1 < cols) {
          g[fragY][fragX + 1] = ".";
        }
      }
    }

    // ---- Generation counter: small tally marks on right margin ----
    // Show how many "divisions" have elapsed (0..6) based on erode
    const divisions = Math.min(6, Math.floor(erode * 7));
    const tallyRow = 1;
    for (let d = 0; d < divisions; d++) {
      const tx = cols - 2 - d * 2;
      if (tx >= 0 && tx < cols && tallyRow < rows) {
        g[tallyRow][tx] = "|";
      }
    }
    // Label
    if (tallyRow < rows) {
      const label = "div";
      for (let li = 0; li < label.length; li++) {
        const lx = cols - 2 - 6 * 2 - 1 - label.length + li;
        if (lx >= 0 && lx < cols) g[tallyRow][lx] = label[li];
      }
    }

    // ---- Erode label on left side ----
    const pct = Math.round(erode * 100);
    const pctStr = pct < 10 ? `  ${pct}%` : pct < 100 ? ` ${pct}%` : `${pct}%`;
    const labelRow = rows - 2;
    for (let li = 0; li < pctStr.length; li++) {
      if (li < cols && labelRow < rows) g[labelRow][li] = pctStr[li];
    }
    // "worn" label
    const worn = "worn";
    for (let li = 0; li < worn.length; li++) {
      const wx = li;
      if (wx < cols && labelRow + 1 < rows) g[labelRow + 1][wx] = worn[li];
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
