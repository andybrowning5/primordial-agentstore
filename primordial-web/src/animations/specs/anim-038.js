export default {
  id: 38,
  system: "Oxygen binding hemoglobin",
  title: "O2 Loads the Heme",
  caption: "Four heme pockets open like petals as oxygen locks in.",
  cols: 52,
  rows: 18,
  palette: "blood",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cy = rows / 2;
    const cx = cols / 2;

    // Cooperative binding: saturation cycles slowly (T->R->T state)
    // s oscillates 0..1 representing O2 saturation
    const s = Math.sin(t * 0.5 - Math.PI / 2) * 0.5 + 0.5;

    // R-state expansion: subunits spread slightly when oxygenated
    const expand = 0.8 + s * 0.22;

    // Four heme subunit centers (alpha1, alpha2, beta1, beta2)
    // In T-state they're pulled tight; in R-state they open outward
    const subunits = [
      { bx: -8.5, by: -5.5, phase: 0.0 },
      { bx:  8.5, by: -5.5, phase: Math.PI * 0.5 },
      { bx: -8.5, by:  5.5, phase: Math.PI },
      { bx:  8.5, by:  5.5, phase: Math.PI * 1.5 },
    ];

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    // Draw a subunit (globin protein pocket) as an elliptical shell
    function drawSubunit(scx, scy, bound) {
      const rx = 7.2 * expand;
      const ry = 4.2 * expand;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - scx) / rx;
          const dy = (y - scy) / ry;
          const r = Math.sqrt(dx * dx + dy * dy);
          const edgeDist = Math.abs(r - 1.0);

          if (edgeDist < 0.07) {
            // Outer shell: brighter when bound
            g[y][x] = bound > 0.7 ? "@" : (bound > 0.3 ? "O" : "o");
          } else if (edgeDist < 0.18 && g[y][x] === " ") {
            g[y][x] = bound > 0.5 ? "0" : ".";
          } else if (r < 0.75 && g[y][x] === " ") {
            // Interior fill — pulsing texture
            const tx = Math.floor(x * 3 + t * 1.5) % 7;
            const ty = Math.floor(y * 2 + t * 1.2) % 5;
            if (tx === 0 && ty === 0) g[y][x] = bound > 0.5 ? "*" : ",";
          }
        }
      }
    }

    // Draw the heme iron center (Fe atom)
    function drawHeme(scx, scy, bound) {
      const fx = Math.round(scx);
      const fy = Math.round(scy);
      // Heme ring — small cross/diamond
      const hemeChars = bound > 0.6 ? ["#", "+", "-", "|"] : ["o", ":", "-", ":"];
      const places = [
        [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
        [-2, 0], [2, 0], [0, -2], [0, 2],
        [-1, -1], [1, -1], [-1, 1], [1, 1],
      ];
      const ring = [
        [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
        [-2, 0], [2, 0],
      ];
      for (const [dx, dy] of ring) {
        const px = clamp(fx + dx, 0, cols - 1);
        const py = clamp(fy + dy, 0, rows - 1);
        if (dx === 0 && dy === 0) {
          g[py][px] = bound > 0.65 ? "#" : "O";
        } else if (Math.abs(dx) + Math.abs(dy) === 1) {
          g[py][px] = bound > 0.5 ? "+" : "-";
        } else {
          g[py][px] = bound > 0.5 ? "=" : "~";
        }
      }
    }

    // Draw an O2 molecule traveling toward its heme site
    function drawO2(ox, oy, visible) {
      if (visible < 0.15) return;
      const px = clamp(Math.round(ox), 0, cols - 1);
      const py = clamp(Math.round(oy), 0, rows - 1);
      if (g[py][px] === " " || g[py][px] === "." || g[py][px] === ",") {
        g[py][px] = visible > 0.7 ? "O" : "o";
      }
      // Draw the bond between the two O atoms
      const px2 = clamp(px + 1, 0, cols - 1);
      if (g[py][px2] === " " || g[py][px2] === "." || g[py][px2] === ",") {
        g[py][px2] = visible > 0.7 ? "O" : "o";
      }
      // Draw connecting dash
      const pxm = clamp(px, 0, cols - 1);
      if (g[py][pxm] !== "#" && g[py][pxm] !== "+") {
        // already drawn above
      }
    }

    // Render all four subunits
    for (let i = 0; i < 4; i++) {
      const su = subunits[i];
      const scx = cx + su.bx * expand;
      const scy = cy + su.by * expand;

      // Each subunit binds cooperatively — staggered by phase
      // bound: 0=empty, 1=fully bound
      const bindCycle = Math.sin(t * 0.5 - Math.PI / 2 + su.phase * 0.15) * 0.5 + 0.5;
      const bound = bindCycle;

      drawSubunit(scx, scy, bound);
      drawHeme(scx, scy, bound);

      // O2 molecule traveling in from outside, parking at heme
      // When unbound -> O2 drifts inward; when bound -> O2 sits at center
      const travelProgress = bound;
      // Start position: outside the subunit in a cardinal direction
      const angle = Math.atan2(su.by, su.bx);
      const startDist = 14;
      const ox = scx + Math.cos(angle) * startDist * (1 - travelProgress);
      const oy = scy + Math.sin(angle) * startDist * (1 - travelProgress) * 0.6;
      const oVisible = Math.min(1, travelProgress * 3);
      drawO2(ox, oy, oVisible);
    }

    // Central cavity label — shows allosteric state
    const statePulse = Math.floor(t * 1.5) % 2;
    const stateLabel = s > 0.5 ? " R " : " T ";
    const labelX = Math.round(cx - 1);
    const labelY = Math.round(cy);
    if (labelX >= 0 && labelX + 2 < cols && labelY >= 0 && labelY < rows) {
      const chars = stateLabel.split("");
      for (let i = 0; i < chars.length; i++) {
        const px = clamp(labelX + i, 0, cols - 1);
        if (g[labelY][px] === " " || g[labelY][px] === ",") {
          g[labelY][px] = chars[i];
        }
      }
    }

    // Pad each row to exactly cols characters
    return g.map(row => row.join("").padEnd(cols, " ").slice(0, cols)).join("\n");
  }
};
