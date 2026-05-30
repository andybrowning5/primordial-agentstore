export default {
  id: 8,
  system: "Passive diffusion",
  title: "Gradient Flow",
  caption: "Molecules drift down the gradient, seeking equilibrium.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Membrane: vertical band near center, with pores that open/close
    const memX = Math.round(cols * 0.48);
    for (let y = 0; y < rows; y++) {
      // Pores: a few gaps in the membrane that pulse open/shut
      const pore1 = Math.abs(Math.sin(t * 0.7 + y * 0.9)) < 0.18;
      const pore2 = Math.abs(Math.sin(t * 0.5 + y * 1.3 + 2)) < 0.15;
      if (!pore1 && !pore2) {
        g[y][memX] = "|";
        if (memX + 1 < cols) g[y][memX + 1] = "|";
      }
    }

    // Hash function for deterministic pseudo-random placement
    function hash(a, b, c) {
      let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
      h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
      return (h >>> 0) / 4294967295;
    }

    // Particles: each has a base position and drifts rightward over time
    // Left side: high concentration (many particles)
    const leftCount = 38;
    for (let i = 0; i < leftCount; i++) {
      // Base x/y seeded per particle
      const bx = hash(i, 0, 1) * (memX - 3);
      const by = hash(i, 0, 2) * (rows - 2) + 1;
      // Drift: particle slowly moves right; speed varies per particle
      const speed = 0.04 + hash(i, 0, 3) * 0.06;
      // Wobble for organic feel
      const wobX = Math.sin(t * (0.8 + hash(i, 0, 4) * 0.6) + hash(i, 0, 5) * 6.28) * 1.4;
      const wobY = Math.cos(t * (0.6 + hash(i, 0, 6) * 0.5) + hash(i, 0, 7) * 6.28) * 0.9;
      // Drift progress wraps: particle cycles from left toward membrane
      const drift = (t * speed + hash(i, 0, 8)) % 1.0;
      const px = bx + drift * (memX - 2 - bx) + wobX;
      const py = by + wobY;
      const xi = Math.round(px);
      const yi = Math.round(py);
      if (xi >= 0 && xi < memX && yi >= 0 && yi < rows) {
        // Particles near membrane appear as crossing symbols
        const nearMem = xi >= memX - 3;
        g[yi][xi] = nearMem ? "o" : (hash(i, 1, 9) < 0.4 ? "*" : ".");
      }
    }

    // Right side: low concentration (few particles, recently crossed)
    const rightCount = 14;
    const rightStart = memX + 2;
    for (let i = 0; i < rightCount; i++) {
      const bx = rightStart + hash(i, 1, 1) * (cols - rightStart - 2);
      const by = hash(i, 1, 2) * (rows - 2) + 1;
      const speed = 0.03 + hash(i, 1, 3) * 0.04;
      const wobX = Math.sin(t * (0.5 + hash(i, 1, 4) * 0.5) + hash(i, 1, 5) * 6.28) * 1.2;
      const wobY = Math.cos(t * (0.4 + hash(i, 1, 6) * 0.4) + hash(i, 1, 7) * 6.28) * 0.8;
      // Drift outward from membrane rightward
      const drift = (t * speed + hash(i, 1, 8)) % 1.0;
      const px = bx + drift * (cols - 2 - bx) + wobX;
      const py = by + wobY;
      const xi = Math.round(px);
      const yi = Math.round(py);
      if (xi > memX + 1 && xi < cols && yi >= 0 && yi < rows) {
        g[yi][xi] = hash(i, 2, 9) < 0.35 ? "o" : ".";
      }
    }

    // Crossing particles: a small number actively traversing the membrane pores
    const crossCount = 5;
    for (let i = 0; i < crossCount; i++) {
      const phase = (t * (0.18 + hash(i, 3, 1) * 0.1) + hash(i, 3, 2)) % 1.0;
      // Particle travels from memX-4 to memX+6 across the membrane
      const px = (memX - 4) + phase * 10;
      const py = 1 + hash(i, 3, 3) * (rows - 2);
      const xi = Math.round(px);
      const yi = Math.round(py);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        // Don't overwrite membrane unless it's a pore position
        const onMem = xi === memX || xi === memX + 1;
        if (!onMem) {
          g[yi][xi] = "O";
        } else if (g[yi][xi] === " ") {
          // crossing through a pore
          g[yi][xi] = "O";
        }
      }
    }

    // Gradient shading: density markers on left side
    for (let y = 1; y < rows - 1; y++) {
      // Far left dense zone marker
      const densePulse = Math.sin(t * 1.1 + y * 0.4) * 0.5 + 0.5;
      if (densePulse > 0.82) {
        const xi = Math.round(hash(y, 4, t | 0) * 4);
        if (xi >= 0 && xi < memX && g[y][xi] === " ") {
          g[y][xi] = ":";
        }
      }
    }

    // Labels: concentration indicators (H=high, L=low)
    // Left label at top
    const hiLabel = "HIGH";
    for (let i = 0; i < hiLabel.length; i++) {
      if (i + 1 < memX) g[0][i + 1] = hiLabel[i];
    }
    // Right label at top
    const loLabel = "LOW";
    for (let i = 0; i < loLabel.length; i++) {
      if (memX + 3 + i < cols) g[0][memX + 3 + i] = loLabel[i];
    }

    // Arrows showing direction of net flow (left to right, subtle)
    const arrowY = Math.round(rows / 2);
    const arrowX = memX - 6;
    if (arrowX >= 0 && arrowX + 3 < memX) {
      const arrowPhase = Math.floor(t * 1.8) % 3;
      if (arrowPhase === 0 && g[arrowY][arrowX] === " ") g[arrowY][arrowX] = "-";
      if (arrowPhase <= 1 && arrowX + 1 < memX && g[arrowY][arrowX + 1] === " ") g[arrowY][arrowX + 1] = "-";
      if (arrowX + 2 < memX && g[arrowY][arrowX + 2] === " ") g[arrowY][arrowX + 2] = ">";
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
