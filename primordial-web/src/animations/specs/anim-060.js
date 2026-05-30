export default {
  id: 60,
  system: "Cilia beating in a metachronal wave",
  title: "Metachronal Wave",
  caption: "A living tide — each cilium sweeps in rippled unison.",
  cols: 52,
  rows: 20,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- helper: clamp index ---
    function set(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        g[yi][xi] = ch;
      }
    }

    // --- fluid flow particles drifting rightward above cilia ---
    // small dots that travel with the wave to show propelled fluid
    const numParticles = 18;
    for (let p = 0; p < numParticles; p++) {
      const phase = (p / numParticles) * cols;
      // x position drifts right over time (fluid being pushed)
      const px = ((phase + t * 4.5) % cols);
      // y position floats in the upper 2/3, oscillates gently
      const py = 2 + (p % 7) + Math.sin(t * 1.1 + p * 0.9) * 0.8;
      // intensity: brighter near the wave peak
      const intensity = 0.5 + 0.5 * Math.sin(t * 2.2 + p * 0.4);
      const ch = intensity > 0.72 ? "~" : intensity > 0.4 ? "." : "`";
      set(px, py, ch);
    }

    // --- cilia: evenly spaced along the bottom baseline ---
    const numCilia = 13;
    const baseY = rows - 2; // baseline row (floor)
    const ciliumHeight = 9; // max stalk length in rows

    for (let c = 0; c < numCilia; c++) {
      // x root position
      const rootX = Math.round(2 + (c / (numCilia - 1)) * (cols - 4));

      // metachronal phase: wave travels LEFT to RIGHT
      // each cilium is offset by a fixed phase fraction
      const spatialPhase = (c / numCilia) * Math.PI * 2 * 1.5;
      const beat = Math.sin(t * 2.8 - spatialPhase);

      // power stroke: rapid forward lean (beat > 0 = leaning right/forward)
      // recovery stroke: slower, lean left — we model this with asymmetric waveform
      // Use a sharpened sine to approximate the asymmetry: tanh(2*sin)
      const asymBeat = Math.tanh(2.2 * beat); // ranges ~-1..1, peaky forward

      // tip deflection in x (positive = rightward power stroke)
      const tipDx = asymBeat * 7.5;

      // --- draw stalk as a curve with ~ciliumHeight points ---
      const segments = ciliumHeight;
      let prevX = rootX, prevY = baseY;

      for (let s = 1; s <= segments; s++) {
        const frac = s / segments; // 0 (root) -> 1 (tip)
        // x deflects more toward tip (quadratic arc)
        const x = rootX + tipDx * frac * frac;
        const y = baseY - frac * (ciliumHeight - 1);

        // choose character by position and motion
        let ch;
        if (s === segments) {
          // tip: brighter, shows direction
          ch = asymBeat > 0.3 ? "o" : asymBeat < -0.3 ? "o" : "*";
        } else if (s <= 2) {
          // base: thick anchor
          ch = "|";
        } else {
          // mid stalk: lean direction shows beat phase
          const slope = x - prevX; // dx per step
          if (Math.abs(slope) < 0.35) ch = "|";
          else if (slope > 0) ch = "/";
          else ch = "\\";
        }

        set(x, y, ch);
        prevX = x;
        prevY = y;
      }
    }

    // --- baseline: solid floor ---
    for (let x = 0; x < cols; x++) {
      g[rows - 1][x] = "=";
    }

    // --- wave-crest indicator: a faint traveling marker above cilia ---
    // shows where the wave peak is right now
    const waveFront = ((t * 2.8 / (Math.PI * 2)) % 1) * cols;
    for (let dx = -1; dx <= 1; dx++) {
      const wx = Math.round(waveFront + dx);
      if (wx >= 0 && wx < cols) {
        const wy = rows - 2 - ciliumHeight - 1;
        if (wy >= 0 && g[wy][wx] === " ") {
          g[wy][wx] = dx === 0 ? "^" : "~";
        }
      }
    }

    return g.map(row => row.join("")).join("\n");
  }
};
