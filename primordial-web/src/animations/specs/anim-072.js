export default {
  id: 72,
  system: "Cell signaling cascade",
  title: "Signal Cascade",
  caption: "A receptor spark ignites a phospho-wave to the waiting nucleus.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // ── helpers ──────────────────────────────────────────────────────────────
    function set(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function get(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // ── membrane (top edge, row 1) ────────────────────────────────────────
    const memRow = 1;
    for (let x = 2; x < cols - 2; x++) {
      // undulating membrane
      const wave = Math.sin(x * 0.35 + t * 1.2) * 0.5;
      const row = memRow + Math.round(wave);
      const r = Math.max(0, Math.min(rows - 1, row));
      g[r][x] = "=";
    }
    // membrane label
    set(cols - 8, memRow, "M"); set(cols - 7, memRow, "E"); set(cols - 6, memRow, "M");

    // ── receptor (sits on the membrane, pulses when ligand arrives) ───────
    // ligand binding cycle — every 4 s the ligand hits and triggers cascade
    const cycleLen = 5.0;
    const phase = (t % cycleLen) / cycleLen; // 0..1
    const bound = phase > 0.08; // ligand bound after 8 % of cycle

    const recX = 10, recY = memRow + 1;
    // extracellular ligand drifts down and binds
    if (phase < 0.08) {
      const ly = Math.round((phase / 0.08) * (memRow - 1));
      set(recX, ly, "L");          // ligand approaching
    }
    // receptor shape
    const recChar = bound ? "@" : "Y";
    set(recX,     recY, recChar);
    set(recX - 1, recY - 1, bound ? ">" : " ");
    set(recX + 1, recY - 1, bound ? "<" : " ");
    // activation glow ring when bound
    if (bound) {
      const glow = Math.sin(t * 4) * 0.5 + 0.5;
      const gChar = glow > 0.5 ? "*" : "o";
      set(recX - 2, recY, gChar);
      set(recX + 2, recY, gChar);
      set(recX, recY - 1, gChar);
      set(recX, recY + 1, gChar);
    }

    // ── phosphorylation wave ──────────────────────────────────────────────
    // wave travels from receptor (recY+1) down to nucleus (row ~13)
    // starts at phase 0.1, arrives at nucleus by phase 0.55
    const waveStart = memRow + 2;     // y where wave begins
    const waveEnd   = 13;             // y just above nucleus
    const waveRange = waveEnd - waveStart;

    // wave position: travels down between phase 0.10 and 0.55
    const waveActive = phase > 0.10 && phase < 0.90;
    if (waveActive) {
      const wProgress = Math.min(1, (phase - 0.10) / 0.45);
      const waveY = waveStart + wProgress * waveRange;

      // draw several molecules in the cascade trail
      const trailLen = 5;
      for (let i = 0; i < trailLen; i++) {
        const ty = waveY - i * 1.4;
        if (ty < waveStart || ty > waveEnd + 1) continue;
        const intensity = 1 - i / trailLen;
        const wx = recX + Math.sin(ty * 0.9 + t * 0.5) * 3;
        const ch = i === 0 ? "P" : (intensity > 0.5 ? "+" : "·");
        set(wx, ty, ch);
        // flanking dots for head of wave
        if (i === 0) {
          set(wx - 1, ty, "*");
          set(wx + 1, ty, "*");
        }
      }

      // secondary branch (MAPK-style fork) at midpoint
      if (wProgress > 0.35) {
        const branchProgress = (wProgress - 0.35) / 0.65;
        const by = waveStart + 0.35 * waveRange + branchProgress * waveRange * 0.5;
        const bx = recX + 8 + branchProgress * 5;
        if (by >= 0 && by < rows && bx >= 0 && bx < cols) {
          set(bx, by, "p");
          set(bx + 1, by, "~");
        }
      }
    }

    // ── cytoplasm background dots (metabolic noise) ───────────────────────
    for (let y = memRow + 2; y < rows - 2; y++) {
      for (let x = 0; x < cols; x++) {
        if (g[y][x] !== " ") continue;
        // sparse deterministic noise
        const v = ((x * 17 + y * 31 + Math.floor(t * 2) * 7) % 97);
        if (v === 0) g[y][x] = ".";
        else if (v === 1) g[y][x] = "`";
      }
    }

    // ── nucleus (oval, rows 13-16, centered at x~26) ─────────────────────
    const nucCX = 26, nucCY = 14.5, nucRX = 10, nucRY = 2.8;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - nucCX) / nucRX;
        const dy = (y - nucCY) / nucRY;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(r - 1) < 0.15) {
          g[y][x] = "O";
        } else if (r < 0.85) {
          // chromatin pattern inside nucleus
          const pat = ((x * 5 + y * 9 + Math.floor(t * 1.5) * 3) % 23);
          if (pat === 0) g[y][x] = ":";
          else if (pat === 1) g[y][x] = "-";
        }
      }
    }

    // ── transcription activation flash when wave arrives ─────────────────
    // wave arrives at nucleus around phase 0.55; transcription fires 0.55-0.85
    if (phase > 0.55 && phase < 0.85) {
      const txProgress = (phase - 0.55) / 0.30;
      // growing mRNA strand coming off nucleus
      const mLen = Math.round(txProgress * 12);
      const mStartX = nucCX + nucRX + 1;
      const mY = Math.round(nucCY);
      for (let i = 0; i < mLen && mStartX + i < cols - 1; i++) {
        const ch = (i % 3 === 0) ? "~" : (i % 3 === 1) ? "-" : "~";
        set(mStartX + i, mY, ch);
      }
      // label
      if (mLen > 4) {
        set(mStartX + mLen, mY, "m");
        set(mStartX + mLen + 1, mY, "R");
        set(mStartX + mLen + 2, mY, "N");
        set(mStartX + mLen + 3, mY, "A");
      }
      // nucleus glow
      const nglow = Math.sin(txProgress * Math.PI) > 0.3;
      if (nglow) {
        const gChar = Math.sin(t * 6) > 0 ? "*" : "+";
        set(nucCX, Math.round(nucCY), gChar);
        set(nucCX - 1, Math.round(nucCY), gChar);
        set(nucCX + 1, Math.round(nucCY), gChar);
      }
    }

    // ── border ────────────────────────────────────────────────────────────
    for (let x = 0; x < cols; x++) { g[0][x] = "-"; g[rows - 1][x] = "-"; }
    for (let y = 0; y < rows; y++) { g[y][0] = "|"; g[y][cols - 1] = "|"; }
    g[0][0] = "+"; g[0][cols - 1] = "+"; g[rows - 1][0] = "+"; g[rows - 1][cols - 1] = "+";

    return g.map((row) => row.join("")).join("\n");
  }
};
