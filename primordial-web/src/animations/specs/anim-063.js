export default {
  id: 63,
  system: "Plasmolysis (a plant cell shrinking)",
  title: "Plasmolysis",
  caption: "Protoplast retreats as osmosis drains the cell of life.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Oscillate shrink: s goes 0..1..0, representing plasmolysis progress
    const s = Math.sin(t * 0.45) * 0.5 + 0.5; // 0=turgid, 1=fully plasmolysed

    // --- Cell wall: fixed rigid rectangle ---
    const wallL = 6, wallR = cols - 7, wallT = 2, wallB = rows - 3;
    // Top and bottom edges
    for (let x = wallL; x <= wallR; x++) {
      g[wallT][x] = (x === wallL || x === wallR) ? "+" : "=";
      g[wallB][x] = (x === wallL || x === wallR) ? "+" : "=";
    }
    // Left and right edges
    for (let y = wallT; y <= wallB; y++) {
      g[y][wallL] = (y === wallT || y === wallB) ? "+" : "|";
      g[y][wallR] = (y === wallT || y === wallB) ? "+" : "|";
    }

    // Cell wall interior fill (sparse dots suggesting the apoplast space)
    for (let y = wallT + 1; y < wallB; y++) {
      for (let x = wallL + 1; x < wallR; x++) {
        const pat = (x * 3 + y * 7 + Math.floor(t * 1.5)) % 23;
        if (pat === 0) g[y][x] = ".";
      }
    }

    // --- Protoplast: shrinking ellipse that detaches from the wall corners ---
    // At s=0 (turgid): protoplast nearly fills the cell wall interior
    // At s=1 (plasmolysed): protoplast has shrunk to ~55% of wall area
    const wcx = (wallL + wallR) / 2;
    const wcy = (wallT + wallB) / 2;
    const wallRx = (wallR - wallL) / 2;
    const wallRy = (wallB - wallT) / 2;

    // Protoplast radii shrink with s; slight vertical sag as it collapses
    const prx = wallRx * (0.88 - s * 0.30);
    const pry = wallRy * (0.85 - s * 0.28);

    // Tiny drift downward as protoplast sags when water leaves
    const pcx = wcx;
    const pcy = wcy + s * 0.8;

    // Draw protoplast interior content (cytoplasm texture)
    for (let y = wallT + 1; y < wallB; y++) {
      for (let x = wallL + 1; x < wallR; x++) {
        const dx = (x - pcx) / prx;
        const dy = (y - pcy) / pry;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 0.92) {
          // Cytoplasm fill — animated streaming pattern
          const cytoPattern = (x * 5 + y * 11 + Math.floor(t * 3)) % 17;
          if (cytoPattern < 2) g[y][x] = ":";
          else if (cytoPattern < 4) g[y][x] = "'";
          else if (cytoPattern === 5) g[y][x] = "`";
          else g[y][x] = " ";
        }
      }
    }

    // Nucleus: small oval in the center, pulses slightly
    const nPulse = Math.sin(t * 1.1) * 0.03;
    const nrx = prx * (0.22 + nPulse);
    const nry = pry * (0.28 + nPulse);
    for (let y = wallT + 1; y < wallB; y++) {
      for (let x = wallL + 1; x < wallR; x++) {
        const dx = (x - pcx) / nrx;
        const dy = (y - pcy) / nry;
        const r = Math.sqrt(dx * dx + dy * dy);
        const edge = Math.abs(r - 1);
        if (r < 0.75) g[y][x] = "o";
        else if (edge < 0.35) g[y][x] = "O";
      }
    }

    // Draw protoplast membrane border (over cytoplasm, under nucleus ring)
    for (let y = wallT + 1; y < wallB; y++) {
      for (let x = wallL + 1; x < wallR; x++) {
        const dx = (x - pcx) / prx;
        const dy = (y - pcy) / pry;
        const r = Math.sqrt(dx * dx + dy * dy);
        const edge = Math.abs(r - 1);
        if (edge < 0.10) {
          // Membrane character — thicker at top/bottom where it peels last
          const angle = Math.atan2(dy, dx);
          const atCorner = Math.abs(Math.abs(angle) - Math.PI / 2) > 1.1;
          g[y][x] = atCorner ? "@" : "o";
        }
      }
    }

    // --- Water molecules leaving (dots drifting outward between wall and protoplast) ---
    const numDrops = 8;
    for (let i = 0; i < numDrops; i++) {
      const phase = (i / numDrops) * Math.PI * 2;
      // Position along the gap, animated radially outward from protoplast toward wall
      const progress = ((t * 0.6 + i * 0.37) % 1.0); // 0=near protoplast, 1=near wall
      const angle = phase + t * 0.08;
      // Interpolate from just outside protoplast membrane to just inside wall
      const r = (prx + 0.5) + (wallRx - prx - 1.2) * progress;
      // Use elliptical coords; scale angle-based radius to fit elliptical path
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const wx = pcx + r * cosA;
      const wy = pcy + r * sinA * (pry / prx);

      const xi = Math.round(wx), yi = Math.round(wy);
      if (yi > wallT && yi < wallB && xi > wallL && xi < wallR) {
        const dx2 = (xi - pcx) / prx;
        const dy2 = (yi - pcy) / pry;
        if (Math.sqrt(dx2 * dx2 + dy2 * dy2) > 1.05) {
          g[yi][xi] = "~";
        }
      }
    }

    // Ensure each row is exactly cols wide
    return g.map(row => row.join("").padEnd(cols).slice(0, cols)).join("\n");
  }
};
