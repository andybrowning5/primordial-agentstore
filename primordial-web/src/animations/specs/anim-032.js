export default {
  id: 32,
  system: "Synaptic neurotransmitter release",
  title: "Synapse Firing",
  caption: "Vesicles burst open, flooding the cleft with chemical signals.",
  cols: 52,
  rows: 20,
  palette: "neuron",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // ── Layout constants ────────────────────────────────────────────────
    const cx = cols / 2;
    const preY  = 6;   // row of presynaptic membrane
    const postY = 13;  // row of postsynaptic membrane
    const cleftTop    = preY + 1;
    const cleftBottom = postY - 1;

    // ── Helpers ─────────────────────────────────────────────────────────
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function get(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // ── Cycle: 9 seconds total ───────────────────────────────────────────
    // Phase 0.00–0.15  vesicles dock (drift toward membrane)
    // Phase 0.15–0.35  vesicles fuse (2-3 burst open)
    // Phase 0.35–0.60  transmitters flood cleft & diffuse
    // Phase 0.60–0.80  transmitters bind to receptors (postsynaptic activation)
    // Phase 0.80–1.00  reuptake / reset
    const period = 9.0;
    const phase  = (t % period) / period; // 0..1

    // ── Draw presynaptic terminal (axon bouton) ──────────────────────────
    // Rounded arc spanning most of the top section
    const termRx = cols * 0.36;
    const termRy = rows * 0.32;
    const termCy = preY - 3.5;
    for (let y = 0; y <= preY; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / termRx;
        const dy = (y - termCy) / termRy;
        const r  = Math.sqrt(dx * dx + dy * dy);
        if (y === preY) {
          // bottom flat membrane line
          if (Math.abs(dx) < 0.95) g[y][x] = "=";
        } else if (Math.abs(r - 1.0) < 0.10) {
          g[y][x] = "@";
        } else if (r < 0.90) {
          // cytoplasm stipple inside terminal
          const tick = Math.floor(t * 3);
          if ((x * 13 + y * 7 + tick) % 23 === 0) g[y][x] = ".";
        }
      }
    }

    // ── Resting vesicles inside terminal ────────────────────────────────
    // 7 small vesicles arranged in two rows; they drift slowly leftward
    const vesicleSeeds = [
      { bx: cx - 10, by: 2.5 }, { bx: cx - 4, by: 1.8 }, { bx: cx + 2, by: 2.0 },
      { bx: cx + 8,  by: 2.5 }, { bx: cx - 7, by: 4.2 }, { bx: cx,     by: 4.0 },
      { bx: cx + 7,  by: 4.3 },
    ];

    // How many vesicles have been "consumed" (fused) this cycle
    const fuseStart  = 0.15;
    const fuseEnd    = 0.38;
    const fuseCount  = phase > fuseEnd ? 3 : phase > fuseStart ? Math.floor(((phase - fuseStart) / (fuseEnd - fuseStart)) * 3) : 0;

    // Vesicles that haven't fused drift gently
    vesicleSeeds.forEach((v, i) => {
      if (i < fuseCount) return; // this one fused, skip
      // gentle oscillation
      const ox = Math.sin(t * 0.5 + i * 1.3) * 1.2;
      const oy = Math.sin(t * 0.7 + i * 2.1) * 0.5;
      const vx = v.bx + ox;
      const vy = v.by + oy;
      const xi = Math.round(vx), yi = Math.round(vy);
      if (xi >= 1 && xi < cols - 1 && yi >= 0 && yi < preY) {
        g[yi][xi]     = "o";
        if (xi - 1 >= 0)       g[yi][xi - 1] = "(";
        if (xi + 1 < cols)     g[yi][xi + 1] = ")";
      }
    });

    // ── Vesicles docking: drift toward membrane during phase 0..0.35 ────
    const dockVesicles = [
      { bx: cx - 6, phase0: 0.02 },
      { bx: cx,     phase0: 0.08 },
      { bx: cx + 6, phase0: 0.04 },
    ];

    dockVesicles.forEach((dv, i) => {
      if (i >= fuseCount + 1) {
        // Still docking (approaching membrane)
        const localPhase = Math.max(0, (phase - dv.phase0) / (fuseStart - dv.phase0 + 0.01));
        const clampedP   = Math.min(localPhase, 1.0);
        const startY     = 3.5 + i * 0.4;
        const vy         = startY + clampedP * (preY - 1.5 - startY);
        const vx         = dv.bx + Math.sin(t * 0.6 + i) * 0.5;
        const xi         = Math.round(vx), yi = Math.round(vy);
        if (xi >= 1 && xi < cols - 1 && yi >= 0 && yi < preY) {
          g[yi][xi]     = "O";
          if (xi - 1 >= 0)   g[yi][xi - 1] = "(";
          if (xi + 1 < cols) g[yi][xi + 1] = ")";
        }
      }
    });

    // ── Fusion pores: brief burst char on the presynaptic membrane ───────
    if (phase >= fuseStart && phase < 0.50) {
      const burstFrac = Math.min(1.0, (phase - fuseStart) / 0.18);
      const fusionSites = [cx - 6, cx, cx + 6];
      fusionSites.forEach((fx, i) => {
        if (i >= fuseCount) return;
        const xi = Math.round(fx);
        if (xi >= 0 && xi < cols) {
          // pore flickers open
          const flicker = Math.sin(t * 8 + i * 2.7) > 0 ? "*" : "+";
          g[preY][xi] = flicker;
          // small splash above
          if (preY - 1 >= 0 && g[preY - 1][xi] === " ") g[preY - 1][xi] = "v";
        }
      });
    }

    // ── Presynaptic membrane line (redrawn to overwrite stipple) ─────────
    for (let x = 0; x < cols; x++) {
      const dx = (x - cx) / termRx;
      if (Math.abs(dx) < 0.95 && g[preY][x] === " ") g[preY][x] = "=";
    }

    // ── Postsynaptic membrane ────────────────────────────────────────────
    for (let x = 2; x < cols - 2; x++) {
      g[postY][x] = "=";
    }
    // Receptor sites — evenly spaced teeth below postsynaptic membrane
    const receptorXs = [
      cx - 16, cx - 10, cx - 4, cx + 2, cx + 8, cx + 14,
    ];
    receptorXs.forEach((rx2) => {
      const xi = Math.round(rx2);
      if (xi >= 2 && xi < cols - 2) {
        // receptor spine
        if (postY + 1 < rows) g[postY + 1][xi] = "|";
        if (postY + 2 < rows) {
          g[postY + 2][xi - 1 >= 0 ? xi - 1 : xi] = "(";
          g[postY + 2][xi] = "U";
          g[postY + 2][xi + 1 < cols ? xi + 1 : xi] = ")";
        }
      }
    });

    // ── Transmitter particles in the cleft ──────────────────────────────
    // Each transmitter has a deterministic seed-based trajectory
    const numTransmitters = 18;
    const releaseStart    = 0.18;
    const releaseEnd      = 0.55;
    const bindStart       = 0.55;
    const reuptakeStart   = 0.80;

    for (let i = 0; i < numTransmitters; i++) {
      // Stagger release timing
      const relPhase = releaseStart + (i / numTransmitters) * (releaseEnd - releaseStart) * 0.6;
      if (phase < relPhase) continue; // not released yet

      // Which fusion pore did this come from?
      const poreIdx = i % 3;
      const spawnX  = [cx - 6, cx, cx + 6][poreIdx];

      // Lateral spread based on seed
      const seedA   = Math.sin(i * 3.7 + 1.1) * 0.5 + 0.5; // 0..1
      const seedB   = Math.sin(i * 5.3 + 2.4) * 0.5 + 0.5;
      const targetX = spawnX + (seedA - 0.5) * 28; // spread ±14 cols
      const targetY = postY - 1; // lands just above postsynaptic

      let particleX, particleY;
      const charBase = (i % 5 === 0) ? "*" : (i % 5 === 1) ? "+" : (i % 5 === 2) ? "o" : (i % 5 === 3) ? ":" : ".";

      if (phase < bindStart) {
        // Diffusing across the cleft
        const travelFrac = Math.min(1.0, (phase - relPhase) / (bindStart - relPhase));
        // Ease: cubic in
        const ease = travelFrac * travelFrac * (3 - 2 * travelFrac);
        particleX = spawnX + ease * (targetX - spawnX);
        particleY = cleftTop + ease * (cleftBottom - cleftTop);
        // Add slight Brownian wiggle (deterministic)
        particleX += Math.sin(t * 3.1 + i * 1.9) * 0.8;
        particleY += Math.sin(t * 2.7 + i * 2.3) * 0.3;
        const xi = Math.round(particleX), yi = Math.round(particleY);
        if (xi >= 0 && xi < cols && yi > preY && yi < postY) {
          g[yi][xi] = charBase;
        }
      } else if (phase < reuptakeStart) {
        // Bound to receptor — show on postsynaptic membrane / receptor
        // Find nearest receptor
        let nearRx = receptorXs[0], nearDist = Infinity;
        receptorXs.forEach(r => { const d = Math.abs(r - targetX); if (d < nearDist) { nearDist = d; nearRx = r; } });
        // Binding pulse
        const boundFrac  = (phase - bindStart) / (reuptakeStart - bindStart);
        const pulse      = Math.sin(t * 4 + i * 1.1) > 0.3 ? "*" : charBase;
        const bindY      = postY + 1;
        const xi         = Math.round(nearRx + (seedA - 0.5) * 2);
        if (xi >= 0 && xi < cols && bindY < rows) {
          // Only draw if the receptor is "occupied" — spread them out
          if ((i % receptorXs.length) === receptorXs.indexOf(nearRx) || nearDist < 3) {
            g[bindY][Math.round(nearRx)] = pulse;
          }
        }
        // Still show some particles hovering just above postsynaptic
        const floatY = cleftBottom - Math.floor(boundFrac * 1.5);
        const floatX = Math.round(targetX + Math.sin(t * 1.5 + i) * 0.7);
        if (floatX >= 0 && floatX < cols && floatY > preY && floatY < postY) {
          g[floatY][floatX] = charBase;
        }
      } else {
        // Reuptake — particles drift back up toward presynaptic membrane
        const rFrac    = Math.min(1.0, (phase - reuptakeStart) / (1.0 - reuptakeStart));
        const ease     = rFrac * rFrac;
        particleX      = targetX + ease * (spawnX - targetX);
        particleY      = cleftBottom + ease * (cleftTop - cleftBottom);
        particleX     += Math.sin(t * 2.9 + i * 1.7) * 0.6;
        const xi       = Math.round(particleX), yi = Math.round(particleY);
        if (xi >= 0 && xi < cols && yi > preY && yi < postY) {
          // Use a fading char
          const rChar = rFrac > 0.6 ? "'" : charBase;
          g[yi][xi] = rChar;
        }
      }
    }

    // ── Receptor activation glow (postsynaptic depolarization) ───────────
    if (phase >= bindStart && phase < reuptakeStart) {
      const glowFrac = (phase - bindStart) / (reuptakeStart - bindStart);
      // Ripple along post-synaptic membrane propagates leftward
      const waveFront = Math.round(cx + (glowFrac - 0.5) * cols * 0.9);
      for (let x = 2; x < cols - 2; x++) {
        const dist = Math.abs(x - waveFront);
        if (dist < 3) {
          g[postY][x] = dist === 0 ? "#" : dist === 1 ? "=" : "-";
        }
      }
      // Depolarization sparks below postsynaptic
      if (postY + 3 < rows) {
        const sparkX = waveFront + Math.round(Math.sin(t * 6) * 2);
        if (sparkX >= 0 && sparkX < cols) g[postY + 3][sparkX] = "^";
        const sparkX2 = waveFront - 3 + Math.round(Math.cos(t * 5) * 2);
        if (sparkX2 >= 0 && sparkX2 < cols) g[postY + 3][sparkX2] = "v";
      }
    }

    // ── Cleft gap visual separators (walls) ──────────────────────────────
    // Very subtle side guides
    for (let y = cleftTop; y <= cleftBottom; y++) {
      if (g[y][1] === " ")         g[y][1]         = ":";
      if (g[y][cols - 2] === " ") g[y][cols - 2]  = ":";
    }

    // ── Cell body below postsynaptic (dendrite interior) ─────────────────
    for (let y = postY + 4; y < rows; y++) {
      for (let x = 2; x < cols - 2; x++) {
        const tick = Math.floor(t * 2);
        if ((x * 11 + y * 5 + tick) % 29 === 0) g[y][x] = ".";
      }
    }
    // Dendrite outline (rough)
    if (rows - 1 >= 0) {
      for (let x = 2; x < cols - 2; x++) g[rows - 1][x] = "~";
    }
    g[postY + 4] && ((() => {
      for (let x = 2; x < cols - 2; x++) {
        if (g[postY + 4][x] === " ") g[postY + 4][x] = "-";
      }
    })());

    return g.map(row => row.join("").padEnd(cols, " ").slice(0, cols)).join("\n");
  }
};
