export default {
  id: 16,
  system: "Protein folding",
  title: "Chain to Structure",
  caption: "A tangled chain collapses into helices and sheets.",
  cols: 50,
  rows: 18,
  palette: "dna",
  frame(t) {
    const cols = 50, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Folding progress: 0 = extended chain, 1 = fully folded
    const fold = (Math.sin(t * 0.35) * 0.5 + 0.5);
    const fold2 = fold * fold;

    // Helper: safe write to grid
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        if (g[yi][xi] === " " || ch === "@" || ch === "#") g[yi][xi] = ch;
      }
    }

    // ── Extended chain backbone ──────────────────────────────────────────
    // When fold=0, a sinuous chain spans the grid horizontally
    // As fold increases, the chain contracts into the center

    const chainLen = 36;
    const chainNodes = [];

    for (let i = 0; i < chainLen; i++) {
      const fi = i / (chainLen - 1); // 0..1 along chain

      // Extended: gentle S-curve across the grid
      const extX = 4 + fi * 42;
      const extY = rows / 2 + Math.sin(fi * Math.PI * 2.5 + t * 0.4) * 3.5;

      // Folded: compact coil — alpha-helix region left, beta-sheet right
      // Alpha helix: left cluster, helical curl
      const helixAngle = fi * Math.PI * 6 + t * 1.1;
      const helixCx = 16, helixCy = rows / 2;
      const helixRx = 5.5 * (1 - fi * 0.3);
      const helixRy = fi * 0.35 * rows * 0.5;
      const foldedHelixX = helixCx + Math.cos(helixAngle) * helixRx;
      const foldedHelixY = helixCy + (fi - 0.5) * rows * 0.72 + Math.sin(helixAngle * 0.5) * 1.2;

      // Beta sheet: right cluster, stacked strands
      const strandIdx = Math.floor(fi * 5);
      const strandPos = fi * 5 - strandIdx;
      const sheetCx = 34;
      const sheetX = sheetCx + (strandPos - 0.5) * 9 * (strandIdx % 2 === 0 ? 1 : -1);
      const sheetY = rows / 2 + (strandIdx - 2) * 2.5;

      // Blend between extended, helix, and sheet regions
      const helixWeight = Math.max(0, 1 - fi * 2); // first half = helix
      const sheetWeight = Math.max(0, fi * 2 - 1); // second half = sheet
      const coilWeight = 1 - helixWeight - sheetWeight;

      const foldedX = helixWeight * foldedHelixX + sheetWeight * sheetX + coilWeight * (helixCx + (sheetCx - helixCx) * fi);
      const foldedY = helixWeight * foldedHelixY + sheetWeight * sheetY + coilWeight * (rows / 2 + Math.sin(fi * Math.PI + t * 0.8) * 2);

      const nx = extX * (1 - fold2) + foldedX * fold2;
      const ny = extY * (1 - fold2) + foldedY * fold2;
      chainNodes.push({ x: nx, y: ny, fi });
    }

    // Draw chain bonds between nodes
    for (let i = 0; i < chainNodes.length - 1; i++) {
      const a = chainNodes[i], b = chainNodes[i + 1];
      const steps = 4;
      for (let s = 0; s <= steps; s++) {
        const bx = a.x + (b.x - a.x) * s / steps;
        const by = a.y + (b.y - a.y) * s / steps;
        // Character varies by region and fold
        let ch;
        if (fold > 0.7) {
          ch = a.fi < 0.5 ? (s % 2 === 0 ? "o" : "-") : (s % 2 === 0 ? "=" : "-");
        } else {
          ch = (i + s) % 3 === 0 ? "o" : "-";
        }
        put(bx, by, ch);
      }
    }

    // Draw residue nodes along chain
    for (let i = 0; i < chainNodes.length; i++) {
      const n = chainNodes[i];
      const pulse = Math.sin(t * 2.2 + i * 0.6) * 0.5 + 0.5;
      let ch;
      if (fold > 0.65 && n.fi < 0.5) {
        // Alpha helix residues
        ch = (i % 4 === 0) ? "@" : (i % 2 === 0 ? "O" : "o");
      } else if (fold > 0.65 && n.fi >= 0.5) {
        // Beta sheet residues
        ch = (i % 3 === 0) ? "#" : "=";
      } else {
        // Unfolded chain
        ch = pulse > 0.7 ? "O" : (i % 5 === 0 ? "@" : "o");
      }
      put(n.x, n.y, ch);
    }

    // ── Alpha-helix cylinder outline (left region, appears when folded) ──
    if (fold > 0.4) {
      const alpha = (fold - 0.4) / 0.6;
      const hcx = 16, hcy = rows / 2;
      const hh = 7 * alpha; // half-height
      const hr = 4.5 * alpha;
      // Top and bottom ellipse arcs
      for (let a = 0; a <= Math.PI; a += 0.18) {
        const ex = hcx + Math.cos(a) * hr;
        const ey = hcy - hh + Math.sin(a) * 1.1;
        put(ex, ey, "~");
        const ex2 = hcx + Math.cos(a + Math.PI) * hr;
        const ey2 = hcy + hh + Math.sin(a + Math.PI) * 1.1;
        put(ex2, ey2, "~");
      }
      // Side rails
      for (let y = hcy - hh; y <= hcy + hh; y += 0.5) {
        put(hcx - hr, y, "|");
        put(hcx + hr, y, "|");
      }
      // Helix label
      if (alpha > 0.8) {
        const label = "α"; // α — fallback to 'a' if needed
        put(hcx, hcy - hh - 1.5, "a");
      }
    }

    // ── Beta-sheet arrows (right region, appears when folded) ──
    if (fold > 0.45) {
      const alpha = (fold - 0.45) / 0.55;
      const scx = 34;
      for (let strand = 0; strand < 5; strand++) {
        const sy = rows / 2 + (strand - 2) * 2.5;
        const slen = Math.round(7 * alpha);
        const dir = strand % 2 === 0 ? 1 : -1;
        const sx = scx - slen / 2 * dir;
        for (let dx = 0; dx < slen; dx++) {
          const x = sx + dx * dir;
          const ch = dx === slen - 1 ? (dir > 0 ? ">" : "<") : "=";
          put(x, sy, ch);
        }
      }
      // Sheet label
      if (alpha > 0.8) {
        put(scx, rows / 2 - 5.5, "b");
      }
    }

    // ── Energy/hydrophobic collapse indicator ────────────────────────────
    // Sparkling dots show hydrophobic core forming at center
    if (fold > 0.55) {
      const alpha = (fold - 0.55) / 0.45;
      const cx = 25, cy = rows / 2;
      for (let angle = 0; angle < Math.PI * 2; angle += 0.38) {
        const r = 1.5 * alpha;
        const px = cx + Math.cos(angle + t * 0.7) * r;
        const py = cy + Math.sin(angle + t * 0.7) * r * 0.55;
        const sparkCh = (Math.sin(t * 3.1 + angle * 4) > 0.4) ? "*" : ".";
        put(px, py, sparkCh);
      }
    }

    // ── Floating unfolded residue labels ────────────────────────────────
    // Before folding: amino acid single-letter codes drift in
    if (fold < 0.5) {
      const codes = ["G", "A", "V", "L", "P", "F", "W", "M", "S", "T"];
      const vis = 1 - fold * 2;
      for (let k = 0; k < 6; k++) {
        const bx = 5 + k * 7 + Math.sin(t * 0.6 + k * 1.1) * 1.5;
        const by = 2 + Math.sin(t * 0.5 + k * 0.9) * 1.2;
        if (vis > 0.3) put(bx, by, codes[k % codes.length]);
        const bx2 = 5 + k * 7 + Math.sin(t * 0.5 + k * 1.3) * 1.5;
        const by2 = rows - 3 + Math.sin(t * 0.6 + k * 0.7) * 1.2;
        if (vis > 0.3) put(bx2, by2, codes[(k + 5) % codes.length]);
      }
    }

    // ── Fold progress bar at bottom ──────────────────────────────────────
    const barW = 20;
    const barX = Math.floor((cols - barW) / 2);
    const barY = rows - 1;
    const filled = Math.round(fold * barW);
    for (let i = 0; i < barW; i++) {
      const bx = barX + i;
      if (bx >= 0 && bx < cols && barY >= 0 && barY < rows) {
        g[barY][bx] = i < filled ? ":" : ".";
      }
    }

    return g.map(row => row.join("")).join("\n");
  }
};
