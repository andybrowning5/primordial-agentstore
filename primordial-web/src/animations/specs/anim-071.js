export default {
  id: 71,
  system: "Centriole duplication",
  title: "Centriole Genesis",
  caption: "Nine-blade barrels birth daughters, rising perpendicular to time.",
  cols: 52,
  rows: 18,
  palette: "dna",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // helpers — clamp to grid
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function putSafe(x, y, ch) {
      if (x >= 0 && x < cols && y >= 0 && y < rows && g[y][x] === " ") g[y][x] = ch;
    }

    // Duplication cycle: 0..1 (slow oscillation ~16 s period)
    const cycle = (Math.sin(t * 0.39) * 0.5 + 0.5);  // 0=paired, 1=fully separated

    // ─── draw a centriole barrel (9-fold cross-section ring) ───────────────
    // cx,cy = centre; rx,ry = ellipse radii; phase = rotation offset; bright = fill char
    function drawBarrel(cx, cy, rx, ry, phase, bright) {
      const blades = 9;
      for (let i = 0; i < blades; i++) {
        const angle = (i / blades) * Math.PI * 2 + phase;
        const bx = cx + Math.cos(angle) * rx;
        const by = cy + Math.sin(angle) * ry;
        put(bx, by, bright);
        // triplet hint: two satellite dots at smaller radii
        const r2 = 0.72, r3 = 0.48;
        put(cx + Math.cos(angle) * rx * r2, cy + Math.sin(angle) * ry * r2, "o");
        put(cx + Math.cos(angle) * rx * r3, cy + Math.sin(angle) * ry * r3, ".");
      }
      // hub
      put(cx, cy, "+");
    }

    // ─── draw elongating procentriole (daughter) ──────────────────────────
    // grows as a vertical stack of partial rings from attachPoint upward
    function drawDaughter(ax, ay, length, phase) {
      const blades = 9, rx = 2.2, ry = 0.6;
      const layers = Math.max(1, Math.round(length));
      for (let layer = 0; layer < layers; layer++) {
        const progress = layer / Math.max(layers - 1, 1);
        const bright = layer === layers - 1 ? "@" : (layer === 0 ? "#" : "O");
        const fade = progress < 0.3 ? "o" : bright;
        for (let i = 0; i < blades; i++) {
          const angle = (i / blades) * Math.PI * 2 + phase + layer * 0.12;
          const bx = ax + Math.cos(angle) * rx;
          const by = ay - layer - Math.sin(angle) * ry;
          put(bx, by, fade);
        }
      }
    }

    // ─── layout ───────────────────────────────────────────────────────────
    // Two mother centrioles, side by side in cross-section
    // They separate slightly at peak of cycle
    const sepX = cycle * 5;
    const leftCX  = cols * 0.36 - sepX;
    const rightCX = cols * 0.64 + sepX;
    const motherY = rows * 0.62;

    // slow rotation of the barrel ring (visible tumble)
    const rot = t * 0.25;

    // draw left mother
    drawBarrel(leftCX, motherY, 3.8, 1.2, rot, "@");
    // draw right mother
    drawBarrel(rightCX, motherY, 3.8, 1.2, rot + 0.35, "@");

    // ─── daughter centrioles ──────────────────────────────────────────────
    // Daughter elongation: starts small, grows to ~5 layers over the cycle
    const daughterLen = cycle * 5.5 + 0.5;

    // left daughter — sprouts perpendicular (upward) from left mother
    drawDaughter(leftCX, motherY - 1.8, daughterLen, rot * 0.6);
    // right daughter
    drawDaughter(rightCX, motherY - 1.8, daughterLen, rot * 0.6 + 0.7);

    // ─── connecting linker between mother & procentriole ──────────────────
    // cartwheel spoke hint: faint line when daughter is very short
    if (cycle < 0.35) {
      const alpha = 1 - cycle / 0.35;
      if (alpha > 0.5) {
        putSafe(Math.round(leftCX),  Math.round(motherY - 2), ":");
        putSafe(Math.round(rightCX), Math.round(motherY - 2), ":");
      }
    }

    // ─── pericentriolar material (PCM) halo ───────────────────────────────
    // fuzzy cloud of dots around each mother, pulsing
    const pulse = Math.sin(t * 1.1) * 0.5 + 0.5;
    const pcmR = 5.5 + pulse * 1.2;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.38) {
      const jitter = Math.sin(angle * 7 + t * 0.7) * 0.8;
      const r = pcmR + jitter;
      putSafe(Math.round(leftCX  + Math.cos(angle) * r),
              Math.round(motherY + Math.sin(angle) * r * 0.45), "·");
      putSafe(Math.round(rightCX + Math.cos(angle) * r),
              Math.round(motherY + Math.sin(angle) * r * 0.45), "·");
    }
    // inner PCM ring
    for (let angle = 0; angle < Math.PI * 2; angle += 0.55) {
      const r2 = 4.2 + Math.sin(angle * 5 + t * 1.3) * 0.5;
      putSafe(Math.round(leftCX  + Math.cos(angle) * r2),
              Math.round(motherY + Math.sin(angle) * r2 * 0.38), "·");
      putSafe(Math.round(rightCX + Math.cos(angle) * r2),
              Math.round(motherY + Math.sin(angle) * r2 * 0.38), "·");
    }

    // ─── label ────────────────────────────────────────────────────────────
    // Small marker glyphs that pulse to show growth activity
    const marker = (Math.floor(t * 2) % 2 === 0) ? "*" : "o";
    putSafe(Math.round(leftCX),  Math.round(motherY - Math.round(daughterLen) - 1), marker);
    putSafe(Math.round(rightCX), Math.round(motherY - Math.round(daughterLen) - 1), marker);

    return g.map((row) => row.join("")).join("\n");
  }
};
