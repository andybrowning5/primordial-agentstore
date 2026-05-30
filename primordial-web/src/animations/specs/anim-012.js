export default {
  id: 12,
  system: "Autophagy",
  title: "Self-Eating Cell",
  caption: "A double membrane curls around the broken, seals, and digests.",
  cols: 54,
  rows: 20,
  palette: "membrane",
  frame(t) {
    const cols = 54, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cx = cols * 0.5;
    const cy = rows * 0.5;

    function smoothstep(a, b, x) {
      const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return u * u * (3 - 2 * u);
    }
    function put(x, y, ch) {
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }

    // Full autophagy cycle ~24s
    const cycle = (t % 24) / 24; // 0..1

    // Phases:
    //  curl    0.00-0.35  phagophore (double membrane) grows around cargo
    //  seal    0.35-0.55  membrane closes -> autophagosome
    //  fuse    0.55-0.75  drifts to lysosome, fuses
    //  digest  0.75-1.00  cargo dissolves, contents fade -> loop
    const curl = smoothstep(0.0, 0.35, cycle);
    const seal = smoothstep(0.35, 0.55, cycle);
    const fuse = smoothstep(0.55, 0.75, cycle);
    const digest = smoothstep(0.75, 1.0, cycle);

    // Cargo: damaged organelles clustered left-of-center
    const cargoCx = cx - cols * 0.10;
    const cargoCy = cy;
    const cargoR = 4.2 * (1 - digest * 0.85);

    // ---- Draw cargo (damaged organelles) ----
    if (cargoR > 0.6) {
      const blobs = [
        [-1.6, -1.0, 1.7],
        [1.4, -0.6, 1.4],
        [-0.4, 1.3, 1.5],
        [1.6, 1.1, 1.2],
      ];
      for (const [ox, oy, r0] of blobs) {
        const r = r0 * (1 - digest * 0.9);
        if (r < 0.4) continue;
        const bx = cargoCx + ox;
        const by = cargoCy + oy * 0.8;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const dx = (x - bx);
            const dy = (y - by) * 1.6;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < r) {
              // dissolving: interior breaks into specks late in digest
              const speck = (Math.floor(x * 2 + t * 4) + Math.floor(y * 3)) % 5;
              if (digest > 0.4 && speck > 1) continue;
              if (d < r - 0.9) g[y][x] = digest > 0.5 ? ":" : "#";
              else if (g[y][x] === " ") g[y][x] = digest > 0.5 ? "." : "%";
            }
          }
        }
      }
    }

    // ---- Phagophore: a C-shaped double membrane that closes into a circle ----
    // openGap shrinks from a wide arc to fully closed as curl->seal complete.
    const enclose = Math.max(curl, seal); // 0..1 how closed the membrane is
    const gapHalf = (1 - enclose) * 1.45 + 0.02; // half-angle of the opening (radians)
    const memR = 6.4 - seal * 0.8; // membrane radius, tightens slightly on sealing

    // membrane drifts toward lysosome during fuse
    const lysoCx = cx + cols * 0.26;
    const lysoCy = cy;
    const mcx = cargoCx + (lysoCx - cargoCx) * fuse;
    const mcy = cargoCy + (lysoCy - cargoCy) * fuse * 0.4;

    // mouth faces right (toward where the membrane will close last), wobble for life
    const mouth = 0; // angle of the opening center
    const wob = Math.sin(t * 1.6) * 0.06 * (1 - seal);

    if (digest < 0.85) {
      const steps = 150;
      for (let i = 0; i <= steps; i++) {
        const ang = -Math.PI + (i / steps) * Math.PI * 2;
        // angular distance from the mouth direction
        let da = ang - mouth;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < gapHalf) continue; // this part of the ring is still open

        const wobble = wob * Math.sin(ang * 3 + t);
        const rOuter = memR + 0.0 + wobble;
        const rInner = memR - 1.15 + wobble;
        const ex = mcx + Math.cos(ang) * rOuter;
        const ey = mcy + Math.sin(ang) * rOuter * 0.62;
        const ix = mcx + Math.cos(ang) * rInner;
        const iy = mcy + Math.sin(ang) * rInner * 0.62;
        // double membrane: outer and inner leaflet
        put(ex, ey, "(");
        put(ix, iy, ")");
      }
      // tidy the leaflet glyphs into membrane chars based on side
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const ch = g[y][x];
          if (ch === "(" || ch === ")") {
            const dx = x - mcx;
            const dy = (y - mcy);
            if (Math.abs(dx) > Math.abs(dy) * 1.4) g[y][x] = "="; // sides
            else g[y][x] = dy < 0 ? "~" : "-"; // top / bottom curve
          }
        }
      }
    }

    // ---- Lysosome on the right: acidic vesicle with enzyme specks ----
    const lysoR = 4.6;
    const lysoVisible = 1 - smoothstep(0.9, 1.0, cycle) * 0.0; // stays present
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = x - lysoCx;
        const dy = (y - lysoCy) * 1.6;
        const d = Math.sqrt(dx * dx + dy * dy);
        // during fuse, lysosome merges with autophagosome -> swell + open toward it
        const swell = lysoR + fuse * 1.2;
        if (d < swell && d > swell - 0.85) {
          // membrane, but break the left side once fused so they join
          if (!(fuse > 0.5 && dx < -swell * 0.45)) {
            if (g[y][x] === " " || g[y][x] === "=" ) g[y][x] = "O";
          }
        } else if (d < swell - 0.85) {
          if (g[y][x] === " ") {
            const enz = (Math.floor(x * 3 + t * 5) + Math.floor(y * 2 + t * 3)) % 6;
            // enzymes more active (denser) as digestion proceeds
            if (enz === 0 || (digest > 0.3 && enz === 1)) g[y][x] = "*";
            else if (digest > 0.6 && enz === 2) g[y][x] = ".";
          }
        }
      }
    }

    // ---- Digestion sparks flying from lysosome into the cargo ----
    if (fuse > 0.4 && digest < 0.95) {
      const sparks = 7;
      for (let s = 0; s < sparks; s++) {
        const life = ((t * 0.9 + s * 0.91) % 2) / 2; // 0..1
        const sx = lysoCx + (cargoCx - lysoCx) * life;
        const sy = lysoCy + Math.sin(s * 1.7 + t) * 1.5 * (1 - life);
        put(sx, sy, life < 0.5 ? "+" : ".");
      }
    }

    // ---- Phase caption band ----
    const labels = ["curl ", "curl ", "seal ", "fuse ", "digest", "clear"];
    let li;
    if (cycle < 0.35) li = 0;
    else if (cycle < 0.55) li = 2;
    else if (cycle < 0.75) li = 3;
    else if (cycle < 0.92) li = 4;
    else li = 5;
    const lbl = labels[li];
    const lx = Math.floor(cols / 2 - lbl.length / 2);
    for (let i = 0; i < lbl.length; i++) {
      if (lx + i >= 0 && lx + i < cols) g[rows - 1][lx + i] = lbl[i];
    }

    return g.map((r) => r.join("")).join("\n");
  },
};
