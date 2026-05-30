export default {
  id: 5,
  system: "Endocytosis",
  title: "Membrane Engulfing",
  caption: "The cell membrane folds inward, swallowing a cargo vesicle whole.",
  cols: 52,
  rows: 20,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Phase cycles every 6 seconds: 0=open, 1=cupping, 2=pinching, 3=vesicle drifting
    const period = 6.0;
    const phase = (t % period) / period; // 0..1

    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);

    // --- Draw outer cell membrane (flat arc across the top) ---
    // The cell body fills the lower portion; membrane is a horizontal band
    const memY = Math.floor(rows * 0.28); // row where membrane lives

    // Draw the cell body interior — sparse stipple
    for (let y = memY + 1; y < rows - 1; y++) {
      for (let x = 2; x < cols - 2; x++) {
        const pat = (x * 3 + y * 7 + Math.floor(t * 2)) % 17;
        if (pat === 0) g[y][x] = ".";
        else if (pat === 5) g[y][x] = "`";
      }
    }

    // Draw flat membrane line with slight pulse wave
    for (let x = 1; x < cols - 1; x++) {
      const wave = Math.sin(x * 0.25 + t * 1.2) * 0.6;
      const my = Math.round(memY + wave);
      const my2 = Math.round(memY + wave + 1);
      if (my >= 0 && my < rows) g[my][x] = "=";
      if (my2 >= 0 && my2 < rows) {
        if (g[my2][x] === " " || g[my2][x] === ".") g[my2][x] = "-";
      }
    }

    // --- Cargo particle above membrane ---
    // Cargo drifts slowly down toward membrane during phase 0..0.25
    // then gets engulfed
    const cargoX = cx;
    let cargoY;
    let showCargo = true;

    if (phase < 0.25) {
      // Cargo descending toward membrane
      const t0 = phase / 0.25;
      cargoY = Math.round(2 + t0 * (memY - 4));
    } else if (phase < 0.55) {
      // Cargo at membrane, membrane cupping around it
      cargoY = memY - 1;
    } else if (phase < 0.72) {
      // Vesicle pinching off, drifting inward
      const t1 = (phase - 0.55) / 0.17;
      cargoY = Math.round((memY + 1) + t1 * 3);
    } else if (phase < 0.92) {
      // Vesicle traveling deeper into cell
      const t2 = (phase - 0.72) / 0.20;
      cargoY = Math.round(memY + 4 + t2 * (rows - memY - 7));
      // pulse vesicle slightly
    } else {
      // Fade out near end of cycle
      showCargo = false;
      cargoY = rows - 2;
    }

    // --- Draw membrane pit / invagination ---
    if (phase >= 0.25 && phase < 0.65) {
      // How deep the pit goes
      const pitProgress = phase < 0.55
        ? (phase - 0.25) / 0.30   // 0..1 cupping
        : 1.0 - (phase - 0.55) / 0.10; // quickly closes

      const pitDepth = Math.round(pitProgress * 5);
      const pitWidth = Math.round(6 - pitProgress * 2); // narrows as it pinches

      // Erase membrane in pit zone and redraw curved walls
      for (let d = 0; d <= pitDepth; d++) {
        const py = memY + d;
        if (py >= rows) continue;
        const halfW = Math.max(1, Math.round(pitWidth * (1 - d / (pitDepth + 1))));
        const leftX = cx - halfW;
        const rightX = cx + halfW;

        // Clear the membrane line in pit area (redraw side walls)
        for (let x = leftX; x <= rightX; x++) {
          if (x >= 0 && x < cols) g[py][x] = " ";
        }

        // Wall chars
        if (d === 0) {
          // Top edge of pit — curve brackets
          if (leftX - 1 >= 0) g[py][leftX - 1] = "(";
          if (rightX + 1 < cols) g[py][rightX + 1] = ")";
        } else if (d < pitDepth) {
          if (leftX >= 0) g[py][leftX] = "|";
          if (rightX < cols) g[py][rightX] = "|";
        } else {
          // Bottom of pit — closing arc
          for (let x = leftX; x <= rightX; x++) {
            if (x >= 0 && x < cols) g[py][x] = "~";
          }
          if (leftX > 0) g[py][leftX - 1] = ")";
          if (rightX + 1 < cols) g[py][rightX + 1] = "(";
        }
      }
    }

    // --- Pinch neck closes during vesicle release ---
    if (phase >= 0.55 && phase < 0.68) {
      const neckProgress = (phase - 0.55) / 0.13; // 0..1
      const neckY = memY + 1;
      const neckHalf = Math.max(0, Math.round(3 * (1 - neckProgress)));
      if (neckY < rows) {
        for (let x = cx - neckHalf; x <= cx + neckHalf; x++) {
          if (x >= 0 && x < cols) g[neckY][x] = ":";
        }
        if (neckProgress > 0.7) {
          // Membrane resealing
          g[neckY][cx] = "X";
        }
      }
    }

    // --- Draw cargo particle ---
    if (showCargo && cargoY >= 0 && cargoY < rows) {
      const pulse = Math.sin(t * 3.0) * 0.5 + 0.5;
      const outerChar = pulse > 0.6 ? "O" : "o";
      const innerChar = "*";

      // Draw cargo as small cluster
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const py = cargoY + dy;
          const px = cargoX + dx;
          if (py < 0 || py >= rows || px < 0 || px >= cols) continue;
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist === 0) {
            g[py][px] = innerChar;
          } else if (dist <= 2) {
            g[py][px] = outerChar;
          } else if (dist === 3) {
            if (g[py][px] === " " || g[py][px] === "." || g[py][px] === "`") {
              g[py][px] = ".";
            }
          }
        }
      }

      // If vesicle is inside cell (phase > 0.6), draw vesicle membrane ring
      if (phase >= 0.60 && phase < 0.92) {
        const vr = 2.0 + Math.sin(t * 2.0) * 0.3;
        for (let angle = 0; angle < Math.PI * 2; angle += 0.22) {
          const vx = Math.round(cargoX + Math.cos(angle) * vr * 1.5);
          const vy = Math.round(cargoY + Math.sin(angle) * vr * 0.6);
          if (vy >= 0 && vy < rows && vx >= 0 && vx < cols) {
            if (g[vy][vx] === " " || g[vy][vx] === "." || g[vy][vx] === "`") {
              g[vy][vx] = "o";
            }
          }
        }
      }
    }

    // --- Extra cargo particles above membrane in extracellular space ---
    for (let i = 0; i < 3; i++) {
      const offX = Math.round(Math.sin(t * 0.5 + i * 2.1) * (cols * 0.3) + cx);
      const offY = Math.round(Math.cos(t * 0.4 + i * 1.7) * (memY * 0.35) + memY * 0.4);
      if (offY >= 0 && offY < memY && offX >= 1 && offX < cols - 1) {
        g[offY][offX] = "o";
        if (offY > 0) {
          const left = offX - 1, right = offX + 1;
          if (left >= 0) g[offY][left] = ".";
          if (right < cols) g[offY][right] = ".";
        }
      }
    }

    // --- Nucleus hint deep in cell ---
    const nucX = cx, nucY = Math.floor(rows * 0.78);
    const nucRx = 6, nucRy = 2;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.18) {
      const nx = Math.round(nucX + Math.cos(angle) * nucRx);
      const ny = Math.round(nucY + Math.sin(angle) * nucRy);
      if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
        g[ny][nx] = "#";
      }
    }
    // Fill nucleus interior hint
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const ny = nucY + dy, nx = nucX + dx;
        if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
          if (g[ny][nx] === " ") g[ny][nx] = ":";
        }
      }
    }

    // Pad each row to exactly cols characters
    return g.map(row => row.join("").padEnd(cols, " ").slice(0, cols)).join("\n");
  }
};
