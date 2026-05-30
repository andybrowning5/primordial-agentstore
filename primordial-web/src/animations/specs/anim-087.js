export default {
  id: 87,
  system: "Fungal spore release",
  title: "Spore Dispersal",
  caption: "A sporangium ruptures, casting spores into the unseen air.",
  cols: 52,
  rows: 18,
  palette: "microbe",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: safe pixel set
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        if (g[yi][xi] === " " || ch === "@" || ch === "0") g[yi][xi] = ch;
      }
    }

    // --- STALK (fixed, center-bottom) ---
    const stalkX = cols / 2;
    const stalkBase = rows - 1;
    const stalkTop = rows - 6;
    for (let y = stalkTop; y <= stalkBase; y++) {
      put(stalkX, y, "|");
      // subtle sway
      const sway = Math.sin(t * 1.2) * 0.8 * ((stalkBase - y) / (stalkBase - stalkTop));
      put(stalkX + sway, y, "|");
    }

    // --- SPORANGIUM (round cap atop stalk, pulses before burst) ---
    // Burst cycle: every 5 seconds
    const cycle = 5.0;
    const phase = (t % cycle) / cycle; // 0..1 within cycle
    // 0..0.6: building pressure (cap swells), 0.6..0.75: burst, 0.75..1.0: refractory/regrow
    const buildPhase = Math.min(phase / 0.6, 1.0);
    const burstPhase = phase >= 0.6 && phase < 0.75 ? (phase - 0.6) / 0.15 : 0;
    const regrowPhase = phase >= 0.75 ? (phase - 0.75) / 0.25 : 0;

    const capCX = stalkX + Math.sin(t * 1.2) * 0.8;
    const capCY = stalkTop - 1;
    // radius grows during build, shrinks at burst, regrows
    const capR = burstPhase > 0
      ? 3.2 * (1 - burstPhase * 0.9)
      : 2.2 + buildPhase * 1.0 + regrowPhase * 1.2;
    const capRY = capR * 0.75;

    // Draw cap outline
    const capSteps = 60;
    for (let i = 0; i <= capSteps; i++) {
      const angle = (i / capSteps) * Math.PI * 2;
      const ex = capCX + Math.cos(angle) * capR;
      const ey = capCY + Math.sin(angle) * capRY;
      const edgeChar = burstPhase > 0.3 ? "*" : (buildPhase > 0.85 ? "0" : "O");
      put(ex, ey, edgeChar);
    }
    // Cap interior fill with pressure dots
    for (let dy = -Math.ceil(capRY); dy <= Math.ceil(capRY); dy++) {
      for (let dx = -Math.ceil(capR); dx <= Math.ceil(capR); dx++) {
        const nx = dx / capR, ny = dy / capRY;
        if (nx * nx + ny * ny < 0.82) {
          const px = capCX + dx, py = capCY + dy;
          const xi = Math.round(px), yi = Math.round(py);
          if (xi >= 0 && xi < cols && yi >= 0 && yi < rows && g[yi][xi] === " ") {
            // inner texture varies with pressure
            const noise = ((xi * 7 + yi * 13 + Math.floor(t * 3)) % 9);
            if (buildPhase > 0.5 && noise === 0) g[yi][xi] = ":";
            else if (buildPhase > 0.7 && noise <= 1) g[yi][xi] = ".";
          }
        }
      }
    }

    // --- SPORE PARTICLES ---
    // Each spore is launched at burst start, travels outward, fades
    // 16 spores evenly distributed in angle
    const numSpores = 16;
    for (let i = 0; i < numSpores; i++) {
      // spores are active from phase 0.6 onward (current cycle) and linger through refractory
      if (phase < 0.6) continue;

      const launchPhase = phase >= 0.6 ? (phase - 0.6) / 0.4 : 0; // 0..1 over rest of cycle
      const angle = (i / numSpores) * Math.PI * 2 + (Math.floor(t / cycle) * 1.1); // slight rotation each cycle
      // spores fan upward more (restrict downward angles)
      const adjustedAngle = angle - Math.PI / 2; // bias upward

      // travel distance grows with time since burst
      const speed = 3.5 + (i % 4) * 1.2;
      const dist = launchPhase * speed * 6.5;

      // slight arc drift (gravity-like downward curve)
      const sx = capCX + Math.cos(adjustedAngle) * dist;
      const sy = capCY + Math.sin(adjustedAngle) * dist + launchPhase * launchPhase * 2.0;

      // spore character: shrinks as it travels
      let sporeChar;
      if (launchPhase < 0.15) sporeChar = "O";
      else if (launchPhase < 0.35) sporeChar = "o";
      else if (launchPhase < 0.6) sporeChar = "*";
      else sporeChar = ".";

      put(sx, sy, sporeChar);

      // trailing dot
      if (dist > 2) {
        const trailDist = dist - 1.5;
        put(
          capCX + Math.cos(adjustedAngle) * trailDist,
          capCY + Math.sin(adjustedAngle) * trailDist + (launchPhase - 0.05) * (launchPhase - 0.05) * 2.0,
          "."
        );
      }
    }

    // --- AMBIENT DRIFTING SPORES from previous cycles ---
    // Simulate spores still drifting from older bursts using deterministic offsets
    for (let k = 0; k < 12; k++) {
      // Each spore has a unique phase offset and trajectory
      const offset = (k * 0.37 + k * k * 0.07) % 1.0;
      const lifeT = ((t * 0.2 + offset) % 1.0); // 0..1 lifetime
      if (lifeT > 0.85) continue; // invisible near birth/death
      const angle2 = (k / 12) * Math.PI * 2 + offset * Math.PI;
      const drift = lifeT * 18;
      const sx2 = capCX + Math.cos(angle2 - Math.PI / 2) * drift;
      const sy2 = capCY + Math.sin(angle2 - Math.PI / 2) * drift + lifeT * lifeT * 3.5;
      put(sx2, sy2, lifeT < 0.4 ? "o" : ".");
    }

    // --- PAD rows to exact cols width ---
    return g.map(row => {
      const line = row.join("");
      return line.length < cols ? line + " ".repeat(cols - line.length) : line.slice(0, cols);
    }).join("\n");
  }
};
