export default {
  id: 28,
  system: "Inflammation response",
  title: "Cytokine Storm",
  caption: "Cytokines flare outward as immune cells surge toward the wound.",
  cols: 52,
  rows: 18,
  palette: "blood",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- wound site: center-left, pulsing red core ---
    const wx = Math.floor(cols * 0.38);
    const wy = Math.floor(rows * 0.5);
    const pulse = Math.sin(t * 2.4) * 0.5 + 0.5;       // 0..1 slow throb
    const coreR = 1.8 + pulse * 1.2;                    // inner wound radius
    const swellR = 3.5 + pulse * 2.2;                   // vasodilation ring

    // Draw wound core + swelling halo
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = x - wx, dy = (y - wy) * 1.6;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r <= coreR) {
          g[y][x] = r < coreR * 0.55 ? "@" : "#";
        } else if (r <= swellR) {
          const ring = (r - coreR) / (swellR - coreR);  // 0..1 outward
          if (ring < 0.35) g[y][x] = "%";
          else if (ring < 0.65) g[y][x] = "O";
          else g[y][x] = "o";
        } else if (r <= swellR + 1.2) {
          g[y][x] = ".";
        }
      }
    }

    // --- cytokine signals: radial wave bursts from wound ---
    const waveCount = 3;
    for (let w = 0; w < waveCount; w++) {
      const wavePhase = (t * 1.1 + w * (1 / waveCount)) % 1.0;
      const waveR = swellR + 1.5 + wavePhase * (cols * 0.38);
      const waveWidth = 1.6 + wavePhase * 1.4;
      const fade = 1 - wavePhase;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = x - wx, dy = (y - wy) * 1.5;
          const r = Math.sqrt(dx * dx + dy * dy);
          const dist = Math.abs(r - waveR);
          if (dist < waveWidth && fade > 0.15) {
            const ang = Math.atan2(dy, dx);
            // dotted appearance along the wave ring
            const dotPattern = Math.floor((ang * 8 / Math.PI + t * 3) * 2) % 3;
            if (dotPattern !== 2 && g[y][x] === " ") {
              g[y][x] = dist < waveWidth * 0.4 ? "*" : ":";
            }
          }
        }
      }
    }

    // --- immune cells (neutrophils/macrophages): travel toward wound ---
    const cellCount = 10;
    for (let i = 0; i < cellCount; i++) {
      // Each cell starts at a random edge angle and moves inward
      const baseAngle = (i / cellCount) * Math.PI * 2 + i * 0.7;
      const speed = 0.55 + (i % 3) * 0.18;
      const startDist = cols * 0.48;
      const phase = ((t * speed + i * 0.37) % 1.0);
      const dist = startDist * (1 - phase);              // shrinks toward 0 (wound)

      const cx = wx + Math.cos(baseAngle) * dist;
      const cy2 = wy + Math.sin(baseAngle) * dist * 0.65;
      const xi = Math.round(cx);
      const yi = Math.round(cy2);

      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        // Macrophages are larger (even i), neutrophils smaller (odd i)
        const cellChar = i % 2 === 0 ? "0" : "o";
        if (g[yi][xi] === " " || g[yi][xi] === ":" || g[yi][xi] === ".") {
          g[yi][xi] = cellChar;
        }
        // trailing motion blur dot
        const tx2 = Math.round(cx + Math.cos(baseAngle) * 1.4);
        const ty2 = Math.round(cy2 + Math.sin(baseAngle) * 0.9);
        if (tx2 >= 0 && tx2 < cols && ty2 >= 0 && ty2 < rows && g[ty2][tx2] === " ") {
          g[ty2][tx2] = ",";
        }
      }
    }

    // --- fibrin threads: static lattice inside swell zone ---
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (g[y][x] !== " ") continue;
        const dx = x - wx, dy = (y - wy) * 1.6;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > swellR + 1.5 && r < swellR + 4.5) {
          // sparse diagonal threads
          const thread = (x * 3 + y * 5 + Math.floor(t * 0.5)) % 17;
          if (thread === 0) g[y][x] = "\\";
          else if (thread === 8) g[y][x] = "/";
          else if (thread === 4) g[y][x] = "|";
        }
      }
    }

    // --- right side: healthy tissue label region (sparse dots) ---
    for (let y = 1; y < rows - 1; y++) {
      for (let x = Math.floor(cols * 0.72); x < cols - 1; x++) {
        if (g[y][x] === " ") {
          const grain = (x * 11 + y * 7 + Math.floor(t * 2)) % 41;
          if (grain === 0) g[y][x] = "`";
          else if (grain === 20) g[y][x] = ".";
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
