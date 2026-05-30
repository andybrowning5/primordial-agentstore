export default {
  id: 83,
  system: "Jellyfish pulse",
  title: "Bell & Drift",
  caption: "A translucent bell contracts and blooms, trailing silk through the deep.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Pulse cycle: bell expands and contracts rhythmically
    const pulse = Math.sin(t * 1.8) * 0.5 + 0.5;   // 0=contracted, 1=expanded
    const slowDrift = Math.sin(t * 0.4) * 0.5 + 0.5;

    // Bell center position (gentle vertical bob)
    const cx = Math.floor(cols / 2 + Math.sin(t * 0.5) * 4);
    const bellTop = Math.floor(2 + Math.sin(t * 0.7) * 1.5);

    // Bell dimensions pulse
    const bellW = Math.floor(9 + pulse * 6);   // half-width
    const bellH = Math.floor(4 + pulse * 3);   // height of dome

    // --- Draw dome (upper bell) ---
    // Dome is a half-ellipse
    for (let x = cx - bellW; x <= cx + bellW; x++) {
      if (x < 0 || x >= cols) continue;
      const dx = (x - cx) / (bellW || 1);
      const domeH = Math.floor(bellH * Math.sqrt(Math.max(0, 1 - dx * dx)));
      const topY = bellTop + bellH - domeH;
      const botY = bellTop + bellH;

      for (let y = topY; y <= botY; y++) {
        if (y < 0 || y >= rows) continue;
        const isTop = y === topY;
        const isBot = y === botY;
        const isEdge = Math.abs(x - (cx - bellW)) < 1 || Math.abs(x - (cx + bellW)) < 1;

        if (isTop || isEdge) {
          g[y][x] = "@";
        } else if (y === topY + 1 || y === botY - 1) {
          g[y][x] = "o";
        } else if (isBot) {
          // bell rim — dashes pulsing to dots on contraction
          g[y][x] = pulse < 0.3 ? "-" : "~";
        } else {
          // interior: shimmering radial texture
          const phase = Math.floor(t * 4 + dx * 3 + (y - topY) * 2);
          if (phase % 7 === 0) g[y][x] = ":";
          else if (phase % 11 === 0) g[y][x] = ".";
          else g[y][x] = " ";
        }
      }
    }

    // --- Rim decoration: scalloped edge ---
    const rimY = bellTop + bellH;
    if (rimY >= 0 && rimY < rows) {
      for (let x = cx - bellW + 1; x <= cx + bellW - 1; x++) {
        if (x < 0 || x >= cols) continue;
        const scallop = Math.sin((x - cx) * 0.6 + t * 2.2);
        if (scallop > 0.5) g[rimY][x] = "v";
        else if (scallop > 0.0) g[rimY][x] = "~";
        else g[rimY][x] = "-";
      }
    }

    // --- Oral arms: short thick arms just below rim center ---
    const armBaseY = rimY + 1;
    const numArms = 4;
    for (let a = 0; a < numArms; a++) {
      const armOffset = (a - (numArms - 1) / 2) * Math.floor(bellW * 0.45);
      const armX = cx + Math.floor(armOffset);
      const armLen = Math.floor(2 + pulse * 2 + Math.sin(t * 2 + a * 1.2) * 1);
      const armWave = Math.sin(t * 2.5 + a * 0.9) * 1.5;
      for (let i = 0; i < armLen; i++) {
        const ay = armBaseY + i;
        const ax = armX + Math.round(armWave * (i / (armLen || 1)));
        if (ax >= 0 && ax < cols && ay >= 0 && ay < rows) {
          g[ay][ax] = i === 0 ? "O" : "o";
        }
      }
    }

    // --- Trailing tentacles ---
    const numTentacles = 8;
    for (let n = 0; n < numTentacles; n++) {
      // Spread tentacles across bell width
      const spread = (n / (numTentacles - 1)) * 2 - 1;  // -1..1
      const txBase = cx + Math.round(spread * bellW * 0.88);
      const tentLen = Math.floor(5 + pulse * 3 + n % 3);
      for (let i = 0; i < tentLen; i++) {
        const ty = rimY + 1 + i;
        // Each tentacle sways with its own phase
        const sway = Math.sin(t * 1.4 + n * 0.8 + i * 0.25) * (1.5 + i * 0.2);
        const tx = txBase + Math.round(sway);
        if (tx >= 0 && tx < cols && ty >= 0 && ty < rows) {
          const ch = i === 0 ? "|" : (i % 3 === 0 ? ":" : ".");
          g[ty][tx] = ch;
        }
      }
    }

    // --- Bioluminescent sparkle (a few random-looking but deterministic glints) ---
    // Seed glints based on t quantized to slow steps, placed near the bell
    const step = Math.floor(t * 3);
    for (let s = 0; s < 6; s++) {
      const gx = cx - bellW + 1 + ((step * 7 + s * 13) % Math.max(1, (bellW * 2 - 2)));
      const gy = bellTop + 1 + ((step * 5 + s * 11) % Math.max(1, bellH - 1));
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows && g[gy][gx] === " ") {
        g[gy][gx] = "*";
      }
    }

    // Pad each row to exactly cols characters
    return g.map(row => row.join("").padEnd(cols, " ").slice(0, cols)).join("\n");
  }
};
