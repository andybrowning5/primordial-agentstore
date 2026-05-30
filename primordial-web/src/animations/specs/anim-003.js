export default {
  id: 3,
  system: "Cytokinesis",
  title: "The Cleaving Furrow",
  caption: "A drawstring tightens at the equator; two daughters emerge.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Phase: 0..1 furrow progress (oscillates so animation loops)
    const phase = (Math.sin(t * 0.55 - Math.PI / 2) * 0.5 + 0.5); // 0=round, 1=pinched-off
    const split = Math.max(0, (phase - 0.72) / 0.28);             // 0..1 only in final stage
    const pinch = phase;

    const cy = (rows - 1) / 2;
    const cx = (cols - 1) / 2;

    // Cell outline: elongated ellipse that stretches along Y as furrow deepens
    // and narrows at equator (x ~ cx, y ~ cy)
    const baseRx = cols * 0.36;
    const baseRy = rows * 0.38;
    // elongation: cell stretches vertically as it pinches
    const elong = 1 + pinch * 0.28;
    const rx = baseRx * (1 - pinch * 0.08);
    const ry = baseRy * elong;

    // Furrow depth: how much the equatorial radius shrinks
    const furrowDepth = pinch * 0.82;

    // Helper: signed distance to cell boundary at angle theta from center
    // We model the cell as a super-ellipse deformed by the furrow
    function cellRadius(nx, ny) {
      // nx,ny are normalized coords centered on cx,cy
      const angY = Math.abs(ny); // 0 at poles, max at equator
      const equatorWeight = Math.exp(-angY * angY * 8); // gaussian peak at equator
      const furrowFactor = 1 - furrowDepth * equatorWeight;
      return furrowFactor;
    }

    // Draw the cell contents and membrane
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;

        // Furrow deformation
        const equatorProximity = Math.exp(-dy * dy * 8);
        const rLocal = Math.sqrt(
          dx * dx / ((1 - furrowDepth * equatorProximity) ** 2) + dy * dy
        );

        const onMembrane = Math.abs(rLocal - 1) < 0.09;
        const nearMembrane = Math.abs(rLocal - 1) < 0.22;
        const interior = rLocal < 0.92;

        if (rLocal > 1.3) continue;

        // After split: two separate blobs drift apart
        if (split > 0.05) {
          const drift = split * rows * 0.3;
          const inTop = (y - cy + drift) / (ry * 0.88);
          const inBot = (y - cy - drift) / (ry * 0.88);
          const rTop = Math.sqrt(dx * dx + inTop * inTop);
          const rBot = Math.sqrt(dx * dx + inBot * inBot);
          const onMemTop = Math.abs(rTop - 1) < 0.1;
          const onMemBot = Math.abs(rBot - 1) < 0.1;
          const inTop2 = rTop < 0.92;
          const inBot2 = rBot < 0.92;

          if (onMemTop || onMemBot) {
            g[y][x] = "@";
          } else if (inTop2 || inBot2) {
            const px = Math.floor(x * 3 + y * 7 + t * 4);
            g[y][x] = px % 13 === 0 ? "o" : px % 7 === 0 ? "*" : ".";
          } else if (Math.abs(rTop - 1) < 0.22 || Math.abs(rBot - 1) < 0.22) {
            g[y][x] = "o";
          }
          continue;
        }

        // Membrane
        if (onMembrane) {
          g[y][x] = "@";
          continue;
        }

        // Furrow crease accent — highlight the pinch zone
        if (nearMembrane && equatorProximity > 0.55 && pinch > 0.15) {
          g[y][x] = "O";
          continue;
        }

        if (interior) {
          // Chromatin settling to poles (two dense regions)
          const poleY1 = -0.48 * elong; // top pole (normalized)
          const poleY2 =  0.48 * elong; // bottom pole
          const chromDist1 = Math.sqrt(dx * dx * 2 + (dy - poleY1) * (dy - poleY1) * 2.5);
          const chromDist2 = Math.sqrt(dx * dx * 2 + (dy - poleY2) * (dy - poleY2) * 2.5);
          const inChrom = chromDist1 < 0.28 + 0.06 * Math.sin(t * 1.8) ||
                          chromDist2 < 0.28 + 0.06 * Math.sin(t * 1.8 + 1);

          if (inChrom) {
            const tick = Math.floor(t * 6 + x * 2 + y * 3) % 9;
            g[y][x] = tick < 2 ? "#" : tick < 5 ? "%" : "*";
          } else {
            // Cytoplasm: sparse shimmer
            const px = Math.floor(x * 5 + y * 11 + t * 3);
            if (px % 17 === 0) g[y][x] = ".";
            else if (px % 23 === 0) g[y][x] = ":";
          }
        }
      }
    }

    // Midbody: the narrow bridge at the equator before final severance
    if (split < 0.01 && pinch > 0.45) {
      const bridgeWidth = Math.max(0, (1 - pinch) * 1.8); // shrinks to 0
      const midY = Math.round(cy);
      for (let bx = Math.round(cx - bridgeWidth); bx <= Math.round(cx + bridgeWidth); bx++) {
        if (bx >= 0 && bx < cols && midY >= 0 && midY < rows) {
          const tick = Math.floor(t * 8 + bx) % 5;
          g[midY][bx] = tick === 0 ? "+" : tick === 2 ? "-" : "=";
        }
      }
      // Contractile ring accent dots flanking the bridge
      const ringBx1 = Math.max(0, Math.round(cx - bridgeWidth - 1));
      const ringBx2 = Math.min(cols - 1, Math.round(cx + bridgeWidth + 1));
      if (midY >= 0 && midY < rows) {
        g[midY][ringBx1] = "|";
        g[midY][ringBx2] = "|";
      }
    }

    // Contractile ring indicator: a visible arc at equator during pinching
    if (split < 0.01 && pinch > 0.08) {
      const ringR = rx * (1 - furrowDepth * 0.9) + 1;
      const ringY = cy;
      for (let angle = -Math.PI * 0.45; angle <= Math.PI * 0.45; angle += 0.18) {
        const rx2 = Math.round(cx + Math.cos(angle) * ringR * 0.88);
        const ry2 = Math.round(ringY);
        if (rx2 >= 0 && rx2 < cols && ry2 >= 0 && ry2 < rows) {
          const pulse = Math.floor(t * 5 + Math.abs(angle) * 3) % 4;
          g[ry2][rx2] = pulse === 0 ? ">" : pulse === 1 ? "*" : pulse === 2 ? "<" : "-";
        }
      }
      // Mirror the other side
      for (let angle = Math.PI * 0.55; angle <= Math.PI * 1.45; angle += 0.18) {
        const rx2 = Math.round(cx + Math.cos(angle) * ringR * 0.88);
        const ry2 = Math.round(ringY);
        if (rx2 >= 0 && rx2 < cols && ry2 >= 0 && ry2 < rows) {
          const pulse = Math.floor(t * 5 + Math.abs(angle) * 3) % 4;
          g[ry2][rx2] = pulse === 0 ? "<" : pulse === 1 ? "*" : pulse === 2 ? ">" : "-";
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
