export default {
  id: 29,
  system: "Complement cascade",
  title: "Complement Cascade",
  caption: "Proteins assemble into a pore that ruptures the pathogen.",
  cols: 52,
  rows: 18,
  palette: "immune",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cy = rows / 2;
    const cx = cols / 2;

    // --- helper: safe set ---
    function set(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        g[yi][xi] = ch;
      }
    }

    // cascade phase: 0..1 cycling over ~8s
    const phase = (t % 8) / 8;

    // --- 1. Target pathogen membrane (horizontal arc at center) ---
    const memRadius = 7;
    const memChars = ["-", "=", "-", "~"];
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2;
      const mx = cx + memRadius * Math.cos(angle) * 1.9;
      const my = cy + memRadius * Math.sin(angle) * 0.85;
      // pulse membrane slightly
      const pulse = 1 + 0.04 * Math.sin(t * 2 + i * 0.3);
      const pmx = cx + memRadius * pulse * Math.cos(angle) * 1.9;
      const pmy = cy + memRadius * pulse * Math.sin(angle) * 0.85;
      const ch = memChars[i % memChars.length];
      set(pmx, pmy, ch);
    }

    // --- 2. C3 convertase activation at top of membrane (t > 0.05s equivalent) ---
    // Activation site pulses at top of pathogen
    const actX = cx;
    const actY = cy - memRadius * 0.85 - 1;
    const actBlink = Math.sin(t * 4) > 0 ? "*" : "+";
    set(actX, actY, actBlink);
    set(actX - 1, actY, "C");
    set(actX + 1, actY, "3");

    // --- 3. C3b fragments raining down on the membrane surface ---
    // Each fragment is a dot traveling from activation site to membrane
    const numFrags = 10;
    for (let i = 0; i < numFrags; i++) {
      const fragPhase = ((t * 0.7 + i * (1 / numFrags)) % 1);
      // Only show fragments in early+mid phase
      if (fragPhase < 0.7) {
        const progress = fragPhase / 0.7;
        // spread angle: fragments fan outward from top
        const angle = -Math.PI / 2 + (i - numFrags / 2) * 0.28;
        const dist = progress * memRadius * 1.1;
        const fx = cx + dist * Math.cos(angle) * 1.9;
        const fy = cy + dist * Math.sin(angle) * 0.85;
        const fragChar = progress < 0.5 ? "o" : ".";
        set(fx, fy, fragChar);
      }
    }

    // --- 4. Opsonization: C3b dots coating the membrane ---
    // They appear and persist as phase advances
    const coatCount = Math.floor(phase * 24);
    for (let i = 0; i < coatCount; i++) {
      const angle = (i / 24) * Math.PI * 2 + 0.13;
      const mx = cx + memRadius * 1.05 * Math.cos(angle) * 1.9;
      const my = cy + memRadius * 1.05 * Math.sin(angle) * 0.85;
      set(mx, my, "o");
    }

    // --- 5. MAC (membrane attack complex) pore forming ---
    // Appears in late phase (phase > 0.5), grows as a ring inside the membrane
    if (phase > 0.45) {
      const macProgress = Math.min(1, (phase - 0.45) / 0.4);
      const macR = macProgress * 3.2;
      const macParts = Math.floor(macProgress * 18);
      // MAC subunits: C5b-C9 oligomer
      const macChars = ["(", "O", ")"];
      for (let i = 0; i < macParts; i++) {
        const angle = (i / 18) * Math.PI * 2;
        const mx = cx + macR * Math.cos(angle) * 1.7;
        const my = cy + macR * Math.sin(angle) * 0.8;
        const ch = macChars[i % macChars.length];
        set(mx, my, ch);
      }
      // Pore center: if fully formed, show interior disruption
      if (macProgress > 0.85) {
        const rupture = Math.sin(t * 6) > 0.3 ? "#" : "@";
        set(cx, cy, rupture);
        // leaking contents
        const leakAngle = t * 3;
        for (let l = 0; l < 4; l++) {
          const la = leakAngle + l * (Math.PI / 2);
          const ldist = 1 + ((t * 2 + l * 0.7) % 2.5);
          set(cx + ldist * Math.cos(la) * 1.5, cy + ldist * Math.sin(la) * 0.7, ".");
        }
      }
    }

    // --- 6. Cascade label glyphs: C1 C4 C2 C3 ... drifting inward ---
    const labels = ["C1", "C4", "C2", "C3", "C5"];
    for (let li = 0; li < labels.length; li++) {
      // Each label appears at a different time in the cascade
      const labelStart = li * 0.15;
      const labelPhase = ((phase - labelStart + 1) % 1);
      if (labelPhase < 0.45) {
        const lp = labelPhase / 0.45;
        // Start far out, drift toward membrane
        const angle = -Math.PI * 0.5 + li * 0.55 - 1.1;
        const startDist = memRadius * 2.2;
        const endDist = memRadius * 1.15;
        const dist = startDist + (endDist - startDist) * lp;
        const lx = Math.round(cx + dist * Math.cos(angle) * 1.9);
        const ly = Math.round(cy + dist * Math.sin(angle) * 0.85);
        const label = labels[li];
        const alpha = lp < 0.85 ? 1 : (1 - (lp - 0.85) / 0.15);
        if (alpha > 0.5) {
          for (let ci = 0; ci < label.length; ci++) {
            const lxi = lx + ci;
            if (lxi >= 0 && lxi < cols && ly >= 0 && ly < rows) {
              g[ly][lxi] = label[ci];
            }
          }
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
