export default {
  id: 39,
  system: "Platelet clotting cascade",
  title: "Clot Formation",
  caption: "Platelets swarm the breach as fibrin weaves a crimson seal.",
  cols: 52,
  rows: 18,
  palette: "blood",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: clamp to grid bounds
    function plot(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        // Only overwrite if new char is "stronger"
        const rank = " .,'`-~:=+*oO0@#";
        const cur = g[yi][xi];
        if (rank.indexOf(ch) > rank.indexOf(cur)) g[yi][xi] = ch;
      }
    }

    // --- Vessel walls (top and bottom bands) ---
    for (let x = 0; x < cols; x++) {
      const wavT = Math.sin(x * 0.3 + t * 0.4) * 0.6;
      // Top wall
      const ty = Math.round(1 + wavT);
      for (let wy = 0; wy <= ty; wy++) {
        if (wy >= 0 && wy < rows) g[wy][x] = wy === ty ? "=" : "#";
      }
      // Bottom wall
      const by = Math.round(rows - 2 + wavT);
      for (let wy = by; wy < rows; wy++) {
        if (wy >= 0 && wy < rows) g[wy][x] = wy === by ? "=" : "#";
      }
    }

    // --- Blood flow lines (left to right drift) ---
    const flowChars = ["-", "~", "-", "~"];
    for (let lane = 0; lane < 4; lane++) {
      const laneY = Math.round(4 + lane * 2.5);
      const offset = (t * 8 + lane * 13) % cols;
      for (let i = 0; i < cols; i += 5) {
        const fx = (i + Math.floor(offset)) % cols;
        if (laneY >= 0 && laneY < rows && g[laneY][fx] === " ") {
          g[laneY][fx] = flowChars[lane % 4];
        }
      }
    }

    // --- Wound gap: a break in the right-center of the vessel ---
    const woundX = Math.round(cols * 0.62);
    const woundW = 6;
    for (let wx = woundX; wx < woundX + woundW && wx < cols; wx++) {
      for (let y = 0; y < rows; y++) {
        if (g[y][wx] === "#" || g[y][wx] === "=") g[y][wx] = " ";
      }
    }

    // --- Clot growth over time: clot radius grows with sigmoid of t ---
    const clotProgress = 1 / (1 + Math.exp(-(t - 5) * 0.4)); // 0..1 over ~20s
    const clotCx = woundX + woundW / 2;
    const clotCy = rows / 2;
    const maxR = 4.5;
    const clotR = clotProgress * maxR;

    // Fibrin mesh inside clot (dense cross-hatch)
    if (clotR > 0.5) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = x - clotCx, dy = (y - clotCy) * 1.6;
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r < clotR) {
            const phase = t * 1.2;
            // Fibrin strands: diagonal hatching that animates
            const strand1 = Math.abs((x + y + Math.floor(phase)) % 4) === 0;
            const strand2 = Math.abs((x - y + Math.floor(phase * 0.7)) % 5) === 0;
            const core = r < clotR * 0.5;
            if (core) {
              g[y][x] = strand1 || strand2 ? "#" : "@";
            } else if (strand1) {
              g[y][x] = "+";
            } else if (strand2) {
              g[y][x] = "*";
            } else if (g[y][x] === " ") {
              g[y][x] = "o";
            }
          }
        }
      }
    }

    // --- Fibrin strands radiating outward from clot center ---
    const numStrands = 8;
    for (let s = 0; s < numStrands; s++) {
      const angle = (s / numStrands) * Math.PI * 2 + t * 0.3;
      const strandLen = clotR + 1.5 + Math.sin(t * 1.1 + s) * 0.8;
      for (let step = 0; step < 20; step++) {
        const rr = (step / 20) * strandLen;
        const fx = clotCx + Math.cos(angle) * rr;
        const fy = clotCy + Math.sin(angle) * rr / 1.6;
        const ch = rr < clotR ? "+" : (step % 3 === 0 ? ":" : ".");
        plot(fx, fy, ch);
      }
    }

    // --- Platelets: small discs converging toward the wound ---
    const numPlatelets = 14;
    for (let p = 0; p < numPlatelets; p++) {
      // Each platelet has a lane and phase; it drifts right then spirals toward clot
      const phase = (p / numPlatelets) * Math.PI * 2;
      const speed = 0.6 + (p % 3) * 0.25;
      const laneY = 3 + (p % 7) * 2;

      // x position: starts far left, moves right, attracted to wound
      const rawX = (t * speed * 4 + p * 7) % (cols + 8) - 4;
      const dist = rawX - clotCx;
      const attracted = dist > 0 && dist < 18;
      const py = attracted
        ? laneY + (clotCy - laneY) * Math.min(1, (18 - dist) / 18)
        : laneY;
      const px = rawX;

      // Only draw if not yet absorbed into clot
      const pdx = px - clotCx, pdy = (py - clotCy) * 1.6;
      const pr = Math.sqrt(pdx * pdx + pdy * pdy);
      if (pr > clotR + 0.5) {
        // Platelet body: small oval
        const pulse = Math.sin(t * 2.5 + phase) * 0.3 + 0.7; // 0.4..1.0
        plot(px, py, "O");
        if (pulse > 0.7) {
          plot(px - 1, py, "o");
          plot(px + 1, py, "o");
        }
        plot(px, py - 1 < rows ? py - 1 : py, ".");
        plot(px, py + 1 < rows ? py + 1 : py, ".");
      }
    }

    // --- Activation signals: small sparks near clot edge ---
    const numSparks = 6;
    for (let sk = 0; sk < numSparks; sk++) {
      const sparkAngle = (sk / numSparks) * Math.PI * 2 + t * 1.8;
      const sparkR = clotR + 1.2 + Math.sin(t * 3 + sk * 1.1) * 0.5;
      const sx = clotCx + Math.cos(sparkAngle) * sparkR;
      const sy = clotCy + Math.sin(sparkAngle) * sparkR / 1.6;
      plot(sx, sy, "*");
    }

    // --- Repair: patch walls adjacent to wound as clot matures ---
    if (clotProgress > 0.6) {
      const patchChar = clotProgress > 0.85 ? "=" : "-";
      for (let wx = woundX; wx < woundX + woundW && wx < cols; wx++) {
        const topY = 1;
        const botY = rows - 2;
        if (g[topY][wx] === " " || g[topY][wx] === "-") g[topY][wx] = patchChar;
        if (g[botY][wx] === " " || g[botY][wx] === "-") g[botY][wx] = patchChar;
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
