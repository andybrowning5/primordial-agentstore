export default {
  id: 33,
  system: "Neural network firing",
  title: "Synaptic Cascade",
  caption: "Voltage spikes bloom and race across a web of awakened neurons.",
  cols: 52,
  rows: 18,
  palette: "neuron",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Fixed neuron positions (node index -> [x, y])
    const neurons = [
      [26, 9],   // 0 — center
      [10, 4],   // 1
      [20, 3],   // 2
      [33, 3],   // 3
      [43, 5],   // 4
      [6,  9],   // 5
      [15, 10],  // 6
      [37, 10],  // 7
      [47, 9],   // 8
      [11, 15],  // 9
      [26, 16],  // 10
      [42, 15],  // 11
      [20, 8],   // 12
      [33, 7],   // 13
    ];

    // Directed synapse edges [from, to]
    const edges = [
      [0, 6], [0, 7], [0, 12], [0, 13],
      [1, 2], [1, 6], [1, 9],
      [2, 0], [2, 12],
      [3, 13], [3, 4],
      [4, 7], [4, 8],
      [5, 6], [5, 9],
      [6, 9], [6, 10],
      [7, 8], [7, 11],
      [8, 11],
      [9, 10],
      [10, 11],
      [12, 6], [12, 2],
      [13, 3], [13, 7],
    ];

    // Each neuron fires on a staggered cycle derived from its index
    // fire(n, t) = 0..1 progress through firing arc at this moment
    function firePulse(n) {
      const period = 3.5 + (n * 0.37) % 1.8;
      const phase  = (n * 1.618) % period;
      return ((t + phase) % period) / period; // 0..1 over one period
    }

    // How "lit" is a neuron right now? peaks sharply near 0 of its cycle
    function neuronBrightness(n) {
      const p = firePulse(n);
      // sharp spike near p=0, decays quickly
      const spike = Math.max(0, 1 - p * 12);
      // slow refractory glow in the middle of the period
      const glow  = Math.max(0, Math.sin(p * Math.PI) * 0.35);
      return spike + glow;
    }

    // Draw a line segment using Bresenham, placing a character at each grid cell
    function drawEdge(x0, y0, x1, y1, fromN, toN) {
      x0 = Math.round(x0); y0 = Math.round(y0);
      x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      let cx = x0, cy = y0;
      const len = Math.max(dx, dy) || 1;
      let step = 0;

      // pulse travels from sender's fire phase
      const fromPhase = firePulse(fromN);   // 0..1
      const pulsePos   = fromPhase;          // 0 = at source, 1 = at target

      while (true) {
        const frac = step / len;  // 0 at source, 1 at target
        if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
          // Choose synapse character based on slope
          const adx = Math.abs(x1 - x0), ady = Math.abs(y1 - y0);
          let baseChar;
          if (adx === 0) baseChar = "|";
          else if (ady === 0) baseChar = "-";
          else if ((sx > 0 && sy > 0) || (sx < 0 && sy < 0)) baseChar = "\\";
          else baseChar = "/";

          // Is the pulse close to this segment position?
          const dist = Math.abs(frac - pulsePos);
          const onPulse = dist < 0.12 && fromPhase < 0.9;

          // Also brighten near the firing source neuron
          const nearSrc = frac < 0.15 && neuronBrightness(fromN) > 0.3;

          if (onPulse) {
            g[cy][cx] = "*";
          } else if (nearSrc && g[cy][cx] === " ") {
            g[cy][cx] = "+";
          } else if (g[cy][cx] === " ") {
            g[cy][cx] = baseChar;
          }
        }

        if (cx === x1 && cy === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 <  dx) { err += dx; cy += sy; }
        step++;
        if (step > 200) break; // safety
      }
    }

    // 1. Draw all edges first (background layer)
    for (const [a, b] of edges) {
      const [x0, y0] = neurons[a];
      const [x1, y1] = neurons[b];
      drawEdge(x0, y0, x1, y1, a, b);
    }

    // 2. Draw neurons on top
    for (let n = 0; n < neurons.length; n++) {
      const [nx, ny] = neurons[n];
      const bright = neuronBrightness(n);

      // Node core
      const coreChar = bright > 0.7 ? "@"
                      : bright > 0.4 ? "O"
                      : bright > 0.15 ? "o"
                      : ".";
      if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
        g[ny][nx] = coreChar;
      }

      // Halo ring when firing hard
      if (bright > 0.5) {
        const haloChar = bright > 0.8 ? "o" : ".";
        const offsets = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dx, dy] of offsets) {
          const hx = nx + dx, hy = ny + dy;
          if (hx >= 0 && hx < cols && hy >= 0 && hy < rows && g[hy][hx] === " ") {
            g[hy][hx] = haloChar;
          }
        }
      }
      // Outer halo at peak
      if (bright > 0.85) {
        const outerOffsets = [[-2,0],[2,0],[0,-2],[0,2],[-1,-1],[-1,1],[1,-1],[1,1]];
        for (const [dx, dy] of outerOffsets) {
          const hx = nx + dx, hy = ny + dy;
          if (hx >= 0 && hx < cols && hy >= 0 && hy < rows && g[hy][hx] === " ") {
            g[hy][hx] = "~";
          }
        }
      }
    }

    return g.map(row => row.join("")).join("\n");
  }
};
