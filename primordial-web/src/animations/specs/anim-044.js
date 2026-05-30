export default {
  id: 44,
  system: "Viral replication burst",
  title: "Viral Burst",
  caption: "A host cell swells with replicated virions, then ruptures.",
  cols: 52,
  rows: 20,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cx = cols / 2;
    const cy = rows / 2;

    // Burst cycle: 0..1, repeats every 6 seconds
    const cycle = (t % 6) / 6;
    // 0.0-0.5: cell swells with replication, 0.5-0.8: burst, 0.8-1.0: fade/reset
    const phase = cycle < 0.5 ? "swell" : cycle < 0.8 ? "burst" : "reset";
    const phaseT = phase === "swell"
      ? cycle / 0.5            // 0..1
      : phase === "burst"
        ? (cycle - 0.5) / 0.3  // 0..1
        : (cycle - 0.8) / 0.2; // 0..1

    // Helper: clamp index to grid bounds
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        g[yi][xi] = ch;
      }
    }

    // Draw host cell membrane (ellipse)
    if (phase !== "reset" || phaseT < 0.6) {
      const cellOpacity = phase === "burst" ? 1 - phaseT * 0.9 : 1;
      if (cellOpacity > 0.1) {
        // Cell swells as replication progresses
        const swell = phase === "swell" ? 1 + phaseT * 0.18 : 1 + 0.18 - phaseT * 0.18;
        const rx = (cols * 0.36) * swell;
        const ry = (rows * 0.42) * swell;

        // Draw membrane ellipse
        for (let angle = 0; angle < Math.PI * 2; angle += 0.04) {
          const ex = cx + Math.cos(angle) * rx;
          const ey = cy + Math.sin(angle) * ry;
          // Membrane ripple: small wave as cell swells
          const ripple = phase === "swell"
            ? Math.sin(angle * 6 + t * 2.5) * phaseT * 0.7
            : 0;
          const rx2 = ex + Math.cos(angle) * ripple;
          const ry2 = ey + Math.sin(angle) * ripple;

          // Burst distortion: membrane tears outward
          const burstPush = phase === "burst"
            ? Math.sin(angle * 5 + t * 4) * phaseT * 3
            : 0;
          const bx = rx2 + Math.cos(angle) * burstPush;
          const by = ry2 + Math.sin(angle) * burstPush;

          // Use heavier char near rupture point
          const ch = (phase === "burst" && phaseT > 0.4 && Math.sin(angle * 5 + t * 4) > 0.6)
            ? "%" : "@";
          put(bx, by, ch);
        }

        // Inner cytoplasm fill — sparse dots
        for (let y = 1; y < rows - 1; y++) {
          for (let x = 1; x < cols - 1; x++) {
            const dx = (x - cx) / rx, dy = (y - cy) / ry;
            if (dx * dx + dy * dy < 0.88) {
              const hash = (x * 17 + y * 31 + Math.floor(t * 4)) % 23;
              if (hash === 0) g[y][x] = ".";
              else if (hash === 1) g[y][x] = ":";
            }
          }
        }
      }
    }

    // Internal virion replication: small hex-ish symbols growing inside cell
    const virionCount = phase === "swell"
      ? Math.floor(phaseT * 12) + 1
      : phase === "burst"
        ? Math.max(0, 13 - Math.floor(phaseT * 13))
        : 0;

    for (let i = 0; i < virionCount; i++) {
      // Deterministic pseudo-random positions using sin/cos of index
      const angle = (i / 13) * Math.PI * 2 + t * 0.3;
      const r = 0.15 + ((i * 7 + 3) % 9) / 9 * 0.45;
      const vx = cx + Math.cos(angle) * r * cols * 0.28;
      const vy = cy + Math.sin(angle) * r * rows * 0.32;

      // Each virion pulses
      const pulse = Math.sin(t * 3 + i * 1.1) > 0 ? "O" : "o";
      put(vx, vy, pulse);

      // Small cross/spike decoration on virion
      const spike = Math.sin(t * 2 + i * 0.7) > 0.3 ? "*" : "+";
      put(vx + 1, vy, spike);
      put(vx - 1, vy, spike);
      put(vx, vy + 1, spike);
      put(vx, vy - 1, spike);
    }

    // Nucleus with viral DNA injection (center)
    const nucleusR = 3.5;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.25) {
      const nx = cx + Math.cos(angle) * nucleusR;
      const ny = cy + Math.sin(angle) * nucleusR * 0.6;
      put(nx, ny, "#");
    }
    // DNA replication strands inside nucleus
    for (let x = Math.round(cx) - 2; x <= Math.round(cx) + 2; x++) {
      const wave = Math.sin(x * 1.2 + t * 4) * 1.5;
      put(x, cy + wave, "=");
      put(x, cy + wave - 1, "-");
    }

    // BURST PHASE: virions fly outward
    if (phase === "burst") {
      for (let i = 0; i < 16; i++) {
        const launchAngle = (i / 16) * Math.PI * 2 + (i % 3) * 0.15;
        // Travel distance grows with phaseT
        const dist = phaseT * (cols * 0.42 + (i % 4) * 2);
        const vx = cx + Math.cos(launchAngle) * dist;
        const vy = cy + Math.sin(launchAngle) * dist * 0.6;

        // Trail
        const trailLen = 4;
        for (let tr = 1; tr <= trailLen; tr++) {
          const td = dist - tr * 1.8;
          if (td > 0) {
            const tx = cx + Math.cos(launchAngle) * td;
            const ty = cy + Math.sin(launchAngle) * td * 0.6;
            const trailCh = tr === 1 ? "o" : tr === 2 ? "." : "`";
            put(tx, ty, trailCh);
          }
        }

        // Virion head
        const ch = phaseT < 0.5 ? "O" : "o";
        put(vx, vy, ch);
        // Spikes on flying virions
        if (phaseT < 0.65) {
          put(vx + 1, vy, "*");
          put(vx - 1, vy, "*");
          put(vx, vy + 1, "*");
          put(vx, vy - 1, "*");
        }
      }

      // Shockwave ring expanding outward
      if (phaseT > 0.1) {
        const waveR = phaseT * cols * 0.46;
        const waveRy = phaseT * rows * 0.44;
        for (let angle = 0; angle < Math.PI * 2; angle += 0.06) {
          const wx = cx + Math.cos(angle) * waveR;
          const wy = cy + Math.sin(angle) * waveRy;
          if (phaseT < 0.7) {
            const wch = phaseT < 0.4 ? "~" : ".";
            put(wx, wy, wch);
          }
        }
      }
    }

    // RESET phase: faint remnant of lysed cell
    if (phase === "reset") {
      // Scattered debris
      const debrisCount = Math.floor((1 - phaseT) * 10);
      for (let i = 0; i < debrisCount; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const r = 0.5 + (i % 3) * 0.15;
        const dx = cx + Math.cos(angle) * r * cols * 0.38;
        const dy = cy + Math.sin(angle) * r * rows * 0.38;
        put(dx, dy, ".");
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
