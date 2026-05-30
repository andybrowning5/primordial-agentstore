export default {
  id: 52,
  system: "Actin-myosin sliding filaments",
  title: "Power Stroke",
  caption: "Myosin heads grip actin and row the filament inward.",
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
    function peek(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // Sarcomere geometry
    const zLeft   = 2;
    const zRight  = cols - 3;
    const mCenter = Math.floor(cols / 2);  // 26

    // Cycling: actin slides inward (right for left strand, left for right strand)
    // Use a sawtooth so motion is continuous and loops
    const cycleT  = (t * 0.5) % 1;          // 0..1, one full power-stroke cycle
    const slide   = cycleT * 6;             // max 6 chars of inward travel per cycle

    // Draw two identical sarcomere zones: upper (cy=4) and lower (cy=13)
    const zones = [4, 13];

    zones.forEach(cy => {
      // Z-lines
      for (let dy = -2; dy <= 2; dy++) {
        set(zLeft,  cy + dy, "|");
        set(zRight, cy + dy, "|");
      }

      // Actin thin filaments — two strands above and below the thick filament
      // Each strand slides inward by `slide` chars
      const actinRows = [cy - 1, cy + 1];
      actinRows.forEach(ay => {
        // Left strand: anchored at zLeft+1, tip reaches toward mCenter
        const tipLeft = Math.min(mCenter - 2, zLeft + 1 + Math.floor(14 + slide));
        for (let x = zLeft + 1; x <= tipLeft; x++) {
          const ch = (x % 4 === 0) ? "o" : "-";
          set(x, ay, ch);
        }
        // Right strand: anchored at zRight-1, tip reaches toward mCenter
        const tipRight = Math.max(mCenter + 2, zRight - 1 - Math.floor(14 + slide));
        for (let x = tipRight; x <= zRight - 1; x++) {
          const ch = ((zRight - x) % 4 === 0) ? "o" : "-";
          set(x, ay, ch);
        }
      });

      // Myosin thick filament — centered on mCenter, spans ±10
      const myoHalf = 10;
      for (let x = mCenter - myoHalf; x <= mCenter + myoHalf; x++) {
        if (x === mCenter) {
          set(x, cy, "M");
        } else {
          const ch = (Math.abs(x - mCenter) % 5 === 0) ? "=" : "-";
          set(x, cy, ch);
        }
      }
      set(mCenter - myoHalf - 1, cy, "<");
      set(mCenter + myoHalf + 1, cy, ">");

      // Myosin S1 heads — staggered along the thick filament
      // Each head cycles independently: attach (reach to actin), pull, detach, recover
      // headOffsets: positions relative to mCenter along the filament
      const headOffsets = [-8, -6, -4, -2, 2, 4, 6, 8];
      headOffsets.forEach((hOff, hi) => {
        const hx = mCenter + hOff;
        // Stagger each head by 1/8 of a cycle
        const phase = (cycleT + hi * 0.125) % 1;

        // Heads on left half reach upward (-1 row), heads on right reach downward (+1 row)
        // This creates a visually distinct rowing pattern
        const targetDy = hOff < 0 ? -1 : 1;

        let headY, headChar;
        if (phase < 0.55) {
          // Power stroke: head swings toward and along actin
          const frac = phase / 0.55;
          // Smoothly swing outward from filament to actin row
          headY = cy + Math.round(targetDy * Math.min(frac * 2, 1));
          headChar = frac < 0.15 ? "+" : (frac < 0.75 ? "*" : "+");
        } else {
          // Recovery stroke: head lifts back to filament level
          headY = cy;
          headChar = "`";
        }

        // Draw stalk connecting filament to head when displaced
        if (headY !== cy) {
          const y0 = Math.min(cy, headY);
          const y1 = Math.max(cy, headY);
          for (let yr = y0; yr <= y1; yr++) {
            if (yr !== cy && peek(hx, yr) === " ") set(hx, yr, "|");
          }
        }
        set(hx, headY, headChar);
      });

      // ATP sparkle: brief bright flash at heads during peak of power stroke
      const sparkPhase = (cycleT * 8 + 0.5) % 1;
      if (sparkPhase < 0.12) {
        [-4, -2, 2, 4].forEach(off => {
          const sx = mCenter + off;
          const sy = cy + (off < 0 ? -1 : 1);
          if (peek(sx, sy) !== " ") set(sx, sy, "@");
        });
      }
    });

    // Separator band between the two zones
    const sepRow = Math.floor((zones[0] + zones[1]) / 2);
    const label = "~~~ sarcomere ~~~";
    const lx = Math.floor((cols - label.length) / 2);
    for (let i = 0; i < label.length; i++) {
      set(lx + i, sepRow, label[i]);
    }

    // Top bar: Z / M / Z labels
    set(zLeft,   0, "Z");
    set(mCenter, 0, "M");
    set(zRight,  0, "Z");

    // Animated sliding arrows on row 1 (show actin direction of travel)
    const aPhase = Math.floor(t * 2.5) % 3;
    const aChars = [".", ">", "*"];
    // Left arrows (pointing right = inward)
    for (let i = 0; i < 4; i++) {
      const ax = zLeft + 4 + i * 3;
      if (ax < mCenter - 3) set(ax, 1, aChars[(aPhase + i) % 3]);
    }
    // Right arrows (pointing left = inward), mirrored
    const rChars = [".", "<", "*"];
    for (let i = 0; i < 4; i++) {
      const ax = zRight - 4 - i * 3;
      if (ax > mCenter + 3) set(ax, 1, rChars[(aPhase + i) % 3]);
    }

    // Bottom row: force output label
    const forceLabel = "<<< CONTRACTION >>>";
    const fx = Math.floor((cols - forceLabel.length) / 2);
    const forceRow = rows - 1;
    const pulse = Math.floor(t * 1.5) % 2 === 0;
    if (pulse) {
      for (let i = 0; i < forceLabel.length; i++) {
        set(fx + i, forceRow, forceLabel[i]);
      }
    }

    return g.map(row => row.join("")).join("\n");
  }
};
