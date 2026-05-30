export default {
  id: 65,
  system: "Golgi vesicle budding",
  title: "Golgi Bud & Release",
  caption: "A cisterna pinches off a vesicle that drifts into the cytosol.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- Golgi stack: 4 curved cisternae ---
    // Each cisterna is a flattened arc, slightly offset vertically
    const stackCx = Math.floor(cols * 0.38);
    const cisternae = [
      { cy: 4,  ry: 1.2, rx: 8.5, wobble: 0.3 },
      { cy: 7,  ry: 1.1, rx: 9.5, wobble: 0.2 },
      { cy: 10, ry: 1.1, rx: 9.5, wobble: 0.2 },
      { cy: 13, ry: 1.2, rx: 8.5, wobble: 0.3 },
    ];

    // Draw each cisterna as a thick horizontal arc (membrane bilayer feel)
    for (const cis of cisternae) {
      const wave = Math.sin(t * 0.7 + cis.cy) * cis.wobble;
      for (let x = 0; x < cols * 0.65; x++) {
        // Parametric: sweep x across the arc
        const dx = (x - stackCx) / cis.rx;
        if (Math.abs(dx) > 1) continue;
        // Curve the arc gently
        const curveY = cis.cy + dx * dx * 1.2 + wave;
        // Outer membrane
        for (const offset of [-0.0, 0.9]) {
          const fy = curveY + offset;
          const iy = Math.round(fy);
          if (iy >= 0 && iy < rows) {
            const ch = offset === 0 ? (x % 3 === 0 ? "=" : "-") : (x % 3 === 0 ? "=" : "-");
            g[iy][x] = ch;
          }
        }
        // Lumen fill between layers
        const y0 = Math.round(curveY), y1 = Math.round(curveY + 0.9);
        if (y0 !== y1 && y0 >= 0 && y0 < rows) {
          if (g[y0][x] === " ") g[y0][x] = "~";
        }
      }
      // Cap the right end with a curved tip
      const tipX = Math.floor(stackCx + cis.rx - 0.5);
      const tipY = Math.round(cis.cy + 1.0 + wave);
      if (tipX >= 0 && tipX < cols && tipY >= 0 && tipY < rows) g[tipY][tipX] = ")";
      // Cap the left end
      const ltipX = Math.floor(stackCx - cis.rx + 0.5);
      const ltipY = Math.round(cis.cy + 1.0 + wave);
      if (ltipX >= 0 && ltipX < cols && ltipY >= 0 && ltipY < rows) g[ltipY][ltipX] = "(";
    }

    // --- Budding tubule on the right side of top cisterna ---
    // Phase cycles every 5 seconds: 0-0.3 tubule extends, 0.3-0.6 neck forms, 0.6-0.8 pinch, 0.8-1.0 vesicle drifts
    const phase = (t % 5.0) / 5.0;          // 0..1

    // Tubule origin: right tip of 2nd cisterna (index 1)
    const tubOriginX = Math.floor(stackCx + cisternae[1].rx + 1);
    const tubOriginY = Math.round(cisternae[1].cy + 0.5 + Math.sin(t * 0.7 + cisternae[1].cy) * cisternae[1].wobble);

    if (phase < 0.6) {
      // Tubule extends rightward
      const extendFrac = Math.min(phase / 0.3, 1.0);
      const tubLen = Math.round(extendFrac * 7);
      for (let i = 0; i <= tubLen && tubOriginX + i < cols; i++) {
        const x = tubOriginX + i;
        if (x >= 0 && x < cols) {
          if (tubOriginY - 1 >= 0) g[tubOriginY - 1][x] = "-";
          if (tubOriginY     >= 0 && tubOriginY < rows) g[tubOriginY][x] = "~";
          if (tubOriginY + 1 < rows) g[tubOriginY + 1][x] = "-";
        }
      }
      // Bulging tip
      if (tubLen > 0) {
        const tipX = tubOriginX + tubLen;
        if (tipX < cols) {
          if (tubOriginY >= 0 && tubOriginY < rows)     g[tubOriginY][tipX]     = "O";
          if (tubOriginY - 1 >= 0)                      g[tubOriginY - 1][tipX] = "o";
          if (tubOriginY + 1 < rows)                    g[tubOriginY + 1][tipX] = "o";
        }
      }
    } else if (phase < 0.8) {
      // Neck constricts — draw short tubule with pinch symbol
      const neckFrac = (phase - 0.6) / 0.2;  // 0..1
      const tubLen = 7;
      // Draw tubule up to neck
      const neckPos = Math.round(tubOriginX + tubLen * 0.55);
      for (let i = 0; i <= tubLen && tubOriginX + i < cols; i++) {
        const x = tubOriginX + i;
        if (x >= neckPos - 1 && x <= neckPos + 1) {
          // Neck: constricted
          if (tubOriginY >= 0 && tubOriginY < rows) g[tubOriginY][x] = "|";
        } else {
          if (x >= 0 && x < cols) {
            if (tubOriginY - 1 >= 0) g[tubOriginY - 1][x] = "-";
            if (tubOriginY >= 0 && tubOriginY < rows) g[tubOriginY][x] = "~";
            if (tubOriginY + 1 < rows) g[tubOriginY + 1][x] = "-";
          }
        }
      }
      // Vesicle bud at tip — grows as neckFrac increases
      const budX = tubOriginX + tubLen + 1;
      const budR = 1.2 + neckFrac * 0.6;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx2 = -2; dx2 <= 2; dx2++) {
          const r = Math.sqrt(dx2 * dx2 + dy * dy);
          const bx = budX + dx2, by = tubOriginY + dy;
          if (bx < 0 || bx >= cols || by < 0 || by >= rows) continue;
          if (Math.abs(r - budR) < 0.55) g[by][bx] = "@";
          else if (r < budR - 0.5 && g[by][bx] === " ") g[by][bx] = "o";
        }
      }
    } else {
      // Vesicle released — drifts right and slightly upward
      const driftFrac = (phase - 0.8) / 0.2;  // 0..1
      const vesX = Math.round(tubOriginX + 8 + driftFrac * 6);
      const vesY = Math.round(tubOriginY - driftFrac * 2.5);
      const vesR = 1.8;
      // Draw detached vesicle
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx2 = -3; dx2 <= 3; dx2++) {
          const r = Math.sqrt(dx2 * dx2 + dy * dy);
          const bx = vesX + dx2, by = vesY + dy;
          if (bx < 0 || bx >= cols || by < 0 || by >= rows) continue;
          if (Math.abs(r - vesR) < 0.5) g[by][bx] = "@";
          else if (r < vesR - 0.4) {
            // Cargo dots inside
            if ((dx2 * 3 + dy * 5 + 7) % 7 === 0) g[by][bx] = "*";
            else if (g[by][bx] === " ") g[by][bx] = ".";
          }
        }
      }
      // Fading remnant of the neck at the Golgi tip
      const remX = tubOriginX;
      if (remX < cols) {
        if (tubOriginY - 1 >= 0) g[tubOriginY - 1][remX] = "-";
        if (tubOriginY < rows)   g[tubOriginY][remX]     = ")";
        if (tubOriginY + 1 < rows) g[tubOriginY + 1][remX] = "-";
      }
    }

    // --- Coatomer coat proteins assembling around the bud ---
    // Small dots orbiting the bud site, pulsing with phase
    if (phase > 0.15 && phase < 0.85) {
      const coatPhase = (phase - 0.15) / 0.7;  // 0..1
      const numCoat = Math.round(coatPhase * 6);
      const coatCx = tubOriginX + 8;
      const coatCy = tubOriginY;
      for (let i = 0; i < numCoat; i++) {
        const angle = (i / 6) * Math.PI * 2 + t * 1.1;
        const cr = 3.2;
        const cx = Math.round(coatCx + Math.cos(angle) * cr * 1.6);
        const cy2 = Math.round(coatCy + Math.sin(angle) * cr * 0.7);
        if (cx >= 0 && cx < cols && cy2 >= 0 && cy2 < rows) {
          if (g[cy2][cx] === " ") g[cy2][cx] = "+";
        }
      }
    }

    // --- Floating free vesicles already released in cytosol (background activity) ---
    const vesicleSeeds = [
      { ox: 42, oy: 3,  speedX: 0.4, speedY: 0.15, amp: 2.5 },
      { ox: 46, oy: 14, speedX: 0.3, speedY: 0.22, amp: 1.8 },
    ];
    for (const v of vesicleSeeds) {
      const vx = Math.round(v.ox + Math.sin(t * v.speedX + v.ox) * v.amp);
      const vy = Math.round(v.oy + Math.cos(t * v.speedY + v.oy) * 1.2);
      if (vx >= 1 && vx < cols - 1 && vy >= 1 && vy < rows - 1) {
        if (g[vy][vx] === " ") g[vy][vx] = "O";
        if (g[vy][vx - 1] === " ") g[vy][vx - 1] = "o";
        if (g[vy][vx + 1] === " ") g[vy][vx + 1] = "o";
        if (vy - 1 >= 0 && g[vy - 1][vx] === " ") g[vy - 1][vx] = ".";
        if (vy + 1 < rows && g[vy + 1][vx] === " ") g[vy + 1][vx] = ".";
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
