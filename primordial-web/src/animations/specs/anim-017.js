export default {
  id: 17,
  system: "mRNA splicing by the spliceosome",
  title: "Spliceosome",
  caption: "Intron loops into a lariat as exons are stitched together.",
  cols: 54,
  rows: 20,
  palette: "dna",
  frame(t) {
    const cols = 54, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: clamp indices
    const set = (x, y, ch) => {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        if (g[yi][xi] === " " || ch === "@" || ch === "#" || ch === "O") g[yi][xi] = ch;
      }
    };

    // Animation cycle: period ~8s
    // Phase 0..1: spliceosome assembles over intron
    // Phase 0.4..0.7: lariat forms (intron loops)
    // Phase 0.7..0.9: exons ligate
    // Phase 0.9..1.0: product released, reset
    const period = 8.0;
    const phase = (t % period) / period; // 0..1

    // ── mRNA strand geometry ──────────────────────────────────
    // The pre-mRNA runs horizontally across row cy
    const cy = rows / 2 - 1; // y=8 (0-indexed) for the strand

    // Exon 1: cols 2..18   Intron: cols 18..36   Exon 2: cols 36..52
    const ex1Start = 2, ex1End = 18;
    const intronStart = 18, intronEnd = 36;
    const ex2Start = 36, ex2End = 52;

    // ── Draw exon segments (always present) ──────────────────
    // Exon 1 — bright, solid
    const exonChar1 = (x) => {
      const pat = (x + Math.floor(t * 2)) % 4;
      return pat === 0 ? "=" : pat === 1 ? "-" : pat === 2 ? "=" : "-";
    };
    for (let x = ex1Start; x <= ex1End; x++) {
      set(x, cy, exonChar1(x));
    }
    // Exon label
    set(ex1Start + 4, cy - 2, "E");
    set(ex1Start + 5, cy - 2, "x");
    set(ex1Start + 6, cy - 2, "o");
    set(ex1Start + 7, cy - 2, "n");
    set(ex1Start + 8, cy - 2, "1");

    // Exon 2 — bright, solid (visible when not yet ligated)
    const exonChar2 = (x) => {
      const pat = (x + Math.floor(t * 2)) % 4;
      return pat === 0 ? "=" : pat === 1 ? "-" : pat === 2 ? "=" : "-";
    };
    for (let x = ex2Start; x <= ex2End; x++) {
      set(x, cy, exonChar2(x));
    }
    set(ex2Start + 4, cy - 2, "E");
    set(ex2Start + 5, cy - 2, "x");
    set(ex2Start + 6, cy - 2, "o");
    set(ex2Start + 7, cy - 2, "n");
    set(ex2Start + 8, cy - 2, "2");

    // ── Intron and lariat ─────────────────────────────────────
    const lariPhase = Math.max(0, (phase - 0.38) / 0.32); // 0..1 during lariat formation
    const lariP = Math.min(lariPhase, 1.0);

    if (lariP < 1.0) {
      // Intron still present as a strand (or being pulled into loop)
      // As lariat forms, the intron arcs downward
      const arcDepth = lariP * (rows - cy - 2); // how far down the loop dips
      const intronMid = (intronStart + intronEnd) / 2;
      const intronLen = intronEnd - intronStart;

      for (let i = 0; i <= intronLen; i++) {
        const frac = i / intronLen; // 0..1
        const x = intronStart + i;
        // Arc: parabola dipping downward, scaled by lariP
        const arcY = cy + arcDepth * 4 * frac * (1 - frac);
        const intronCharList = ["~", "~", "-", "~", "~", "-"];
        const ch = (lariP < 0.05)
          ? intronCharList[(i + Math.floor(t * 3)) % intronCharList.length]
          : (frac < 0.12 || frac > 0.88) ? "|" : "~";
        set(x, arcY, ch);
      }

      // Lariat branch point knot (5' end circles back)
      if (lariP > 0.3) {
        const knotProgress = (lariP - 0.3) / 0.7;
        const knotX = intronStart + intronLen * 0.25;
        const knotY = cy + arcDepth * 4 * 0.25 * 0.75;
        // Draw small circle indicating branch point
        const knotR = knotProgress * 1.8;
        for (let a = 0; a < 12; a++) {
          const angle = (a / 12) * Math.PI * 2;
          const bx = knotX + Math.cos(angle) * knotR;
          const by = knotY + Math.sin(angle) * knotR * 0.55;
          set(bx, by, knotProgress > 0.7 ? "o" : ".");
        }
        if (knotProgress > 0.85) set(knotX, knotY, "@");
      }
    } else {
      // Lariat fully formed — draw completed lariat loop floating below
      const loopCX = (intronStart + intronEnd) / 2;
      const loopCY = cy + 4;
      const loopRX = (intronEnd - intronStart) * 0.38;
      const loopRY = 3.2;
      // Loop outline
      for (let a = 0; a < 40; a++) {
        const angle = (a / 40) * Math.PI * 2;
        const lx = loopCX + Math.cos(angle) * loopRX;
        const ly = loopCY + Math.sin(angle) * loopRY;
        const ch = (a % 5 === 0) ? "O" : "o";
        set(lx, ly, ch);
      }
      // Tail from lariat to ex1End (the 5' tail connecting to branch)
      for (let x = intronStart; x <= intronStart + 3; x++) {
        set(x, cy, "|");
      }
      set(intronStart, cy + 1, "\\");
      set(intronStart + 1, cy + 2, "\\");
      set(intronStart + 2, cy + 3, "|");
      // Branch point marker
      set(loopCX - loopRX * 0.7, loopCY - loopRY * 0.3, "@");
    }

    // ── Spliceosome complex assembly ──────────────────────────
    // Phase 0..0.4: snRNPs arrive and assemble over the intron
    // Show 5 snRNP blobs arriving at intron boundaries
    const assembleP = Math.min(phase / 0.38, 1.0);

    // Five snRNP positions along the intron (U1,U2,U4,U5,U6)
    const snrnpDefs = [
      { name: "U1", tx: intronStart,          ty: cy - 3 },
      { name: "U2", tx: intronStart + 4,      ty: cy - 4 },
      { name: "U5", tx: (intronStart + intronEnd) / 2, ty: cy - 5 },
      { name: "U4", tx: intronEnd - 4,        ty: cy - 4 },
      { name: "U6", tx: intronEnd,            ty: cy - 3 },
    ];

    snrnpDefs.forEach((snrnp, i) => {
      const arriveThresh = i * 0.07;
      if (assembleP < arriveThresh) return;
      const localP = Math.min((assembleP - arriveThresh) / 0.18, 1.0);

      // snRNP starts from above, descends to target y
      const startY = 1;
      const curY = startY + (snrnp.ty - startY) * localP;
      const curX = snrnp.tx;

      // Body: small blob (3 chars wide)
      const pulse = Math.sin(t * 2.5 + i * 1.1) * 0.5 + 0.5;
      const bodyChar = pulse > 0.6 ? "#" : "O";
      set(curX - 1, curY, "(");
      set(curX,     curY, bodyChar);
      set(curX + 1, curY, ")");

      // Label
      if (localP > 0.7) {
        const label = snrnp.name;
        for (let li = 0; li < label.length; li++) {
          set(curX - 1 + li, curY - 1, label[li]);
        }
      }

      // Connection line from snRNP down to strand once assembled
      if (localP > 0.85) {
        const lineY1 = Math.round(curY) + 1;
        const lineY2 = cy - 1;
        for (let ly = lineY1; ly <= lineY2; ly++) {
          set(curX, ly, ":");
        }
      }
    });

    // ── Ligation flash ────────────────────────────────────────
    // Phase 0.72..0.82: exons snap together with a burst
    const ligPhase = Math.max(0, (phase - 0.72) / 0.10);
    const ligP = Math.min(ligPhase, 1.0);

    if (ligP > 0 && ligP < 1.0) {
      // Junction flash
      const jx = (ex1End + ex2Start) / 2;
      const burst = Math.sin(ligP * Math.PI);
      const flashChars = ["*", "+", "x", "*", "+"];
      for (let r = 0; r < 3; r++) {
        const angle = t * 6 + r * 2.094;
        const bx = jx + Math.cos(angle) * (burst * 3 + r);
        const by = cy + Math.sin(angle) * (burst * 1.5 + r * 0.5);
        set(bx, by, flashChars[r % flashChars.length]);
      }
      // Show exon junction marker
      set(jx, cy, "*");
    }

    // After ligation: show joined exon strand bridging the gap
    if (ligP >= 1.0 || phase > 0.82) {
      const joinedP = Math.min((phase - 0.82) / 0.08, 1.0);
      // Fill in the junction
      for (let x = ex1End; x <= ex2Start; x++) {
        set(x, cy, "=");
      }
      // mRNA product label
      if (joinedP > 0.5) {
        const label = "mRNA";
        const lx = Math.round((ex1Start + ex2End) / 2) - 2;
        for (let li = 0; li < label.length; li++) {
          set(lx + li, cy + 2, label[li]);
        }
      }
    }

    // ── Ambient RNA polymerase flow markers ───────────────────
    // Small dots drifting leftward along the strand edges
    for (let i = 0; i < 4; i++) {
      const speed = 0.6 + i * 0.15;
      const x = ((cols - 4 - (t * speed * 8 + i * 13) % (cols - 4)) | 0) + 2;
      set(x, cy + 1, ".");
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
