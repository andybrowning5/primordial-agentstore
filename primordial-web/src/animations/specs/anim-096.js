export default {
  id: 96,
  system: "Stem cell niche",
  title: "Stem Cell Niche",
  caption: "Stem cells nestle in their niche, pulsing as signals call them forth.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: safe set
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        if (g[yi][xi] === " " || ch === "@" || ch === "O" || ch === "#") {
          g[yi][xi] = ch;
        }
      }
    }

    // Helper: draw char with priority
    function putP(x, y, ch, priority) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        const cur = g[yi][xi];
        const rank = { " ": 0, ".": 1, ":": 1, "~": 2, "-": 2, "+": 3, "*": 3, "o": 4, "O": 5, "#": 6, "@": 7 };
        if ((rank[ch] || 0) >= (rank[cur] || 0) || priority) {
          g[yi][xi] = ch;
        }
      }
    }

    const cx = cols / 2;
    const cy = rows / 2;

    // --- Niche wall: elliptical boundary (extracellular matrix) ---
    const nw = cols * 0.44;
    const nh = rows * 0.42;
    for (let a = 0; a < 360; a += 2) {
      const rad = (a * Math.PI) / 180;
      const wx = cx + nw * Math.cos(rad);
      const wy = cy + nh * Math.sin(rad);
      // Pulse the wall slightly
      const pulse = 1 + 0.03 * Math.sin(t * 1.2 + rad * 2);
      const bx = cx + nw * pulse * Math.cos(rad);
      const by = cy + nh * pulse * Math.sin(rad);
      const wallChar = a % 18 === 0 ? "#" : (a % 6 === 0 ? "=" : "-");
      putP(bx, by, wallChar, false);
    }

    // --- Central niche anchor cell (large, slowly rotating) ---
    const anchorPulse = 1 + 0.12 * Math.sin(t * 0.7);
    const anchorRx = 3.8 * anchorPulse;
    const anchorRy = 2.2 * anchorPulse;
    for (let a = 0; a < 360; a += 3) {
      const rad = (a * Math.PI) / 180;
      const ax = cx + anchorRx * Math.cos(rad);
      const ay = cy + anchorRy * Math.sin(rad);
      putP(ax, ay, "@", true);
    }
    // Anchor nucleus
    putP(cx, cy, "O", true);
    putP(cx - 1, cy, "O", true);
    putP(cx + 1, cy, "O", true);
    putP(cx, cy - 1, "O", true);

    // --- Stem cells orbiting the niche anchor (4 cells) ---
    const numStemCells = 4;
    for (let i = 0; i < numStemCells; i++) {
      const baseAngle = (i / numStemCells) * Math.PI * 2;
      // Each stem cell orbits slowly with slight wobble
      const orbit = 8 + 1.5 * Math.sin(t * 0.5 + i * 1.3);
      const angle = baseAngle + t * 0.18 + i * 0.4;
      const scx = cx + orbit * Math.cos(angle);
      const scy = cy + (orbit * 0.55) * Math.sin(angle);

      // Stem cell body pulse
      const scPulse = 1 + 0.15 * Math.sin(t * 1.4 + i * 2.1);
      const scRx = 2.0 * scPulse;
      const scRy = 1.2 * scPulse;

      for (let a = 0; a < 360; a += 10) {
        const rad = (a * Math.PI) / 180;
        const ex = scx + scRx * Math.cos(rad);
        const ey = scy + scRy * Math.sin(rad);
        putP(ex, ey, "o", false);
      }
      // Stem cell nucleus
      putP(scx, scy, "*", false);

      // --- Signal lines from anchor to stem cells (dashed) ---
      const steps = 10;
      for (let s = 1; s < steps; s++) {
        const frac = s / steps;
        const lx = cx + (scx - cx) * frac;
        const ly = cy + (scy - cy) * frac;
        // Animated dash: only draw every other segment, offset by time
        const dashPhase = Math.floor(t * 4 + s) % 3;
        if (dashPhase === 0) putP(lx, ly, ":", false);
        else if (dashPhase === 1) putP(lx, ly, ".", false);
      }
    }

    // --- Differentiating cell: one stem cell breaking away ---
    const diffAngle = t * 0.22 + Math.PI * 0.25;
    const diffOrbit = 11 + 4 * Math.abs(Math.sin(t * 0.28));
    const dfx = cx + diffOrbit * Math.cos(diffAngle);
    const dfy = cy + (diffOrbit * 0.5) * Math.sin(diffAngle);
    // Differentiated cell is larger and has more structure
    const dfPulse = 1 + 0.08 * Math.sin(t * 2.0);
    const dfRx = 2.8 * dfPulse;
    const dfRy = 1.7 * dfPulse;
    for (let a = 0; a < 360; a += 8) {
      const rad = (a * Math.PI) / 180;
      const ex = dfx + dfRx * Math.cos(rad);
      const ey = dfy + dfRy * Math.sin(rad);
      putP(ex, ey, "O", false);
    }
    putP(dfx, dfy, "#", true);
    putP(dfx + 1, dfy, "+", false);
    putP(dfx - 1, dfy, "+", false);

    // --- Signaling molecules (small dots drifting outward from anchor) ---
    const numParticles = 12;
    for (let i = 0; i < numParticles; i++) {
      const pAngle = (i / numParticles) * Math.PI * 2 + t * 0.3 * (i % 2 === 0 ? 1 : -1);
      const pPhase = (t * 0.6 + i * 0.83) % 1;
      const pRadius = pPhase * nw * 0.85;
      const px = cx + pRadius * Math.cos(pAngle);
      const py = cy + (pRadius * 0.55) * Math.sin(pAngle);
      const pChar = pPhase < 0.3 ? "+" : (pPhase < 0.65 ? "." : "`");
      putP(px, py, pChar, false);
    }

    // --- Quiescent stem cell tucked near wall ---
    const qAngle = t * 0.08 + Math.PI * 1.6;
    const qOrbit = nw * 0.72;
    const qx = cx + qOrbit * Math.cos(qAngle);
    const qy = cy + qOrbit * 0.55 * Math.sin(qAngle);
    putP(qx, qy, "o", false);
    putP(qx + 1, qy, "o", false);
    putP(qx, qy - 1, ".", false);

    // --- Niche interior fill: sparse background texture ---
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        if (g[y][x] === " ") {
          const dx = (x - cx) / nw;
          const dy = (y - cy) / nh;
          if (dx * dx + dy * dy < 0.72) {
            const seed = (x * 17 + y * 31 + Math.floor(t * 2)) % 97;
            if (seed === 0) g[y][x] = "~";
            else if (seed === 5) g[y][x] = ".";
          }
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
