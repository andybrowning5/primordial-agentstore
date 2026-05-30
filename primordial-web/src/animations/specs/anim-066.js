export default {
  id: 66,
  system: "Endoplasmic reticulum flow",
  title: "ER Membrane Flow",
  caption: "Cisternae ripple and vesicles bud along the living membrane sea.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: safe grid write
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function get(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // --- Cisternae: sinuous horizontal membrane sheets ---
    // Draw 4 stacked ER cisternae that undulate over time
    const numCisternae = 4;
    for (let ci = 0; ci < numCisternae; ci++) {
      const baseY = 3 + ci * 3.6;
      const phaseShift = ci * 1.1;
      const ampMod = 0.7 + 0.3 * Math.sin(t * 0.4 + ci * 2.3);

      for (let x = 1; x < cols - 1; x++) {
        const fx = x / cols;
        // Layered undulation: slow wave + faster ripple
        const wave = Math.sin(fx * Math.PI * 3 + t * 0.8 + phaseShift) * 1.4 * ampMod
                   + Math.sin(fx * Math.PI * 5.5 - t * 1.2 + phaseShift) * 0.55 * ampMod;
        const y = baseY + wave;

        const yi = Math.floor(y);
        const frac = y - yi;

        if (yi >= 0 && yi < rows) {
          // Outer membrane edge (bright)
          const edgeCh = (Math.abs(frac - 0.5) < 0.18) ? "=" : "-";
          if (g[yi][x] === " ") g[yi][x] = edgeCh;
        }
        // Lumen gap (inner space) — one row below the membrane
        const luY = yi + 1;
        if (luY >= 0 && luY < rows && luY < baseY + wave + 2) {
          const dotPhase = (x * 3 + Math.floor(t * 3 + ci * 7)) % 9;
          if (dotPhase === 0 && g[luY][x] === " ") g[luY][x] = ".";
        }
      }

      // Left and right caps for each cisterna
      const capPhase = ci * 1.1;
      const capWaveL = Math.sin(0 + t * 0.8 + capPhase) * 1.4 * ampMod
                     + Math.sin(0 - t * 1.2 + capPhase) * 0.55 * ampMod;
      const capWaveR = Math.sin(Math.PI * 3 + t * 0.8 + capPhase) * 1.4 * ampMod
                     + Math.sin(Math.PI * 5.5 - t * 1.2 + capPhase) * 0.55 * ampMod;
      put(0, baseY + capWaveL, "(");
      put(cols - 1, baseY + capWaveR, ")");
    }

    // --- Tubular connections between cisternae ---
    // Vertical tubes linking adjacent sheets, positions shift slowly
    const numTubes = 5;
    for (let ti = 0; ti < numTubes; ti++) {
      const tubeX = Math.round(
        8 + ti * 8.5 + Math.sin(t * 0.35 + ti * 1.7) * 2.5
      );
      if (tubeX < 1 || tubeX >= cols - 1) continue;

      // Connect cisternae pairs
      for (let ci = 0; ci < numCisternae - 1; ci++) {
        const y0 = 3 + ci * 3.6 + 1;
        const y1 = 3 + (ci + 1) * 3.6;
        const midY = (y0 + y1) / 2;
        for (let yy = Math.ceil(y0); yy <= Math.floor(y1); yy++) {
          if (yy < 0 || yy >= rows) continue;
          const flowPhase = (yy * 2 - Math.floor(t * 4 + ti * 3)) % 5;
          let ch = "|";
          if (flowPhase === 0) ch = "o";
          else if (flowPhase === 2) ch = ":";
          if (g[yy][tubeX] === " " || g[yy][tubeX] === ".") g[yy][tubeX] = ch;
        }
      }
    }

    // --- Vesicle budding ---
    // Small circular vesicles budding off and drifting
    const numVesicles = 6;
    for (let vi = 0; vi < numVesicles; vi++) {
      const seed = vi * 137.5;
      // Each vesicle has a birth cisterna and drift trajectory
      const birthCi = vi % numCisternae;
      const birthX = 6 + (vi * 41 % (cols - 12));
      const birthY = 3 + birthCi * 3.6;

      // Vesicle lifecycle: 0..1 progress per period
      const period = 4.5 + vi * 0.7;
      const life = ((t * 0.7 + vi * 1.3) % period) / period;

      // Bud phase: 0..0.25 — bulge at membrane
      // Drift phase: 0.25..0.85 — vesicle floats away
      // Fade phase: 0.85..1 — disappears

      const driftDir = (vi % 2 === 0) ? 1 : -1;
      const driftX = birthX + driftDir * (life > 0.25 ? (life - 0.25) * 18 : 0);
      const driftY = birthY + (life > 0.25 ? -(life - 0.25) * 4 : -life * 0.8);

      if (life < 0.85) {
        const vx = Math.round(driftX);
        const vy = Math.round(driftY);
        const size = life < 0.25 ? life / 0.25 : (life > 0.7 ? 1 - (life - 0.7) / 0.15 : 1);

        if (size > 0.5) {
          // Full vesicle ring
          put(vx,     vy - 1, "o");
          put(vx - 1, vy,     "(");
          put(vx + 1, vy,     ")");
          put(vx,     vy + 1, "o");
          // Interior cargo dot
          if (get(vx, vy) === " ") put(vx, vy, "*");
        } else {
          // Small bud
          put(vx, vy, "o");
        }
      }
    }

    // --- Ribosome dots on rough ER regions ---
    // Top two cisternae are rough ER — studded with ribosomes
    for (let ci = 0; ci < 2; ci++) {
      const baseY = 3 + ci * 3.6;
      for (let x = 2; x < cols - 2; x += 3) {
        const wave = Math.sin((x / cols) * Math.PI * 3 + t * 0.8 + ci * 1.1) * 1.4
                   + Math.sin((x / cols) * Math.PI * 5.5 - t * 1.2 + ci * 1.1) * 0.55;
        const ribY = Math.round(baseY + wave) - 1;
        const ribPhase = (Math.floor(t * 2 + x * 0.4 + ci * 5)) % 3;
        const ch = ribPhase === 0 ? "@" : ribPhase === 1 ? "%" : "*";
        if (ribY >= 0 && ribY < rows && g[ribY][x] === " ") g[ribY][x] = ch;
      }
    }

    // --- Calcium ion sparkle in lumen ---
    // Occasional bright flashes inside the ER lumen
    for (let ci = 0; ci < numCisternae; ci++) {
      const baseY = Math.round(3 + ci * 3.6) + 0;
      const sparkX = Math.round(
        cols * 0.5 + Math.sin(t * 1.3 + ci * 2.1) * cols * 0.35
      );
      const sparkPhase = (Math.floor(t * 3 + ci * 4)) % 7;
      if (sparkPhase < 2 && sparkX > 0 && sparkX < cols - 1) {
        if (g[baseY][sparkX] === " " || g[baseY][sparkX] === ".") {
          g[baseY][sparkX] = sparkPhase === 0 ? "+" : "'";
        }
      }
    }

    // Pad every row to exactly cols chars
    return g.map(row => row.join("").padEnd(cols, " ").slice(0, cols)).join("\n");
  }
};
