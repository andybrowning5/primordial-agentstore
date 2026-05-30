export default {
  id: 15,
  system: "mRNA translation at the ribosome",
  title: "Ribosome Translation",
  caption: "Codons stream through the ribosome, each read into life.",
  cols: 54,
  rows: 20,
  palette: "dna",
  frame(t) {
    const cols = 54, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function putIfEmpty(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows && g[yi][xi] === " ") g[yi][xi] = ch;
    }

    const mRnaY = 12;           // row where mRNA threads through ribosome
    const riboCx = 28;          // ribosome center x (fixed)
    const riboCy = mRnaY - 1;   // ribosome vertical center

    // ── mRNA scrolling strand ────────────────────────────────────────────
    // mRNA moves left: offset increases with t, giving rightward-to-left flow
    const mRnaSpeed = 1.4;
    const mRnaOffset = (t * mRnaSpeed) % 3; // repeating 3-char codon pattern
    const codonChars = ["A", "U", "G", "C"];
    // Deterministic codon sequence derived from position
    function codonChar(pos) {
      const idx = ((pos * 7 + 3) % 4 + 4) % 4;
      return codonChars[idx];
    }
    for (let x = 0; x < cols; x++) {
      // Inside ribosome (roughly cols 20..36) mRNA is partially hidden
      const inRibo = x >= 19 && x <= 37;
      if (inRibo) {
        // Show mRNA backbone but dim
        const floatPos = x + mRnaOffset;
        const codonPos = Math.floor(floatPos / 3);
        const charSlot = Math.floor(floatPos) % 3;
        if (charSlot === 0) {
          put(x, mRnaY, "-");
        } else {
          const ch = codonChar(codonPos * 3 + charSlot);
          put(x, mRnaY, ch);
        }
      } else {
        // Outside ribosome: full wavy mRNA with codon separators
        const floatPos = x + mRnaOffset;
        const codonPos = Math.floor(floatPos / 3);
        const charSlot = Math.floor(floatPos) % 3;
        const waveY = mRnaY + Math.round(Math.sin(x * 0.4 + t * 0.3) * 0.4);
        if (charSlot === 0) {
          put(x, waveY, "|");
        } else {
          const ch = codonChar(codonPos * 3 + charSlot);
          put(x, waveY, ch);
        }
      }
    }

    // ── Ribosome large subunit (top, dome shape) ─────────────────────────
    // Large subunit: wider ellipse sitting above mRNA
    const lsuRx = 10.5, lsuRy = 4.8;
    const lsuCy = mRnaY - 3.2;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - riboCx) / lsuRx;
        const dy = (y - lsuCy) / lsuRy;
        const r = Math.sqrt(dx * dx + dy * dy);
        // Only draw top half (dy < 0.55 keeps it above mRNA)
        if (dy > 0.7) continue;
        if (Math.abs(r - 1.0) < 0.10) {
          g[y][x] = "#";
        } else if (r < 0.90) {
          // Sparse interior texture — deterministic
          if ((x * 13 + y * 7 + Math.floor(t * 3)) % 17 === 0) g[y][x] = ".";
          else if ((x * 5 + y * 11 + Math.floor(t * 2)) % 23 === 0) g[y][x] = ":";
        }
      }
    }

    // ── Ribosome small subunit (bottom, flatter) ─────────────────────────
    const ssuRx = 9.0, ssuRy = 2.8;
    const ssuCy = mRnaY + 2.5;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - riboCx) / ssuRx;
        const dy = (y - ssuCy) / ssuRy;
        const r = Math.sqrt(dx * dx + dy * dy);
        // Only draw bottom half
        if (dy < -0.5) continue;
        if (Math.abs(r - 1.0) < 0.12) {
          g[y][x] = "#";
        } else if (r < 0.88) {
          if ((x * 11 + y * 5 + Math.floor(t * 3)) % 19 === 0) g[y][x] = ".";
        }
      }
    }

    // ── Exit tunnel label on left ─────────────────────────────────────────
    // Small notch on large subunit left side
    put(riboCx - lsuRx + 0.5, lsuCy, ">");

    // ── A-site, P-site, E-site markers inside ribosome ───────────────────
    // Sites relative to ribosome center; mRNA scrolls through them
    const aSite = riboCx + 4;
    const pSite = riboCx;
    const eSite = riboCx - 4;
    put(aSite, mRnaY - 1, "A");
    put(pSite, mRnaY - 1, "P");
    put(eSite, mRnaY - 1, "E");

    // ── tRNA molecules ────────────────────────────────────────────────────
    // Three tRNAs: one at A-site (incoming), one at P-site (translating),
    // one at E-site (exiting). Each bobs vertically with slight phase offset.
    const aminoAcids = ["G", "L", "V", "A", "S", "T", "K", "R"];
    function aminoAt(siteX) {
      // Which amino acid is at this codon right now?
      const floatPos = siteX + mRnaOffset;
      const codonPos = Math.floor(floatPos / 3);
      return aminoAcids[((codonPos * 11 + 5) % aminoAcids.length + aminoAcids.length) % aminoAcids.length];
    }

    function drawTrna(siteX, phase, showAmino) {
      const bob = Math.sin(t * 1.8 + phase) * 0.8;
      const baseY = mRnaY - 2;
      const stemTop = Math.round(baseY - 3 + bob);
      const stemBot = Math.round(baseY + bob);
      const tx = Math.round(siteX);

      // Anticodon loop at bottom touching mRNA
      put(tx - 1, stemBot, "(");
      put(tx,     stemBot, "o");
      put(tx + 1, stemBot, ")");

      // Stem (vertical bar)
      for (let sy = stemBot - 1; sy >= stemTop + 1; sy--) {
        put(tx, sy, "|");
      }

      // Amino acid arm at top
      put(tx - 1, stemTop, "<");
      put(tx,     stemTop, "-");
      put(tx + 1, stemTop, ">");

      // Amino acid cargo above arm
      if (showAmino) {
        const aa = aminoAt(siteX);
        put(tx - 1, stemTop - 1, "(");
        put(tx,     stemTop - 1, aa);
        put(tx + 1, stemTop - 1, ")");
      }
    }

    // A-site tRNA arrives with phase synced to mRNA scroll (bobs in)
    const aArrival = (Math.sin(t * 1.8) * 0.5 + 0.5); // 0..1 arrival progress
    if (aArrival > 0.2) drawTrna(aSite, 0.0, true);

    // P-site tRNA (actively translating, always present, steady)
    drawTrna(pSite, 1.2, false);

    // E-site tRNA (exiting, fading — only draw stem, no amino acid)
    const eExit = (Math.sin(t * 1.8 + 3.0) * 0.5 + 0.5);
    if (eExit < 0.75) drawTrna(eSite, 2.4, false);

    // ── Growing polypeptide chain exiting left ────────────────────────────
    // Chain grows over time, looping; each amino acid is a letter bead
    const chainLength = Math.floor((t * 0.8) % 9) + 3;
    const chainStartX = riboCx - lsuRx - 1;
    const chainY = mRnaY - 5;

    for (let i = 0; i < chainLength; i++) {
      const bead = aminoAcids[(i * 3 + 7) % aminoAcids.length];
      const bx = chainStartX - i * 2.2;
      const by = chainY + Math.sin(i * 0.9 + t * 0.5) * 1.2;
      const bxi = Math.round(bx), byi = Math.round(by);
      if (bxi >= 0 && bxi < cols && byi >= 0 && byi < rows) {
        g[byi][bxi] = bead;
        // connector between beads
        if (i < chainLength - 1) {
          const nx = bx - 2.2;
          const ny = by + Math.sin((i + 1) * 0.9 + t * 0.5) * 1.2;
          const mx = (bx + nx) / 2, my = (by + ny) / 2;
          putIfEmpty(mx, my, "-");
        }
      }
    }

    // Polypeptide exit tunnel connector to ribosome
    const exitX = Math.round(riboCx - lsuRx);
    const exitY = mRnaY - 4;
    put(exitX + 1, exitY, "~");
    put(exitX,     exitY, "~");

    // ── 5' cap label on left end of mRNA ─────────────────────────────────
    put(1, mRnaY - 1, "5");
    put(2, mRnaY - 1, "'");

    // ── 3' tail label on right end ────────────────────────────────────────
    put(cols - 3, mRnaY - 1, "3");
    put(cols - 2, mRnaY - 1, "'");

    return g.map((row) => row.join("")).join("\n");
  }
};
