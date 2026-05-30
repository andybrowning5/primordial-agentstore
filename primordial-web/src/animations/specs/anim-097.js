export default {
  id: 97,
  system: "CRISPR cutting DNA",
  title: "Cas9 Cuts the Code",
  caption: "Guide RNA locks on; Cas9 shears the double helix in two.",
  cols: 52,
  rows: 18,
  palette: "dna",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const put = (x, y, ch) => {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    };

    // Cycle: 7s total
    //  0.00–0.25  helix rotates freely, Cas9 descends
    //  0.25–0.45  Cas9 clamps — helix slows to a halt
    //  0.45–0.62  CUT propagates outward from clamp site
    //  0.62–0.82  severed strands drift apart
    //  0.82–1.00  everything fades, reset
    const period = 7.0;
    const ph = (t % period) / period;   // 0..1

    // smooth step helper
    const sm = (a, b, x) => {
      const c = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return c * c * (3 - 2 * c);
    };

    const clampAmt   = sm(0.20, 0.42, ph);          // 0→1 as Cas9 closes
    const cutAmt     = sm(0.45, 0.62, ph) * (1 - sm(0.82, 1.00, ph));
    const driftAmt   = sm(0.62, 0.82, ph) * (1 - sm(0.82, 1.00, ph)) * 3.5;
    const resetFade  = 1 - sm(0.82, 1.00, ph);      // dims everything near reset

    // Helix rotation: full speed → slows → frozen during cut → resumes
    // We integrate speed over time to get a phase angle that doesn't jump.
    // Speed function: 1 before clamp, 0 during cut, 1 after reset.
    // Approximation: use t directly but modulate by (1-clampAmt).
    // Since helixSpeed isn't truly integrated, use a simpler approach:
    // run the helix at constant speed always but freeze its DISPLAY angle.
    const rawAngleOffset = t * 1.6;
    const frozenAngle    = (0.25 * period / period) * 1.6 * period; // angle at freeze point
    const helixOffset    = clampAmt < 1
      ? rawAngleOffset * (1 - clampAmt) + frozenAngle * clampAmt
      : frozenAngle;

    const cutCol   = Math.round(cols * 0.52);
    const cutSpread = cutAmt * (cols * 0.48);   // how far cut has propagated

    const wavelength = 13.0;
    const amplitude  = 3.5;
    const helixCy    = rows / 2;

    // --- Draw double helix ---
    for (let x = 0; x < cols; x++) {
      const distFromCut = Math.abs(x - cutCol);

      // Gap at cut site grows over time
      if (distFromCut < cutSpread - 0.5) continue;

      // Soft edge at the cut front
      const edgeFade = distFromCut < cutSpread
        ? distFromCut - (cutSpread - 1)
        : 1;
      if (edgeFade <= 0) continue;

      const angle = (x / wavelength) * Math.PI * 2 - helixOffset;

      // After cut, strands drift: left drifts up-left, right drifts down-right
      const side     = x < cutCol ? -1 : 1;
      const driftFrac = Math.min(1, distFromCut / 8);
      const driftY   = side * driftAmt * driftFrac * 0.7;
      const driftX   = side * driftAmt * driftFrac * 0.35;

      const xd = x + driftX;

      const y1 = helixCy + Math.sin(angle) * amplitude + driftY;
      const y2 = helixCy + Math.sin(angle + Math.PI) * amplitude + driftY;

      if (edgeFade > 0.4) {
        const tick = Math.floor(angle / (Math.PI * 0.5));
        const ch1  = tick % 3 === 0 ? "O" : "-";
        const ch2  = tick % 3 === 1 ? "O" : "-";
        put(xd, y1, ch1);
        put(xd, y2, ch2);

        // base-pair rungs when the two strands are close (near crossing)
        const sinVal = Math.abs(Math.sin(angle));
        if (sinVal < 0.22 && edgeFade > 0.7) {
          const mid1 = (y1 + helixCy) / 2;
          const mid2 = (y2 + helixCy) / 2;
          put(xd, mid1, ":");
          put(xd, helixCy, "|");
          put(xd, mid2, ":");
        }
      }
    }

    // --- Cut-site spark ---
    if (cutAmt > 0.02) {
      const flash = cutAmt * (0.7 + 0.3 * Math.sin(t * 18));
      const cy1   = Math.round(helixCy - amplitude * 0.55);
      const cy2   = Math.round(helixCy + amplitude * 0.55);
      const spark = flash > 0.65 ? "*" : flash > 0.35 ? "+" : ".";
      put(cutCol,     cy1,     spark);
      put(cutCol,     cy2,     spark);
      put(cutCol - 1, cy1,     "/");
      put(cutCol + 1, cy1,     "\\");
      put(cutCol - 1, cy2,     "\\");
      put(cutCol + 1, cy2,     "/");
      if (flash > 0.6) {
        put(cutCol, cy1 - 1, "^");
        put(cutCol, cy2 + 1, "v");
      }
      // Glow ring expanding outward
      const glowR = 1.5 + cutAmt * 4.0;
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const dist = Math.sqrt(dx * dx + (dy * 1.5) * (dy * 1.5));
          if (Math.abs(dist - glowR) < 0.9) {
            const py = Math.round(helixCy + dy);
            const px = cutCol + dx;
            if (px >= 0 && px < cols && py >= 0 && py < rows && g[py][px] === " ") {
              put(px, py, ".");
            }
          }
        }
      }
    }

    // --- Cas9 clamp (two arms, top and bottom) ---
    // Top arm descends from row 0; bottom arm ascends from row rows-1
    const cas9Left  = cutCol - 8;
    const cas9Right = cutCol + 8;
    const armGap    = 3.5;   // distance each arm keeps from helix center when clamped

    const topArmY = (1 - clampAmt) * (-3) + clampAmt * (helixCy - armGap);
    const botArmY = (1 - clampAmt) * (rows + 2) + clampAmt * (helixCy + armGap);

    // Top arm
    if (topArmY >= 0 && topArmY < rows) {
      const ty = Math.round(topArmY);
      for (let x = cas9Left; x <= cas9Right; x++) {
        const edge = (x === cas9Left || x === cas9Right);
        put(x, ty, edge ? "#" : "=");
      }
      if (ty + 1 < rows) {
        put(cas9Left,  ty + 1, "#");
        put(cas9Right, ty + 1, "#");
      }
    }

    // Bottom arm
    if (botArmY >= 0 && botArmY < rows) {
      const by = Math.round(botArmY);
      for (let x = cas9Left; x <= cas9Right; x++) {
        const edge = (x === cas9Left || x === cas9Right);
        put(x, by, edge ? "#" : "=");
      }
      if (by - 1 >= 0) {
        put(cas9Left,  by - 1, "#");
        put(cas9Right, by - 1, "#");
      }
    }

    // Guide RNA: wavy line between arms when clamped
    if (clampAmt > 0.25) {
      const grnaY  = Math.round(topArmY + 1.5);
      if (grnaY >= 0 && grnaY < rows) {
        for (let x = cas9Left + 1; x < cas9Right; x++) {
          const rel  = (x - cas9Left) / (cas9Right - cas9Left);
          const wave = Math.sin(rel * Math.PI * 4 - t * 5) * 0.5 + 0.5;
          const ch   = wave > 0.65 ? "~" : wave > 0.35 ? "." : " ";
          if (ch !== " " && g[grnaY][Math.round(x)] === " ") {
            put(x, grnaY, ch);
          }
        }
      }
    }

    // Cas9 label
    if (clampAmt > 0.1) {
      const lx = cas9Right + 1;
      const ly = Math.round(topArmY);
      const label = "Cas9";
      if (ly >= 0 && ly < rows && lx + label.length <= cols) {
        for (let i = 0; i < label.length; i++) put(lx + i, ly, label[i]);
      }
    }

    return g.map(row => row.join("")).join("\n");
  }
};
