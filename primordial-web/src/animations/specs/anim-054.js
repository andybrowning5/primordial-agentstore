export default {
  id: 54,
  system: "Gastrulation",
  title: "The First Fold",
  caption: "A hollow sphere dimples inward, birthing the body's first layers.",
  cols: 52,
  rows: 20,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cx = cols / 2;
    const cy = rows / 2;
    const RX = cols * 0.36;
    const RY = rows * 0.40;

    // Invagination progress: 0 = perfect sphere, 1 = deep cup
    const inv = Math.sin(t * 0.55) * 0.5 + 0.5;  // 0..1, slow oscillation

    // Slow rotation so we see the blastopore side
    const angle = t * 0.18;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Draw outer blastula outline — ellipse with invagination dent on one side
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // Rotate point into local frame
        const dx = (x - cx) / RX;
        const dy = (y - cy) / RY;
        const lx = dx * cosA + dy * sinA;
        const ly = -dx * sinA + dy * cosA;

        // Base ellipse radius in local coords
        const baseR = Math.sqrt(lx * lx + ly * ly);

        // Invagination dent: pushes the bottom pole inward
        // The dent is localised to the bottom (ly > 0) in local coords
        const dent = inv * 0.45 * Math.max(0, ly) * Math.exp(-2.5 * lx * lx);
        const r = baseR + dent;

        const edge = Math.abs(r - 1.0);

        if (edge < 0.07) {
          // Outer cell layer (ectoderm) — dense edge
          g[y][x] = "@";
        } else if (edge < 0.16) {
          g[y][x] = "o";
        } else if (edge < 0.28 && r < 1.0) {
          // Just inside the wall — sparse cellular texture
          const phase = Math.floor(t * 4);
          if ((x * 5 + y * 9 + phase) % 13 === 0) g[y][x] = ".";
        }
      }
    }

    // Draw the invagination tunnel (archenteron / blastocoel shrinking)
    // In local coords, the invagination is a curved channel along ly axis from bottom
    const archDepth = inv * 0.75;  // how far the channel penetrates (in normalised units)

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // Already filled with outer wall — skip
        if (g[y][x] !== " ") continue;

        const dx = (x - cx) / RX;
        const dy = (y - cy) / RY;
        const lx = dx * cosA + dy * sinA;
        const ly = -dx * sinA + dy * cosA;

        // We're inside the blastula — check invagination channel
        // Channel runs from bottom pole (ly=1) upward to ly = 1 - archDepth
        const channelTop = 1.0 - archDepth;
        const inChannel = ly > channelTop && ly < 1.05;

        // Channel width narrows as it goes deeper
        const depth = ly - channelTop;           // 0 at opening, archDepth at tip
        const maxDepth = archDepth + 0.001;
        const frac = depth / maxDepth;            // 0..1 along channel
        const channelW = 0.18 * (1 - frac * 0.55);  // wider at mouth, narrower at tip

        if (inChannel && Math.abs(lx) < channelW) {
          // Inside the archenteron channel
          const wallDist = channelW - Math.abs(lx);
          if (wallDist < channelW * 0.25) {
            // Inner endoderm wall
            g[y][x] = ":";
          } else {
            // Interior lumen — occasional content dots
            const phase = Math.floor(t * 6);
            if ((x * 7 + y * 11 + phase) % 17 === 0) g[y][x] = "`";
          }
        }
      }
    }

    // Blastopore opening — mark the mouth of the invagination
    // It's at the bottom of the rotated ellipse in screen space
    // Bottom pole in local coords: (lx=0, ly=1) → rotate back
    const bpX = cx + RX * (0 * cosA - 1.0 * (-sinA));
    const bpY = cy + RY * (0 * sinA + 1.0 * cosA) * 0.0 + RY * 1.0;
    // Simpler: just mark the real-space bottom extent with a pulsing indicator
    const bpPulse = Math.sin(t * 2.2) * 0.5 + 0.5;

    // Place blastopore indicator at the bottom of the outer ellipse
    // In unrotated coords the bottom is cy + RY; rotate to find screen position
    const bpSX = Math.round(cx + RX * (0 * cosA + 1.0 * (-sinA)));
    const bpSY = Math.round(cy + RY * (0 * sinA + 1.0 * cosA));

    if (bpSX >= 1 && bpSX < cols - 1 && bpSY >= 1 && bpSY < rows - 1) {
      if (bpPulse > 0.55 && inv > 0.15) {
        g[bpSY][bpSX] = bpPulse > 0.8 ? "#" : "O";
      }
    }

    // Floating cell debris / signalling molecules just outside the blastula
    for (let i = 0; i < 18; i++) {
      const baseAngle = (i / 18) * Math.PI * 2 + t * (i % 3 === 0 ? 0.3 : -0.2);
      const orbitR = 1.18 + 0.06 * Math.sin(t * 1.1 + i * 0.7);
      const px = Math.round(cx + RX * orbitR * Math.cos(baseAngle));
      const py = Math.round(cy + RY * 0.85 * orbitR * Math.sin(baseAngle));
      if (px >= 0 && px < cols && py >= 0 && py < rows && g[py][px] === " ") {
        const phase = Math.floor(t * 3 + i);
        g[py][px] = phase % 3 === 0 ? "·" : ".";
      }
    }

    // Pad each row to exactly cols chars
    return g.map((row) => {
      const s = row.join("");
      return s.length < cols ? s + " ".repeat(cols - s.length) : s.slice(0, cols);
    }).join("\n");
  }
};
