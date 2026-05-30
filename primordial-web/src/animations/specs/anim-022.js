export default {
  id: 22,
  system: "Krebs cycle",
  title: "Citric Acid Wheel",
  caption: "Eight metabolites spin the wheel that powers every breath.",
  cols: 52,
  rows: 20,
  palette: "energy",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cx = cols / 2;
    const cy = rows / 2;
    const rx = cols * 0.36;
    const ry = rows * 0.40;

    // 8 Krebs cycle intermediates, evenly spaced around the ellipse
    const labels = ["CIT", "ISO", "aKG", "SUC", "FUM", "MAL", "OAA", "ACoA"];
    const n = labels.length;

    // Spin the whole cycle
    const spin = t * 0.35;

    // Draw the elliptical track with dashes
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * rx);
      const y = Math.round(cy + Math.sin(a) * ry);
      if (x >= 0 && x < cols && y >= 0 && y < rows) {
        // Only draw track where no node will sit (roughly)
        const nearNode = labels.some((_, ni) => {
          const na = (ni / n) * Math.PI * 2 + spin;
          const nx = Math.round(cx + Math.cos(na) * rx);
          const ny = Math.round(cy + Math.sin(na) * ry);
          return Math.abs(x - nx) <= 2 && Math.abs(y - ny) <= 1;
        });
        if (!nearNode) {
          if (g[y][x] === " ") g[y][x] = (i % 9 < 3) ? "-" : "·";
        }
      }
    }

    // Draw flow arrows between consecutive nodes
    for (let ni = 0; ni < n; ni++) {
      const a0 = (ni / n) * Math.PI * 2 + spin;
      const a1 = ((ni + 1) / n) * Math.PI * 2 + spin;
      const steps = 12;
      for (let s = 1; s < steps; s++) {
        const frac = s / steps;
        // Animate a traveling pulse along each segment
        const pulse = ((t * 0.7 + ni * 0.125) % 1);
        const a = a0 + (a1 - a0) * frac;
        const x = Math.round(cx + Math.cos(a) * rx);
        const y = Math.round(cy + Math.sin(a) * ry);
        if (x >= 0 && x < cols && y >= 0 && y < rows) {
          const dist = Math.abs(frac - pulse);
          const wrapped = Math.min(dist, 1 - dist);
          if (wrapped < 0.1) {
            g[y][x] = ">";
          } else if (wrapped < 0.2) {
            g[y][x] = "o";
          }
        }
      }
    }

    // Draw the 8 metabolite nodes
    for (let ni = 0; ni < n; ni++) {
      const a = (ni / n) * Math.PI * 2 + spin;
      const nx = Math.round(cx + Math.cos(a) * rx);
      const ny = Math.round(cy + Math.sin(a) * ry);
      const label = labels[ni];

      // Pulsing brightness per node, staggered
      const phase = (t * 1.1 + ni * 0.25) % (Math.PI * 2);
      const bright = Math.sin(phase) > 0.3;

      // Write label centered at node position
      const lx = nx - Math.floor(label.length / 2);
      for (let c = 0; c < label.length; c++) {
        const px = lx + c;
        if (px >= 0 && px < cols && ny >= 0 && ny < rows) {
          g[ny][px] = label[c];
        }
      }

      // Node brackets
      if (ny >= 0 && ny < rows) {
        const l = lx - 1, r = lx + label.length;
        if (l >= 0 && l < cols) g[ny][l] = bright ? "[" : "(";
        if (r >= 0 && r < cols) g[ny][r] = bright ? "]" : ")";
      }
    }

    // Central hub: ATP energy burst
    const hubPulse = Math.sin(t * 2.2) * 0.5 + 0.5;
    const hubChars = ["*", "O", "@", "0", "*"];
    const hubIdx = Math.floor(t * 3) % hubChars.length;

    const centerLines = [
      "  CO2  ",
      "       ",
      " NADH  ",
      "  ATP  ",
      "       ",
      " GTP   ",
    ];
    const startY = Math.round(cy) - 2;
    const centerLabelX = Math.round(cx) - 3;

    for (let li = 0; li < centerLines.length; li++) {
      const line = centerLines[li];
      const py = startY + li;
      if (py < 0 || py >= rows) continue;
      for (let c = 0; c < line.length; c++) {
        const px = centerLabelX + c;
        if (px >= 0 && px < cols && g[py][px] === " ") {
          g[py][px] = line[c];
        }
      }
    }

    // Central pulsing core marker
    const coreY = Math.round(cy);
    const coreX = Math.round(cx);
    // Already filled by centerLines above; add a spark if grid is space
    const sparkOffsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const sparkChar = hubPulse > 0.7 ? "+" : "·";
    for (const [dy, dx] of sparkOffsets) {
      const sy = coreY + dy, sx = coreX + dx;
      if (sy >= 0 && sy < rows && sx >= 0 && sx < cols && g[sy][sx] === " ") {
        g[sy][sx] = sparkChar;
      }
    }

    // CO2 / FADH2 release particles drifting outward from nodes
    const releaseNodes = [1, 2, 4]; // ISO, aKG, FUM produce CO2/FADH2
    for (const ni of releaseNodes) {
      const baseAngle = (ni / n) * Math.PI * 2 + spin;
      const drift = (t * 0.5 + ni) % 1; // 0..1 travel progress
      // Particle drifts radially outward
      const outR = rx + drift * rx * 0.45;
      const outRy = ry + drift * ry * 0.45;
      const px = Math.round(cx + Math.cos(baseAngle) * outR);
      const py = Math.round(cy + Math.sin(baseAngle) * outRy);
      const chars = [".", "·", "*", "+", " "];
      const ci = Math.floor(drift * (chars.length - 1));
      if (px >= 0 && px < cols && py >= 0 && py < rows && g[py][px] === " ") {
        g[py][px] = chars[ci];
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
