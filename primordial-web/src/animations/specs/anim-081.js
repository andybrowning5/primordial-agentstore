export default {
  id: 81,
  system: "Seed germination",
  title: "Breaking Dormancy",
  caption: "A seed cracks open, roots reach down, a shoot climbs toward light.",
  cols: 50,
  rows: 18,
  palette: "photosynth",
  frame(t) {
    const cols = 50, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Animation cycles with a slow 20-second loop
    const cycle = (t % 20) / 20; // 0..1 over 20s

    // Phase 0.0–0.2: dormant seed pulsing
    // Phase 0.2–0.5: seed cracks open
    // Phase 0.5–0.8: root descends, shoot rises
    // Phase 0.8–1.0: leaves unfurl, full plant

    const phase = cycle;
    const cx = Math.floor(cols / 2);
    const seedRow = Math.floor(rows * 0.52); // seed sits just below center

    // Helper: safely set a cell
    function set(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        g[yi][xi] = ch;
      }
    }

    // Helper: draw a vertical line segment
    function vline(x, y0, y1, ch) {
      const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
      for (let y = Math.ceil(lo); y <= Math.floor(hi); y++) {
        set(x, y, ch);
      }
    }

    // ── SOIL LINE ──────────────────────────────────────────────────
    const soilRow = seedRow + 1;
    for (let x = 0; x < cols; x++) {
      const bump = Math.sin(x * 0.45 + t * 0.12) * 0.6;
      const sy = Math.round(soilRow + bump);
      set(x, sy, "~");
      if (sy + 1 < rows) set(x, sy + 1, "-");
    }

    // ── DORMANT SEED (phase 0..0.45) ──────────────────────────────
    // Seed shape: a small rounded oval
    const seedVis = phase < 0.45 ? 1 : Math.max(0, 1 - (phase - 0.45) / 0.1);
    if (seedVis > 0) {
      // Pulse scale so the seed breathes before germination
      const breathe = 1 + Math.sin(t * 1.8) * 0.04 * Math.max(0, 1 - phase * 3);
      const seedRx = 4 * breathe;
      const seedRy = 2.5 * breathe;

      for (let dy = -Math.ceil(seedRy) - 1; dy <= Math.ceil(seedRy) + 1; dy++) {
        for (let dx = -Math.ceil(seedRx) - 1; dx <= Math.ceil(seedRx) + 1; dx++) {
          const nx = dx / seedRx, ny = dy / seedRy;
          const r = nx * nx + ny * ny;
          const y = seedRow + dy, x = cx + dx;
          if (y < 0 || y >= rows || x < 0 || x >= cols) continue;
          if (r <= 0.55) {
            g[y][x] = (Math.abs(dx) < 1 && Math.abs(dy) < 1) ? "O" : "o";
          } else if (r <= 0.85) {
            g[y][x] = ":";
          } else if (r <= 1.0) {
            g[y][x] = ".";
          }
        }
      }

      // Seed crack — opens progressively from phase 0.2..0.45
      if (phase > 0.2) {
        const crackProgress = (phase - 0.2) / 0.25; // 0..1
        const crackLen = Math.floor(crackProgress * 4);
        for (let i = 0; i <= crackLen; i++) {
          const offset = Math.sin(i * 0.9) * 1.2;
          set(cx + i - 1, seedRow - 1 + Math.round(offset), "`");
          set(cx - i + 1, seedRow - 1 + Math.round(offset * 0.7), "`");
        }
        // Seed coat splitting: draw a gap
        if (crackProgress > 0.4) {
          const gapW = Math.floor(crackProgress * 3);
          for (let dx = -gapW; dx <= gapW; dx++) {
            set(cx + dx, seedRow - 2, " ");
          }
        }
      }
    }

    // ── ROOT (phase 0.35..0.85) ────────────────────────────────────
    if (phase > 0.35) {
      const rootProgress = Math.min(1, (phase - 0.35) / 0.5);
      const rootLen = rootProgress * (rows - soilRow - 1) * 0.85;

      // Main taproot grows straight down with subtle wave
      for (let i = 0; i <= rootLen; i++) {
        const y = soilRow + 1 + i;
        const wave = Math.sin(i * 0.6 + t * 0.4) * 0.8;
        set(cx + wave, y, "|");
      }

      // Lateral roots branch out as root matures
      if (rootProgress > 0.4) {
        const latProgress = (rootProgress - 0.4) / 0.6;
        const numLaterals = Math.floor(latProgress * 4);
        for (let n = 0; n < numLaterals; n++) {
          const latY = soilRow + 2 + Math.floor((n + 1) * rootLen * 0.2);
          const dir = n % 2 === 0 ? 1 : -1;
          const latLen = Math.floor(latProgress * 3 * (1 - n * 0.15));
          for (let l = 1; l <= latLen; l++) {
            set(cx + dir * l, latY + Math.floor(l * 0.3), dir > 0 ? ">" : "<");
          }
          // Fine root hairs
          if (latProgress > 0.6 && latLen > 1) {
            set(cx + dir * (latLen + 1), latY + Math.floor(latLen * 0.3), ".");
          }
        }
      }
    }

    // ── SHOOT / STEM (phase 0.38..0.85) ───────────────────────────
    if (phase > 0.38) {
      const shootProgress = Math.min(1, (phase - 0.38) / 0.47);
      const shootLen = shootProgress * (seedRow - 2);

      // Hypocotyl arch: shoot first arches then straightens
      const archFactor = Math.max(0, 1 - shootProgress * 1.8);
      for (let i = 0; i <= shootLen; i++) {
        const y = seedRow - 1 - i;
        const arch = Math.sin((i / Math.max(shootLen, 1)) * Math.PI) * archFactor * 3;
        const ch = i < 2 ? "+" : "|";
        set(cx + arch, y, ch);
      }

      // ── COTYLEDONS / LEAVES (phase 0.65..1.0) ─────────────────
      if (shootProgress > 0.5) {
        const leafProgress = (shootProgress - 0.5) / 0.5;
        const tipY = seedRow - 1 - Math.floor(shootLen);
        const tipX = cx + Math.sin((shootLen / Math.max(shootLen, 1)) * Math.PI) * archFactor * 3;

        // Two cotyledons unfurl symmetrically
        const leafSpread = leafProgress * 5;
        const leafDrop = leafProgress * 1.5;

        for (let side = -1; side <= 1; side += 2) {
          const lx = tipX + side * leafSpread;
          const ly = tipY + leafDrop;

          // Leaf outline — ellipse
          const lrx = leafProgress * 3.5;
          const lry = leafProgress * 2;
          for (let dy = -Math.ceil(lry); dy <= Math.ceil(lry); dy++) {
            for (let dx = -Math.ceil(lrx); dx <= Math.ceil(lrx); dx++) {
              const nx = dx / Math.max(lrx, 0.1), ny = dy / Math.max(lry, 0.1);
              const r = nx * nx + ny * ny;
              const lxi = Math.round(lx + dx), lyi = Math.round(ly + dy);
              if (lxi < 0 || lxi >= cols || lyi < 0 || lyi >= rows) continue;
              if (r <= 0.6) {
                g[lyi][lxi] = "*";
              } else if (r <= 0.9) {
                if (g[lyi][lxi] === " " || g[lyi][lxi] === ".") g[lyi][lxi] = "o";
              } else if (r <= 1.0) {
                if (g[lyi][lxi] === " ") g[lyi][lxi] = ".";
              }
            }
          }

          // Leaf midrib
          for (let i = 0; i <= Math.floor(leafProgress * 3); i++) {
            set(lx + side * i * 0.3, ly - i * 0.5, "-");
          }
        }

        // First true leaves emerge above cotyledons (phase > 0.85)
        if (leafProgress > 0.7) {
          const trueProgress = (leafProgress - 0.7) / 0.3;
          const trueY = tipY - 2 - trueProgress * 1.5;
          const trueSpread = trueProgress * 3;
          for (let side = -1; side <= 1; side += 2) {
            set(cx + side * trueSpread, Math.round(trueY), trueProgress > 0.5 ? "v" : ".");
            if (trueProgress > 0.3) set(cx + side * trueSpread * 0.5, Math.round(trueY + 0.5), ":");
          }
          // Growing tip
          set(cx, Math.round(trueY - 1), "^");
        }
      }
    }

    // ── AMBIENT SOIL PARTICLES (always) ──────────────────────────
    for (let n = 0; n < 8; n++) {
      const px = Math.floor(((n * 37 + Math.sin(t * 0.3 + n) * 3) % cols + cols) % cols);
      const py = soilRow + 2 + Math.floor(((n * 13 + Math.cos(t * 0.2 + n) * 2) % (rows - soilRow - 2) + (rows - soilRow - 2)) % (rows - soilRow - 2));
      if (py >= 0 && py < rows && px >= 0 && px < cols && g[py][px] === " ") {
        g[py][px] = ",";
      }
    }

    // ── LIGHT RAYS from top (phase > 0.6) ─────────────────────────
    if (phase > 0.6) {
      const rayIntensity = Math.min(1, (phase - 0.6) / 0.3);
      const numRays = Math.floor(rayIntensity * 5);
      for (let r = 0; r < numRays; r++) {
        const rx = cx - 6 + r * 3;
        const rayLen = Math.floor(rayIntensity * 4 * (1 + Math.sin(t * 0.5 + r) * 0.3));
        for (let i = 0; i < rayLen; i++) {
          const ry = 1 + i;
          const drift = Math.round(i * 0.3 * (r % 2 === 0 ? 1 : -1));
          if (ry < rows && rx + drift >= 0 && rx + drift < cols && g[ry][rx + drift] === " ") {
            g[ry][rx + drift] = i === 0 ? "|" : "'";
          }
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
