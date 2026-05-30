export default {
  id: 57,
  system: "Amoeba pseudopod crawl",
  title: "Pseudopod Crawl",
  caption: "A shapeless hunter flows forward, fingers of cytoplasm reaching.",
  cols: 52,
  rows: 18,
  palette: "microbe",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Body center drifts slowly left-to-right and back
    const cx = cols * 0.5 + Math.sin(t * 0.18) * cols * 0.28;
    const cy = rows * 0.5 + Math.sin(t * 0.27) * rows * 0.18;

    // Base radii — body is an irregular ellipse that breathes
    const baseRx = cols * 0.17 + Math.sin(t * 0.7) * cols * 0.02;
    const baseRy = rows * 0.30 + Math.cos(t * 0.55) * rows * 0.04;

    // Direction of travel (angle of velocity vector)
    const moveAngle = Math.atan2(
      Math.cos(t * 0.27) * rows * 0.18 * 0.27,
      Math.cos(t * 0.18) * cols * 0.28 * 0.18
    );

    // Number of pseudopods and their angular offsets
    const NUM_PODS = 4;
    // Pod phases: leading pods extend forward, trailing ones retract
    const pods = Array.from({ length: NUM_PODS }, (_, i) => {
      const baseAngle = moveAngle + (i / NUM_PODS) * Math.PI * 2 + t * 0.08;
      // Leading hemisphere pods extend further
      const leadFactor = Math.cos(baseAngle - moveAngle) * 0.5 + 0.5; // 0..1
      const phase = t * 0.6 + i * 1.3;
      const length = 0.28 + leadFactor * 0.32 + Math.sin(phase) * 0.14;
      const width = 0.22 - leadFactor * 0.04;
      return { angle: baseAngle, length, width };
    });

    // Nucleus position — lags slightly behind movement direction
    const nucX = cx - Math.sin(t * 0.18) * cols * 0.04;
    const nucY = cy - Math.sin(t * 0.27) * rows * 0.04;

    // Build signed-distance field for the main body + pseudopods
    function bodyDist(x, y) {
      // Distance from point to ellipse body (approximate SDF)
      const dx = (x - cx) / baseRx;
      const dy = (y - cy) / baseRy;
      let minD = Math.sqrt(dx * dx + dy * dy) - 1.0;

      // Add each pseudopod as a capsule-like bulge
      for (const pod of pods) {
        const cos = Math.cos(pod.angle), sin = Math.sin(pod.angle);
        // Vector from center to point
        const px = (x - cx) / baseRx, py = (y - cy) / baseRy;
        // Project onto pod axis
        const along = px * cos + py * sin;
        const perp = px * (-sin) + py * cos;
        // Capsule: cylinder from 0.6 to 1+length
        const clamped = Math.max(0.6, Math.min(1.0 + pod.length, along));
        const capDist = Math.sqrt((px - clamped * cos) ** 2 + (py - clamped * sin) ** 2);
        // Taper width toward tip
        const taper = 1.0 - Math.max(0, (along - 0.6) / (pod.length + 0.4)) * 0.6;
        const podD = capDist - pod.width * taper;
        // Union (smooth min)
        const k = 0.35;
        const h = Math.max(k - Math.abs(minD - podD), 0) / k;
        minD = Math.min(minD, podD) - h * h * k * 0.25;
      }
      return minD;
    }

    // Nucleus SDF (small ellipse)
    const nucRx = baseRx * 0.30, nucRy = baseRy * 0.30;

    // Fill cytoplasm interior with streaming dots
    // Cytoplasm flows toward the leading edge
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = bodyDist(x, y);

        if (d < -0.18) {
          // Interior cytoplasm — streaming particle pattern
          // Particles flow in direction of travel
          const flowX = x - Math.cos(moveAngle) * t * 1.8;
          const flowY = y - Math.sin(moveAngle) * t * 0.9;
          const hash = (Math.floor(flowX * 3 + flowY * 7) * 2654435761) >>> 0;
          const density = (hash % 100) / 100;
          if (density < 0.04) g[y][x] = "*";
          else if (density < 0.10) g[y][x] = "·" in {} ? "·" : ".";
          else if (density < 0.13) g[y][x] = ":";
          else g[y][x] = " ";
        }
      }
    }

    // Nucleus
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dnx = (x - nucX) / nucRx, dny = (y - nucY) / nucRy;
        const nr = Math.sqrt(dnx * dnx + dny * dny);
        if (nr < 0.7) {
          g[y][x] = "O";
        } else if (nr < 1.0) {
          g[y][x] = nr < 0.85 ? "o" : (bodyDist(x, y) < -0.1 ? "0" : " ");
        }
      }
    }

    // Membrane: draw border along d ≈ 0
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = bodyDist(x, y);
        if (Math.abs(d) < 0.22) {
          // Choose membrane char by local normal direction
          const dRight = bodyDist(x + 1, y) - d;
          const dDown = bodyDist(x, y + 1) - d;
          const nx = dRight, ny = dDown;
          const ang = Math.atan2(ny, nx);
          const sector = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 8;
          const chars = ["~", "~", "|", "/", "~", "~", "|", "\\"];
          // Outer fringe
          if (Math.abs(d) < 0.08) {
            g[y][x] = "@";
          } else if (d < 0) {
            g[y][x] = chars[sector];
          } else {
            g[y][x] = ".";
          }
        }
      }
    }

    // Join rows, ensuring each is exactly cols chars wide
    return g.map(row => {
      const s = row.slice(0, cols).join("");
      return s.length < cols ? s + " ".repeat(cols - s.length) : s;
    }).join("\n");
  }
};
