export default {
  id: 51,
  system: "Sarcomere contraction",
  title: "Sliding Filaments",
  caption: "Actin threads slide inward as myosin ratchets the Z-lines close.",
  cols: 52,
  rows: 18,
  palette: "energy",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Contraction cycle: s=0 relaxed, s=1 fully contracted, smooth loop
    const s = Math.sin(t * 0.7) * 0.5 + 0.5; // 0..1

    const midY = Math.floor(rows / 2);

    // Sarcomere spans the full width
    // Z-lines move inward as s increases
    const zHalf0 = Math.floor(cols * 0.46); // relaxed Z-line half-distance from center
    const zHalfC = Math.floor(cols * 0.28); // contracted Z-line half-distance from center
    const zHalf  = Math.round(zHalf0 + (zHalfC - zHalf0) * s);

    const cx = Math.floor(cols / 2);
    const zLeft  = cx - zHalf;
    const zRight = cx + zHalf;

    // Helper: clamp and set char if in bounds
    function set(x, y, ch) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) {
        if (g[y][x] === " " || ch === "|" || ch === "=" || ch === "#") g[y][x] = ch;
      }
    }
    function setOver(x, y, ch) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) g[y][x] = ch;
    }

    // --- Z-lines (thick vertical bars on both ends) ---
    for (let y = 1; y < rows - 1; y++) {
      setOver(zLeft,      y, "#");
      setOver(zLeft + 1,  y, "#");
      setOver(zRight,     y, "#");
      setOver(zRight - 1, y, "#");
    }

    // --- Actin filaments (thin tracks from Z-lines toward center) ---
    // Each filament row: several rows around midY
    const actinRows = [midY - 3, midY - 1, midY + 1, midY + 3];
    // Actin extends inward from Z-lines; length shrinks as s increases
    const actinLen0 = Math.floor(cols * 0.30); // relaxed
    const actinLenC = Math.floor(cols * 0.15); // contracted
    const actinLen  = Math.round(actinLen0 + (actinLenC - actinLen0) * s);

    for (const ay of actinRows) {
      // Left actin filament (extends right from left Z-line)
      for (let dx = 2; dx < actinLen; dx++) {
        const x = zLeft + 1 + dx;
        if (x < cx) set(x, ay, "-");
      }
      // Right actin filament (extends left from right Z-line)
      for (let dx = 2; dx < actinLen; dx++) {
        const x = zRight - 1 - dx;
        if (x > cx) set(x, ay, "-");
      }
    }

    // --- Myosin thick filament (stays centered, A-band constant) ---
    // A-band: fixed width around cx
    const aHalf = Math.floor(cols * 0.18);
    const myosinRows = [midY - 2, midY, midY + 2];

    for (const my of myosinRows) {
      // Thick myosin backbone
      for (let dx = -aHalf; dx <= aHalf; dx++) {
        const x = cx + dx;
        set(x, my, "=");
      }
    }

    // --- Myosin heads (cross-bridges that cycle) ---
    // Heads appear between myosin backbone and actin filaments
    // They animate with a cycling phase to simulate power stroke
    const headRows = [midY - 2, midY, midY + 2];
    const actinTgt = [midY - 3, midY - 1, midY + 1]; // targets for even/odd
    const numHeads = 6;

    for (let hi = 0; hi < numHeads; hi++) {
      const phase = (hi / numHeads) * Math.PI * 2;
      // Head x-position along myosin, alternating left/right sides
      const side  = hi % 2 === 0 ? -1 : 1;
      const hxOff = Math.round((aHalf * 0.3) + (aHalf * 0.55) * (hi / numHeads));
      const hx    = cx + side * hxOff;

      // Power stroke: head reaches toward actin
      const stroke = Math.sin(t * 1.4 + phase) * 0.5 + 0.5;

      // Which myosin row does this head belong to?
      const mIdx = hi % headRows.length;
      const my   = headRows[mIdx];
      const ay   = actinTgt[mIdx] !== undefined ? actinTgt[mIdx] : midY - 1;

      // Head character changes with stroke phase
      const headChar = stroke > 0.6 ? "o" : stroke > 0.3 ? "v" : ".";

      // Draw head at midpoint between myosin row and actin row
      const headY = Math.round((my + ay) / 2);
      set(hx, headY, headChar);

      // Connector from myosin backbone to head
      if (my !== headY) {
        const connY = my + (headY > my ? 1 : -1);
        set(hx, connY, ":");
      }
    }

    // --- H-zone indicator (center gap in myosin, shrinks with s) ---
    // H-zone: region where only myosin, no actin overlap
    // Shown as dots on the myosin rows at center (narrow as s increases)
    const hHalf = Math.round(Math.max(2, aHalf * 0.45 * (1 - s)));
    for (const my of myosinRows) {
      for (let dx = -hHalf; dx <= hHalf; dx++) {
        setOver(cx + dx, my, dx === 0 ? "|" : "~");
      }
    }

    // --- M-line (center vertical line) ---
    for (let y = 1; y < rows - 1; y++) {
      if (g[y][cx] === " ") setOver(cx, y, ":");
    }
    setOver(cx, midY - 4, "|");
    setOver(cx, midY + 4, "|");

    // --- Titin springs (elastic connectors Z-line to M-line, top+bottom) ---
    const titinY  = [1, rows - 2];
    const titinPhase = Math.sin(t * 0.7) * 0.5 + 0.5; // same cycle as s
    for (const ty of titinY) {
      // Draw stretched spring between Z-lines
      const springStep = Math.floor((zRight - zLeft) / 10);
      for (let i = 0; i < 10; i++) {
        const tx = zLeft + i * springStep + Math.round(springStep / 2);
        // Spring char alternates / \ with compression state
        const sp = (i + Math.floor(t * 2)) % 2 === 0 ? "/" : "\\";
        if (tx > zLeft + 1 && tx < zRight - 1) set(tx, ty, sp);
      }
    }

    // --- Labels on first and last row ---
    // Row 0: "Z" markers over Z-line positions
    setOver(zLeft,      0, "Z");
    setOver(zRight - 1, 0, "Z");
    setOver(cx,         0, "M");

    // --- Pulse glow: brighten center actin overlap zone ---
    const glowPhase = Math.sin(t * 1.1 + 1.0);
    if (glowPhase > 0.7) {
      // brief flash on overlap zone chars
      const overlapL = zLeft + actinLen;
      const overlapR = zRight - actinLen;
      if (overlapL < cx && overlapR > cx) {
        for (const ay of actinRows) {
          for (let x = overlapL; x <= overlapR; x++) {
            if (g[ay] && g[ay][x] === "-") g[ay][x] = "*";
          }
        }
      }
    }

    return g.map(row => row.join("")).join("\n");
  }
};
