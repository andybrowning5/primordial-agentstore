export default {
  id: 86,
  system: "Yeast budding",
  title: "Daughter Rising",
  caption: "A daughter cell swells and pinches free from her mother.",
  cols: 52,
  rows: 18,
  palette: "microbe",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Budding cycle: ~12 seconds per full cycle
    const cycle = (t % 12) / 12; // 0..1 over 12 s

    // Mother cell center (slightly left of center)
    const mCX = cols * 0.42;
    const mCY = rows * 0.52;
    const mRX = cols * 0.17;
    const mRY = rows * 0.36;

    // Bud grows from the upper-right shoulder of the mother
    // budProgress 0->1: bud grows, then separates
    const budProgress = Math.min(cycle * 1.6, 1.0); // grows during first 62% of cycle
    const separating = cycle > 0.72; // starts separating at 72%
    const separated = cycle > 0.88;  // fully free at 88%

    // Bud size: starts tiny, grows to ~55% of mother size
    const budScale = budProgress * 0.55;
    const budRX = mRX * budScale;
    const budRY = mRY * budScale;

    // Bud attachment point on mother surface (upper-right)
    const attachAngle = -0.55; // radians, upper-right
    const attachX = mCX + Math.cos(attachAngle) * mRX * 0.92;
    const attachY = mCY + Math.sin(attachAngle) * mRY * 0.92;

    // Bud center: grows outward from attachment point
    let budCX, budCY;
    if (!separating) {
      budCX = attachX + Math.cos(attachAngle) * budRX * 0.85;
      budCY = attachY + Math.sin(attachAngle) * budRY * 0.85;
    } else {
      // Separation: bud moves away from mother
      const sepT = (cycle - 0.72) / 0.16; // 0..1 during separation
      const sepDist = Math.min(sepT, 1.0);
      budCX = attachX + Math.cos(attachAngle) * (budRX * 0.85 + sepDist * budRX * 1.8);
      budCY = attachY + Math.sin(attachAngle) * (budRY * 0.85 + sepDist * budRY * 1.8);
    }

    // Nucleus pulse (slow oscillation)
    const nucleusPulse = Math.sin(t * 1.1) * 0.12 + 0.88;

    // Draw mother cell interior fill
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - mCX) / mRX;
        const dy = (y - mCY) / mRY;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 0.88) {
          // Cytoplasm texture pattern
          const pat = (x * 5 + y * 7 + Math.floor(t * 3)) % 17;
          if (pat === 0) g[y][x] = ".";
          else if (pat === 3) g[y][x] = "`";
          else if (pat === 8) g[y][x] = ",";
        }
      }
    }

    // Draw mother nucleus (center-left of mother)
    const mnCX = mCX - mRX * 0.22;
    const mnCY = mCY + mRY * 0.08;
    const mnR = mRX * 0.28 * nucleusPulse;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = x - mnCX, dy = (y - mnCY) * 1.5;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < mnR * 0.55) {
          g[y][x] = "O";
        } else if (r < mnR) {
          g[y][x] = "o";
        }
      }
    }

    // Draw bud interior (if visible)
    if (budProgress > 0.05) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - budCX) / Math.max(budRX, 0.5);
          const dy = (y - budCY) / Math.max(budRY, 0.5);
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r < 0.88) {
            const pat = (x * 3 + y * 11 + Math.floor(t * 3 + 5)) % 13;
            if (pat === 0) g[y][x] = ".";
            else if (pat === 4) g[y][x] = "`";
          }
        }
      }

      // Bud nucleus appears when bud is large enough
      if (budProgress > 0.55) {
        const bnProgress = Math.min((budProgress - 0.55) / 0.35, 1.0);
        const bnCX = budCX;
        const bnCY = budCY + budRY * 0.05;
        const bnR = budRX * 0.3 * bnProgress * nucleusPulse;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const dx = x - bnCX, dy = (y - bnCY) * 1.5;
            const r = Math.sqrt(dx * dx + dy * dy);
            if (r < bnR * 0.55 && bnR > 0.4) {
              g[y][x] = "O";
            } else if (r < bnR && bnR > 0.4) {
              g[y][x] = "o";
            }
          }
        }
      }
    }

    // Draw mother cell wall (outer boundary)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - mCX) / mRX;
        const dy = (y - mCY) / mRY;
        const r = Math.sqrt(dx * dx + dy * dy);
        const edge = Math.abs(r - 1.0);
        if (edge < 0.07) {
          g[y][x] = "@";
        } else if (edge < 0.16 && g[y][x] === " ") {
          g[y][x] = "o";
        }
      }
    }

    // Draw bud wall (if visible)
    if (budProgress > 0.05 && budRX > 0.3) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - budCX) / budRX;
          const dy = (y - budCY) / budRY;
          const r = Math.sqrt(dx * dx + dy * dy);
          const edge = Math.abs(r - 1.0);
          if (edge < 0.1) {
            g[y][x] = "@";
          } else if (edge < 0.22 && g[y][x] === " ") {
            g[y][x] = "o";
          }
        }
      }
    }

    // Draw neck/isthmus between mother and bud (while attached)
    if (budProgress > 0.1 && !separated && budRX > 0.5) {
      const neckWidth = budRX * 0.55 * (1 - Math.max(0, (cycle - 0.72) / 0.16));
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const nx = attachX + (budCX - attachX) * frac * 0.5;
        const ny = attachY + (budCY - attachY) * frac * 0.5;
        // Draw perpendicular width at this neck point
        const perpX = -(budCY - attachY);
        const perpY = (budCX - attachX);
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
        for (let w = -neckWidth; w <= neckWidth; w += 0.7) {
          const px = Math.round(nx + (perpX / perpLen) * w);
          const py = Math.round(ny + (perpY / perpLen) * w);
          if (px >= 0 && px < cols && py >= 0 && py < rows) {
            if (Math.abs(w) > neckWidth * 0.6) {
              if (g[py][px] === " " || g[py][px] === "." || g[py][px] === "`" || g[py][px] === ",") {
                g[py][px] = "@";
              }
            }
          }
        }
      }
    }

    // Scatter a few floating spores/particles in background during separation
    if (separated) {
      const sepAge = (cycle - 0.88) / 0.12;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + t * 0.4;
        const dist = 3 + sepAge * 2;
        const px = Math.round(budCX + Math.cos(angle) * dist);
        const py = Math.round(budCY + Math.sin(angle) * dist * 0.6);
        if (px >= 0 && px < cols && py >= 0 && py < rows && g[py][px] === " ") {
          g[py][px] = "*";
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
