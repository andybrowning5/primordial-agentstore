export default {
  id: 19,
  system: "Enzyme-substrate lock and key",
  title: "Active Site Binding",
  caption: "Substrate drifts in, clicks home, transforms, then slips free.",
  cols: 52,
  rows: 18,
  palette: "dna",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Cycle: 0..1 over ~6 seconds
    const period = 6.0;
    const phase = (t % period) / period; // 0..1

    // Sub-phases:
    // 0.00..0.20 — substrate drifting toward enzyme
    // 0.20..0.45 — docking / induced fit (enzyme closes around substrate)
    // 0.45..0.65 — catalysis pulse (internal activity)
    // 0.65..0.80 — product release / enzyme opens
    // 0.80..1.00 — enzyme relaxes, product drifts away

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function smoothstep(a, b, x) {
      const t2 = clamp((x - a) / (b - a), 0, 1);
      return t2 * t2 * (3 - 2 * t2);
    }

    // ── Enzyme body (left-center) ─────────────────────────────────────
    // Enzyme is a large C-shaped blob with an active-site pocket on the right side.
    // During docking the mouth narrows; during release it opens.

    const ecx = 18;          // enzyme center x
    const ecy = rows / 2;    // enzyme center y
    const erx = 9.5;         // half-width
    const ery = 7.0;         // half-height

    // Mouth opening angle (right side gap) — widens when open, narrows when substrate inside
    const mouthOpen = (() => {
      if (phase < 0.20) return 1.0;                            // fully open, waiting
      if (phase < 0.45) return 1.0 - smoothstep(0.20, 0.40, phase); // closing
      if (phase < 0.65) return 0.0;                            // fully closed
      if (phase < 0.80) return smoothstep(0.65, 0.80, phase); // opening
      return 1.0;
    })();

    // Enzyme conformational "squeeze" wobble during catalysis
    const catalysisPulse = phase >= 0.45 && phase < 0.65
      ? Math.sin((phase - 0.45) / 0.20 * Math.PI * 4) * 0.12
      : 0;

    const erxE = erx * (1 + catalysisPulse);
    const eryE = ery * (1 - catalysisPulse * 0.5);

    // Draw enzyme: ellipse shell with gap on right side for the active-site pocket
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - ecx) / erxE;
        const dy = (y - ecy) / eryE;
        const r = Math.sqrt(dx * dx + dy * dy);

        // Angle from enzyme center (0 = right)
        const ang = Math.atan2(dy, dx); // -π..π
        // Mouth gap on right side: angle range ±mouthGap
        const mouthGap = 0.55 * mouthOpen; // radians

        const inMouth = Math.abs(ang) < mouthGap && dx > 0;

        if (inMouth) continue; // leave gap open for mouth

        const shell = Math.abs(r - 1.0);
        if (shell < 0.09) {
          g[y][x] = "#";
        } else if (shell < 0.22) {
          g[y][x] = (Math.floor(x * 3 + y * 5 + t * 2) % 5 === 0) ? "%" : "o";
        } else if (r < 0.88) {
          // Interior — sparse texture that pulses during catalysis
          const interior = (x * 7 + y * 11 + Math.floor(t * 3)) % 17;
          if (phase >= 0.45 && phase < 0.65) {
            if (interior === 0) g[y][x] = "*";
            else if (interior === 3) g[y][x] = "+";
          } else {
            if (interior === 0) g[y][x] = ".";
          }
        }
      }
    }

    // ── Active site pocket labels ──────────────────────────────────────
    // Small notch markers inside the pocket mouth
    if (mouthOpen > 0.3) {
      const notchY1 = Math.round(ecy - 1.5);
      const notchY2 = Math.round(ecy + 1.5);
      const notchX  = Math.round(ecx + erxE * 0.92);
      if (notchY1 >= 0 && notchY1 < rows && notchX >= 0 && notchX < cols) g[notchY1][notchX] = "(";
      if (notchY2 >= 0 && notchY2 < rows && notchX >= 0 && notchX < cols) g[notchY2][notchX] = "(";
    }

    // ── Substrate molecule ─────────────────────────────────────────────
    // Small compact shape (the "key"). Travels from right → active site, then leaves as product.

    // Position over cycle
    const startX = cols - 6;
    const dockX  = Math.round(ecx + erxE * 0.85); // just inside the mouth
    const exitX  = cols - 4;

    let subX, subY, subAlpha;
    if (phase < 0.20) {
      // Drifting in
      const p = smoothstep(0, 0.20, phase);
      subX = startX - (startX - dockX) * p;
      subY = ecy + Math.sin(phase * Math.PI * 3) * 1.5;
      subAlpha = 1.0;
    } else if (phase < 0.65) {
      // Docked inside enzyme
      subX = dockX - smoothstep(0.20, 0.40, phase) * 2.5;
      subY = ecy;
      subAlpha = 1.0;
    } else if (phase < 0.80) {
      // Product exiting
      const p = smoothstep(0.65, 0.80, phase);
      subX = (dockX - 2.5) + (exitX - (dockX - 2.5)) * p;
      subY = ecy - p * 2.0;
      subAlpha = 1.0;
    } else {
      // Product drifted away, fade
      subX = exitX + (phase - 0.80) * cols * 0.6;
      subY = ecy - 2.0 - (phase - 0.80) * 3;
      subAlpha = 1.0 - smoothstep(0.80, 1.0, phase);
    }

    // Substrate shape: small key-like pattern
    const subChars = phase >= 0.45 && phase < 0.80
      ? ["*", "0", "*"]   // activated / product
      : ["o", "O", "o"];  // normal substrate

    if (subAlpha > 0.1) {
      const sx = Math.round(subX);
      const sy = Math.round(subY);
      const offsets = [[-1, 0], [0, 0], [1, 0], [0, -1], [0, 1]];
      const subGlyphs = [subChars[0], subChars[1], subChars[0], "-", "-"];
      offsets.forEach(([dx, dy], i) => {
        const px = sx + dx, py = sy + dy;
        if (px >= 0 && px < cols && py >= 0 && py < rows) {
          // Only draw if not obscured by closed enzyme body
          if (g[py][px] === " " || g[py][px] === ".") {
            g[py][px] = subGlyphs[i];
          }
        }
      });
    }

    // ── Approach arrow / bond sparks ──────────────────────────────────
    if (phase < 0.20) {
      // Dashed approach trail
      const p = phase / 0.20;
      const trailEnd = Math.round(subX);
      const trailStart = Math.round(startX + 2);
      for (let x = trailEnd + 2; x <= trailStart; x += 2) {
        const ty = Math.round(ecy + Math.sin((x / cols) * Math.PI * 3) * 1.5);
        if (ty >= 0 && ty < rows && x < cols && g[ty][x] === " ") {
          g[ty][x] = (Math.floor(t * 4 + x) % 3 === 0) ? "-" : ".";
        }
      }
    }

    // During catalysis: energy sparks radiate from active site
    if (phase >= 0.45 && phase < 0.65) {
      const sparkT = (phase - 0.45) / 0.20; // 0..1
      const numSparks = 6;
      for (let i = 0; i < numSparks; i++) {
        const ang = (i / numSparks) * Math.PI * 2 + t * 2.5;
        const dist = sparkT * 3.5;
        const spx = Math.round(ecx + Math.cos(ang) * dist * 1.8);
        const spy = Math.round(ecy + Math.sin(ang) * dist);
        if (spx >= 0 && spx < cols && spy >= 0 && spy < rows && g[spy][spx] === " ") {
          g[spy][spx] = (i % 2 === 0) ? "*" : "+";
        }
      }
    }

    // ── Labels ─────────────────────────────────────────────────────────
    // "E" label on enzyme body
    const labelX = Math.round(ecx - 2), labelY = Math.round(ecy);
    if (labelY >= 0 && labelY < rows && labelX >= 0 && labelX < cols) {
      g[labelY][labelX] = "E";
    }

    // "S" or "P" label on substrate/product
    if (subAlpha > 0.3) {
      const lx = Math.round(subX), ly = Math.round(subY) - 2;
      if (lx >= 0 && lx < cols && ly >= 0 && ly < rows && g[ly][lx] === " ") {
        g[ly][lx] = phase >= 0.65 ? "P" : "S";
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
