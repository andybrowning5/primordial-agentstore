export default {
  id: 41,
  system: "Bacterial binary fission",
  title: "Divide & Conquer",
  caption: "A rod splits its genome and pinches into two daughters.",
  cols: 52,
  rows: 18,
  palette: "microbe",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Full cycle period: 6 seconds
    const period = 6.0;
    const phase = (t % period) / period; // 0..1

    const cy = Math.floor(rows / 2);

    // Phase breakdown:
    //  0.00–0.30 : single bacterium, growing
    //  0.30–0.60 : septum forms in center, DNA segregates
    //  0.60–0.85 : cells pinch apart and separate
    //  0.85–1.00 : two daughters drift, fade to restart

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    function drawCell(cx, halfLen, halfH, innerDots, septumFrac, phase_marker) {
      // halfLen: half-length along x axis (ellipse x radius)
      // halfH: y radius
      // septumFrac: 0=no septum, 1=full septum line at center of THIS cell
      const cxi = Math.round(cx);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
          const dx = (x - cx) / halfLen;
          const dy = (y - cy) / halfH;
          const r2 = dx * dx + dy * dy;
          if (r2 > 1.0) continue;
          const r = Math.sqrt(r2);
          const edgeDist = 1.0 - r;

          // Outer membrane — thick border
          if (edgeDist < 0.18) {
            if (edgeDist < 0.07) {
              g[y][x] = "@";
            } else {
              g[y][x] = "O";
            }
            continue;
          }

          // Septum line: vertical divider near cell center
          if (septumFrac > 0.05) {
            const septX = cx; // septum at cell center
            const distToSept = Math.abs(x - septX);
            const septThresh = septumFrac * halfH * Math.sqrt(1 - dy * dy);
            if (distToSept < 1.1 && Math.abs(y - cy) < septThresh) {
              g[y][x] = septumFrac > 0.7 ? "#" : "=";
              continue;
            }
          }

          // Interior cytoplasm with animated stipple
          if (innerDots) {
            const tick = Math.floor(t * 4);
            const hash = ((x * 17 + y * 31 + tick * 7) % 23);
            if (hash < 3) {
              g[y][x] = ".";
            } else if (hash < 5) {
              g[y][x] = ":";
            } else {
              g[y][x] = " ";
            }
          }
        }
      }
    }

    function drawDNA(cx, spread, color) {
      // Draw DNA as two dots or a figure-8 pattern inside the cell
      // spread: 0=together at center, 1=segregated to poles
      const leftX = cx - spread * 4;
      const rightX = cx + spread * 4;
      const lxi = Math.round(leftX), rxi = Math.round(rightX);
      const yc = cy;
      // Left chromosome blob
      for (let dy = -1; dy <= 1; dy++) {
        const yn = yc + dy;
        if (yn < 0 || yn >= rows) continue;
        const inner = Math.abs(dy) < 1 ? "*" : ".";
        if (lxi >= 0 && lxi < cols) g[yn][lxi] = inner;
        if (lxi + 1 < cols) g[yn][lxi + 1] = ".";
      }
      // Right chromosome blob
      if (spread > 0.15) {
        for (let dy = -1; dy <= 1; dy++) {
          const yn = yc + dy;
          if (yn < 0 || yn >= rows) continue;
          if (rxi >= 0 && rxi < cols) g[yn][rxi] = "*";
          if (rxi - 1 >= 0) g[yn][rxi - 1] = ".";
        }
      }
    }

    function drawFlagella(cx, halfLen, flip) {
      // simple wavy flagella lines at the poles
      const poleX = flip ? cx - halfLen - 1 : cx + halfLen + 1;
      const dir = flip ? -1 : 1;
      for (let i = 0; i < 5; i++) {
        const fx = Math.round(poleX + dir * (i + 1));
        if (fx < 0 || fx >= cols) continue;
        const wave = Math.sin(t * 3.0 + i * 0.8) * 2.0;
        const fy = Math.round(cy + wave);
        if (fy < 0 || fy >= rows) continue;
        const ch = i % 2 === 0 ? "~" : "-";
        if (g[fy][fx] === " ") g[fy][fx] = ch;
      }
    }

    const CENTER = cols / 2;

    if (phase < 0.30) {
      // Growing phase: single elongating bacterium
      const growT = phase / 0.30; // 0..1
      const halfLen = 7 + growT * 5; // 7..12
      const halfH = 3.2;
      // Pulse size slightly
      const pulse = 1 + Math.sin(t * 4) * 0.015;
      drawCell(CENTER, halfLen * pulse, halfH * pulse, true, 0, 0);
      // Single chromosome replicating — split slightly as it copies
      const dnaSep = growT * 0.4;
      drawDNA(CENTER, dnaSep, 0);
      drawFlagella(CENTER, halfLen, true);
      drawFlagella(CENTER, halfLen, false);

    } else if (phase < 0.60) {
      // Septum formation + DNA segregation
      const sepT = (phase - 0.30) / 0.30; // 0..1
      const halfLen = 12 + sepT * 2; // 12..14 (still growing slightly)
      const halfH = 3.2;
      // septum grows from 0 to 1
      const septumFrac = sepT;
      drawCell(CENTER, halfLen, halfH, true, septumFrac, 1);
      // DNA fully segregates to poles
      const dnaSep = 0.4 + sepT * 0.6; // 0.4..1.0
      drawDNA(CENTER, dnaSep * 5, 1);
      drawFlagella(CENTER, halfLen, true);
      drawFlagella(CENTER, halfLen, false);

    } else if (phase < 0.85) {
      // Pinching + separation
      const splitT = (phase - 0.60) / 0.25; // 0..1
      // Two cells drift apart
      const drift = splitT * 8; // 0..8 cols apart (each cell moves drift/2)
      const cx1 = CENTER - drift / 2;
      const cx2 = CENTER + drift / 2;
      // Cells shrink from elongated to rounder as they separate
      const halfLen = 14 - splitT * 5; // 14..9
      const halfH = 3.2 + splitT * 0.4; // slight rounding
      // Pinch: neck becomes very thin — model by drawing two separate cells
      // with a shrinking "neck" between them
      const neckVisibility = 1 - splitT;
      if (neckVisibility > 0.05) {
        // Draw connecting neck
        const neckW = Math.round(neckVisibility * 2);
        for (let ny = cy - neckW; ny <= cy + neckW; ny++) {
          if (ny < 0 || ny >= rows) continue;
          const nx = Math.round(CENTER);
          if (nx >= 0 && nx < cols) g[ny][nx] = neckVisibility > 0.5 ? "O" : "o";
        }
      }
      drawCell(cx1, halfLen, halfH, true, 0, 0);
      drawCell(cx2, halfLen, halfH, true, 0, 0);
      drawDNA(cx1, 0.2, 0);
      drawDNA(cx2, 0.2, 0);
      drawFlagella(cx1, halfLen, true);
      drawFlagella(cx2, halfLen, false);

    } else {
      // Two daughters drifting, then fade out before loop
      const endT = (phase - 0.85) / 0.15; // 0..1
      const drift = 8 + endT * 4; // continue separating
      const cx1 = CENTER - drift / 2;
      const cx2 = CENTER + drift / 2;
      const halfLen = 9;
      const halfH = 3.6;
      // Pulse as new cells — they are alive and active
      const livePulse = 1 + Math.sin(t * 5) * 0.02;
      drawCell(cx1, halfLen * livePulse, halfH * livePulse, true, 0, 0);
      drawCell(cx2, halfLen * livePulse, halfH * livePulse, true, 0, 0);
      drawDNA(cx1, 0.1, 0);
      drawDNA(cx2, 0.1, 0);
      drawFlagella(cx1, halfLen, true);
      drawFlagella(cx2, halfLen, false);
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
