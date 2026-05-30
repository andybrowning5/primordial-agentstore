export default {
  id: 95,
  system: "Wound healing",
  title: "Wound Closure",
  caption: "Cells surge inward, knitting torn flesh back into wholeness.",
  cols: 50,
  rows: 18,
  palette: "blood",
  frame(t) {
    const cols = 50, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Wound gap: starts wide, closes over a ~12s cycle
    const cycle = (t % 12) / 12; // 0..1
    const closeFrac = Math.pow(cycle, 0.7); // accelerates mid-cycle
    const maxGap = cols * 0.28;
    const gap = maxGap * (1 - closeFrac); // half-gap width each side of center
    const cx = cols / 2;

    // Tissue rows — which rows have active tissue (not all rows have equal wound depth)
    // Wound is deepest in the middle rows, shallower at top/bottom
    for (let y = 0; y < rows; y++) {
      const cy = rows / 2;
      const dy = (y - cy) / (rows * 0.5);
      // Wound edge shape: elliptical, wider in the middle
      const edgeFactor = Math.sqrt(Math.max(0, 1 - dy * dy * 2.2));
      const halfGap = gap * edgeFactor;
      const leftEdge = Math.round(cx - halfGap);
      const rightEdge = Math.round(cx + halfGap);

      // ---- Left tissue block ----
      for (let x = 0; x < leftEdge; x++) {
        const distFromEdge = leftEdge - x;
        // Surface layer (rightmost cells of tissue)
        if (distFromEdge <= 1) {
          g[y][x] = "@";
        } else if (distFromEdge <= 3) {
          // Active migration front — cells pulsing
          const pulse = Math.sin(t * 2.5 - x * 0.4 + y * 0.3) * 0.5 + 0.5;
          g[y][x] = pulse > 0.55 ? "O" : "o";
        } else if (distFromEdge <= 6) {
          // Granulation zone
          const pat = (x * 5 + y * 7 + Math.floor(t * 3)) % 9;
          g[y][x] = pat < 2 ? "*" : pat < 4 ? "." : " ";
        } else {
          // Interior tissue
          const pat = (x * 3 + y * 11 + Math.floor(t * 1.5)) % 17;
          if (pat === 0) g[y][x] = ":";
          else if (pat === 1) g[y][x] = ".";
        }
      }

      // ---- Right tissue block ----
      for (let x = rightEdge + 1; x < cols; x++) {
        const distFromEdge = x - rightEdge;
        if (distFromEdge <= 1) {
          g[y][x] = "@";
        } else if (distFromEdge <= 3) {
          const pulse = Math.sin(t * 2.5 + x * 0.4 - y * 0.3) * 0.5 + 0.5;
          g[y][x] = pulse > 0.55 ? "O" : "o";
        } else if (distFromEdge <= 6) {
          const pat = (x * 5 + y * 7 + Math.floor(t * 3)) % 9;
          g[y][x] = pat < 2 ? "*" : pat < 4 ? "." : " ";
        } else {
          const pat = (x * 3 + y * 11 + Math.floor(t * 1.5)) % 17;
          if (pat === 0) g[y][x] = ":";
          else if (pat === 1) g[y][x] = ".";
        }
      }

      // ---- Wound interior (gap zone) ----
      if (halfGap > 0.5) {
        for (let x = leftEdge; x <= rightEdge && x < cols; x++) {
          if (x < 0) continue;
          const relX = (x - cx) / Math.max(halfGap, 1);
          const relY = dy;

          // Migrating cells traveling inward from both edges
          // Left-side cells move right, right-side cells move left
          const cellStreamL = (Math.floor(x + t * 4 + y * 2.1) % 7 === 0) &&
                              relX < 0 && Math.abs(relX) < 0.85;
          const cellStreamR = (Math.floor(-x + t * 4 + y * 2.1) % 7 === 0) &&
                              relX > 0 && Math.abs(relX) < 0.85;

          // Fibrin threads crossing the gap (horizontal dashes)
          const fibrin = (Math.floor(y * 3 + t * 1.2) % 5 === 0) &&
                         Math.abs(relX) < 0.6 &&
                         (Math.floor(x * 1.5 + t * 2) % 4 < 2);

          // New granulation forming near center (late stage, high closeFrac)
          const newTissue = closeFrac > 0.6 &&
                            Math.abs(relX) < (closeFrac - 0.6) * 2.5 &&
                            (x * 7 + y * 13 + Math.floor(t * 4)) % 11 < 3;

          if (cellStreamL || cellStreamR) {
            g[y][x] = closeFrac > 0.5 ? "O" : "o";
          } else if (newTissue) {
            const nt = (x * 4 + y * 9 + Math.floor(t * 5)) % 6;
            g[y][x] = nt < 2 ? "*" : nt < 3 ? "+" : ".";
          } else if (fibrin) {
            g[y][x] = "-";
          } else if (Math.abs(relX) > 0.88) {
            // Very edge of gap — serum droplets
            const drip = Math.sin(t * 1.8 + y * 0.9 + x * 0.6) * 0.5 + 0.5;
            g[y][x] = drip > 0.7 ? "," : " ";
          }
        }
      } else {
        // Gap closed: scar line forming
        for (let x = Math.max(0, leftEdge); x <= Math.min(cols - 1, rightEdge); x++) {
          const scarPulse = Math.sin(t * 1.5 + x * 0.5 + y * 0.2) * 0.5 + 0.5;
          g[y][x] = scarPulse > 0.6 ? "+" : scarPulse > 0.3 ? "=" : "-";
        }
      }
    }

    // Blood platelet clot dots drifting near top/bottom wound margins (early phase)
    if (closeFrac < 0.45) {
      const clotIntensity = 1 - closeFrac / 0.45;
      for (let i = 0; i < 14; i++) {
        const px = Math.floor(cx + Math.sin(i * 1.7 + t * 0.6) * gap * 0.7);
        const py = Math.floor(rows / 2 + Math.cos(i * 2.3 + t * 0.5) * rows * 0.35);
        if (py >= 0 && py < rows && px >= 0 && px < cols && g[py][px] === " ") {
          const dot = (i + Math.floor(t * 2)) % 3;
          g[py][px] = dot === 0 ? "%" : dot === 1 ? "o" : ".";
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
