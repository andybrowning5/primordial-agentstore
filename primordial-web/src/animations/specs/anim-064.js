export default {
  id: 64,
  system: "Mitochondrion cristae",
  title: "Cristae in Motion",
  caption: "Inner membrane folds pulse as ATP synthase spins in the dark.",
  cols: 52,
  rows: 18,
  palette: "energy",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cx = cols / 2;
    const cy = rows / 2;
    const rx = cols * 0.42;
    const ry = rows * 0.44;

    // Draw outer mitochondrial membrane (oval)
    for (let angle = 0; angle < Math.PI * 2; angle += 0.025) {
      const x = Math.round(cx + rx * Math.cos(angle));
      const y = Math.round(cy + ry * Math.sin(angle));
      if (x >= 0 && x < cols && y >= 0 && y < rows) {
        g[y][x] = "@";
      }
    }

    // Draw inner membrane outline (slightly smaller oval), breathing
    const breathe = 0.96 + 0.04 * Math.sin(t * 1.1);
    const irx = rx * 0.82 * breathe;
    const iry = ry * 0.82 * breathe;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.03) {
      const x = Math.round(cx + irx * Math.cos(angle));
      const y = Math.round(cy + iry * Math.sin(angle));
      if (x >= 0 && x < cols && y >= 0 && y < rows) {
        if (g[y][x] === " ") g[y][x] = "o";
      }
    }

    // Fill interior with sparse matrix dots
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const dx = (x - cx) / irx;
        const dy = (y - cy) / iry;
        if (dx * dx + dy * dy < 0.72) {
          if ((x * 5 + y * 7 + 3) % 17 === 0 && g[y][x] === " ") {
            g[y][x] = ".";
          }
        }
      }
    }

    // Cristae: finger-like folds protruding inward from the inner membrane
    // They alternate left and right and gently wave
    const cristaCount = 5;
    for (let i = 0; i < cristaCount; i++) {
      const phase = (i / cristaCount) * Math.PI * 2;
      // Vertical position for each crista along the y-axis of the oval
      const cristaFrac = (i + 1) / (cristaCount + 1); // 0..1
      const cristaY = Math.round(cy + iry * (cristaFrac * 1.6 - 0.8) * 0.9);

      if (cristaY < 1 || cristaY >= rows - 1) continue;

      // How far the inner membrane reaches horizontally at this y
      const normY = (cristaY - cy) / iry;
      const horizReach = Math.sqrt(Math.max(0, 1 - normY * normY));
      const innerX = irx * horizReach;

      // Cristae alternate left/right
      const fromLeft = i % 2 === 0;
      const wave = Math.sin(t * 1.4 + phase) * 1.5;
      const cristaLen = Math.round(innerX * 0.55 + wave);

      const startX = fromLeft
        ? Math.round(cx - innerX + 1)
        : Math.round(cx + innerX - cristaLen - 1);

      // Draw the crista shaft
      for (let dx = 0; dx < cristaLen; dx++) {
        const px = fromLeft ? startX + dx : startX + dx;
        if (px >= 1 && px < cols - 1) {
          // Undulate the crista slightly in y
          const undulate = Math.round(Math.sin(t * 1.8 + phase + dx * 0.4) * 0.7);
          const py = cristaY + undulate;
          if (py >= 1 && py < rows - 1 && g[py][px] === " " || g[py][px] === ".") {
            const distFrac = dx / Math.max(1, cristaLen - 1);
            g[py][px] = distFrac > 0.85 ? "o" : "=";
          }
          // Crista edge (cap)
          if (dx === cristaLen - 1) {
            const py2 = cristaY + Math.round(Math.sin(t * 1.8 + phase + dx * 0.4) * 0.7);
            if (py2 - 1 >= 1 && g[py2 - 1][px] === " ") g[py2 - 1][px] = "|";
            if (py2 + 1 < rows - 1 && g[py2 + 1][px] === " ") g[py2 + 1][px] = "|";
          }
        }
      }
    }

    // ATP synthase particles: small blobs traveling along cristae tips
    const atpCount = 6;
    for (let i = 0; i < atpCount; i++) {
      const phase = (i / atpCount) * Math.PI * 2;
      // Orbit around the inner membrane perimeter
      const orbitAngle = t * 0.7 + phase;
      const orbitR = 0.78;
      const ax = Math.round(cx + irx * orbitR * Math.cos(orbitAngle));
      const ay = Math.round(cy + iry * orbitR * Math.sin(orbitAngle));
      if (ax >= 1 && ax < cols - 1 && ay >= 1 && ay < rows - 1) {
        const pulse = Math.sin(t * 3.0 + phase) > 0.3;
        if (g[ay][ax] === " " || g[ay][ax] === ".") {
          g[ay][ax] = pulse ? "*" : "o";
        }
      }
    }

    // Proton gradient dots drifting across the matrix
    const protonCount = 8;
    for (let i = 0; i < protonCount; i++) {
      const phase = (i / protonCount) * Math.PI * 2;
      // Move radially inward/outward with a sinusoidal pulse
      const drift = (t * 0.5 + phase) % (Math.PI * 2);
      const r = 0.35 + 0.3 * Math.abs(Math.sin(drift));
      const angle = phase + t * 0.3;
      const px = Math.round(cx + irx * r * Math.cos(angle));
      const py = Math.round(cy + iry * r * Math.sin(angle));
      if (px >= 1 && px < cols - 1 && py >= 1 && py < rows - 1) {
        if (g[py][px] === " " || g[py][px] === ".") {
          g[py][px] = "+";
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
