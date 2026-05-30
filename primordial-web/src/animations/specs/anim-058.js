export default {
  id: 58,
  system: "Euglena swimming to light",
  title: "Chasing the Light",
  caption: "A lone euglena spirals toward the glow, eyespot locked on.",
  cols: 52,
  rows: 18,
  palette: "photosynth",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- light source (right side, gentle radial glow) ---
    const lx = cols - 4;
    const ly = rows / 2 + Math.sin(t * 0.4) * 1.5;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = x - lx, dy = y - ly;
        const d = Math.sqrt(dx * dx + dy * dy * 2.2);
        if (d < 1.2) {
          g[y][x] = "*";
        } else if (d < 2.5) {
          g[y][x] = "+";
        } else if (d < 4.0) {
          g[y][x] = ":";
        } else if (d < 6.0) {
          g[y][x] = ".";
        }
      }
    }

    // --- euglena body: elongated teardrop, drifts toward light ---
    // Body center drifts rightward and oscillates up/down (phototaxis)
    const bodyProgress = ((t * 0.12) % 1.0); // slow drift across screen
    const bx = 6 + bodyProgress * (cols - 22);
    const by = rows / 2 + Math.sin(t * 0.55) * 3.5;

    // Euglenoid motion: body twists/elongates — stretch factor oscillates
    const twist = Math.sin(t * 1.8) * 0.18;
    const rx = 7.5 + Math.sin(t * 1.8) * 1.2;  // elongate/contract
    const ry = 2.8 - Math.sin(t * 1.8) * 0.4;

    // Draw body outline and interior
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - bx) / rx;
        const dy = (y - by) / ry;
        // Teardrop: shift the circle to make it pointed at the front
        const tdx = dx - twist * dy;
        // Asymmetric teardrop: pointed at +x (front/flagellum end)
        const r = Math.sqrt(tdx * tdx + dy * dy) + tdx * 0.28;
        const edge = Math.abs(r - 1.0);

        if (edge < 0.09) {
          g[y][x] = "@";
        } else if (edge < 0.22 && g[y][x] === " ") {
          g[y][x] = "O";
        } else if (r < 0.88 && g[y][x] === " ") {
          // Interior chloroplast pattern (striped, animate slowly)
          const stripe = Math.floor((x * 0.6 + y * 1.1 + t * 0.8) * 1.3) % 4;
          if (stripe === 0) g[y][x] = "%";
          else if (stripe === 1) g[y][x] = "&";
          else g[y][x] = "#";
        }
      }
    }

    // --- eyespot: small red-dot-like marker near front of body ---
    const ex = Math.round(bx + rx * 0.55);
    const ey = Math.round(by - ry * 0.3);
    if (ey >= 0 && ey < rows && ex >= 0 && ex < cols) {
      g[ey][ex] = "0";
    }
    const ex2 = Math.round(bx + rx * 0.5);
    if (ey >= 0 && ey < rows && ex2 >= 0 && ex2 < cols && ex2 !== ex) {
      g[ey][ex2] = "o";
    }

    // --- nucleus: central organelle dot ---
    const nx = Math.round(bx - rx * 0.15);
    const ny = Math.round(by + Math.sin(t * 1.8) * 0.4);
    if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
      g[ny][nx] = "O";
    }

    // --- flagellum: whipping sinusoidal curve from front tip ---
    const flagBase = 12; // number of flagellum segments
    const frontX = bx + rx * 0.72;
    const frontY = by;
    for (let i = 0; i <= flagBase; i++) {
      const frac = i / flagBase;
      // Flagellum extends forward then curves; whipping motion
      const phase = t * 3.2 - frac * 3.5;
      const fx = Math.round(frontX + frac * 7.5);
      const fy = Math.round(frontY + Math.sin(phase) * (1.8 * frac + 0.3));
      if (fy >= 0 && fy < rows && fx >= 0 && fx < cols) {
        const ch = frac < 0.15 ? "|" : frac < 0.5 ? "~" : frac < 0.85 ? "-" : ".";
        if (g[fy][fx] === " " || g[fy][fx] === ".") g[fy][fx] = ch;
      }
    }

    // --- wake turbulence: trailing dots behind body ---
    const wakeCount = 7;
    for (let i = 1; i <= wakeCount; i++) {
      const wfrac = i / wakeCount;
      const wx = Math.round(bx - rx * 0.85 - wfrac * 5.5);
      const wy = Math.round(by + Math.sin(t * 0.55 - wfrac * 1.2) * 3.5
                             + Math.cos(t * 2.1 + wfrac * 2.0) * (wfrac * 1.4));
      const wchar = wfrac < 0.4 ? ":" : wfrac < 0.75 ? "'" : ".";
      if (wy >= 0 && wy < rows && wx >= 0 && wx < cols && g[wy][wx] === " ") {
        g[wy][wx] = wchar;
      }
    }

    // Pad every row to exactly cols wide
    return g.map(row => row.join("").padEnd(cols, " ").slice(0, cols)).join("\n");
  }
};
