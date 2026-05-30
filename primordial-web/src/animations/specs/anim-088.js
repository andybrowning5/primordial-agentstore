export default {
  id: 88,
  system: "Mycelium spreading",
  title: "Hyphal Expansion",
  caption: "Hyphae thread outward, branching blind into the dark.",
  cols: 52,
  rows: 20,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        g[yi][xi] = ch;
      }
    }

    function drawLine(x0, y0, x1, y1, ch) {
      const dx = x1 - x0, dy = y1 - y0;
      const steps = Math.max(Math.abs(Math.round(dx * 2)), Math.abs(Math.round(dy * 2)), 1);
      for (let i = 0; i <= steps; i++) {
        put(x0 + dx * (i / steps), y0 + dy * (i / steps), ch);
      }
    }

    function angleCh(a) {
      const norm = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (norm < Math.PI / 8 || norm > 15 * Math.PI / 8) return "-";
      if (norm < 3 * Math.PI / 8) return "/";
      if (norm < 5 * Math.PI / 8) return "|";
      if (norm < 7 * Math.PI / 8) return "\\";
      if (norm < 9 * Math.PI / 8) return "-";
      if (norm < 11 * Math.PI / 8) return "/";
      if (norm < 13 * Math.PI / 8) return "|";
      return "\\";
    }

    // Grow a hypha as a polyline from (ox,oy) along angle for actualLen steps.
    // Returns the final tip position.
    // dx per step = cos(a) * stepSize, dy per step = sin(a) * stepSize * aspectRatio
    // We keep internal coords in "grid cells" directly, no extra aspect scaling.
    function hypha(ox, oy, angle, totalSteps, grow, seed) {
      const steps = Math.round(totalSteps * grow);
      if (steps < 1) return { x: ox, y: oy };
      let px = ox, py = oy;
      let a = angle;
      const stepLen = 1.0; // one cell per step

      for (let s = 0; s < steps; s++) {
        // Gentle accumulated meander
        const drift = Math.sin(t * 0.2 + seed + s * 0.85) * 0.15;
        a = angle + drift * Math.sqrt(s + 1) * 0.25;

        // Move: scale y movement by 0.5 to compensate for char aspect ratio
        // (chars are ~2x taller than wide, so halving y-step keeps angle visual)
        const nx = px + Math.cos(a) * stepLen;
        const ny = py + Math.sin(a) * stepLen * 0.5;

        const ch = angleCh(a);
        drawLine(px, py, nx, ny, ch);
        px = nx; py = ny;
      }
      // Tip pulse
      const tipCh = Math.sin(t * 2.0 + seed) > 0 ? "o" : "*";
      put(px, py, tipCh);
      return { x: px, y: py };
    }

    // ── Growth timeline ──────────────────────────────────────
    const cycleDur = 15;
    const phase = (t % cycleDur) / cycleDur;
    // Smooth ease-in ramp to 1, then quick retract
    const rawGrow = phase < 0.70 ? phase / 0.70 : 1.0 - (phase - 0.70) / 0.30;
    const grow = rawGrow * rawGrow * (3 - 2 * rawGrow); // smoothstep

    const cx = cols / 2;   // 26
    const cy = rows / 2;   // 10

    // Primary reach: how many steps out from center (in grid cols)
    // At full spread we want arms to nearly reach the edges
    const primaryReach = 22; // cols = 52, center at 26, so ~22 reaches edge

    // ── 8 primary arms ──────────────────────────────────────
    const numArms = 8;
    for (let i = 0; i < numArms; i++) {
      const baseAngle = (i / numArms) * Math.PI * 2;
      const wobble = Math.sin(t * 0.15 + i * 2.1) * 0.08;
      const armAngle = baseAngle + wobble;

      // Stagger growth start across arms
      const delay = (i / numArms) * 0.15;
      const armGrow = Math.max(0, Math.min(1, (grow - delay) / (1 - delay)));

      const tip = hypha(cx, cy, armAngle, primaryReach, armGrow, i * 4.1);

      // Secondary branches when arm is >35% grown
      if (armGrow > 0.35) {
        // Fork from 40% along the arm
        const frac = 0.40;
        const f1x = cx + Math.cos(armAngle) * primaryReach * frac * armGrow;
        // y is scaled by 0.5 per our hypha stepping
        const f1y = cy + Math.sin(armAngle) * primaryReach * frac * armGrow * 0.5;
        const secReach = primaryReach * 0.45;
        const secGrow = Math.max(0, Math.min(1, (armGrow - 0.35) / 0.65));
        const spread = 0.58 + Math.sin(t * 0.12 + i * 1.4) * 0.06;
        hypha(f1x, f1y, armAngle + spread, secReach, secGrow, i * 2.3 + 11);
        hypha(f1x, f1y, armAngle - spread, secReach, secGrow, i * 2.3 + 22);

        // Tertiary from 70% along arm
        if (armGrow > 0.60) {
          const frac2 = 0.68;
          const f2x = cx + Math.cos(armAngle) * primaryReach * frac2 * armGrow;
          const f2y = cy + Math.sin(armAngle) * primaryReach * frac2 * armGrow * 0.5;
          const terReach = primaryReach * 0.28;
          const terGrow = Math.max(0, Math.min(1, (armGrow - 0.60) / 0.40));
          const spread2 = 0.48 + Math.sin(t * 0.10 + i * 1.1) * 0.05;
          hypha(f2x, f2y, armAngle + spread2, terReach, terGrow, i * 1.7 + 33);
          hypha(f2x, f2y, armAngle - spread2, terReach, terGrow, i * 1.7 + 44);
        }
      }
    }

    // ── Spore body ───────────────────────────────────────────
    const sc = Math.sin(t * 1.3);
    put(cx, cy, sc > 0.4 ? "@" : sc > -0.4 ? "O" : "0");
    for (let k = 0; k < 4; k++) {
      const ha = (k / 4) * Math.PI * 2 + t * 0.45;
      put(cx + Math.cos(ha) * 1.0, cy + Math.sin(ha) * 0.5,
          k % 2 === 0 ? "+" : "o");
    }

    // ── Anastomosis junction nodes ───────────────────────────
    // Appear near intersections as network matures
    const nodes = [
      [0.28, 0.25], [0.74, 0.28], [0.18, 0.52], [0.83, 0.48],
      [0.50, 0.14], [0.46, 0.86], [0.64, 0.70], [0.34, 0.42],
      [0.66, 0.35], [0.36, 0.72], [0.76, 0.62], [0.24, 0.38],
      [0.55, 0.20], [0.42, 0.78], [0.20, 0.68], [0.80, 0.32],
    ];
    for (let n = 0; n < nodes.length; n++) {
      const nx = nodes[n][0] * cols;
      const ny = nodes[n][1] * rows;
      // Distance from center in aspect-correct space
      const dr = Math.sqrt(
        ((nx - cx) / primaryReach) ** 2 +
        ((ny - cy) / (primaryReach * 0.5)) ** 2
      );
      if (dr < grow * 0.92) {
        const nodeCh = Math.sin(t * 1.2 + n * 1.6) > 0.35 ? "o" : ".";
        put(nx, ny, nodeCh);
      }
    }

    // ── Sparse substrate speckles ────────────────────────────
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (g[y][x] === " ") {
          const h = (x * 31 + y * 17 + x * y * 3) % 127;
          if (h < 3) {
            if (Math.sin(t * 0.5 + x * 0.33 + y * 0.57) > 0.60) {
              g[y][x] = ".";
            }
          }
        }
      }
    }

    return g.map(row => row.join("")).join("\n");
  }
};
