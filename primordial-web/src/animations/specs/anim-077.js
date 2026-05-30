export default {
  id: 77,
  system: "Axon growth cone navigation",
  title: "Growth Cone Pathfinding",
  caption: "Filopodia probe the dark, pulling an axon toward its target.",
  cols: 54,
  rows: 20,
  palette: "neuron",
  frame(t) {
    const cols = 54, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: clamp to grid bounds
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        if (g[yi][xi] === " " || ch === "@" || ch === "O" || ch === "#") {
          g[yi][xi] = ch;
        }
      }
    }

    // ── Axon shaft ──────────────────────────────────────────────────────────
    // The shaft trails behind the growth cone, undulating slightly as it grows.
    // Growth cone advances from left (col ~4) toward right (~cols-6) over time.
    const tLoop = (t % 18) / 18;                       // 0..1 over 18-second loop
    const gcX = 4 + tLoop * (cols - 10);               // growth cone X position
    const baseY = Math.round(rows / 2);

    // Draw shaft from left edge to growth cone
    for (let x = 1; x <= Math.floor(gcX) - 3; x++) {
      // gentle vertical undulation trailing behind
      const wave = Math.sin(x * 0.35 - t * 1.2) * 0.8;
      const y = baseY + Math.round(wave);
      const shaftChar = (x % 4 === 0) ? "=" : "-";
      put(x, y, shaftChar);
      // thicken shaft slightly
      if (Math.abs(wave) < 0.3) {
        put(x, y - 1, ".");
        put(x, y + 1, ".");
      }
    }

    // ── Growth cone body (lamellipodia) ──────────────────────────────────────
    // An elliptical fan-shaped region at the leading edge, pulsing.
    const pulse = 0.85 + 0.15 * Math.sin(t * 3.1);
    const fanW = 3.5 * pulse;
    const fanH = 4.2 * pulse;

    for (let dy = -Math.ceil(fanH); dy <= Math.ceil(fanH); dy++) {
      for (let dx = -Math.ceil(fanW); dx <= Math.ceil(fanW); dx++) {
        const nx = dx / fanW, ny = dy / fanH;
        const r = Math.sqrt(nx * nx + ny * ny);
        // Fan only extends forward (right half biased)
        const fwd = nx + 0.3;                          // shift forward
        if (r < 1.0 && fwd > -0.4) {
          const cx = gcX + dx, cy = baseY + dy;
          const edge = Math.abs(r - 0.95);
          let ch;
          if (edge < 0.07) {
            ch = (Math.floor(t * 6 + dx + dy) % 3 === 0) ? "o" : ":";
          } else if (r > 0.65) {
            ch = ".";
          } else {
            // inner fill — sparse stipple
            const hash = (Math.floor(cx * 7 + cy * 13 + t * 4)) % 9;
            ch = hash === 0 ? "*" : (hash === 1 ? "," : " ");
          }
          if (ch !== " ") put(cx, cy, ch);
        }
      }
    }

    // Nucleus-like core of growth cone
    put(gcX - 0.5, baseY,     "O");
    put(gcX + 0.5, baseY,     "O");
    put(gcX,       baseY,     "@");

    // ── Filopodia ────────────────────────────────────────────────────────────
    // 6 thin protrusions extending from the growth cone, each oscillating
    // in angle and length to simulate active sensing.
    const filoCount = 7;
    for (let i = 0; i < filoCount; i++) {
      const baseAngle = (i / filoCount) * Math.PI - Math.PI / 2;
      // Each filopodium sweeps with its own phase
      const sweep = Math.sin(t * 1.8 + i * 1.1) * 0.55;
      const angle = baseAngle + sweep;
      const len = 3.5 + 2.5 * (0.5 + 0.5 * Math.sin(t * 2.3 + i * 0.9));

      // Only forward-facing filopodia (right hemisphere + some top/bottom)
      if (Math.cos(baseAngle) < -0.2) continue;

      const stepCount = Math.ceil(len * 1.8);
      for (let s = 1; s <= stepCount; s++) {
        const frac = s / stepCount;
        const fx = gcX + fanW * 0.6 + Math.cos(angle) * len * frac;
        const fy = baseY + Math.sin(angle) * len * frac;
        // Filopodium tip is brightest
        const ch = frac > 0.85 ? "+" : (frac > 0.5 ? "'" : "`");
        put(fx, fy, ch);
      }
      // Tip marker — the very tip pulses
      const tipBlink = Math.sin(t * 4.5 + i * 2.0) > 0.3;
      if (tipBlink) {
        const fx = gcX + fanW * 0.6 + Math.cos(angle) * len;
        const fy = baseY + Math.sin(angle) * len;
        put(fx, fy, "*");
      }
    }

    // ── Chemoattractant gradient (sparse dots fading right) ──────────────────
    // Represents the concentration field the growth cone navigates toward.
    for (let y = 1; y < rows - 1; y++) {
      for (let x = Math.floor(gcX) + 5; x < cols - 1; x++) {
        const distFrac = (x - gcX) / (cols - gcX);   // 0..1 toward right
        // probability of a gradient dot decreases with distance
        const hash = (x * 17 + y * 31 + Math.floor(t * 2)) % 100;
        const threshold = 12 * (1 - distFrac * 0.7);
        if (hash < threshold) {
          // don't overwrite existing content
          if (g[y][x] === " ") {
            g[y][x] = distFrac < 0.3 ? "," : ".";
          }
        }
      }
    }

    // ── Target marker (right side, faint pulsing star) ───────────────────────
    const targetX = cols - 4;
    const targetY = baseY;
    const tPulse = Math.sin(t * 2.5) > 0;
    put(targetX,     targetY,     tPulse ? "#" : "O");
    put(targetX - 1, targetY,     "|");
    put(targetX + 1, targetY,     "|");
    put(targetX,     targetY - 1, "-");
    put(targetX,     targetY + 1, "-");

    return g.map((row) => row.join("")).join("\n");
  }
};
