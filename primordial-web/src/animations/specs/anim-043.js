export default {
  id: 43,
  system: "Bacteriophage infecting a cell",
  title: "Phage Injection",
  caption: "A viral predator lands, injects its code, and hijacks life itself.",
  cols: 52,
  rows: 20,
  palette: "dna",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: safe set
    function set(x, y, ch) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) g[y][x] = ch;
    }

    // --- Phase timing (loops every 10 seconds) ---
    const cycle = t % 10;
    // 0..2   : phage descends toward cell
    // 2..3.5 : landing / tail-pin contact
    // 3.5..6 : DNA injection (streak traveling down tail into cell)
    // 6..9   : new phages assembling inside cell
    // 9..10  : fade / reset

    // --- Bacterial cell (oval, centered lower half) ---
    const cellCX = 26, cellCY = 14;
    const cellRX = 14, cellRY = 4;

    // Cell membrane pulse: slight breathe
    const breathe = 1 + 0.04 * Math.sin(t * 1.8);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cellCX) / (cellRX * breathe);
        const dy = (y - cellCY) / (cellRY * breathe);
        const r = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(r - 1) < 0.12) {
          // membrane boundary
          const dense = Math.abs(r - 1) < 0.04;
          set(x, y, dense ? "O" : "o");
        } else if (r < 0.88) {
          // cytoplasm — sparse ribosome-like dots
          const hash = ((x * 7 + y * 13) ^ (x * 3)) & 0xffff;
          if (hash % 17 === 0) set(x, y, ".");
          else if (hash % 31 === 0) set(x, y, ":");
        }
      }
    }

    // --- Phage geometry ---
    // Phage descends from top; tail tip targets cell surface at top of oval
    // Cell top = cellCY - cellRY ≈ row 10
    const cellTop = cellCY - cellRY; // ~10

    // Landing progress: 0 = phage far above, 1 = tail just touching cell
    const landT = Math.min(1, cycle < 2 ? cycle / 2 : 1);
    // phage head center y during descent
    const phageHeadY = Math.round(1 + (cellTop - 4) * landT); // head bottom at cellTop-1 when landed
    const phageX = cellCX; // phage lands on top-center of cell

    // Tail tip y = phageHeadY + 4 (head height 2 + tail 2)
    const tailTipY = phageHeadY + 4;

    // Only draw phage if it hasn't been fully disassembled (cycle < 9)
    if (cycle < 9) {
      // Head: diamond / hexagonal capsid ~5 wide 3 tall
      const hx = phageX, hy = phageHeadY;
      // Capsid rows
      const capsidRows = [
        [0, "^"],
        [-1, 1, "/\\"],
        [-2, 2, "|#|"],
        [-1, 1, "\\/"],
      ];
      // Draw hexagonal capsid
      set(hx,     hy - 2, "^");
      set(hx - 1, hy - 1, "/"); set(hx, hy - 1, "#"); set(hx + 1, hy - 1, "\\");
      set(hx - 2, hy,     "|"); set(hx - 1, hy, "#"); set(hx, hy, "#"); set(hx + 1, hy, "#"); set(hx + 2, hy, "|");
      set(hx - 1, hy + 1, "\\"); set(hx, hy + 1, "#"); set(hx + 1, hy + 1, "/");

      // Tail sheath: 2 rows below capsid base
      const sheathTop = hy + 2;
      set(hx, sheathTop,     "|");
      set(hx, sheathTop + 1, "|");

      // Tail fiber legs (spread out on landing)
      const legSpread = Math.round(landT * 3);
      if (legSpread >= 1) {
        set(hx - legSpread, tailTipY,     "/");
        set(hx + legSpread, tailTipY,     "\\");
      }
      if (legSpread >= 2) {
        set(hx - legSpread - 1, tailTipY + 1, "/");
        set(hx + legSpread + 1, tailTipY + 1, "\\");
      }
    }

    // --- DNA injection stream ---
    // Visible during cycle 3.5..6
    if (cycle >= 3.5 && cycle < 7) {
      const injProgress = (cycle - 3.5) / 3.5; // 0..1
      // DNA strand travels from tail tip down into cell interior
      const streamLen = Math.round(injProgress * (cellRY * 2 - 1));
      const startY = tailTipY;
      for (let i = 0; i < streamLen; i++) {
        const sy = startY + i;
        if (sy >= rows) break;
        // Alternate bases to look like DNA
        const base = ((i + Math.floor(t * 3)) % 4);
        const ch = base === 0 ? "A" : base === 1 ? "T" : base === 2 ? "G" : "C";
        // slight waver
        const wx = phageX + Math.round(Math.sin(i * 0.8 + t * 4) * 0.8);
        set(wx, sy, ch);
      }
      // Bright leading tip
      const tipY = startY + streamLen;
      if (tipY < rows) set(phageX, tipY, "*");
    }

    // --- New phage assembly inside cell (cycle 6..9) ---
    if (cycle >= 6) {
      const assembleT = (cycle - 6) / 3; // 0..1
      // Two offspring phages assembling symmetrically
      const offsets = [-6, 6];
      for (let oi = 0; oi < offsets.length; oi++) {
        const ox = phageX + offsets[oi];
        const oy = cellCY;
        // Assemble from bottom up based on assembleT
        const built = assembleT; // 0..1 completeness

        // Tail (appears first, 0..0.3)
        if (built > 0.05) {
          const tailAlpha = Math.min(1, (built - 0.05) / 0.25);
          if (tailAlpha > 0.3) set(ox, oy + 1, "|");
          if (tailAlpha > 0.6) set(ox, oy + 2, "|");
          if (tailAlpha > 0.85) {
            set(ox - 1, oy + 2, "/");
            set(ox + 1, oy + 2, "\\");
          }
        }
        // Head capsid (appears after tail)
        if (built > 0.35) {
          const headAlpha = Math.min(1, (built - 0.35) / 0.4);
          if (headAlpha > 0.2) {
            set(ox - 1, oy, "/"); set(ox, oy, "#"); set(ox + 1, oy, "\\");
          }
          if (headAlpha > 0.5) {
            set(ox, oy - 1, "^");
            set(ox - 1, oy - 1, "|"); set(ox + 1, oy - 1, "|");
          }
          if (headAlpha > 0.8) {
            set(ox - 1, oy + 1, "\\"); set(ox, oy + 1, "#"); set(ox + 1, oy + 1, "/");
          }
        }
        // DNA still present inside head as it fills
        if (built > 0.6 && built < 0.95) {
          set(ox, oy - 1, (Math.floor(t * 5 + oi) % 2 === 0) ? "@" : "#");
        }
      }
    }

    // --- Burst indicator at end of cycle ---
    if (cycle >= 8.5) {
      const burstT = (cycle - 8.5) / 1.5; // 0..1
      const burst = [
        [-8, -2, "*"], [-7, -3, "o"], [8, -2, "*"], [7, -3, "o"],
        [-5,  3, "o"], [5,  3, "o"],  [0, -5, "*"],
        [-3, -4, "."], [3, -4, "."],
      ];
      for (const [bx, by, ch] of burst) {
        const fx = Math.round(phageX + bx * burstT * 1.4);
        const fy = Math.round(cellCY + by * burstT * 1.2);
        set(fx, fy, ch);
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
