export default {
  id: 69,
  system: "Chromosome condensation",
  title: "Chromatin Coils",
  caption: "Loose chromatin threads coil and compact into dense chromosomes.",
  cols: 52,
  rows: 18,
  palette: "dna",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // condensation progress: 0 = diffuse chromatin, 1 = fully condensed X-chromosome
    // slow oscillation so it expands and condenses repeatedly
    const phase = (t * 0.18) % 1;
    // smooth ease in-out using cosine
    const c = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);

    const cx = cols / 2;
    const cy = rows / 2;

    // --- Stage 1: diffuse chromatin fibre network (visible when c near 0) ---
    // Draw wandering fibre strands as sine curves across the grid
    const fibOpacity = 1 - c; // fades out as condensation progresses

    if (fibOpacity > 0.05) {
      const fibChars = [".", ":", "~", "-", ",", "`", "'"];
      const numFibres = 8;
      for (let f = 0; f < numFibres; f++) {
        const amp = (rows * 0.38) * fibOpacity;
        const freq = 0.8 + f * 0.3;
        const phaseOff = (f * 2.4) + t * (0.4 + f * 0.07);
        const xStart = Math.floor((f / numFibres) * cols);
        const xEnd = Math.floor(((f + 1) / numFibres) * cols) + 4;
        for (let x = xStart; x < Math.min(xEnd, cols); x++) {
          const ci = Math.floor((f * 3 + x) % fibChars.length);
          const y = Math.round(cy + amp * Math.sin(freq * (x / cols) * Math.PI * 2 + phaseOff));
          if (y >= 0 && y < rows) {
            g[y][x] = fibChars[ci];
          }
          // secondary thread
          const y2 = Math.round(cy + amp * 0.6 * Math.cos(freq * (x / cols) * Math.PI * 2 + phaseOff + 1.1));
          if (y2 >= 0 && y2 < rows) {
            if (g[y2][x] === " ") g[y2][x] = fibChars[(ci + 2) % fibChars.length];
          }
        }
      }
    }

    // --- Stage 2: condensing chromosome body (two sister chromatids forming an X) ---
    // Chromosome arms: top-left, top-right, bottom-left, bottom-right
    // Centromere sits at (cx, cy). Arms extend outward as c increases.
    const armLen = c * rows * 0.38;        // how far arms extend
    const armWidth = Math.max(1, 3 * (1 - c * 0.5)); // arms thin as they condense

    // helper: draw a filled line segment from (x0,y0) toward angle, length l, width w
    function drawArm(x0, y0, dx, dy, len, w, intensity) {
      const steps = Math.ceil(len * 1.6);
      for (let s = 0; s <= steps; s++) {
        const frac = s / Math.max(steps, 1);
        const px = x0 + dx * len * frac;
        const py = y0 + dy * len * frac;
        // perpendicular spread
        const perpX = -dy, perpY = dx;
        const halfW = w * (1 - frac * 0.4); // taper toward tip
        for (let wi = -Math.ceil(halfW); wi <= Math.ceil(halfW); wi++) {
          const gx = Math.round(px + perpX * wi);
          const gy = Math.round(py + perpY * wi);
          if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
            const dist = Math.abs(wi) / Math.max(halfW, 0.5);
            if (dist < 0.3) {
              g[gy][gx] = intensity > 0.85 ? "@" : (intensity > 0.6 ? "#" : "O");
            } else if (dist < 0.7) {
              g[gy][gx] = intensity > 0.7 ? "O" : "o";
            } else if (g[gy][gx] === " " || g[gy][gx] === ".") {
              g[gy][gx] = "o";
            }
          }
        }
      }
    }

    // pulse the density of the chromosome body
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.1);
    const bodyIntensity = c * pulse;

    if (c > 0.05) {
      // X-chromosome: 4 arms at ~45-degree angles
      // Top-left arm
      drawArm(cx, cy, -0.55, -0.83, armLen, armWidth, bodyIntensity);
      // Top-right arm
      drawArm(cx, cy,  0.55, -0.83, armLen, armWidth, bodyIntensity);
      // Bottom-left arm
      drawArm(cx, cy, -0.55,  0.83, armLen, armWidth, bodyIntensity);
      // Bottom-right arm
      drawArm(cx, cy,  0.55,  0.83, armLen, armWidth, bodyIntensity);

      // Centromere — pinched junction
      const centR = Math.max(1.2, armWidth * 0.6);
      for (let dy2 = -Math.ceil(centR); dy2 <= Math.ceil(centR); dy2++) {
        for (let dx2 = -Math.ceil(centR); dx2 <= Math.ceil(centR); dx2++) {
          const r = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          if (r <= centR) {
            const gx = Math.round(cx + dx2);
            const gy = Math.round(cy + dy2);
            if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
              g[gy][gx] = bodyIntensity > 0.7 ? "@" : "#";
            }
          }
        }
      }

      // Coiling detail: small arcs along each arm surface suggesting supercoiling
      if (c > 0.35) {
        const coilIntensity = (c - 0.35) / 0.65;
        const numCoils = Math.floor(coilIntensity * 5);
        const armDirs = [
          [-0.55, -0.83], [0.55, -0.83], [-0.55, 0.83], [0.55, 0.83]
        ];
        for (const [adx, ady] of armDirs) {
          for (let k = 1; k <= numCoils; k++) {
            const frac = k / (numCoils + 1);
            const bx = Math.round(cx + adx * armLen * frac);
            const by = Math.round(cy + ady * armLen * frac);
            // perpendicular tick
            const perpX = -ady, perpY = adx;
            const tickLen = armWidth * 0.8 * (1 - frac * 0.3);
            for (let ti = -Math.ceil(tickLen); ti <= Math.ceil(tickLen); ti++) {
              const gx = Math.round(bx + perpX * ti * 0.5);
              const gy = Math.round(by + perpY * ti * 0.5);
              if (gx >= 0 && gx < cols && gy >= 0 && gy < rows && g[gy][gx] === " ") {
                g[gy][gx] = "+";
              }
            }
          }
        }
      }
    }

    // --- Histone/condensin labels: small markers that coalesce as c grows ---
    if (c > 0.15) {
      const numMarkers = Math.floor(c * 10);
      for (let m = 0; m < numMarkers; m++) {
        const angle = (m / numMarkers) * Math.PI * 2 + t * 0.3;
        const radius = (1 - c) * cols * 0.28 + c * cols * 0.06;
        const mx = Math.round(cx + Math.cos(angle) * radius);
        const my = Math.round(cy + Math.sin(angle) * radius * 0.55);
        if (mx >= 0 && mx < cols && my >= 0 && my < rows && g[my][mx] === " ") {
          g[my][mx] = c > 0.6 ? "*" : "·";
        }
      }
    }

    // Ensure every row is exactly cols wide
    return g.map((row) => {
      const line = row.join("");
      return line.length < cols ? line + " ".repeat(cols - line.length) : line.slice(0, cols);
    }).join("\n");
  }
};
