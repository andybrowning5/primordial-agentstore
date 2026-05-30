export default {
  id: 85,
  system: "Slime mold network foraging",
  title: "Slime Mold Network",
  caption: "Tendrils pulse and weave, tracing shortest paths through the dark.",
  cols: 52,
  rows: 18,
  palette: "immune",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: safely set a cell
    function set(x, y, ch) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) {
        // Prefer denser chars over sparser ones
        const rank = " .:~-=+*oO@#";
        if (rank.indexOf(ch) > rank.indexOf(g[y][x])) g[y][x] = ch;
      }
    }

    // Draw a line between two points (Bresenham-ish via parametric)
    function drawTube(x0, y0, x1, y1, pulse, thickness) {
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.ceil(len * 2);
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const px = x0 + dx * frac;
        const py = y0 + dy * frac;
        // Pulse travels along the tube
        const pulseFrac = ((t * 0.7 + pulse - frac) % 1 + 1) % 1;
        let ch;
        if (pulseFrac < 0.07) ch = "O";
        else if (pulseFrac < 0.14) ch = "o";
        else if (thickness > 0.6) ch = "=";
        else ch = "-";
        set(Math.round(px), Math.round(py), ch);
      }
    }

    // Central mass — a pulsing blob at screen center
    const cx = cols / 2, cy = rows / 2;
    const massR = 2.5 + 0.4 * Math.sin(t * 1.3);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) * 0.55, dy = y - cy; // squash horizontally
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < massR - 0.8) set(x, y, "@");
        else if (r < massR) set(x, y, "#");
        else if (r < massR + 0.6) set(x, y, "O");
      }
    }

    // Food sources — fixed positions (small clusters)
    const food = [
      { fx: 6,  fy: 3  },
      { fx: 44, fy: 4  },
      { fx: 8,  fy: 14 },
      { fx: 43, fy: 13 },
      { fx: 26, fy: 2  },
      { fx: 26, fy: 15 },
    ];

    // Draw food clusters
    for (const { fx, fy } of food) {
      const wobble = 0.3 * Math.sin(t * 1.7 + fx);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r < 1.2 + wobble) set(fx + dx, fy + dy, "*");
        }
      }
      set(fx, fy, "+");
    }

    // Network arms — tendrils growing toward food sources.
    // Each arm has a "reach" driven by a slow sine so they extend/retract.
    const arms = [
      { food: 0, phase: 0.0,  pulse: 0.1  },
      { food: 1, phase: 1.1,  pulse: 0.4  },
      { food: 2, phase: 2.2,  pulse: 0.7  },
      { food: 3, phase: 3.3,  pulse: 0.0  },
      { food: 4, phase: 0.6,  pulse: 0.55 },
      { food: 5, phase: 1.8,  pulse: 0.85 },
    ];

    for (const arm of arms) {
      const { fx, fy } = food[arm.food];
      // Reach oscillates so the tendril slowly extends toward food and retreats
      const reach = 0.5 + 0.5 * Math.sin(t * 0.35 + arm.phase);
      const ex = cx + (fx - cx) * reach;
      const ey = cy + (fy - cy) * reach;
      const thickness = 0.4 + 0.4 * reach;
      drawTube(cx, cy, ex, ey, arm.pulse, thickness);
    }

    // Secondary cross-linking tubes between adjacent food sources (the hallmark
    // of slime-mold topology: it builds redundant network paths).
    const links = [
      { a: 0, b: 4, phase: 0.2 },
      { a: 1, b: 4, phase: 0.6 },
      { a: 2, b: 5, phase: 0.9 },
      { a: 3, b: 5, phase: 0.3 },
      { a: 0, b: 2, phase: 0.5 },
      { a: 1, b: 3, phase: 0.75 },
    ];

    for (const lnk of links) {
      const fa = food[lnk.a], fb = food[lnk.b];
      // Cross-links only appear when both arms are reasonably extended
      const reachA = 0.5 + 0.5 * Math.sin(t * 0.35 + arms[lnk.a].phase);
      const reachB = 0.5 + 0.5 * Math.sin(t * 0.35 + arms[lnk.b].phase);
      if (reachA > 0.55 && reachB > 0.55) {
        const mx = (fa.fx + fb.fx) / 2, my = (fa.fy + fb.fy) / 2;
        drawTube(fa.fx, fa.fy, mx, my, lnk.phase, 0.3);
        drawTube(mx, my, fb.fx, fb.fy, lnk.phase + 0.5, 0.3);
      }
    }

    // Exploratory micro-tendrils: thin probes that sweep in arcs around the mass
    const numProbes = 8;
    for (let i = 0; i < numProbes; i++) {
      const baseAngle = (i / numProbes) * Math.PI * 2;
      const sweep = 0.4 * Math.sin(t * 0.6 + i * 0.9);
      const angle = baseAngle + sweep;
      const probeLen = 3.5 + 2.5 * Math.sin(t * 0.5 + i * 1.3);
      const px = cx + Math.cos(angle) * (massR + probeLen) * (1 / 0.55);
      const py = cy + Math.sin(angle) * (massR + probeLen);
      drawTube(cx, cy, px, py, i / numProbes, 0.2);
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
