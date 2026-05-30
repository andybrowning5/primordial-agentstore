export default {
  id: 30,
  system: "Natural killer cell strike",
  title: "NK Cell Strike",
  caption: "A killer cell docks, punches pores, and bursts its prey.",
  cols: 52,
  rows: 18,
  palette: "immune",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: safe grid write
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }

    // Phase logic: 0=approach, 1=contact, 2=perforate, 3=lysis
    // Full cycle ~8 seconds
    const cycle = 8.0;
    const phase = (t % cycle) / cycle; // 0..1

    // --- Target cell (right-center, fixed) ---
    const tcx = cols * 0.62;
    const tcy = rows * 0.5;
    const trx = cols * 0.16;
    const try_ = rows * 0.38;

    // Target cell pulses and deforms during lysis phase
    const lysis = Math.max(0, (phase - 0.72) / 0.28); // 0..1 during last 28%
    const targetPulse = 1 + 0.06 * Math.sin(t * 4.1);
    const targetDeform = 1 + lysis * 0.4 * Math.sin(t * 7 + 1.2);

    // Draw target cell outline
    for (let angle = 0; angle < Math.PI * 2; angle += 0.06) {
      const rx2 = trx * targetPulse * (1 + lysis * 0.15 * Math.cos(angle * 3));
      const ry2 = try_ * targetDeform * (1 + lysis * 0.1 * Math.sin(angle * 2));
      const ex = tcx + Math.cos(angle) * rx2;
      const ey = tcy + Math.sin(angle) * ry2;
      // outer glow
      const outerCh = lysis > 0.5 ? "~" : "o";
      put(ex + Math.cos(angle) * 0.8, ey + Math.sin(angle) * 0.8, outerCh);
      put(ex, ey, "@");
    }

    // Target cell interior fill
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - tcx) / trx;
        const dy = (y - tcy) / try_;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 0.88) {
          // nucleus (inner circle)
          const ndx = (x - tcx) / (trx * 0.38);
          const ndy = (y - tcy) / (try_ * 0.38);
          const nr = Math.sqrt(ndx * ndx + ndy * ndy);
          if (nr < 1.0) {
            if (nr > 0.82) {
              g[y][x] = lysis > 0.3 ? "%" : "O";
            } else {
              const tick = Math.floor(t * 3 + x * 0.7 + y * 1.1) % 17;
              g[y][x] = tick === 0 ? "*" : (lysis > 0.4 ? "," : ".");
            }
          } else {
            // cytoplasm
            const tick2 = Math.floor(t * 2 + x * 1.3 + y * 0.9) % 19;
            if (g[y][x] === " ") {
              g[y][x] = tick2 === 0 ? "+" : (lysis > 0.5 ? "~" : " ");
            }
          }
        }
      }
    }

    // --- NK cell (approaches from left) ---
    // Position: moves from far left into contact by phase ~0.4
    const approachEnd = 0.38;
    const contactStart = 0.38;
    const dockPhase = Math.min(1, phase / approachEnd);
    const nkTargetX = tcx - trx * 1.08; // docked position (touching target)
    const nkStartX = cols * 0.04;
    const nkx = nkStartX + (nkTargetX - nkStartX) * (dockPhase < 1 ? dockPhase * dockPhase * (3 - 2 * dockPhase) : 1);
    const nky = tcy + Math.sin(t * 1.3) * (1 - dockPhase) * 2.5; // slight wobble while approaching
    const nkrx = cols * 0.10;
    const nkry = rows * 0.30;
    const nkPulse = 1 + 0.07 * Math.sin(t * 5.2 + 0.8);

    // Draw NK cell outline
    for (let angle = 0; angle < Math.PI * 2; angle += 0.07) {
      const ex = nkx + Math.cos(angle) * nkrx * nkPulse;
      const ey = nky + Math.sin(angle) * nkry * nkPulse;
      put(ex, ey, "#");
    }

    // NK cell interior (dense granules = cytotoxic granules)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - nkx) / nkrx;
        const dy = (y - nky) / nkry;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 0.88) {
          if (r > 0.72) {
            if (g[y][x] === " ") g[y][x] = "#";
          } else {
            // granules pulsing toward the contact side during perforation
            const grainPhase = Math.max(0, (phase - contactStart) / (0.72 - contactStart));
            const grainBias = grainPhase * 0.4; // granules shift right (toward target)
            const gx = x - nkx - grainBias * nkrx * 2;
            const gy = y - nky;
            const gr2 = Math.sqrt((gx / (nkrx * 0.5)) ** 2 + (gy / (nkry * 0.5)) ** 2);
            const tick3 = Math.floor(t * 4 + x * 2 + y * 3) % 13;
            if (gr2 < 0.9) {
              if (tick3 < 3) {
                if (g[y][x] === " ") g[y][x] = grainPhase > 0.3 ? "0" : ".";
              } else {
                if (g[y][x] === " ") g[y][x] = " ";
              }
            }
          }
        }
      }
    }

    // --- Perforin pores (appear on target cell surface near contact zone) ---
    const perfPhase = Math.max(0, (phase - 0.45) / 0.27); // 0..1 during perforation
    if (perfPhase > 0) {
      const numPores = Math.floor(perfPhase * 6) + 1;
      for (let p = 0; p < numPores && p < 6; p++) {
        // Pores along the left edge of target cell
        const poreAngle = Math.PI * (0.6 + p * 0.14) + Math.sin(t * 2 + p) * 0.08;
        const poreX = tcx + Math.cos(poreAngle) * trx * 1.0;
        const poreY = tcy + Math.sin(poreAngle) * try_ * 1.0;
        const porePulse = Math.sin(t * 6 + p * 1.4) * 0.5 + 0.5;
        put(poreX, poreY, porePulse > 0.5 ? "O" : "0");
        // Pore glow
        put(poreX - 1, poreY, "|");
        put(poreX + 1, poreY, "|");
        put(poreX, poreY - 1, "-");
        put(poreX, poreY + 1, "-");
      }
    }

    // --- Cytotoxin stream (perforin/granzyme spray into target) ---
    const streamPhase = Math.max(0, (phase - 0.52) / 0.20); // 0..1
    if (streamPhase > 0) {
      const numStreams = 5;
      for (let s = 0; s < numStreams; s++) {
        const sAngle = Math.PI * (0.65 + s * 0.10);
        const sLen = streamPhase * trx * 0.7;
        const steps = Math.floor(sLen * 2.5);
        for (let step = 0; step < steps; step++) {
          const frac = step / Math.max(steps - 1, 1);
          const sx = tcx + Math.cos(sAngle) * (trx * 0.9 - frac * sLen);
          const sy = tcy + Math.sin(sAngle) * (try_ * 0.9 - frac * sLen);
          const streamCh = (Math.floor(t * 8 + step * 1.7 + s * 3) % 4 === 0) ? "*" : ":";
          put(sx, sy, streamCh);
        }
      }
    }

    // --- Lysis debris (cell fragments flying outward) ---
    if (lysis > 0.15) {
      const numDebris = 8;
      for (let d = 0; d < numDebris; d++) {
        const debrisAngle = (d / numDebris) * Math.PI * 2 + t * 0.3;
        const debrisDist = lysis * trx * 1.3 * (0.5 + 0.5 * Math.sin(d * 2.3));
        const dbx = tcx + Math.cos(debrisAngle) * debrisDist;
        const dby = tcy + Math.sin(debrisAngle) * (debrisDist * 0.6);
        const debrisCh = (d % 3 === 0) ? "o" : (d % 3 === 1) ? "," : ".";
        put(dbx, dby, debrisCh);
        if (lysis > 0.5) {
          put(dbx + Math.cos(debrisAngle), dby + Math.sin(debrisAngle) * 0.6, ".");
        }
      }
    }

    // --- Motion trail behind NK cell during approach ---
    if (dockPhase < 0.95) {
      const trailLen = 6;
      for (let tr = 1; tr <= trailLen; tr++) {
        const trailFade = 1 - tr / trailLen;
        const trailX = nkx - tr * 1.4;
        const trailY = nky + Math.sin(t * 1.3 - tr * 0.3) * (1 - dockPhase) * 1.5;
        if (trailFade > 0.6) put(trailX, trailY, "-");
        else if (trailFade > 0.3) put(trailX, trailY, "~");
        else put(trailX, trailY, ".");
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
