export default {
  id: 6,
  system: "Exocytosis",
  title: "Vesicle Release",
  caption: "A vesicle docks, fuses, and floods the cell's secrets outward.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- timing ---
    const period = 5.0;
    const phase = (t % period) / period; // 0..1 over each cycle

    // phase 0.00–0.35 : vesicle drifts up toward membrane
    // phase 0.35–0.55 : vesicle docks / membrane deforms (fusion)
    // phase 0.55–0.80 : cargo bursts outward into extracellular space
    // phase 0.80–1.00 : fade / reset

    // --- membrane: a horizontal band near the top ---
    const memY = 4; // row of the membrane
    // membrane thickness characters, deformed where vesicle docks
    const memCX = cols / 2; // fusion point x

    // vesicle position
    // starts near bottom-center, moves up
    const vStartY = rows - 4;
    const vEndY = memY + 1; // just below membrane
    let vesY, vesR, fuseAmt;

    if (phase < 0.35) {
      // drifting upward
      const p = phase / 0.35;
      vesY = vStartY - p * (vStartY - vEndY);
      vesR = 3.2;
      fuseAmt = 0;
    } else if (phase < 0.55) {
      // docking / fusion
      const p = (phase - 0.35) / 0.20;
      vesY = vEndY;
      vesR = 3.2 * (1 - 0.6 * p); // vesicle flattens as it merges
      fuseAmt = p; // 0..1
    } else if (phase < 0.80) {
      // fully fused, cargo released
      vesY = vEndY;
      vesR = 0;
      fuseAmt = 1;
    } else {
      // reset / fade
      const p = (phase - 0.80) / 0.20;
      vesY = vStartY * p + vEndY * (1 - p);
      vesR = 3.2 * p;
      fuseAmt = 1 - p;
    }

    const vesX = memCX;

    // --- draw membrane ---
    for (let x = 0; x < cols; x++) {
      const dist = Math.abs(x - memCX);
      // deform membrane upward near fusion point during docking
      const deform = fuseAmt > 0 && dist < 8
        ? Math.round(fuseAmt * 2 * Math.exp(-dist * dist / 10))
        : 0;

      const y0 = memY - deform;
      const y1 = memY + 1 - deform;

      // outer leaflet
      if (y0 >= 0 && y0 < rows) {
        const wave = Math.sin(t * 1.1 + x * 0.35) * 0.5;
        g[y0][x] = wave > 0 ? "=" : "-";
      }
      // inner leaflet
      if (y1 >= 0 && y1 < rows) {
        g[y1][x] = "~";
      }
    }

    // --- draw vesicle (only while it exists) ---
    if (vesR > 0.5) {
      const ry = vesR * 0.75;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - vesX) / vesR;
          const dy = (y - vesY) / ry;
          const r = Math.sqrt(dx * dx + dy * dy);
          const edge = Math.abs(r - 1);
          // shell of vesicle
          if (r <= 1.0 && edge < 0.15 && y > memY + 1) {
            g[y][x] = edge < 0.07 ? "O" : "o";
          } else if (r < 0.85 && y > memY + 1) {
            // interior cargo dots
            const pattern = (Math.floor(x * 3.7 + y * 2.3 + t * 0) % 7);
            if (pattern === 0) g[y][x] = "*";
            else if (pattern === 3) g[y][x] = ".";
          }
        }
      }
    }

    // --- cargo particles bursting outward ---
    if (fuseAmt > 0) {
      const burstProgress = phase < 0.55
        ? 0
        : phase < 0.80
          ? (phase - 0.55) / 0.25
          : 1.0;

      const numParticles = 14;
      for (let i = 0; i < numParticles; i++) {
        const angle = (i / numParticles) * Math.PI; // upper half only
        const speed = 0.5 + (i % 3) * 0.35;
        const dist = burstProgress * speed * (cols * 0.32);
        const px = Math.round(memCX + Math.cos(angle) * dist);
        const py = Math.round(memY - 1 - Math.abs(Math.sin(angle)) * dist * 0.5);

        if (px >= 0 && px < cols && py >= 0 && py < rows) {
          // trail
          const trailLen = 3;
          for (let tr = 1; tr <= trailLen; tr++) {
            const tFrac = tr / trailLen;
            const tpx = Math.round(memCX + Math.cos(angle) * dist * (1 - tFrac * 0.3));
            const tpy = Math.round(memY - 1 - Math.abs(Math.sin(angle)) * dist * (1 - tFrac * 0.3) * 0.5);
            if (tpx >= 0 && tpx < cols && tpy >= 0 && tpy < rows && g[tpy][tpx] === " ") {
              g[tpy][tpx] = tFrac < 0.4 ? "+" : ".";
            }
          }
          const chars = ["*", "o", ".", "+", ":"];
          g[py][px] = chars[i % chars.length];
        }
      }
    }

    // --- fusion pore: small opening at membrane center during fusion ---
    if (fuseAmt > 0.1 && fuseAmt < 1.0) {
      const poreW = Math.round(fuseAmt * 4);
      for (let dx = -poreW; dx <= poreW; dx++) {
        const px = Math.round(memCX + dx);
        if (px >= 0 && px < cols) {
          if (memY >= 0 && memY < rows) g[memY][px] = " ";
          if (memY + 1 >= 0 && memY + 1 < rows) g[memY + 1][px] = " ";
        }
      }
      // pore lips
      const lipL = Math.round(memCX - poreW - 1);
      const lipR = Math.round(memCX + poreW + 1);
      if (lipL >= 0 && lipL < cols && memY < rows) g[memY][lipL] = "(";
      if (lipR >= 0 && lipR < cols && memY < rows) g[memY][lipR] = ")";
    }

    // --- extracellular label dots (top rows atmosphere) ---
    for (let x = 0; x < cols; x++) {
      const atmo = (Math.floor(x * 5.1 + t * 0.4)) % 23;
      if (atmo === 0 && g[1][x] === " ") g[1][x] = ".";
      if (atmo === 11 && g[2][x] === " ") g[2][x] = "`";
    }

    // --- cytoplasm texture (below membrane) ---
    for (let y = memY + 2; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (g[y][x] === " ") {
          const cyto = (Math.floor(x * 4.3 + y * 7.1 + t * 0.3)) % 29;
          if (cyto === 0) g[y][x] = ".";
          else if (cyto === 14) g[y][x] = "`";
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
