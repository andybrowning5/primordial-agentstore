export default {
  id: 23,
  system: "Glycolysis",
  title: "Glucose to Energy",
  caption: "Glucose splits and tumbles into a river of ATP.",
  cols: 52,
  rows: 18,
  palette: "energy",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    function set(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }

    // ── helpers ──────────────────────────────────────────────────────────────
    const tau = Math.PI * 2;
    const pulse = Math.sin(t * 2.1) * 0.5 + 0.5;         // 0..1 slow pulse
    const beat  = Math.sin(t * 4.8) * 0.5 + 0.5;         // fast energy beat

    // ── Phase: 0..1 encodes where we are in the glycolysis cycle (loops ~12s)
    const phase = (t % 12) / 12;  // 0..1 over 12 seconds

    // ─── Section 1 (phase 0..0.25): Glucose hexagon drifts in from left ─────
    // ─── Section 2 (phase 0.25..0.5): Phosphorylation flash, hex shrinks ────
    // ─── Section 3 (phase 0.5..0.75): Cleave — two trioses separate ─────────
    // ─── Section 4 (phase 0.75..1.0): Two pyruvates stream to the right ──────

    // Smooth 0→1 transition helper
    function smoothstep(lo, hi, x) {
      const t2 = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
      return t2 * t2 * (3 - 2 * t2);
    }

    // ── Draw a hexagon outline ────────────────────────────────────────────────
    function hexagon(cx, cy, r, ch, fill) {
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * tau - Math.PI / 6;
        const a1 = ((i + 1) / 6) * tau - Math.PI / 6;
        const x0 = cx + Math.cos(a0) * r * 1.8;
        const y0 = cy + Math.sin(a0) * r;
        const x1 = cx + Math.cos(a1) * r * 1.8;
        const y1 = cy + Math.sin(a1) * r;
        const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2.5);
        for (let s = 0; s <= steps; s++) {
          const lx = x0 + (x1 - x0) * s / steps;
          const ly = y0 + (y1 - y0) * s / steps;
          set(lx, ly, ch);
        }
      }
      if (fill) {
        // fill interior with sparse dots
        for (let dy = -r + 1; dy < r; dy++) {
          const hw = Math.sqrt(Math.max(0, r * r - dy * dy)) * 1.6;
          for (let dx = -hw + 1; dx < hw; dx++) {
            const xi = Math.round(cx + dx), yi = Math.round(cy + dy);
            if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
              if (g[yi][xi] === " ") {
                const v = (Math.floor(xi * 3 + yi * 7 + t * 6)) % 7;
                g[yi][xi] = v === 0 ? "o" : v === 1 ? "." : " ";
              }
            }
          }
        }
      }
    }

    // ── Draw a small triangle (3-carbon triose) ───────────────────────────────
    function triose(cx, cy, r, ch) {
      for (let i = 0; i < 3; i++) {
        const a0 = (i / 3) * tau - Math.PI / 2;
        const a1 = ((i + 1) / 3) * tau - Math.PI / 2;
        const x0 = cx + Math.cos(a0) * r * 1.6;
        const y0 = cy + Math.sin(a0) * r;
        const x1 = cx + Math.cos(a1) * r * 1.6;
        const y1 = cy + Math.sin(a1) * r;
        const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2.5);
        for (let s = 0; s <= steps; s++) {
          set(x0 + (x1 - x0) * s / steps, y0 + (y1 - y0) * s / steps, ch);
        }
      }
    }

    // ── Draw ATP spark: radiating lines from a point ──────────────────────────
    function atpSpark(cx, cy, age) {
      // age 0→1, fades out
      if (age > 1) return;
      const r = age * 3.5;
      const sym = age < 0.4 ? "*" : age < 0.7 ? "+" : ".";
      set(cx, cy, sym);
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * tau;
        set(cx + Math.cos(ang) * r * 1.6, cy + Math.sin(ang) * r, age < 0.5 ? "+" : ".");
      }
    }

    // ── Phosphate particle (small P dot drifting) ─────────────────────────────
    function phosphate(cx, cy) {
      set(cx, cy, "P");
      set(cx - 1, cy, "(");
      set(cx + 1, cy, ")");
    }

    const cy = rows / 2;   // vertical center = 8.5

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 0..0.25 — Glucose enters from left, bobs toward center
    // ════════════════════════════════════════════════════════════════════════
    if (phase < 0.25) {
      const prog = phase / 0.25;                           // 0→1
      const gx = 4 + prog * (cols / 2 - 4 - 7);           // left edge → center-ish
      const gy = cy + Math.sin(prog * tau) * 1.2;          // gentle bob
      const r = 3.5 - prog * 0.3;                          // slight shrink as phospho starts
      hexagon(gx, gy, r, "#", true);
      // Label
      set(gx - 1, gy, "C");
      set(gx,     gy, "6");
      // Two ATP molecules approaching from right (they're about to donate phosphate)
      const atpX = cols - 6 - prog * (cols * 0.32);
      const atpY1 = cy - 3, atpY2 = cy + 3;
      set(atpX,     atpY1, "A");
      set(atpX + 1, atpY1, "T");
      set(atpX + 2, atpY1, "P");
      set(atpX,     atpY2, "A");
      set(atpX + 1, atpY2, "T");
      set(atpX + 2, atpY2, "P");
      // Energy label top row
      set(2, 1, "G");
      set(3, 1, "L");
      set(4, 1, "Y");
      set(5, 1, "C");
      set(6, 1, "O");
      set(7, 1, "L");
      set(8, 1, "Y");
      set(9, 1, "S");
      set(10,1, "I");
      set(11,1, "S");
    }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 0.25..0.5 — Phosphorylation: ATP → ADP, P groups attach, hex flashes
    // ════════════════════════════════════════════════════════════════════════
    if (phase >= 0.25 && phase < 0.5) {
      const prog = (phase - 0.25) / 0.25;                  // 0→1
      const gx = cols / 2 - 7;
      const gy = cy;
      const flashChar = (Math.floor(t * 12) % 2 === 0) ? "#" : "@";
      hexagon(gx, gy, 3.2, flashChar, true);
      set(gx - 1, gy, "C");
      set(gx,     gy, "6");
      // P groups arriving and attaching
      const p1x = gx - 3 - (1 - prog) * 7, p1y = gy - 2;
      const p2x = gx + 3 + (1 - prog) * 7, p2y = gy + 2;
      if (prog < 0.85) phosphate(p1x, p1y);
      if (prog < 0.85) phosphate(p2x, p2y);
      // ADP departing upward
      if (prog > 0.3) {
        const adpY = gy - 3 - (prog - 0.3) * 6;
        set(gx - 8, adpY, "A");
        set(gx - 7, adpY, "D");
        set(gx - 6, adpY, "P");
        set(gx + 5, adpY, "A");
        set(gx + 6, adpY, "D");
        set(gx + 7, adpY, "P");
      }
      // Spark on attachment
      if (prog > 0.6) {
        atpSpark(p1x, p1y, (prog - 0.6) / 0.4);
        atpSpark(p2x, p2y, (prog - 0.6) / 0.4);
      }
      set(2, 1, "P");
      set(3, 1, "H");
      set(4, 1, "O");
      set(5, 1, "S");
      set(6, 1, "P");
      set(7, 1, "H");
      set(8, 1, "O");
      set(9, 1, "R");
      set(10,1, "Y");
      set(11,1, "L");
      set(12,1, "A");
      set(13,1, "T");
      set(14,1, "I");
      set(15,1, "O");
      set(16,1, "N");
    }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 0.5..0.75 — Aldolase cleaves: hexagon cracks, two trioses split
    // ════════════════════════════════════════════════════════════════════════
    if (phase >= 0.5 && phase < 0.75) {
      const prog = (phase - 0.5) / 0.25;                   // 0→1
      const gx = cols / 2 - 7;
      const gy = cy;
      const sep = prog * 9;                                 // separation distance
      // Left triose (DHAP)
      const t1x = gx - sep * 0.7, t1y = gy - sep * 0.4;
      // Right triose (G3P)
      const t2x = gx + sep * 0.7, t2y = gy + sep * 0.4;
      const r = 2.5;
      triose(t1x, t1y, r, prog < 0.4 ? "#" : "O");
      triose(t2x, t2y, r, prog < 0.4 ? "#" : "O");
      // crack / break line between them
      if (prog < 0.35) {
        const midx = (t1x + t2x) / 2, midy = (t1y + t2y) / 2;
        set(midx, midy, "|");
        set(midx - 1, midy, "/");
        set(midx + 1, midy, "\\");
      }
      // C3 labels
      set(Math.round(t1x) - 1, Math.round(t1y), "C");
      set(Math.round(t1x),     Math.round(t1y), "3");
      set(Math.round(t2x) - 1, Math.round(t2y), "C");
      set(Math.round(t2x),     Math.round(t2y), "3");
      set(2, 1, "C");
      set(3, 1, "L");
      set(4, 1, "E");
      set(5, 1, "A");
      set(6, 1, "V");
      set(7, 1, "A");
      set(8, 1, "G");
      set(9, 1, "E");
    }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 0.75..1.0 — Pay-off: trioses flow right, ATP sparks burst out
    // ════════════════════════════════════════════════════════════════════════
    if (phase >= 0.75) {
      const prog = (phase - 0.75) / 0.25;                  // 0→1

      // Two trioses streaming to the right, converting to pyruvate
      const baseX  = cols * 0.3 + prog * cols * 0.35;
      const t1x = baseX, t1y = cy - 3.5;
      const t2x = baseX, t2y = cy + 3.5;
      const r = 2.0;
      const shapeChar = prog > 0.6 ? "o" : "O";
      triose(t1x, t1y, r, shapeChar);
      triose(t2x, t2y, r, shapeChar);

      // ATP burst sparks (4 sparks, staggered)
      const spark1age = Math.max(0, prog * 4 - 0);
      const spark2age = Math.max(0, prog * 4 - 0.8);
      const spark3age = Math.max(0, prog * 4 - 1.6);
      const spark4age = Math.max(0, prog * 4 - 2.4);
      atpSpark(t1x - 5, t1y - 1, spark1age);
      atpSpark(t2x + 5, t2y + 1, spark2age);
      atpSpark(t1x + 6, t1y + 2, spark3age);
      atpSpark(t2x - 6, t2y - 2, spark4age);

      // Flowing NADH molecules (electron carriers) drifting up
      const nadhX = cols * 0.15 + prog * cols * 0.1;
      set(nadhX,     cy - 6, "N");
      set(nadhX + 1, cy - 6, "A");
      set(nadhX + 2, cy - 6, "D");
      set(nadhX + 3, cy - 6, "H");

      // Pyruvate labels near end
      if (prog > 0.5) {
        set(Math.round(t1x) + 3, Math.round(t1y), "P");
        set(Math.round(t1x) + 4, Math.round(t1y), "Y");
        set(Math.round(t1x) + 5, Math.round(t1y), "R");
        set(Math.round(t2x) + 3, Math.round(t2y), "P");
        set(Math.round(t2x) + 4, Math.round(t2y), "Y");
        set(Math.round(t2x) + 5, Math.round(t2y), "R");
      }

      // ATP produced count (2 net)
      set(2, rows - 2, "+");
      set(3, rows - 2, "2");
      set(4, rows - 2, "A");
      set(5, rows - 2, "T");
      set(6, rows - 2, "P");

      set(2, 1, "P");
      set(3, 1, "A");
      set(4, 1, "Y");
      set(5, 1, "-");
      set(6, 1, "O");
      set(7, 1, "F");
      set(8, 1, "F");
    }

    // ── Always: flowing enzyme channel (horizontal path across middle) ────────
    for (let x = 0; x < cols; x++) {
      const wave = Math.sin(x * 0.4 - t * 2.5) * 1.8;
      const ly = Math.round(cy + wave);
      if (ly >= 0 && ly < rows && g[ly][x] === " ") {
        const v = (x + Math.floor(t * 5)) % 10;
        g[ly][x] = v === 0 ? "-" : v === 5 ? "~" : v === 2 ? "." : " ";
      }
    }

    // ── Always: phosphate energy sparks drifting upward ──────────────────────
    for (let i = 0; i < 5; i++) {
      const sx = ((i * 11 + Math.floor(t * 3 + i * 2.7)) % cols);
      const sy = rows - 2 - ((Math.floor(t * 3.5 + i * 3.3)) % (rows - 4));
      if (sx >= 0 && sx < cols && sy >= 0 && sy < rows && g[sy][sx] === " ") {
        g[sy][sx] = beat > 0.7 ? "*" : ".";
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
