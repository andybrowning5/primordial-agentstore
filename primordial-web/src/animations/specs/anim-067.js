export default {
  id: 67,
  system: "Lysosome digestion",
  title: "Acid Hydrolysis",
  caption: "Enzymes dissolve the swallowed debris into molecular dust.",
  cols: 52,
  rows: 18,
  palette: "immune",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cy = rows / 2;
    const cx = cols / 2;

    // Lysosome radius (gently pulses)
    const pulse = Math.sin(t * 1.4) * 0.04;
    const rx = cols * 0.30 + pulse * cols * 0.02;
    const ry = rows * 0.38 + pulse * rows * 0.02;

    // --- Draw lysosome membrane (slightly irregular ellipse) ---
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        // Add slight wobble to membrane
        const angle = Math.atan2(dy, dx);
        const wobble = 1 + 0.045 * Math.sin(3 * angle + t * 1.1) + 0.025 * Math.sin(5 * angle - t * 0.7);
        const r = Math.sqrt(dx * dx + dy * dy) / wobble;
        const edge = Math.abs(r - 1.0);

        if (edge < 0.055) {
          g[y][x] = "@";
        } else if (edge < 0.13) {
          g[y][x] = "o";
        }
      }
    }

    // --- Cargo particle being digested ---
    // Cargo shrinks over the digest cycle (period ~6s)
    const digestCycle = (t % 6.0) / 6.0;           // 0..1
    const cargoScale = 1.0 - digestCycle * 0.88;    // starts full, nearly gone
    const cargoCx = cx - 2 + Math.sin(t * 0.5) * 1.5;
    const cargoCy = cy + Math.cos(t * 0.4) * 1.2;
    const cargoRx = cols * 0.085 * cargoScale;
    const cargoRy = rows * 0.14 * cargoScale;

    if (cargoScale > 0.08) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - cargoCx) / (cargoRx + 0.001);
          const dy = (y - cargoCy) / (cargoRy + 0.001);
          const r = Math.sqrt(dx * dx + dy * dy);
          const edge = Math.abs(r - 1.0);
          // Only draw if inside lysosome membrane
          const lx = (x - cx) / rx;
          const ly = (y - cy) / ry;
          const la = Math.atan2(ly, lx);
          const lw = 1 + 0.045 * Math.sin(3 * la + t * 1.1) + 0.025 * Math.sin(5 * la - t * 0.7);
          const lr = Math.sqrt(lx * lx + ly * ly) / lw;
          if (lr < 0.92) {
            if (edge < 0.10) {
              g[y][x] = "#";
            } else if (r < 0.90) {
              const hash = ((x * 17 + y * 31 + Math.floor(t * 4)) % 7);
              if (hash < 3) g[y][x] = "%";
              else if (hash < 5) g[y][x] = "&";
            }
          }
        }
      }
    }

    // --- Enzyme molecules swarming inside (small moving dots) ---
    const enzymeCount = 18;
    for (let i = 0; i < enzymeCount; i++) {
      const phase = (i / enzymeCount) * Math.PI * 2;
      const speed = 0.6 + (i % 5) * 0.18;
      const orbitR = 0.25 + ((i * 7) % 11) / 11.0 * 0.52;
      const ex = cx + orbitR * rx * Math.cos(phase + t * speed);
      const ey = cy + orbitR * ry * Math.sin(phase + t * speed * 0.77);
      const ix = Math.round(ex);
      const iy = Math.round(ey);
      if (iy >= 0 && iy < rows && ix >= 0 && ix < cols) {
        // Check inside membrane
        const lx = (ix - cx) / rx;
        const ly = (iy - cy) / ry;
        const la = Math.atan2(ly, lx);
        const lw = 1 + 0.045 * Math.sin(3 * la + t * 1.1) + 0.025 * Math.sin(5 * la - t * 0.7);
        const lr = Math.sqrt(lx * lx + ly * ly) / lw;
        if (lr < 0.88 && g[iy][ix] === " ") {
          const enzChar = (i % 3 === 0) ? "*" : (i % 3 === 1) ? "+" : ".";
          g[iy][ix] = enzChar;
        }
      }
    }

    // --- Digested fragments drifting outward (appear mid-cycle) ---
    if (digestCycle > 0.35) {
      const fragCount = 10;
      const progress = (digestCycle - 0.35) / 0.65;
      for (let i = 0; i < fragCount; i++) {
        const phase = (i / fragCount) * Math.PI * 2 + t * 0.3;
        const drift = 0.55 + progress * 0.38;
        const fx = cx + drift * rx * Math.cos(phase);
        const fy = cy + drift * ry * Math.sin(phase);
        const ix = Math.round(fx);
        const iy = Math.round(fy);
        if (iy >= 0 && iy < rows && ix >= 0 && ix < cols) {
          const lx = (ix - cx) / rx;
          const ly = (iy - cy) / ry;
          const la = Math.atan2(ly, lx);
          const lw = 1 + 0.045 * Math.sin(3 * la + t * 1.1) + 0.025 * Math.sin(5 * la - t * 0.7);
          const lr = Math.sqrt(lx * lx + ly * ly) / lw;
          if (lr < 0.90 && g[iy][ix] === " ") {
            g[iy][ix] = (i % 2 === 0) ? "," : "`";
          }
        }
      }
    }

    // --- Acid pH bubbles (tiny rising dots inside) ---
    const bubbleCount = 8;
    for (let i = 0; i < bubbleCount; i++) {
      const bx = cx + ((i * 13 - 26) / 26.0) * rx * 0.72;
      const period = 2.8 + (i % 4) * 0.5;
      const phase = (i / bubbleCount) * period;
      const rawY = ((t * 0.9 + phase) % period) / period; // 0..1 bottom to top
      const by = cy + ry * 0.72 - rawY * ry * 1.35;
      const ix = Math.round(bx);
      const iy = Math.round(by);
      if (iy >= 0 && iy < rows && ix >= 0 && ix < cols) {
        const lx = (ix - cx) / rx;
        const ly = (iy - cy) / ry;
        const la = Math.atan2(ly, lx);
        const lw = 1 + 0.045 * Math.sin(3 * la + t * 1.1) + 0.025 * Math.sin(5 * la - t * 0.7);
        const lr = Math.sqrt(lx * lx + ly * ly) / lw;
        if (lr < 0.85 && g[iy][ix] === " ") {
          g[iy][ix] = "°" in String.prototype ? "o" : "o";
        }
      }
    }

    // Pad every row to exactly cols wide and join
    return g.map((row) => {
      const line = row.join("");
      return line.length < cols ? line + " ".repeat(cols - line.length) : line.slice(0, cols);
    }).join("\n");
  }
};
