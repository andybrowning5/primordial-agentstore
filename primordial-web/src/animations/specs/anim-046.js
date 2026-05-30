export default {
  id: 46,
  system: "Quorum sensing",
  title: "Colony Consensus",
  caption: "Bacteria count their neighbors, then speak as one.",
  cols: 54,
  rows: 18,
  palette: "microbe",
  frame(t) {
    const cols = 54, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Fixed bacterial colony positions (deterministic scatter)
    const bacteria = [
      [7, 3], [14, 2], [22, 4], [30, 3], [38, 2], [46, 4],
      [4, 7], [11, 6], [19, 8], [27, 7], [35, 6], [43, 8],
      [8, 11], [16, 10], [24, 12], [32, 11], [40, 10], [48, 12],
      [5, 15], [13, 14], [21, 16], [29, 15], [37, 14], [45, 16],
      [10, 4], [18, 3], [26, 5], [34, 4], [42, 3],
      [7, 9], [15, 8], [23, 10], [31, 9], [39, 8], [47, 10],
      [12, 13], [20, 14], [28, 12], [36, 13], [44, 14],
    ];

    // Quorum threshold cycle: slow build-up, then collective activation, repeat
    // Full cycle ~16 seconds: 0..8 = building, 8..12 = activated, 12..16 = reset
    const cycleLen = 16;
    const tCycle = t % cycleLen;
    const buildPhase = Math.min(tCycle / 8, 1);           // 0..1 over first 8s
    const activated = tCycle >= 8 && tCycle < 12;          // collective ON
    const resetPhase = tCycle >= 12;                        // fading back

    // Density signal: how "loud" the quorum is right now
    const quorum = activated
      ? 1.0
      : resetPhase
        ? Math.max(0, 1 - (tCycle - 12) / 4)
        : buildPhase;

    // Signal molecule emission ring per bacterium
    // Each bacterium emits rings at different phases so they stagger
    for (let bi = 0; bi < bacteria.length; bi++) {
      const [bx, by] = bacteria[bi];
      const phaseOffset = (bi * 2.3) % (Math.PI * 2);

      // Number of visible rings scales with quorum level
      const ringCount = activated ? 3 : Math.floor(quorum * 2.5) + 1;

      for (let ri = 0; ri < ringCount; ri++) {
        // Ring expands outward from bacterium, then fades
        const ringSpeed = activated ? 1.8 : 0.9;
        const ringPeriod = activated ? 2.0 : 3.5;
        const ringT = ((t * ringSpeed + phaseOffset + ri * (ringPeriod / ringCount)) % ringPeriod) / ringPeriod;
        const maxRadius = activated ? 7 : 4;
        const radius = ringT * maxRadius;

        // Draw ring as discrete signal molecules along the circumference
        const molCount = Math.max(4, Math.floor(radius * 3));
        for (let mi = 0; mi < molCount; mi++) {
          const angle = (mi / molCount) * Math.PI * 2;
          const mx = Math.round(bx + Math.cos(angle) * radius * 1.8);
          const my = Math.round(by + Math.sin(angle) * radius * 0.7);
          if (mx >= 0 && mx < cols && my >= 0 && my < rows) {
            // Fade out as ring expands; use different chars for near/far
            if (radius < 1.2) {
              g[my][mx] = activated ? "*" : ".";
            } else if (radius < 2.5) {
              if (g[my][mx] === " ") g[my][mx] = activated ? "o" : ":";
            } else if (radius < maxRadius * 0.75) {
              if (g[my][mx] === " ") g[my][mx] = activated ? "~" : "`";
            } else {
              if (g[my][mx] === " ") g[my][mx] = ".";
            }
          }
        }
      }
    }

    // Draw the bacteria themselves (on top of signals)
    for (let bi = 0; bi < bacteria.length; bi++) {
      const [bx, by] = bacteria[bi];
      const phaseOffset = (bi * 1.7) % (Math.PI * 2);

      // Cell body: pulses faster when activated
      const pulseRate = activated ? 4.0 : 1.2;
      const pulse = Math.sin(t * pulseRate + phaseOffset) * 0.5 + 0.5;

      // Activated cells glow brighter
      let cellChar;
      if (activated) {
        cellChar = pulse > 0.6 ? "@" : "O";
      } else if (quorum > 0.5) {
        cellChar = pulse > 0.5 ? "O" : "0";
      } else {
        cellChar = pulse > 0.5 ? "0" : "o";
      }

      if (by >= 0 && by < rows && bx >= 0 && bx < cols) {
        g[by][bx] = cellChar;
      }
      // Cell elongation (bacteria are oval-ish)
      if (bx + 1 < cols && by >= 0 && by < rows) {
        g[by][bx + 1] = activated ? (pulse > 0.5 ? "@" : "O") : "o";
      }
    }

    // Threshold indicator line — a wavering horizontal threshold bar
    // Appears as a faint dotted line that fills in as quorum approaches
    if (!activated && quorum > 0.15) {
      const barRow = Math.floor(rows * 0.5);
      const fillAmt = Math.floor(quorum * cols);
      const barPulse = Math.sin(t * 2.5) * 0.5 + 0.5;
      for (let x = 0; x < fillAmt; x++) {
        if (g[barRow][x] === " ") {
          // Dashed threshold line, faint
          if ((x + Math.floor(t * 3)) % 5 === 0) {
            g[barRow][x] = "-";
          }
        }
      }
    }

    // Collective activation pulse wave — sweeps across the colony at threshold
    if (activated) {
      const wavePos = ((tCycle - 8) / 4) * (cols + 8) - 4;
      for (let y = 0; y < rows; y++) {
        for (let dx = -1; dx <= 1; dx++) {
          const wx = Math.round(wavePos + Math.sin(y * 0.8 + t) * 2) + dx;
          if (wx >= 0 && wx < cols && g[y][wx] === " ") {
            g[y][wx] = dx === 0 ? "|" : "~";
          }
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
