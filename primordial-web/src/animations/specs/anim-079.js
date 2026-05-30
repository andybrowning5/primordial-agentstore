export default {
  id: 79,
  system: "Root hair water uptake",
  title: "Root Hair Osmosis",
  caption: "Slender root hairs drink deep, drawing water cell by cell.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- helpers ---
    function set(x, y, ch) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) g[y][x] = ch;
    }
    function get(x, y) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) return g[y][x];
      return " ";
    }

    // === SOIL PARTICLES (static background noise, faint) ===
    const soilSeeds = [
      [4,1],[9,3],[14,1],[20,2],[27,1],[33,3],[39,1],[46,2],
      [6,5],[11,4],[18,5],[24,4],[31,5],[37,4],[43,5],[49,4],
      [3,7],[8,6],[15,7],[22,6],[29,7],[36,6],[42,7],[48,6],
      [5,9],[12,8],[19,9],[26,8],[33,9],[40,8],[46,9],[50,8],
      [2,11],[7,10],[16,11],[23,10],[30,11],[38,10],[44,11],[51,10],
      [4,13],[10,12],[17,13],[25,12],[32,13],[39,12],[45,13],[50,12],
      [6,15],[13,14],[20,15],[27,14],[35,15],[41,14],[47,15],[3,15],
      [8,17],[15,16],[22,17],[29,16],[36,17],[43,16],[49,17],[1,16],
    ];
    for (const [sx, sy] of soilSeeds) {
      set(sx, sy, ".");
    }

    // === WATER MOLECULES in soil — drift slowly toward roots ===
    // 12 water molecules, each on an orbit path drifting leftward (toward root)
    const waterCount = 14;
    for (let i = 0; i < waterCount; i++) {
      const phase = (i / waterCount) * Math.PI * 2;
      // each molecule wanders in a tight circle and drifts toward root (x decreases over time)
      const baseX = 48 - ((i * 3.2 + t * 1.4) % 46);
      const baseY = 1 + (i * 1.3) % (rows - 2);
      const wx = baseX + Math.sin(t * 1.1 + phase) * 1.2;
      const wy = baseY + Math.cos(t * 0.9 + phase) * 0.7;
      const ix = Math.round(wx), iy = Math.round(wy);
      if (get(ix, iy) === " " || get(ix, iy) === ".") set(ix, iy, "o");
    }

    // === ROOT BODY — vertical bar on left side, cells visible ===
    // Root body spans x=0..4, full height, cell walls at intervals
    for (let y = 0; y < rows; y++) {
      // outer wall
      set(0, y, "|");
      set(4, y, "|");
      // inner cytoplasm fill — pulsing with osmotic pressure
      const pressure = Math.sin(t * 1.8 + y * 0.4) * 0.5 + 0.5;
      const fillChar = pressure > 0.7 ? "%" : pressure > 0.4 ? "*" : ":";
      set(1, y, fillChar);
      set(2, y, fillChar);
      set(3, y, fillChar);
    }
    // cell wall horizontal lines every 3 rows
    for (let y = 2; y < rows; y += 3) {
      set(0, y, "+");
      set(4, y, "+");
      for (let x = 1; x <= 3; x++) set(x, y, "-");
    }

    // === ROOT HAIRS — 5 hairs extending right from root wall ===
    const hairRows = [1, 4, 7, 11, 15];
    for (let hi = 0; hi < hairRows.length; hi++) {
      const hy = hairRows[hi];
      // hair length pulses slightly (turgor pressure)
      const baseLen = 8 + hi % 3;
      const pulseFrac = Math.sin(t * 1.3 + hi * 1.1) * 0.5 + 0.5;
      const hairLen = Math.round(baseLen + pulseFrac * 3);

      // draw hair shaft
      for (let hx = 5; hx < 5 + hairLen && hx < cols - 2; hx++) {
        set(hx, hy, "-");
      }
      // hair tip — bulbous end
      const tipX = 5 + hairLen;
      if (tipX < cols - 1) {
        set(tipX, hy, ">");
        // soft glow around tip
        if (get(tipX + 1, hy) === " " || get(tipX + 1, hy) === ".") {
          set(tipX + 1, hy, ".");
        }
      }

      // === WATER FLOWING INTO HAIR — droplets moving left along hair ===
      // 3 droplets per hair, spaced along the shaft, drifting left
      for (let d = 0; d < 3; d++) {
        const dPhase = (d / 3) + hi * 0.37;
        // position travels from near tip inward toward root
        const progress = ((t * 0.6 + dPhase) % 1.0); // 0=tip, 1=root junction
        const dropX = Math.round((5 + hairLen) - progress * hairLen);
        const dropY = hy;
        if (dropX >= 5 && dropX < cols && get(dropX, dropY) === "-") {
          set(dropX, dropY, "~");
        }
      }
    }

    // === OSMOTIC PRESSURE LABEL — small indicator inside root ===
    // A small pulse glyph at the root center every cycle
    const pulse = Math.floor(t * 2) % 4;
    const pulseChars = [".", "o", "O", "o"];
    const midY = Math.floor(rows / 2);
    set(2, midY, pulseChars[pulse]);

    return g.map(row => row.join("")).join("\n");
  }
};
