export default {
  id: 48,
  system: "Chloroplast light reactions",
  title: "Thylakoid Cascade",
  caption: "Photons split water; electrons race toward ATP and light.",
  cols: 52,
  rows: 18,
  palette: "photosynth",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- helpers ---
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function putSafe(x, y, ch) {
      if (x >= 0 && x < cols && y >= 0 && y < rows) g[y][x] = ch;
    }

    // === THYLAKOID MEMBRANE (two horizontal bands) ===
    // Upper membrane band  row 5, lower membrane band row 12
    const memRows = [5, 12];
    for (const mr of memRows) {
      for (let x = 2; x < cols - 2; x++) {
        // Wavy membrane using sin
        const wave = Math.round(Math.sin(x * 0.35 + t * 0.4) * 0.4);
        const wy = mr + wave;
        if (wy >= 0 && wy < rows) g[wy][x] = "=";
      }
    }

    // === PHOTOSYSTEM II — left cluster (col ~10) ===
    // Blinks as it absorbs photons
    const ps2x = 10;
    const ps2Pulse = (Math.sin(t * 2.1) * 0.5 + 0.5);
    {
      const mr = memRows[0] + Math.round(Math.sin(ps2x * 0.35 + t * 0.4) * 0.4);
      put(ps2x - 1, mr - 1, ps2Pulse > 0.7 ? "P" : "p");
      put(ps2x,     mr - 1, ps2Pulse > 0.7 ? "S" : "s");
      put(ps2x + 1, mr - 1, ps2Pulse > 0.7 ? "2" : ".");
      // Oxygen evolution below (water splitting)
      const oPhase = (t * 1.3) % (Math.PI * 2);
      put(ps2x - 1, mr + 1, oPhase < 1.2 ? "O" : "o");
      put(ps2x + 1, mr + 1, oPhase < 1.2 ? "O" : "o");
      if (oPhase > 0.6 && oPhase < 1.8) put(ps2x, mr + 2, ":");
    }

    // === PHOTOSYSTEM I — right cluster (col ~38) ===
    const ps1x = 38;
    const ps1Pulse = (Math.sin(t * 1.8 + 1.2) * 0.5 + 0.5);
    {
      const mr = memRows[0] + Math.round(Math.sin(ps1x * 0.35 + t * 0.4) * 0.4);
      put(ps1x - 1, mr - 1, ps1Pulse > 0.65 ? "P" : "p");
      put(ps1x,     mr - 1, ps1Pulse > 0.65 ? "S" : "s");
      put(ps1x + 1, mr - 1, ps1Pulse > 0.65 ? "1" : ".");
      // NADPH output above
      const nPhase = (t * 1.1 + 0.8) % (Math.PI * 2);
      if (nPhase < 1.5) {
        put(ps1x, mr - 2, "N");
        put(ps1x + 1, mr - 2, "~");
      }
    }

    // === ELECTRON TRANSPORT CHAIN (ETC) — electrons hop left→right ===
    // 4 electrons travel from PS2 → cytb6f (col ~22) → PS1 along upper membrane
    const etcY = memRows[0] - 2;
    const numElec = 4;
    for (let i = 0; i < numElec; i++) {
      const phase = (t * 0.7 + i * (Math.PI * 2 / numElec)) % (Math.PI * 2);
      // electron position: oscillates across the membrane span
      const ex = ps2x + 2 + ((Math.sin(phase) * 0.5 + 0.5) * (ps1x - ps2x - 4));
      const ey = etcY + Math.sin(phase * 2) * 1.2;
      const ch = (Math.sin(phase * 3) > 0) ? "*" : "o";
      put(ex, ey, ch);
    }

    // === CYTOCHROME b6f COMPLEX (proton pump) col ~22 ===
    const cyt6fx = 22;
    {
      const mr = memRows[0] + Math.round(Math.sin(cyt6fx * 0.35 + t * 0.4) * 0.4);
      put(cyt6fx, mr - 1, "b");
      put(cyt6fx + 1, mr - 1, "6");
      // Proton (H+) pumped downward into lumen (between membranes)
      const hPhase = (t * 1.5) % (Math.PI * 2);
      const hy = mr + 1 + Math.round((hPhase / (Math.PI * 2)) * 5) % 5;
      if (hy < memRows[1] - 1) put(cyt6fx, hy, "+");
    }

    // === ATP SYNTHASE — straddles lower membrane (col ~28) ===
    // Rotor spins, ATP pulses out
    const atpx = 28;
    {
      const mr2 = memRows[1] + Math.round(Math.sin(atpx * 0.35 + t * 0.4) * 0.4);
      // Stalk above membrane
      put(atpx, mr2 - 3, "|");
      put(atpx, mr2 - 2, "|");
      // Spinning rotor (F0) — 6 spokes in circle
      const rotorR = 2.2;
      const spinAngle = t * 1.4;
      for (let s = 0; s < 6; s++) {
        const angle = spinAngle + s * (Math.PI / 3);
        const rx2 = atpx + Math.round(Math.cos(angle) * rotorR);
        const ry2 = mr2 + Math.round(Math.sin(angle) * 1.1);
        const ch2 = (s % 2 === 0) ? "O" : "o";
        putSafe(rx2, ry2, ch2);
      }
      // Stalk below membrane
      put(atpx, mr2 + 2, "|");
      put(atpx, mr2 + 3, "|");
      // ATP pulse
      const atpPhase = (t * 0.9) % (Math.PI * 2);
      if (atpPhase < 1.6) {
        put(atpx - 1, mr2 + 4, "A");
        put(atpx,     mr2 + 4, "T");
        put(atpx + 1, mr2 + 4, "P");
      }
    }

    // === PHOTON RAIN — incoming light quanta from top ===
    const photonCount = 8;
    for (let i = 0; i < photonCount; i++) {
      // Each photon falls at a fixed x lane, speed slightly varies
      const laneX = 3 + Math.round(i * (cols - 6) / (photonCount - 1));
      const speed = 1.1 + (i % 3) * 0.25;
      const phase = (t * speed + i * 1.7) % (Math.PI * 2);
      // y travels 0..4 (above membranes), then hits membrane at row 5
      const py = ((phase / (Math.PI * 2)) * (memRows[0] - 1)) % (memRows[0]);
      const pyR = Math.floor(py);
      const ch = (pyR === 0) ? "*" : (pyR < 2 ? "'" : ".");
      putSafe(laneX, pyR, ch);
    }

    // === NADPH FLOW — from PS1 rightward into stroma ===
    for (let i = 0; i < 3; i++) {
      const nphase = (t * 0.6 + i * 2.1) % (Math.PI * 2);
      const nx = ps1x + 3 + Math.round((nphase / (Math.PI * 2)) * (cols - ps1x - 5));
      const ny = memRows[0] - 3;
      if (nx < cols - 1 && ny >= 0) {
        g[ny][nx] = "~";
      }
    }

    // === LUMEN PROTON GRADIENT — H+ density between membranes ===
    // Rows 6..11 between the two membrane bands
    const lumenTop = memRows[0] + 1;
    const lumenBot = memRows[1] - 1;
    for (let y = lumenTop; y <= lumenBot; y++) {
      const density = 0.08 + 0.07 * Math.sin(t * 0.5 + y * 0.8);
      for (let x = 3; x < cols - 3; x++) {
        const noise = Math.sin(x * 1.7 + y * 2.3 + t * 0.8) * 0.5 + 0.5;
        if (noise < density && g[y][x] === " ") g[y][x] = "+";
      }
    }

    // === STROMA LABEL (top area) ===
    const stromaLabel = "stroma";
    const slx = cols - stromaLabel.length - 2;
    for (let i = 0; i < stromaLabel.length; i++) putSafe(slx + i, 1, stromaLabel[i]);

    // === LUMEN LABEL ===
    const lumenLabel = "lumen";
    const llx = cols - lumenLabel.length - 2;
    const lly = Math.floor((lumenTop + lumenBot) / 2);
    for (let i = 0; i < lumenLabel.length; i++) putSafe(llx + i, lly, lumenLabel[i]);

    return g.map(row => row.join("")).join("\n");
  }
};
