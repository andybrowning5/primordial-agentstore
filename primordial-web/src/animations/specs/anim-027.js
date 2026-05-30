export default {
  id: 27,
  system: "Neutrophil chemotaxis",
  title: "Chasing the Signal",
  caption: "A neutrophil hunts the chemical plume, reaching toward the wound.",
  cols: 52,
  rows: 18,
  palette: "immune",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- Gradient source (wound / chemoattractant) on the right side ---
    const srcX = cols - 5;
    const srcY = rows / 2 + Math.sin(t * 0.4) * 1.5;

    // Gradient plume: faint dots drifting left from source
    for (let x = 8; x < srcX; x++) {
      for (let y = 1; y < rows - 1; y++) {
        const dist = srcX - x;
        const spread = 1.5 + dist * 0.18;
        const dy = y - srcY;
        const intensity = Math.exp(-(dy * dy) / (2 * spread * spread)) *
                          Math.exp(-dist * 0.045);
        // Phase-shifted wave to make dots appear to drift leftward (away from source)
        const wave = Math.sin(x * 0.55 - t * 1.4 + y * 0.3);
        if (intensity > 0.18 && wave > 0.55) {
          g[y][x] = intensity > 0.55 ? "." : "`";
        }
      }
    }

    // --- Source icon: pulsing wound/bacteria cluster ---
    const pulse = 0.7 + 0.3 * Math.sin(t * 2.2);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const r = Math.sqrt(dx * dx + dy * dy);
        const gy = Math.round(srcY) + dy;
        const gx = srcX + dx;
        if (gy >= 0 && gy < rows && gx >= 0 && gx < cols) {
          if (r < 1.0 * pulse) g[gy][gx] = "#";
          else if (r < 1.8 * pulse) g[gy][gx] = "*";
          else if (r < 2.6 * pulse) g[gy][gx] = "+";
        }
      }
    }

    // --- Neutrophil body ---
    // Cell migrates from left toward the source over time, then loops
    const period = 18.0;
    const tLoop = (t % period) / period; // 0..1
    // easeInOut so it accelerates then decelerates
    const ease = tLoop < 0.5
      ? 2 * tLoop * tLoop
      : 1 - Math.pow(-2 * tLoop + 2, 2) / 2;
    const cellX = 8 + ease * (srcX - 14);
    const cellY = rows / 2 + Math.sin(t * 0.35) * 2.2;

    // Cell body radii (slightly elongated along migration axis)
    const rxCell = 4.5 + 0.4 * Math.sin(t * 1.1);
    const ryCell = 3.2 + 0.3 * Math.sin(t * 0.9 + 1.0);

    // Direction toward source for pseudopod orientation
    const dx0 = srcX - cellX;
    const dy0 = srcY - cellY;
    const dlen = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1;
    const dirX = dx0 / dlen;
    const dirY = dy0 / dlen;

    // Draw cell body
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ddx = (x - cellX) / rxCell;
        const ddy = (y - cellY) / ryCell;
        const r = Math.sqrt(ddx * ddx + ddy * ddy);
        const edge = Math.abs(r - 1.0);
        if (r < 1.0) {
          if (edge < 0.15) {
            g[y][x] = "@";
          } else {
            // Interior: lobed nucleus, animated shimmer
            const nx = x - cellX, ny = y - cellY;
            const nAngle = Math.atan2(ny, nx);
            const nucleusR = 0.45 + 0.08 * Math.cos(nAngle * 3 + t * 0.7);
            const nr = Math.sqrt((nx / 2.5) * (nx / 2.5) + (ny / 2.0) * (ny / 2.0));
            if (nr < nucleusR * 2.0) {
              g[y][x] = nr < nucleusR * 1.2 ? "O" : "o";
            } else {
              const shimmer = Math.sin(x * 1.3 + t * 2.1) * Math.cos(y * 1.7 - t * 1.5);
              g[y][x] = shimmer > 0.6 ? ":" : ".";
            }
          }
        }
      }
    }

    // --- Pseudopods: 2-3 finger-like protrusions toward the source ---
    const numPods = 3;
    for (let p = 0; p < numPods; p++) {
      // Angular spread around the forward direction
      const spreadAngle = (p - 1) * 0.45 + Math.sin(t * 0.8 + p * 2.1) * 0.18;
      const cosA = Math.cos(spreadAngle), sinA = Math.sin(spreadAngle);
      const podDirX = dirX * cosA - dirY * sinA;
      const podDirY = dirX * sinA + dirY * cosA;

      // Pod length pulses
      const podLen = (3.5 + 1.5 * Math.sin(t * 1.3 + p * 2.4)) * (p === 1 ? 1.2 : 0.85);
      const podSteps = Math.floor(podLen * 2);

      // Start from cell edge in pod direction
      const startR = rxCell * 0.95;
      const startX = cellX + podDirX * startR;
      const startY = cellY + podDirY * startR * (ryCell / rxCell);

      for (let s = 0; s <= podSteps; s++) {
        const frac = s / podSteps;
        const px = startX + podDirX * frac * podLen;
        const py = startY + podDirY * frac * podLen;
        const gx = Math.round(px);
        const gy = Math.round(py);
        if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
          if (frac < 0.3) g[gy][gx] = "@";
          else if (frac < 0.65) g[gy][gx] = "o";
          else g[gy][gx] = (Math.floor(t * 4 + p) % 2 === 0) ? "." : ",";
        }
      }
    }

    // Ensure each row is exactly cols wide
    return g.map(row => row.join("").padEnd(cols).slice(0, cols)).join("\n");
  }
};
