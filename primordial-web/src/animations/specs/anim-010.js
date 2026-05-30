export default {
  id: 10,
  system: "Fluid mosaic membrane",
  title: "Fluid Mosaic",
  caption: "Proteins drift through a living bilayer of shifting phospholipids.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Membrane center row
    const midY = Math.floor(rows / 2);
    // Bilayer leaflet offsets from center
    const outerOff = 3;  // outer heads row offset from mid
    const innerOff = 1;  // inner heads row offset from mid (toward center)

    // ---- Undulating bilayer backbone ----
    // Each lipid head position has a small vertical wobble from a wave
    for (let x = 0; x < cols; x++) {
      const wave = Math.sin(x * 0.38 - t * 1.1) * 0.7
                 + Math.sin(x * 0.19 + t * 0.7) * 0.4;

      // Upper leaflet outer heads (phosphate)
      const uyO = Math.round(midY - outerOff + wave * 0.5);
      if (uyO >= 0 && uyO < rows) g[uyO][x] = "o";

      // Upper leaflet inner heads (just inside bilayer)
      const uyI = Math.round(midY - innerOff + wave * 0.3);
      if (uyI >= 0 && uyI < rows) g[uyI][x] = ".";

      // Lower leaflet inner heads
      const lyI = Math.round(midY + innerOff - wave * 0.3);
      if (lyI >= 0 && lyI < rows) g[lyI][x] = ".";

      // Lower leaflet outer heads
      const lyO = Math.round(midY + outerOff - wave * 0.5);
      if (lyO >= 0 && lyO < rows) g[lyO][x] = "o";

      // Hydrophobic tails fill the interior between inner heads
      // upper tail
      const tailTopY = Math.round(midY - innerOff + wave * 0.3) + 1;
      if (tailTopY >= 0 && tailTopY < rows && g[tailTopY][x] === " ") {
        g[tailTopY][x] = ((x + Math.floor(t * 3)) % 7 < 4) ? "|" : ":";
      }
      // lower tail
      const tailBotY = Math.round(midY + innerOff - wave * 0.3) - 1;
      if (tailBotY >= 0 && tailBotY < rows && g[tailBotY][x] === " ") {
        g[tailBotY][x] = ((x + Math.floor(t * 3)) % 7 < 4) ? "|" : ":";
      }
      // mid-bilayer (tails meeting)
      if (g[midY][x] === " ") {
        g[midY][x] = ((x * 3 + Math.floor(t * 2)) % 9 < 5) ? "~" : "-";
      }
    }

    // ---- Drifting transmembrane proteins ----
    // Each protein spans the full bilayer height and drifts laterally
    const proteinDefs = [
      // [phase, speed, width, symbol-top, symbol-body, symbol-bot]
      { ph: 0.0,  spd: 0.18, w: 3, top: "#", body: "H", bot: "#" },
      { ph: 2.1,  spd: 0.11, w: 2, top: "@", body: "=", bot: "@" },
      { ph: 4.5,  spd: 0.22, w: 3, top: "%", body: "X", bot: "%" },
      { ph: 6.9,  spd: 0.14, w: 2, top: "*", body: "I", bot: "*" },
    ];

    const memTop = midY - outerOff - 1;   // row just above upper outer heads
    const memBot = midY + outerOff + 1;   // row just below lower outer heads

    proteinDefs.forEach(({ ph, spd, w, top, body, bot }) => {
      // Protein center drifts across the bilayer horizontally
      const cx = Math.round(
        ((t * spd * cols + ph * cols * 0.16) % cols + cols) % cols
      );

      for (let dx = 0; dx < w; dx++) {
        const px = (cx + dx - Math.floor(w / 2) + cols) % cols;

        // Draw protein spanning from memTop to memBot
        for (let py = memTop; py <= memBot; py++) {
          if (py < 0 || py >= rows) continue;
          let ch;
          if (py === memTop || py === memBot) {
            ch = (dx === 0 || dx === w - 1) ? top : body;
          } else {
            ch = body;
          }
          g[py][px] = ch;
        }
      }
    });

    // ---- Peripheral / surface proteins (top & bottom) ----
    const periphDefs = [
      { ph: 1.2, spd: 0.09, side: "top", sym: "^" },
      { ph: 3.8, spd: 0.13, side: "top", sym: "^" },
      { ph: 5.3, spd: 0.08, side: "bot", sym: "v" },
      { ph: 0.7, spd: 0.15, side: "bot", sym: "v" },
    ];

    periphDefs.forEach(({ ph, spd, side, sym }) => {
      const cx = Math.round(
        ((t * spd * cols + ph * cols * 0.2) % cols + cols) % cols
      );
      const py = (side === "top") ? memTop - 1 : memBot + 1;
      if (py >= 0 && py < rows) {
        g[py][cx] = sym;
        const px2 = (cx + 1) % cols;
        g[py][px2] = sym;
      }
    });

    // ---- Cholesterol molecules nestled in tails ----
    const cholDefs = [
      { ph: 0.5,  spd: 0.07, off: -1 },
      { ph: 2.9,  spd: 0.10, off:  1 },
      { ph: 5.1,  spd: 0.06, off: -1 },
      { ph: 8.3,  spd: 0.09, off:  1 },
      { ph: 10.4, spd: 0.08, off: -1 },
    ];

    cholDefs.forEach(({ ph, spd, off }) => {
      const cx = Math.round(
        ((t * spd * cols + ph * cols * 0.17) % cols + cols) % cols
      );
      // Sit in the tail region
      const py = midY + off;
      if (py >= 0 && py < rows) g[py][cx] = "0";
    });

    return g.map(row => row.join("")).join("\n");
  }
};
