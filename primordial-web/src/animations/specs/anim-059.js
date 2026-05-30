export default {
  id: 59,
  system: "Diatom drifting",
  title: "Glass Drifter",
  caption: "A silica jewel turns in the current, etched with living light.",
  cols: 52,
  rows: 18,
  palette: "photosynth",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Diatom drifts slowly across and bobs vertically
    const driftX = Math.sin(t * 0.23) * 6;
    const driftY = Math.sin(t * 0.37) * 2.2;
    const cx = cols / 2 + driftX;
    const cy = rows / 2 + driftY;

    // Slow rotation of the diatom
    const rot = t * 0.18;

    // Radii for the pill/frustule shape
    const rx = 14.0;
    const ry = 5.5;

    // Girdle band oscillates slightly (breathing)
    const breathe = 1 + Math.sin(t * 1.1) * 0.04;

    // Draw diatom frustule (silica shell outline)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = x - cx;
        const dy = y - cy;

        // Rotate coordinates by rot
        const rx2 = dx * Math.cos(rot) + dy * Math.sin(rot);
        const ry2 = -dx * Math.sin(rot) + dy * Math.cos(rot);

        // Ellipse distance
        const ex = rx2 / (rx * breathe);
        const ey = ry2 / (ry * breathe);
        const dist = Math.sqrt(ex * ex + ey * ey);

        // Outer shell edge
        const edge = Math.abs(dist - 1.0);

        if (edge < 0.06) {
          g[y][x] = "@";
        } else if (edge < 0.14) {
          g[y][x] = "O";
        } else if (edge < 0.22) {
          g[y][x] = "o";
        } else if (dist < 0.88) {
          // Interior: radial ribs along the long axis
          // Ribs are evenly spaced lines perpendicular to long axis
          const ribPhase = (rx2 / (rx * breathe)) * 9.0;
          const ribVal = Math.abs(Math.sin(ribPhase * Math.PI));

          // Raphe line (central longitudinal slit)
          const rapheWidth = 0.08;
          const onRaphe = Math.abs(ry2) < ry * breathe * rapheWidth;

          // Punctae (pore) pattern — grid of dots
          const poreX = Math.floor((rx2 + rx * breathe) / 2.8);
          const poreY = Math.floor((ry2 + ry * breathe) / 1.2);
          const porePhase = t * 0.55;
          const isPore = (poreX + poreY) % 2 === 0 &&
            Math.sin(poreX * 2.3 + porePhase) * Math.sin(poreY * 3.1) > 0.35;

          // Striae (fine lines radiating from center)
          const angle = Math.atan2(ry2 / (ry * breathe), rx2 / (rx * breathe));
          const striaeN = 28;
          const striaePhase = angle * striaeN / Math.PI;
          const onStriae = Math.abs(striaePhase - Math.round(striaePhase)) < 0.12;

          if (onRaphe) {
            g[y][x] = "|";
          } else if (ribVal > 0.82 && dist > 0.15) {
            g[y][x] = "-";
          } else if (isPore) {
            g[y][x] = ".";
          } else if (onStriae && dist > 0.2) {
            g[y][x] = ":";
          } else if (dist < 0.25) {
            // Central nodule
            const nodule = Math.sin(t * 1.3) * 0.5 + 0.5;
            g[y][x] = nodule > 0.6 ? "*" : "+";
          }
        }
      }
    }

    // Girdle band (equatorial line, perpendicular view)
    for (let x = 0; x < cols; x++) {
      const dx = x - cx;
      const dy = 0; // horizontal pass
      const rx2 = dx * Math.cos(rot);
      const ey2 = Math.abs(rx2) / (rx * breathe);
      if (ey2 < 0.95) {
        const bandY = Math.round(cy);
        if (bandY >= 0 && bandY < rows) {
          const cur = g[bandY][x];
          if (cur === "-" || cur === ":" || cur === ".") {
            // keep interior marks
          } else if (cur === " ") {
            // don't overwrite shell
          }
        }
      }
    }

    // Floating silica debris / water particles around the diatom
    const particles = [
      [0.31, 0.17, 0.7],
      [0.72, 0.44, 1.1],
      [0.19, 0.82, 0.5],
      [0.85, 0.26, 0.9],
      [0.54, 0.91, 1.3],
      [0.08, 0.63, 0.6],
      [0.93, 0.71, 1.0],
      [0.41, 0.38, 0.8],
      [0.65, 0.09, 1.2],
      [0.27, 0.55, 0.4],
      [0.78, 0.88, 0.95],
      [0.12, 0.34, 1.15],
    ];

    for (const [fx, fy, spd] of particles) {
      // Each particle orbits lazily in its own elliptical path
      const px = Math.sin(t * spd * 0.4 + fx * 6.28) * (cols * 0.42) + cols / 2;
      const py = Math.cos(t * spd * 0.3 + fy * 6.28) * (rows * 0.38) + rows / 2;
      const px2 = Math.round(px);
      const py2 = Math.round(py);
      if (px2 >= 0 && px2 < cols && py2 >= 0 && py2 < rows) {
        if (g[py2][px2] === " ") {
          // Twinkle
          const phase = Math.sin(t * 1.7 + fx * 9.1) * 0.5 + 0.5;
          g[py2][px2] = phase > 0.6 ? "'" : "`";
        }
      }
    }

    // Ensure each line is exactly cols wide
    return g.map((row) => {
      const line = row.join("");
      if (line.length < cols) return line + " ".repeat(cols - line.length);
      return line.slice(0, cols);
    }).join("\n");
  }
};
