export default {
  id: 80,
  system: "Pollen tube growth",
  title: "Pollen Tube Growth",
  caption: "A pollen grain extends its tube, racing toward the ovule.",
  cols: 50,
  rows: 18,
  palette: "photosynth",
  frame(t) {
    const cols = 50, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- pollen grain at top center ---
    const grainCx = Math.floor(cols / 2);
    const grainCy = 2;
    const grainR = 3;

    // Pulse the grain gently
    const pulse = Math.sin(t * 1.8) * 0.3 + 1.0;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = x - grainCx;
        const dy = y - grainCy;
        const r = Math.sqrt(dx * dx + dy * dy);
        const pr = grainR * pulse;
        if (r <= pr + 0.5 && r >= pr - 0.5) {
          // outer shell — aperture pores at cardinal angles
          const angle = Math.atan2(dy, dx);
          const poreZone = Math.abs(Math.sin(angle * 3));
          g[y][x] = poreZone < 0.25 ? "o" : "@";
        } else if (r < pr - 0.5 && r > 0.5) {
          // interior cytoplasm texture
          const hash = ((x * 7 + y * 13 + Math.floor(t * 3)) % 9);
          g[y][x] = hash === 0 ? "*" : hash === 1 ? "." : " ";
        } else if (r <= 0.5) {
          g[y][x] = "O"; // nucleus
        }
      }
    }

    // --- tube length grows over time, loops every ~12s ---
    const loopPeriod = 12;
    const tLoop = t % loopPeriod;
    // tube tip travels from grainCy+grainR down toward near-bottom
    const maxTubeLen = rows - grainCy - grainR - 2;
    // grow fast at first, then slow (sigmoid-like via sin curve mapped 0..1)
    const growPhase = tLoop / loopPeriod; // 0..1
    const growFrac = growPhase < 0.7
      ? (1 - Math.cos(Math.PI * growPhase / 0.7)) * 0.5
      : 1.0;
    const tubeLen = Math.floor(growFrac * maxTubeLen);

    const tubeTopY = grainCy + Math.floor(grainR * pulse);
    const tubeTipY = tubeTopY + tubeLen;
    const tubeCx = grainCx;

    // Draw tube walls (two parallel lines with slight sinusoidal waviness)
    for (let y = tubeTopY + 1; y <= tubeTipY && y < rows - 1; y++) {
      const wave = Math.round(Math.sin(y * 0.8 - t * 2.0) * 0.8);
      const lx = tubeCx - 1 + wave;
      const rx = tubeCx + 1 + wave;
      if (lx >= 0 && lx < cols) g[y][lx] = "|";
      if (rx >= 0 && rx < cols) g[y][rx] = "|";
    }

    // --- vesicles flowing down the tube ---
    // 4 vesicles at evenly spaced phases, each takes ~2s to travel tube length
    const numVesicles = 4;
    for (let v = 0; v < numVesicles; v++) {
      const phase = (t * 0.5 + v / numVesicles) % 1.0;
      const vy = Math.floor(tubeTopY + 1 + phase * (tubeLen - 1));
      const wave = Math.round(Math.sin(vy * 0.8 - t * 2.0) * 0.8);
      const vx = tubeCx + wave;
      if (vy >= tubeTopY + 1 && vy <= tubeTipY && vy >= 0 && vy < rows) {
        if (vx >= 0 && vx < cols) g[vy][vx] = "o";
      }
    }

    // --- tip region: active growth zone with calcium gradient halo ---
    if (tubeTipY >= 0 && tubeTipY < rows) {
      const wave = Math.round(Math.sin(tubeTipY * 0.8 - t * 2.0) * 0.8);
      const tipX = tubeCx + wave;

      // tip cap
      if (tipX >= 0 && tipX < cols) g[tubeTipY][tipX] = "v";

      // calcium halo glows around tip
      const haloFlicker = Math.sin(t * 4.5) * 0.5 + 0.5;
      const haloChars = [".", ":", "+", "*"];
      const haloChar = haloChars[Math.floor(haloFlicker * haloChars.length)];

      const haloPositions = [
        [tubeTipY - 1, tipX - 1], [tubeTipY - 1, tipX + 1],
        [tubeTipY,     tipX - 2], [tubeTipY,     tipX + 2],
        [tubeTipY + 1, tipX - 1], [tubeTipY + 1, tipX],
        [tubeTipY + 1, tipX + 1],
      ];
      for (const [hy, hx] of haloPositions) {
        if (hy >= 0 && hy < rows && hx >= 0 && hx < cols && g[hy][hx] === " ") {
          g[hy][hx] = haloChar;
        }
      }
    }

    // --- style tissue background: faint cellular pattern ---
    for (let y = tubeTopY; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (g[y][x] === " ") {
          // intercellular boundaries, slow drift
          const drift = Math.floor(t * 0.3);
          const cell = ((x + drift) % 8 === 0 || (y + drift) % 5 === 0);
          if (cell) g[y][x] = "·"[0] || ".";
        }
      }
    }

    // Pad each row to exactly cols characters
    return g.map(row => row.join("").padEnd(cols, " ").slice(0, cols)).join("\n");
  }
};
