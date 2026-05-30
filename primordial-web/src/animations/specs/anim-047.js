export default {
  id: 47,
  system: "Bacterial conjugation (plasmid transfer)",
  title: "Conjugation Bridge",
  caption: "A pilus bridges two cells; plasmid DNA slips across.",
  cols: 52,
  rows: 18,
  palette: "microbe",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: safe write
    function put(x, y, ch) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) g[y][x] = ch;
    }

    const cy = rows / 2;          // vertical center

    // --- Two bacteria: left donor, right recipient ---
    // Each is an oval ~8 wide, 5 tall
    const donorCX  = 10;
    const recipCX  = 41;
    const cellRX   = 4.2;
    const cellRY   = 2.6;

    function drawCell(cx, phase) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - cx) / cellRX;
          const dy = (y - cy) / cellRY;
          const r  = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(r - 1) < 0.18) {
            // membrane — pulse gently
            const pulse = Math.sin(t * 1.4 + phase) * 0.06;
            put(x, y, Math.abs(r - 1) < 0.07 + pulse ? "@" : "o");
          } else if (r < 0.85) {
            // cytoplasm stipple
            if ((x * 11 + y * 7 + Math.floor(t * 3 + phase)) % 13 === 0) put(x, y, ".");
          }
        }
      }
    }

    drawCell(donorCX, 0);
    drawCell(recipCX, 3);

    // --- Pilus (conjugation tube) ---
    // Grows from donor right edge to recipient left edge over first ~3s, then stays
    const pilusGrow = Math.min(1, t / 3.0);
    const pilusX0   = Math.round(donorCX + cellRX + 0.5);   // donor right edge
    const pilusX1   = Math.round(recipCX - cellRX - 0.5);   // recipient left edge
    const pilusTip  = Math.round(pilusX0 + (pilusX1 - pilusX0) * pilusGrow);

    // Draw the double-line pilus
    const pilusY0 = Math.round(cy) - 1;
    const pilusY1 = Math.round(cy) + 1;
    for (let x = pilusX0; x <= pilusTip; x++) {
      // Slight undulation
      const wave = Math.sin(t * 2.5 + x * 0.4) * 0.3;
      const topY  = pilusY0 + Math.round(wave);
      const botY  = pilusY1 + Math.round(wave);
      put(x, topY, "-");
      put(x, botY, "-");
      // Occasional cross-link
      if ((x - pilusX0) % 4 === 2) put(x, Math.round((topY + botY) / 2), ":");
    }

    // --- Plasmid in donor (circular DNA ring) ---
    // Small circle spinning inside donor
    const plasmidR  = 1.6;
    const plasmidCX = donorCX - 0.5;
    const plasmidCY = cy;
    const plasmidSpinBase = t * 1.1;
    const plasmidChars = ["o", "0", "O", "0"];
    for (let i = 0; i < 8; i++) {
      const angle = plasmidSpinBase + (i / 8) * Math.PI * 2;
      const px = Math.round(plasmidCX + plasmidR * Math.cos(angle) * 1.8); // stretch for ASCII aspect
      const py = Math.round(plasmidCY + plasmidR * Math.sin(angle));
      put(px, py, plasmidChars[i % plasmidChars.length]);
    }

    // --- Plasmid transfer ---
    // After pilus fully grown (~t>3), a copy travels rightward through the tube
    // It loops: every 4 seconds a copy traverses
    if (pilusGrow >= 1) {
      const tubeLen    = pilusX1 - pilusX0;
      const period     = 4.0;
      const tOffset    = t - 3.0;          // time since pilus complete
      const phase      = (tOffset % period) / period; // 0..1 over each cycle
      const travelX    = Math.round(pilusX0 + phase * tubeLen);
      const travelY    = Math.round(cy);
      // Draw a small plasmid bead moving through the tube
      const beadChars  = ["O", "0", "o"];
      put(travelX,     travelY,     beadChars[Math.floor(t * 4) % 3]);
      put(travelX - 1, travelY,     "(");
      put(travelX + 1, travelY,     ")");

      // Once bead arrives (phase > 0.85) show plasmid forming in recipient
      const recipientPhase = Math.min(1, Math.max(0, (phase - 0.85) / 0.15));
      if (recipientPhase > 0) {
        const rr     = 1.5 * recipientPhase;
        const rSpin  = t * 1.3 + 2.0;
        for (let i = 0; i < 8; i++) {
          const angle = rSpin + (i / 8) * Math.PI * 2;
          const px    = Math.round(recipCX - 0.5 + rr * Math.cos(angle) * 1.8);
          const py    = Math.round(cy       + rr * Math.sin(angle));
          put(px, py, plasmidChars[i % plasmidChars.length]);
        }
      }
    }

    // --- Labels: small indicators ---
    // "F+" donor marker
    put(donorCX - 1, Math.round(cy - cellRY - 1), "F");
    put(donorCX,     Math.round(cy - cellRY - 1), "+");
    // "F-" recipient marker
    put(recipCX - 1, Math.round(cy - cellRY - 1), "F");
    put(recipCX,     Math.round(cy - cellRY - 1), "-");

    return g.map((row) => row.join("")).join("\n");
  }
};
