export default {
  id: 18,
  system: "tRNA delivering amino acids",
  title: "tRNA Charging",
  caption: "Charged tRNA docks at the ribosome, threading life one amino acid at a time.",
  cols: 52,
  rows: 18,
  palette: "dna",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    function set(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function get(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // ── mRNA strand across the bottom third ──────────────────────────────
    const mrnaY = rows - 4;
    for (let x = 1; x < cols - 1; x++) {
      const wave = Math.sin(x * 0.55 + t * 0.4) * 0.4;
      const y = Math.round(mrnaY + wave);
      const code = "AUGCUGAAUCCGAAGUUA";
      const ch = code[(x + Math.floor(t * 0.3)) % code.length] || "-";
      set(x, y, ch);
    }

    // ── ribosome body (A site and P site) ────────────────────────────────
    const riboCX = Math.round(cols / 2);
    const riboTop = mrnaY - 6;
    // upper dome
    for (let dx = -7; dx <= 7; dx++) {
      for (let dy = 0; dy <= 4; dy++) {
        const r = Math.sqrt((dx / 7) ** 2 + (dy / 4) ** 2);
        if (Math.abs(r - 1) < 0.22) {
          const ch = r < 1 ? "%" : "#";
          set(riboCX + dx, riboTop + dy, ch);
        }
      }
    }
    // lower platform
    for (let dx = -7; dx <= 7; dx++) {
      set(riboCX + dx, mrnaY - 2, "=");
      set(riboCX + dx, mrnaY - 1, "_");
    }
    // A-site and P-site markers
    set(riboCX - 2, riboTop + 2, "P");
    set(riboCX + 2, riboTop + 2, "A");

    // ── peptide chain growing from P-site ────────────────────────────────
    const chainLen = Math.floor(t * 0.6) % 6;
    const peptideChars = ["o", "O", "0", "o", "O", "0"];
    for (let i = 0; i <= chainLen; i++) {
      const px = riboCX - 4 - i * 2;
      const py = riboTop + 1 + Math.sin(i * 0.9 + t * 0.3) * 1.2;
      set(px, py, peptideChars[i % peptideChars.length]);
      if (i > 0) set(px + 1, py, "-");
    }

    // ── tRNA molecules (L-shaped) ─────────────────────────────────────────
    // tRNA 1: arriving from top-right, heading toward A-site
    const phase1 = (t * 0.5) % (Math.PI * 2);
    const tRNA1x = riboCX + 14 - phase1 * 3.5;
    const tRNA1y = 2 + Math.sin(phase1 * 0.8) * 3;
    const docked1 = tRNA1x < riboCX + 4;

    function drawTRNA(cx, cy, flip, aa) {
      // anticodon loop at bottom
      set(cx, cy + 4, "(");
      set(cx + 1, cy + 4, aa);
      set(cx + 2, cy + 4, ")");
      // stem going up
      set(cx + 1, cy + 3, "|");
      set(cx + 1, cy + 2, "|");
      // elbow / variable loop
      set(cx + 1, cy + 1, flip ? "<" : ">");
      set(cx + (flip ? 0 : 2), cy + 1, "-");
      set(cx + (flip ? -1 : 3), cy + 1, (flip ? "`" : "`"));
      // acceptor stem going up-right
      const ax = flip ? cx - 1 : cx + 2;
      set(ax, cy, "|");
      set(ax, cy - 1, flip ? "\\" : "/");
      // CCA tail with amino acid
      const aaX = flip ? ax - 1 : ax + 1;
      set(aaX, cy - 2, "*");
      set(aaX, cy - 3, aa);
    }

    if (tRNA1x > 6 && tRNA1x < cols - 3 && tRNA1y > 0 && tRNA1y < rows - 6) {
      const aa1 = ["G", "A", "V", "L", "P"][(Math.floor(t * 0.5)) % 5];
      drawTRNA(Math.round(tRNA1x), Math.round(tRNA1y), false, aa1);
    }

    // tRNA 2: departing from P-site (already delivered, moving left/up)
    const phase2 = (t * 0.5 + Math.PI) % (Math.PI * 2);
    const tRNA2x = riboCX - 8 - phase2 * 2.2;
    const tRNA2y = 3 + Math.sin(phase2 * 0.6 + 1) * 2.5;
    if (tRNA2x > 2 && tRNA2x < riboCX - 8 && tRNA2y > 0 && tRNA2y < rows - 6) {
      // empty tRNA (no amino acid dot) — uncharged after delivery
      set(Math.round(tRNA2x), Math.round(tRNA2y) + 4, "(");
      set(Math.round(tRNA2x) + 1, Math.round(tRNA2y) + 4, "~");
      set(Math.round(tRNA2x) + 2, Math.round(tRNA2y) + 4, ")");
      set(Math.round(tRNA2x) + 1, Math.round(tRNA2y) + 3, "|");
      set(Math.round(tRNA2x) + 1, Math.round(tRNA2y) + 2, "|");
      set(Math.round(tRNA2x) + 1, Math.round(tRNA2y) + 1, "<");
      set(Math.round(tRNA2x), Math.round(tRNA2y) + 1, "-");
      set(Math.round(tRNA2x) - 1, Math.round(tRNA2y), "|");
    }

    // ── floating amino acid dots (background atmosphere) ──────────────────
    const dots = [
      [8, 2, 1.1], [44, 5, 0.7], [12, 8, 1.4], [40, 3, 0.9], [6, 13, 1.2],
      [47, 11, 0.8], [20, 1, 1.0], [35, 7, 1.3],
    ];
    for (const [bx, by, spd] of dots) {
      const fx = bx + Math.sin(t * spd + bx) * 1.5;
      const fy = by + Math.cos(t * spd * 0.7 + by) * 1.2;
      const pulse = Math.sin(t * spd * 2 + bx * 0.3);
      set(fx, fy, pulse > 0.4 ? "o" : ".");
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
