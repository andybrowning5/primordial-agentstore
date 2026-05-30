export default {
  id: 92,
  system: "Peristalsis in the gut",
  title: "Gut Wave",
  caption: "Rhythmic contractions push a bolus through the living tube.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cy = rows / 2;
    // Tube half-height at rest
    const baseR = rows * 0.28;
    // Bolus center travels along the tube, looping every ~6s
    const bolusPeriod = 6.0;
    const bolusFrac = (t % bolusPeriod) / bolusPeriod; // 0..1
    const bolusCX = bolusFrac * cols;

    // For each column, compute the tube wall radius (peristaltic squeeze)
    for (let x = 0; x < cols; x++) {
      // Peristaltic wave: a travelling sine wave that squeezes toward the bolus
      const dist = x - bolusCX;
      // Ahead of bolus: slight dilation; behind: contracting
      const wave1 = Math.sin((x / cols) * Math.PI * 6 - t * 2.2) * 0.18;
      // Additional squeeze near the bolus itself
      const bolusSqueeze = Math.exp(-0.5 * (dist * dist) / 9) * 0.55;
      const r = Math.max(1.5, baseR * (1 - bolusSqueeze + wave1));

      // Top wall char
      const topY = Math.round(cy - r);
      const botY = Math.round(cy + r);

      if (topY >= 0 && topY < rows) {
        // Vary wall char by wave phase to give shimmering motion
        const phase = Math.sin((x * 0.5) - t * 2.2 + 1.0);
        g[topY][x] = phase > 0.4 ? "=" : (phase > -0.2 ? "-" : "~");
      }
      if (botY >= 0 && botY < rows) {
        const phase = Math.sin((x * 0.5) - t * 2.2 - 1.0);
        g[botY][x] = phase > 0.4 ? "=" : (phase > -0.2 ? "-" : "~");
      }

      // Fill tube lumen between walls
      const innerTop = topY + 1;
      const innerBot = botY - 1;
      for (let y = innerTop; y <= innerBot; y++) {
        if (y < 0 || y >= rows) continue;
        const dy = y - cy;
        const nearCenter = Math.abs(dy) < r * 0.35;

        // Bolus: a dense blob traveling along the tube
        const bdx = x - bolusCX;
        const bdy = dy;
        const bolusDist2 = (bdx * bdx) / 9 + (bdy * bdy) / (baseR * baseR * 0.18);
        if (bolusDist2 < 0.8) {
          if (bolusDist2 < 0.2) g[y][x] = "O";
          else if (bolusDist2 < 0.5) g[y][x] = "o";
          else g[y][x] = ".";
          continue;
        }

        // Mucus flow lines — travel with the wave
        const flowPhase = ((x * 1.3 - t * 4.5) % cols + cols) % cols;
        if (nearCenter && flowPhase < cols * 0.07) {
          g[y][x] = ">";
        } else {
          // Sparse lumen fill for depth
          const lumenNoise = (x * 7 + y * 13 + Math.floor(t * 3)) % 23;
          if (lumenNoise === 0) g[y][x] = ".";
          else if (lumenNoise === 1 && nearCenter) g[y][x] = ":";
        }
      }

      // Outer muscle layer (circular muscle): one char beyond wall
      const musTop = topY - 1;
      const musBot = botY + 1;
      const musclePhase = Math.sin(x * 0.4 - t * 2.2);
      const musChar = musclePhase > 0.3 ? "#" : (musclePhase > -0.3 ? "%" : "@");
      if (musTop >= 0 && musTop < rows) g[musTop][x] = musChar;
      if (musBot >= 0 && musBot < rows) g[musBot][x] = musChar;
    }

    // Left and right tube openings — vertical mouth chars
    for (let y = 0; y < rows; y++) {
      const dy = y - cy;
      if (Math.abs(dy) <= baseR + 1) {
        if (g[y][0] === " ") g[y][0] = "|";
        if (g[y][cols - 1] === " ") g[y][cols - 1] = "|";
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
