export default {
  id: 75,
  system: "Calcium wave across a cell",
  title: "Ca²⁺ Wave",
  caption: "A calcium tide floods the cytoplasm, ion by luminous ion.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Cell geometry — a slightly squashed ellipse
    const cx = cols / 2, cy = rows / 2;
    const rx = cols * 0.44, ry = rows * 0.44;

    // Wave origin pulses from the left edge of the cell, cycling every ~7s
    const period = 7.0;
    const phase = (t % period) / period; // 0..1
    // Wave front radius (in normalised ellipse coords) travels 0 -> ~1.6
    const waveR = phase * 1.6;
    // Secondary echo wave (fainter, behind the front)
    const echoR = waveR - 0.35;

    // Spark / release point near left side of cell
    const srcX = cx - rx * 0.72;
    const srcY = cy;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // Distance from pixel to cell centre in normalised coords
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        const cellR = Math.sqrt(nx * nx + ny * ny);

        // Only draw inside the cell
        if (cellR > 1.0) continue;

        // Distance from pixel to wave source (physical pixels, then normalised)
        const dsx = (x - srcX) / rx;
        const dsy = (y - srcY) / ry;
        const srcDist = Math.sqrt(dsx * dsx + dsy * dsy);

        // Cell membrane border
        const edgeDist = Math.abs(cellR - 1.0);
        if (edgeDist < 0.06) {
          // Membrane brightens where wave hits it
          const membraneHit = Math.abs(srcDist - waveR) < 0.18;
          g[y][x] = membraneHit ? "@" : "O";
          continue;
        }

        // Wave front band
        const frontDist = Math.abs(srcDist - waveR);
        if (frontDist < 0.10) {
          // Brightness by proximity to exact front
          if (frontDist < 0.04) g[y][x] = "#";
          else if (frontDist < 0.07) g[y][x] = "@";
          else g[y][x] = "o";
          continue;
        }

        // Echo ring (trailing ripple)
        if (echoR > 0.05) {
          const echoDist = Math.abs(srcDist - echoR);
          if (echoDist < 0.07) {
            g[y][x] = g[y][x] === " " ? (echoDist < 0.03 ? "+" : "-") : g[y][x];
            continue;
          }
        }

        // Flooded interior — area already passed by wave (srcDist < waveR)
        if (srcDist < waveR - 0.05) {
          // Density of ions fades with distance from source & with depth into flood
          const flood = 1.0 - (srcDist / (waveR + 0.01));
          // Deterministic scatter pattern
          const hash = ((x * 17 + y * 31 + Math.floor(t * 4)) * 2654435761) >>> 0;
          const v = (hash % 1000) / 1000.0;
          if (v < flood * 0.55) {
            if (v < flood * 0.12) g[y][x] = "*";
            else if (v < flood * 0.28) g[y][x] = "·";
            else g[y][x] = ".";
          }
          continue;
        }

        // Quiet cytoplasm ahead of the wave — sparse resting dots
        const hash2 = ((x * 13 + y * 29) * 2246822519) >>> 0;
        if (hash2 % 60 === 0) g[y][x] = "·";
      }
    }

    // Draw the release-point spark (flashes at the start of each wave cycle)
    const sparkAge = phase * period; // seconds since last release
    if (sparkAge < 0.9) {
      const sparkInt = 1.0 - sparkAge / 0.9;
      const sx = Math.round(srcX), sy = Math.round(srcY);
      const sparkChars = ["*", "+", "o", "."];
      const idx = Math.floor(sparkInt * 3.99);
      if (sy >= 0 && sy < rows && sx >= 0 && sx < cols) g[sy][sx] = sparkChars[idx];
      // Tiny cross arms
      if (sparkInt > 0.5) {
        if (sy >= 0 && sy < rows && sx + 1 < cols) g[sy][sx + 1] = "+";
        if (sy >= 0 && sy < rows && sx - 1 >= 0)  g[sy][sx - 1] = "+";
        if (sy + 1 < rows && sx >= 0 && sx < cols) g[sy + 1][sx] = "+";
        if (sy - 1 >= 0   && sx >= 0 && sx < cols) g[sy - 1][sx] = "+";
      }
    }

    // Nucleus — small ellipse near cell centre (slightly right of centre)
    const ncx = Math.round(cx + rx * 0.08), ncy = Math.round(cy);
    const nrx = cols * 0.11, nry = rows * 0.20;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const nx2 = (x - ncx) / nrx;
        const ny2 = (y - ncy) / nry;
        const nr = Math.sqrt(nx2 * nx2 + ny2 * ny2);
        const ne = Math.abs(nr - 1.0);
        if (ne < 0.12) {
          g[y][x] = ne < 0.06 ? "0" : "o";
        }
      }
    }

    return g.map(row => row.join("")).join("\n");
  }
};
