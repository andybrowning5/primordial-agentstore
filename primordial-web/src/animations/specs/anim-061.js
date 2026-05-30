export default {
  id: 61,
  system: "Sperm flagellar wave",
  title: "Flagellar Wave",
  caption: "A sinusoidal whip drives the cell through dark currents.",
  cols: 52,
  rows: 18,
  palette: "dna",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- HEAD ---
    // Oval head centered at col 6, mid-row, with gentle vertical bob
    const headCX = 6;
    const headCY = rows / 2 + Math.sin(t * 1.8) * 1.2;
    const headRX = 3.2;
    const headRY = 2.1;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - headCX) / headRX;
        const dy = (y - headCY) / headRY;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 0.55) {
          // nucleus interior
          const pat = ((x * 3 + y * 5 + Math.floor(t * 4)) % 7);
          g[y][x] = pat < 2 ? "%" : pat < 4 ? "o" : "@";
        } else if (r < 0.82) {
          g[y][x] = "@";
        } else if (r < 1.0) {
          g[y][x] = "O";
        } else if (r < 1.18) {
          g[y][x] = "o";
        }
      }
    }

    // --- MIDPIECE (neck connecting head to tail) ---
    // Short dense segment right after the head
    const neckStartX = headCX + Math.round(headRX) + 1;
    const neckEndX = neckStartX + 4;
    for (let x = neckStartX; x <= neckEndX; x++) {
      const frac = (x - neckStartX) / (neckEndX - neckStartX);
      const yBase = headCY + Math.sin(t * 1.8) * 1.2 * (1 - frac);
      const yf = Math.round(yBase);
      if (yf >= 0 && yf < rows) {
        g[yf][x] = frac < 0.5 ? "#" : "=";
      }
      if (yf - 1 >= 0 && frac < 0.3) g[yf - 1][x] = ":";
      if (yf + 1 < rows && frac < 0.3) g[yf + 1][x] = ":";
    }

    // --- FLAGELLUM (sinusoidal travelling wave) ---
    // Wave travels base-to-tip (left to right along the tail)
    // x spans from neckEndX+1 to cols-2
    const tailStartX = neckEndX + 1;
    const tailEndX = cols - 2;
    const tailLen = tailEndX - tailStartX;

    // Amplitude decays slightly from base to tip then returns (real biology)
    // Wave number and speed
    const waveSpeed = 2.8;   // radians/sec
    const waveK = 2.2;       // spatial frequency (radians/col-span)

    // Vertical anchor: midline follows the head bob, fading out along tail
    const midY = rows / 2;
    const headBob = Math.sin(t * 1.8) * 1.2;

    for (let x = tailStartX; x <= tailEndX; x++) {
      const frac = (x - tailStartX) / tailLen;  // 0 at base, 1 at tip

      // Anchor drifts from head position to midline
      const anchorY = midY + headBob * (1 - frac);

      // Amplitude envelope: peaks near 1/3 along, tapering to tip
      const ampEnv = 0.4 + 2.8 * frac * (1 - frac) * (1 - frac * 0.3);

      // Travelling wave phase: propagates toward tip (+x direction)
      const phase = waveK * frac * tailLen - waveSpeed * t;
      const waveY = anchorY + ampEnv * Math.sin(phase);

      const iy = Math.round(waveY);
      const fy = waveY - iy; // fractional part for sub-cell rendering

      // Choose character by speed of change (curvature proxy)
      const dPhase = waveK - 0;
      const curvature = Math.abs(Math.cos(phase));

      let ch;
      if (frac > 0.9) {
        ch = curvature > 0.7 ? "." : "`";
      } else if (frac > 0.6) {
        ch = curvature > 0.6 ? "-" : "~";
      } else if (frac > 0.3) {
        ch = curvature > 0.5 ? "=" : "-";
      } else {
        ch = curvature > 0.4 ? "+" : "=";
      }

      // Draw main strand
      if (iy >= 0 && iy < rows) g[iy][x] = ch;

      // Draw sub-pixel hint row (gives thickness near peaks/troughs)
      const sineSlope = Math.abs(Math.cos(phase));
      if (sineSlope < 0.45) {
        // Near peak/trough — add one extra row for thickness
        const extra = waveY > iy ? iy + 1 : iy - 1;
        const edgeCh = frac > 0.6 ? "'" : ":";
        if (extra >= 0 && extra < rows && g[extra][x] === " ") {
          g[extra][x] = edgeCh;
        }
      }
    }

    // --- TIP ---
    const tipX = tailEndX + 1;
    if (tipX < cols) {
      const frac = 1.0;
      const anchorY = midY + headBob * 0;
      const phase = waveK * tailLen - waveSpeed * t;
      const tipY = Math.round(anchorY + 0.4 * Math.sin(phase));
      if (tipY >= 0 && tipY < rows) g[tipY][tipX] = ".";
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
