export default {
  id: 100,
  system: "Symbiotic algae in a cell",
  title: "Algae Within",
  caption: "Chloroplasts drift and pulse, harvesting light inside their host.",
  cols: 52,
  rows: 20,
  palette: "photosynth",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Host cell — a softly pulsing ellipse membrane
    const cx = cols / 2;
    const cy = rows / 2;
    const rx = cols * 0.44 * (1 + 0.015 * Math.sin(t * 0.7));
    const ry = rows * 0.44 * (1 + 0.015 * Math.cos(t * 0.7));

    // Draw outer membrane
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const r = Math.sqrt(dx * dx + dy * dy);
        const edge = Math.abs(r - 1.0);
        if (edge < 0.055) {
          // Membrane ripple pattern
          const angle = Math.atan2(dy, dx);
          const ripple = Math.sin(angle * 6 + t * 1.2) * 0.5 + 0.5;
          g[y][x] = ripple > 0.55 ? "O" : "o";
        } else if (edge < 0.12 && r > 0.88) {
          g[y][x] = ".";
        }
      }
    }

    // Nucleus — a small dense core near center, slowly drifting
    const nxOff = Math.sin(t * 0.18) * cols * 0.06;
    const nyOff = Math.cos(t * 0.22) * rows * 0.06;
    const nx = cx + nxOff;
    const ny = cy + nyOff;
    const nrx = cols * 0.09;
    const nry = rows * 0.09;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - nx) / nrx;
        const dy = (y - ny) / nry;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 0.55) {
          g[y][x] = (x + y) % 3 === 0 ? "#" : "%";
        } else if (r < 1.0) {
          const ne = Math.abs(r - 0.78);
          if (ne < 0.18) g[y][x] = g[y][x] === " " ? ":" : g[y][x];
        }
      }
    }

    // Symbiotic algae (chloroplast-like bodies) — 5 of them orbiting slowly
    // Each has its own orbital radius, speed, and phase; they pulse with energy
    const algae = [
      { orbitR: 0.26, orbitRy: 0.22, speed: 0.31, phase: 0.0,       sizeX: cols * 0.08, sizeY: rows * 0.10 },
      { orbitR: 0.30, orbitRy: 0.26, speed: 0.19, phase: 1.26,      sizeX: cols * 0.07, sizeY: rows * 0.09 },
      { orbitR: 0.22, orbitRy: 0.32, speed: 0.25, phase: 2.51,      sizeX: cols * 0.09, sizeY: rows * 0.08 },
      { orbitR: 0.34, orbitRy: 0.20, speed: 0.14, phase: 3.77,      sizeX: cols * 0.06, sizeY: rows * 0.10 },
      { orbitR: 0.28, orbitRy: 0.28, speed: 0.22, phase: 5.03,      sizeX: cols * 0.08, sizeY: rows * 0.07 },
    ];

    for (let ai = 0; ai < algae.length; ai++) {
      const a = algae[ai];
      const angle = t * a.speed + a.phase;
      const ax = cx + Math.cos(angle) * cols * a.orbitR;
      const ay = cy + Math.sin(angle) * rows * a.orbitRy;

      // Pulse the algae body size
      const pulse = 1.0 + 0.12 * Math.sin(t * 1.8 + a.phase);
      const arx = a.sizeX * pulse;
      const ary = a.sizeY * pulse;

      // Thylakoid stack phase for internal striation
      const stackPhase = t * 2.2 + a.phase * 1.5;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - ax) / arx;
          const dy = (y - ay) / ary;
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r < 1.0) {
            const edge = Math.abs(r - 1.0);
            if (edge < 0.15) {
              // Outer envelope
              g[y][x] = "@";
            } else {
              // Interior — thylakoid-like striations
              const striation = Math.sin((y - ay) * 1.6 + stackPhase) * 0.5 + 0.5;
              const energyFlash = Math.sin(t * 3.5 + a.phase + r * 4.0) * 0.5 + 0.5;
              if (striation > 0.68) {
                g[y][x] = energyFlash > 0.75 ? "*" : "=";
              } else if (striation > 0.38) {
                g[y][x] = energyFlash > 0.82 ? "+" : "-";
              } else {
                g[y][x] = energyFlash > 0.88 ? "'" : " ";
              }
            }
          } else if (r < 1.18 && g[y][x] === " ") {
            // Soft glow halo around each alga
            const halo = Math.sin(t * 2.0 + a.phase + angle) * 0.5 + 0.5;
            if (halo > 0.72) g[y][x] = ".";
          }
        }
      }
    }

    // Cytoplasmic streaming — sparse drifting particles inside the cell
    for (let i = 0; i < 18; i++) {
      const baseAngle = (i / 18) * Math.PI * 2 + t * 0.08 * (i % 3 === 0 ? 1 : -0.7);
      const baseR = 0.15 + (i % 5) * 0.09;
      const px = cx + Math.cos(baseAngle) * cols * baseR * 0.45;
      const py = cy + Math.sin(baseAngle) * rows * baseR * 0.55;
      const xi = Math.round(px);
      const yi = Math.round(py);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows && g[yi][xi] === " ") {
        const twinkle = Math.sin(t * 4.0 + i * 1.37) > 0.5;
        g[yi][xi] = twinkle ? "`" : ",";
      }
    }

    // Pad each row to exact cols width and join
    return g.map((row) => {
      const s = row.join("");
      return s.length < cols ? s + " ".repeat(cols - s.length) : s.slice(0, cols);
    }).join("\n");
  }
};
