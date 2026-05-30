export default {
  id: 4,
  system: "Phagocytosis",
  title: "Cell Engulfment",
  caption: "A macrophage reaches out, wraps its prey in living membrane.",
  cols: 52,
  rows: 18,
  palette: "immune",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Phase: 0=approach, 1=pseudopods extend, 2=engulf, 3=digest — loops every 8s
    const period = 8.0;
    const phase = (t % period) / period; // 0..1

    const cy = rows / 2;
    const cx = cols * 0.38; // macrophage center (left-ish)

    // --- MACROPHAGE body ---
    // Slightly elongated blob that pulses gently
    const pulse = 1 + 0.06 * Math.sin(t * 2.1);
    const macRx = cols * 0.20 * pulse;
    const macRy = rows * 0.38 * pulse;

    // Draw macrophage interior fill
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / macRx;
        const dy = (y - cy) / macRy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 0.82) {
          // Interior cytoplasm texture
          const noise = Math.sin(x * 1.3 + t * 0.7) * Math.cos(y * 1.7 - t * 0.5);
          if (noise > 0.55) g[y][x] = ".";
          else if (noise > 0.2) g[y][x] = ":";
          else g[y][x] = " ";
        }
      }
    }

    // Draw macrophage membrane (outer shell with wobble)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / macRx;
        const dy = (y - cy) / macRy;
        // Wobble the membrane slightly
        const angle = Math.atan2(dy, dx);
        const wobble = 1 + 0.07 * Math.sin(angle * 5 + t * 1.8) + 0.04 * Math.sin(angle * 3 - t * 2.5);
        const r = Math.sqrt(dx * dx + dy * dy);
        const edge = Math.abs(r - wobble);
        if (edge < 0.09) g[y][x] = "O";
        else if (edge < 0.18) g[y][x] = "o";
      }
    }

    // --- PATHOGEN (target particle) ---
    // Starts far right, moves toward macrophage as phase progresses
    // phase 0..0.3: particle approaches
    // phase 0.3..0.7: pseudopods wrap it
    // phase 0.7..1.0: fully engulfed, fades inside

    const approachEnd = 0.35;
    const engulfEnd = 0.75;

    let pathX, pathY, pathScale;

    if (phase < approachEnd) {
      // Particle drifting toward the macrophage
      const progress = phase / approachEnd;
      const startX = cols * 0.82;
      const targetX = cx + macRx * 1.35;
      pathX = startX - (startX - targetX) * progress;
      pathY = cy + Math.sin(progress * Math.PI * 1.5) * rows * 0.08;
      pathScale = 1.0;
    } else if (phase < engulfEnd) {
      // Particle at engulfment zone, pseudopods wrapping
      const progress = (phase - approachEnd) / (engulfEnd - approachEnd);
      pathX = cx + macRx * (1.35 - progress * 0.55);
      pathY = cy + Math.sin(progress * Math.PI) * rows * 0.04;
      pathScale = 1.0 - progress * 0.25;
    } else {
      // Fully engulfed — particle is inside, shrinking/digesting
      const progress = (phase - engulfEnd) / (1.0 - engulfEnd);
      pathX = cx - macRx * 0.15 + Math.sin(progress * Math.PI * 4) * 2;
      pathY = cy + Math.cos(progress * Math.PI * 3) * rows * 0.1;
      pathScale = 0.75 - progress * 0.65;
    }

    // Draw pathogen (small spiky blob)
    const pathR = 2.5 * Math.max(pathScale, 0.05);
    const pxi = Math.round(pathX);
    const pyi = Math.round(pathY);
    const pathRX = Math.max(1, Math.round(pathR * 1.4));
    const pathRY = Math.max(1, Math.round(pathR * 0.9));

    if (pathScale > 0.08) {
      for (let dy = -pathRY - 1; dy <= pathRY + 1; dy++) {
        for (let dx = -pathRX - 1; dx <= pathRX + 1; dx++) {
          const py = pyi + dy;
          const px = pxi + dx;
          if (py < 0 || py >= rows || px < 0 || px >= cols) continue;
          const nr = Math.sqrt((dx / (pathR * 1.4)) ** 2 + (dy / (pathR * 0.9)) ** 2);
          const spikes = 1 + 0.18 * Math.sin(Math.atan2(dy, dx) * 6 + t * 3.0);
          if (Math.abs(nr - spikes) < 0.25) {
            g[py][px] = phase > engulfEnd ? "+" : "#";
          } else if (nr < spikes * 0.72) {
            g[py][px] = phase > engulfEnd ? "." : "%";
          }
        }
      }
    }

    // --- PSEUDOPODS ---
    // Two arms extending from the right side of the macrophage toward the pathogen
    // Only active during phase 0.3..0.75
    if (phase > approachEnd - 0.05 && phase < engulfEnd) {
      const armProgress = Math.min(1, (phase - (approachEnd - 0.05)) / (engulfEnd - approachEnd + 0.05));

      // Two pseudopod arms extending from the macrophage edge toward pathogen
      for (let arm = 0; arm < 2; arm++) {
        const armSide = arm === 0 ? 1 : -1;
        const baseAngle = armSide * 0.45; // angle offset from horizontal

        // Number of segments along the arm
        const armLen = Math.round(armProgress * 10);
        for (let seg = 0; seg <= armLen; seg++) {
          const segFrac = seg / 10;
          // Arm curves from macrophage edge toward pathogen
          const armAngle = baseAngle * (1 - segFrac * 0.8);
          const armDist = macRx * (0.95 + segFrac * 0.7);
          const ax = Math.round(cx + Math.cos(armAngle) * armDist);
          const ay = Math.round(cy + Math.sin(armAngle) * armDist - armSide * segFrac * rows * 0.12);

          if (ax >= 0 && ax < cols && ay >= 0 && ay < rows) {
            const ch = seg === armLen ? "O" : (seg > armLen - 2 ? "o" : "|");
            g[ay][ax] = ch;
            // Membrane thickening around the arm tip
            if (seg === armLen && arm === 0 && ax + 1 < cols) g[ay][ax + 1] = "o";
            if (seg === armLen && arm === 1 && ax + 1 < cols) g[ay][ax + 1] = "o";
          }
        }

        // Curling tip — the arm bends inward to wrap around the pathogen
        if (armProgress > 0.55) {
          const curlProgress = (armProgress - 0.55) / 0.45;
          const tipBaseX = cx + Math.cos(baseAngle * 0.1) * macRx * 1.65;
          const tipBaseY = cy + Math.sin(baseAngle * 0.1) * macRx * 1.65 - armSide * rows * 0.12;

          for (let c = 1; c <= Math.round(curlProgress * 5); c++) {
            const curlAngle = (armSide > 0 ? -1 : 1) * (c / 5) * Math.PI * 0.5;
            const cx2 = Math.round(tipBaseX + Math.sin(curlAngle) * 4);
            const cy2 = Math.round(tipBaseY - Math.cos(curlAngle) * 2 * armSide);
            if (cx2 >= 0 && cx2 < cols && cy2 >= 0 && cy2 < rows) {
              g[cy2][cx2] = c === Math.round(curlProgress * 5) ? "O" : "o";
            }
          }
        }
      }
    }

    // --- NUCLEUS inside macrophage ---
    const nucX = cx - macRx * 0.28;
    const nucY = cy + macRy * 0.05;
    const nucRx = macRx * 0.28;
    const nucRy = macRy * 0.25;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - nucX) / nucRx;
        const dy = (y - nucY) / nucRy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 1.0 && r > 0.75) g[y][x] = "o";
        else if (r <= 0.75) g[y][x] = ":";
      }
    }

    // Pad each row to exactly cols width
    return g.map((row) => row.join("").padEnd(cols, " ").slice(0, cols)).join("\n");
  }
};
