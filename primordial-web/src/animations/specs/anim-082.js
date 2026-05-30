export default {
  id: 82,
  system: "Coral polyp feeding",
  title: "Polyp Feeding",
  caption: "Tentacles fan and curl as the polyp draws plankton inward.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Polyp anatomy constants
    const cx = cols / 2;        // center x
    const baseY = rows - 2;     // base of polyp (anchored in coral)
    const bodyH = 8;            // column height
    const mouthY = baseY - bodyH; // oral disc row

    // Pulse rhythm: slow expansion/contraction of oral disc
    const pulse = Math.sin(t * 1.4) * 0.5 + 0.5; // 0..1
    const mouthR = 2.5 + pulse * 1.2;             // oral disc radius

    // Draw the column body (rectangular tube, tapers slightly at top)
    for (let y = mouthY + 1; y <= baseY; y++) {
      const frac = (y - mouthY) / bodyH;
      const halfW = Math.round(2.2 + frac * 0.8); // wider at base
      const leftX = Math.round(cx - halfW);
      const rightX = Math.round(cx + halfW);
      if (leftX >= 0 && leftX < cols) g[y][leftX] = "|";
      if (rightX >= 0 && rightX < cols) g[y][rightX] = "|";
      // Interior stipple (mesentery suggestion)
      if ((y * 3 + Math.floor(t * 2)) % 7 === 0) {
        const ix = Math.round(cx + (Math.sin(y * 1.1 + t) * halfW * 0.5));
        if (ix > leftX && ix < rightX && ix >= 0 && ix < cols) g[y][ix] = ":";
      }
    }

    // Base foot — anchored in substrate
    for (let x = Math.round(cx - 3); x <= Math.round(cx + 3); x++) {
      if (x >= 0 && x < cols) g[baseY][x] = "=";
    }
    if (baseY + 1 < rows) {
      for (let x = Math.round(cx - 4); x <= Math.round(cx + 4); x++) {
        if (x >= 0 && x < cols) g[baseY + 1][x] = "~";
      }
    }

    // Oral disc — pulsing ring
    for (let angle = 0; angle < Math.PI * 2; angle += 0.15) {
      const dx = Math.cos(angle) * mouthR;
      const dy = Math.sin(angle) * mouthR * 0.45; // ellipse, shallow
      const px = Math.round(cx + dx);
      const py = Math.round(mouthY + dy);
      if (px >= 0 && px < cols && py >= 0 && py < rows) {
        g[py][px] = "o";
      }
    }
    // Mouth center
    const mouthCx = Math.round(cx);
    const mouthCy = mouthY;
    if (mouthCx >= 0 && mouthCx < cols && mouthCy >= 0 && mouthCy < rows)
      g[mouthCy][mouthCx] = "O";

    // Tentacles — 8 tentacles radiating outward, each waving independently
    const numTentacles = 8;
    for (let i = 0; i < numTentacles; i++) {
      const baseAngle = (i / numTentacles) * Math.PI * 2;
      // Phase offset per tentacle for independent waving
      const phase = i * 0.78 + t * 1.1;
      // Each tentacle has a "catch" event: periodically curls inward
      const catchCycle = Math.sin(t * 0.6 + i * 1.3);
      const isCatching = catchCycle > 0.75;
      const catchProgress = isCatching ? (catchCycle - 0.75) / 0.25 : 0;

      const tentacleLen = 5 + Math.floor(pulse * 1.5); // extends when disc opens

      for (let seg = 1; seg <= tentacleLen; seg++) {
        const frac = seg / tentacleLen;
        // Wave: lateral sway increases toward tip
        const sway = Math.sin(phase + seg * 0.6) * frac * 1.8;
        // If catching, curl tip back toward mouth
        const curlAngle = baseAngle + sway * 0.35
          - (isCatching ? catchProgress * frac * 1.2 : 0);
        // Tentacle extends from oral disc edge
        const startR = mouthR;
        const r = startR + seg * 1.15;
        const tx = cx + Math.cos(curlAngle) * r;
        const ty = mouthY + Math.sin(curlAngle) * r * 0.55;
        const px = Math.round(tx);
        const py = Math.round(ty);
        if (px >= 0 && px < cols && py >= 0 && py < rows && py < mouthY + 1) {
          const ch = seg === tentacleLen ? (isCatching ? "*" : ".") : (seg % 2 === 0 ? "-" : "'");
          g[py][px] = ch;
        }
      }

      // Prey particle drifting toward a catching tentacle
      if (isCatching) {
        const tipFrac = catchProgress;
        const tipR = mouthR + tentacleLen * 1.15;
        const targetR = tipR * (1 - tipFrac * 0.7);
        const px = Math.round(cx + Math.cos(baseAngle) * targetR);
        const py = Math.round(mouthY + Math.sin(baseAngle) * targetR * 0.55);
        if (px >= 0 && px < cols && py >= 0 && py < rows && py < mouthY + 1) {
          g[py][px] = "@";
        }
      }
    }

    // Ambient plankton drifting across the frame (deterministic from t)
    const numDrifters = 6;
    for (let d = 0; d < numDrifters; d++) {
      // Each drifter has a fixed "lane" and phase so it loops smoothly
      const laneY = 1 + Math.round((d * 7919) % (mouthY - 2));
      const speed = 0.4 + (d * 0.13) % 0.5;
      const px = Math.round(((t * speed * 4 + d * 13.7) % (cols + 4)) - 2);
      const py = laneY;
      const wobbleY = Math.round(Math.sin(t * 1.2 + d * 2.3) * 0.8);
      const fy = py + wobbleY;
      if (px >= 0 && px < cols && fy >= 0 && fy < rows && g[fy][px] === " ") {
        g[fy][px] = d % 3 === 0 ? "+" : ".";
      }
    }

    // Water current ripple lines (faint, horizontal)
    for (let r = 1; r < mouthY - 1; r++) {
      const ripplePhase = t * 0.7 + r * 0.9;
      const rippleX = Math.round((Math.sin(ripplePhase) * 0.5 + 0.5) * (cols - 8) + 4);
      if (rippleX >= 0 && rippleX < cols - 2 && g[r][rippleX] === " ") {
        g[r][rippleX] = "~";
        if (rippleX + 1 < cols && g[r][rippleX + 1] === " ") g[r][rippleX + 1] = "~";
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
