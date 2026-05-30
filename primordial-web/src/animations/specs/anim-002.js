export default {
  id: 2,
  system: "Meiosis",
  title: "Four From One",
  caption: "Chromosomes entwine, cross, and split — life shuffled into four.",
  cols: 52,
  rows: 18,
  palette: "dna",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Phase cycle: 0-8s loop
    // 0..2  : single diploid cell, chromosomes condensing
    // 2..4  : homologs align at center (metaphase I), crossing-over
    // 4..5  : first division — cell pinches into two
    // 5..6  : two cells, each with mixed chromosomes
    // 6..7  : second division — each cell pinches again
    // 7..8  : four haploid cells
    const PERIOD = 9;
    const phase = ((t % PERIOD) + PERIOD) % PERIOD;

    // Clamp helper
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    // Smooth step 0..1 from a..b
    function smooth(x, a, b) {
      const u = clamp((x - a) / (b - a), 0, 1);
      return u * u * (3 - 2 * u);
    }

    // Draw a cell outline (ellipse) centered at (cx,cy) with radii rx,ry
    function drawCell(cx, cy, rx, ry, char) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          const r = dx * dx + dy * dy;
          const edge = Math.abs(Math.sqrt(r) - 1);
          if (edge < 0.12) {
            const xi = Math.round(x), yi = Math.round(y);
            if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
              g[yi][xi] = char;
            }
          }
        }
      }
    }

    // Draw a nucleus outline
    function drawNucleus(cx, cy, rx, ry) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          const r = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(r - 1) < 0.15) {
            const xi = Math.round(x), yi = Math.round(y);
            if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
              if (g[yi][xi] === " ") g[yi][xi] = ".";
            }
          }
        }
      }
    }

    // Draw a chromosome as a curved rod
    // cx,cy: center; angle: orientation; len: half-length; thickness char
    function drawChromosome(cx, cy, angle, len, char1, char2) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (let i = -len; i <= len; i += 0.5) {
        const px = cx + cos * i;
        const py = cy + sin * i;
        const xi = Math.round(px), yi = Math.round(py);
        if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
          const frac = (i + len) / (2 * len);
          g[yi][xi] = frac < 0.5 ? char1 : char2;
        }
      }
    }

    // Draw crossing-over X shape between two chromosome arms
    function drawCrossover(cx, cy, size, progress) {
      const p = clamp(progress, 0, 1);
      const arm = size * p;
      const diags = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (let i = 0; i <= arm; i += 0.6) {
        for (const [dx, dy] of diags) {
          const xi = Math.round(cx + dx * i);
          const yi = Math.round(cy + dy * i * 0.5);
          if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
            g[yi][xi] = i < 0.6 ? "X" : (dx * dy > 0 ? "\\" : "/");
          }
        }
      }
    }

    const cy = rows / 2;
    const cx = cols / 2;

    if (phase < 2) {
      // Phase 0-2: Single diploid cell with condensing chromosomes
      const condense = smooth(phase, 0.2, 1.8);
      drawCell(cx, cy, cols * 0.38, rows * 0.42, "@");
      drawNucleus(cx, cy, cols * 0.22, rows * 0.28);

      // 4 chromosomes condensing (getting shorter/thicker)
      const baseLen = 5.5 - condense * 2.5;
      drawChromosome(cx - 4, cy - 2, 0.3, baseLen, "O", "o");
      drawChromosome(cx + 4, cy - 2, -0.3, baseLen, "O", "o");
      drawChromosome(cx - 4, cy + 2, 0.5, baseLen, "0", "o");
      drawChromosome(cx + 4, cy + 2, -0.5, baseLen, "0", "o");

      // Pulse dot in center of nucleus
      if (Math.floor(t * 3) % 2 === 0) {
        const ni = Math.round(cx), nj = Math.round(cy);
        if (ni >= 0 && ni < cols && nj >= 0 && nj < rows) g[nj][ni] = "*";
      }

    } else if (phase < 4) {
      // Phase 2-4: Metaphase I — homologs align, crossing-over forms
      const alignProg = smooth(phase, 2, 3.2);
      const crossProg = smooth(phase, 3.0, 3.9);
      drawCell(cx, cy, cols * 0.38, rows * 0.42, "@");

      // Chromosomes migrate to center plate
      const spread = (1 - alignProg) * 4;
      drawChromosome(cx - 1 - spread, cy - 2, Math.PI / 2, 3.5, "O", "O");
      drawChromosome(cx + 1 + spread, cy - 2, Math.PI / 2, 3.5, "o", "o");
      drawChromosome(cx - 1 - spread, cy + 2, Math.PI / 2, 3.5, "0", "0");
      drawChromosome(cx + 1 + spread, cy + 2, Math.PI / 2, 3.5, "o", "o");

      // Crossing-over chiasmata
      drawCrossover(cx, cy - 2, 4, crossProg);
      drawCrossover(cx, cy + 2, 4, crossProg);

      // Spindle fibers
      if (alignProg > 0.4) {
        const fi = clamp(Math.round(alignProg * 3), 0, 3);
        for (let f = 0; f <= fi; f++) {
          const fy = Math.round(cy - 4 + f * 2.7);
          for (let x = Math.round(cx - 14); x <= Math.round(cx - 2); x++) {
            if (x >= 0 && x < cols && fy >= 0 && fy < rows && g[fy][x] === " ") g[fy][x] = "-";
          }
          for (let x = Math.round(cx + 2); x <= Math.round(cx + 14); x++) {
            if (x >= 0 && x < cols && fy >= 0 && fy < rows && g[fy][x] === " ") g[fy][x] = "-";
          }
        }
      }

    } else if (phase < 5) {
      // Phase 4-5: First division — cell pinches into two
      const pinch = smooth(phase, 4, 4.9);
      const waist = 1 - pinch * 0.88;

      // Two emerging lobes
      const sepX = pinch * cols * 0.18;
      drawCell(cx - sepX, cy, cols * 0.22, rows * 0.38, "@");
      drawCell(cx + sepX, cy, cols * 0.22, rows * 0.38, "@");

      // Pinch bar at center (cleavage furrow)
      if (pinch < 0.85) {
        const gapHalf = Math.round(waist * rows * 0.35);
        for (let y = Math.round(cy - gapHalf); y <= Math.round(cy + gapHalf); y++) {
          const xi = Math.round(cx);
          if (xi >= 0 && xi < cols && y >= 0 && y < rows) g[y][xi] = "|";
        }
      }

      // Chromosomes separating
      const cs = pinch * 7;
      drawChromosome(cx - cs - 1, cy - 2, Math.PI / 2, 2.5, "O", "o");
      drawChromosome(cx + cs + 1, cy - 2, Math.PI / 2, 2.5, "0", "o");
      drawChromosome(cx - cs - 1, cy + 2, Math.PI / 2, 2.5, "O", "o");
      drawChromosome(cx + cs + 1, cy + 2, Math.PI / 2, 2.5, "0", "o");

    } else if (phase < 6) {
      // Phase 5-6: Two cells, each preparing for second division
      const pulse = Math.sin(t * 3) * 0.04;
      const c1x = cx - cols * 0.22, c2x = cx + cols * 0.22;

      drawCell(c1x, cy, cols * 0.2 + pulse, rows * 0.36, "@");
      drawCell(c2x, cy, cols * 0.2 + pulse, rows * 0.36, "@");
      drawNucleus(c1x, cy, cols * 0.1, rows * 0.2);
      drawNucleus(c2x, cy, cols * 0.1, rows * 0.2);

      // Chromosomes inside each cell
      const jitter = Math.sin(t * 4) * 0.5;
      drawChromosome(c1x, cy - 2 + jitter, 0.4, 2.5, "O", "o");
      drawChromosome(c1x, cy + 2 - jitter, -0.4, 2.5, "O", "o");
      drawChromosome(c2x, cy - 2 + jitter, 0.4, 2.5, "0", "o");
      drawChromosome(c2x, cy + 2 - jitter, -0.4, 2.5, "0", "o");

    } else if (phase < 7) {
      // Phase 6-7: Second division — each cell splits again
      const pinch2 = smooth(phase, 6, 6.9);
      const c1x = cx - cols * 0.22, c2x = cx + cols * 0.22;
      const subSep = pinch2 * rows * 0.3;

      drawCell(c1x, cy - subSep, cols * 0.18, rows * 0.22, "@");
      drawCell(c1x, cy + subSep, cols * 0.18, rows * 0.22, "@");
      drawCell(c2x, cy - subSep, cols * 0.18, rows * 0.22, "@");
      drawCell(c2x, cy + subSep, cols * 0.18, rows * 0.22, "@");

      // Cleavage furrows
      if (pinch2 < 0.85) {
        const fxi1 = Math.round(c1x), fxi2 = Math.round(c2x);
        const frow = Math.round(cy);
        for (let x = fxi1 - 4; x <= fxi1 + 4; x++) {
          if (x >= 0 && x < cols && frow >= 0 && frow < rows && g[frow][x] === " ") g[frow][x] = "=";
        }
        for (let x = fxi2 - 4; x <= fxi2 + 4; x++) {
          if (x >= 0 && x < cols && frow >= 0 && frow < rows && g[frow][x] === " ") g[frow][x] = "=";
        }
      }

    } else {
      // Phase 7-9: Four haploid cells — gentle pulse, then reset
      const fadeIn = smooth(phase, 7, 7.8);
      const breathe = 1 + Math.sin(t * 2.5) * 0.03 * fadeIn;
      const c1x = cx - cols * 0.22, c2x = cx + cols * 0.22;
      const vSep = rows * 0.26;

      const centers = [
        [c1x, cy - vSep],
        [c1x, cy + vSep],
        [c2x, cy - vSep],
        [c2x, cy + vSep],
      ];

      for (let i = 0; i < 4; i++) {
        const [hcx, hcy] = centers[i];
        const phase_off = (i * Math.PI) / 2;
        const br = breathe + Math.sin(t * 2.5 + phase_off) * 0.025;
        drawCell(hcx, hcy, cols * 0.14 * br, rows * 0.2 * br, "@");

        // Single chromosome per haploid cell
        const angle = 0.3 + i * 0.4;
        const cchar = i % 2 === 0 ? "O" : "0";
        drawChromosome(hcx, hcy, angle, 2.2, cchar, "o");
      }

      // Label "x4" hint at bottom when fully visible
      if (fadeIn > 0.7) {
        const lx = Math.round(cx) - 1, ly = rows - 2;
        if (lx >= 0 && lx + 1 < cols && ly >= 0 && ly < rows) {
          g[ly][lx] = "x"; g[ly][lx + 1] = "4";
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
