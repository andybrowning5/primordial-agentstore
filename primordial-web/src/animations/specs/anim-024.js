export default {
  id: 24,
  system: "Macrophage engulfing a bacterium",
  title: "Phagocytosis",
  caption: "An immune sentinel flows around its prey, sealing it within.",
  cols: 52,
  rows: 18,
  palette: "immune",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const PI = Math.PI;
    const tau = 2 * PI;

    // Engulf cycle: 0..1, period ~7s, smooth loop
    const cycle = (Math.sin(t * (tau / 7) - PI / 2) * 0.5 + 0.5); // 0=open, 1=engulfed

    // Macrophage center drifts slightly
    const mcx = cols * 0.47 + Math.sin(t * 0.4) * 1.5;
    const mcy = rows * 0.5  + Math.cos(t * 0.3) * 0.8;

    // Macrophage is an irregular blob defined by a radial boundary function
    // Base radii (x,y) grow as engulfment starts to "wrap"
    const mRx = cols * 0.30 + cycle * cols * 0.04;
    const mRy = rows  * 0.38 + cycle * rows  * 0.04;

    // Pseudopod direction: macrophage extends two arms toward the bacterium
    // Bacterium sits to the right of center initially, then gets pulled in
    const bactOffset = (1 - cycle) * cols * 0.18; // bacterium starts offset, pulled to 0
    const bactX = Math.round(mcx + bactOffset);
    const bactY = Math.round(mcy);

    // Helper: smooth step
    function smoothstep(e0, e1, x) {
      const t2 = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t2 * t2 * (3 - 2 * t2);
    }

    // Radial boundary of macrophage membrane at angle theta from center
    // Includes undulating lobes and a pseudopod arm toward bacterium
    function membraneR(theta) {
      // Base ellipse
      const cosT = Math.cos(theta), sinT = Math.sin(theta);
      const baseR = 1.0 / Math.sqrt((cosT / mRx) * (cosT / mRx) + (sinT / mRy) * (sinT / mRy));

      // Undulating surface waves (3 lobes, slow drift)
      const wave = 0.06 * Math.sin(3 * theta + t * 1.1)
                 + 0.04 * Math.sin(5 * theta - t * 0.7)
                 + 0.03 * Math.cos(7 * theta + t * 0.5);

      // Pseudopod extending toward bacterium (angle ~0, i.e. rightward)
      // The arm grows as cycle goes from 0→0.5, then retracts as membrane closes
      const pseudoAngle = 0.0; // rightward
      const angleDiff = Math.atan2(Math.sin(theta - pseudoAngle), Math.cos(theta - pseudoAngle));
      const armWidth = 0.55; // radians
      const armStrength = cycle < 0.5
        ? smoothstep(0, 0.5, cycle) * 0.38
        : smoothstep(1.0, 0.5, cycle) * 0.38;
      const armBulge = armStrength * Math.exp(-(angleDiff * angleDiff) / (2 * armWidth * armWidth));

      // Second pseudopod, mirror side
      const angleDiff2 = Math.atan2(Math.sin(theta - pseudoAngle + 0.6), Math.cos(theta - pseudoAngle + 0.6));
      const armBulge2 = armStrength * 0.7 * Math.exp(-(angleDiff2 * angleDiff2) / (2 * armWidth * armWidth));

      return baseR * (1 + wave) + armBulge + armBulge2;
    }

    // Draw macrophage interior fill and membrane
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = x - mcx;
        const dy = (y - mcy) * (cols / rows) * 0.9; // aspect correction
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.5) continue; // skip exact center
        const theta = Math.atan2(dy, dx);
        const mR = membraneR(theta);

        const ratio = dist / mR;

        if (ratio < 1.0) {
          // Interior cytoplasm — sparse stipple
          const hash = ((x * 7 + y * 13 + Math.floor(t * 3)) * 2654435761) >>> 0;
          const density = 0.10 + 0.05 * Math.sin(x * 0.4 + t * 0.6) * Math.cos(y * 0.5 - t * 0.4);
          if ((hash % 1000) / 1000 < density) {
            g[y][x] = (hash % 3 === 0) ? "." : ((hash % 5 === 0) ? ":" : "·"[0] || ".");
          }
        }

        // Membrane shell: thin band around ratio≈1
        const edge = Math.abs(ratio - 1.0);
        if (edge < 0.055) {
          // Choose membrane glyph based on angle & time for flowing look
          const flowPhase = theta * 2.5 + t * 1.4;
          const glyphIdx = Math.floor(((Math.sin(flowPhase) + 1) / 2) * 4);
          const glyphs = ["o", "O", "@", "0"];
          g[y][x] = glyphs[glyphIdx % 4];
        } else if (edge < 0.11) {
          if (g[y][x] === " ") g[y][x] = (Math.floor(theta * 3 + t) % 2 === 0) ? "~" : "-";
        }
      }
    }

    // Draw nucleus (darker blob, slightly off-center leftward)
    const nucX = mcx - mRx * 0.22;
    const nucY = mcy + mRy * 0.05;
    const nucRx = mRx * 0.28, nucRy = mRy * 0.32;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - nucX) / nucRx;
        const dy = (y - nucY) / nucRy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 0.85) {
          const hash2 = ((x * 11 + y * 17 + 3) * 2246822519) >>> 0;
          if ((hash2 % 1000) / 1000 < 0.22) g[y][x] = "*";
        }
        if (Math.abs(r - 1.0) < 0.14) {
          if (g[y][x] !== "@" && g[y][x] !== "O") g[y][x] = "+";
        }
      }
    }

    // Draw bacterium — small rod shape, only when not yet fully engulfed
    const bactVisible = 1 - smoothstep(0.80, 1.0, cycle);
    if (bactVisible > 0.01 && bactX >= 0 && bactX < cols && bactY >= 0 && bactY < rows) {
      const bactLen = 3; // half-length in x
      const bRot = t * 0.15; // slow tumble
      for (let i = -bactLen; i <= bactLen; i++) {
        const bx = Math.round(bactX + i * Math.cos(bRot));
        const by = Math.round(bactY + i * Math.sin(bRot) * 0.5);
        if (bx >= 0 && bx < cols && by >= 0 && by < rows) {
          g[by][bx] = (i === -bactLen || i === bactLen) ? ")" : (i === 0 ? "=" : "-");
        }
      }
      // Flagella — wiggly line trailing behind
      for (let f = 1; f <= 4; f++) {
        const fx = Math.round(bactX + (bactLen + f) * Math.cos(bRot));
        const fy = Math.round(bactY + (bactLen + f) * Math.sin(bRot) * 0.5
                   + Math.sin(t * 3 + f * 0.8) * 1.2);
        if (fx >= 0 && fx < cols && fy >= 0 && fy < rows && g[fy][fx] === " ") {
          g[fy][fx] = (f % 2 === 0) ? "~" : "`";
        }
      }
    }

    // When fully engulfed, show phagosome ring inside macrophage
    if (cycle > 0.85) {
      const pAlpha = smoothstep(0.85, 1.0, cycle);
      const pRx = mRx * 0.12 * pAlpha, pRy = mRy * 0.14 * pAlpha;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - mcx) / (pRx + 0.01);
          const dy = (y - mcy) / (pRy + 0.01);
          const r = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(r - 1.0) < 0.35) {
            const ph = Math.floor(t * 4 + dx + dy) % 2;
            g[y][x] = ph === 0 ? "o" : "O";
          }
        }
      }
    }

    // Ensure every row is exactly `cols` wide
    return g.map(row => row.join("").slice(0, cols).padEnd(cols)).join("\n");
  }
};
