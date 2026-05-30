export default {
  id: 68,
  system: "Nuclear pore transport",
  title: "Nuclear Pore Transit",
  caption: "Cargo threads the FG-meshwork, gated by the nuclear pore.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Nuclear envelope — horizontal band across the grid
    const envTop = 6, envBot = 11;
    for (let x = 0; x < cols; x++) {
      g[envTop][x] = "=";
      g[envBot][x] = "=";
    }

    // Pore complex — centered, symmetrical spokes
    const cx = Math.floor(cols / 2);
    const poreHalf = 7; // half-width of pore opening

    // Erase envelope in the pore channel, draw scaffold rings instead
    for (let x = cx - poreHalf; x <= cx + poreHalf; x++) {
      if (x >= 0 && x < cols) {
        g[envTop][x] = " ";
        g[envBot][x] = " ";
      }
    }

    // Cytoplasmic ring (top scaffold)
    g[envTop - 1][cx - poreHalf]     = "(";
    g[envTop - 1][cx + poreHalf]     = ")";
    g[envTop][cx - poreHalf]         = "|";
    g[envTop][cx + poreHalf]         = "|";
    g[envTop - 1][cx - poreHalf + 2] = "-";
    g[envTop - 1][cx - poreHalf + 4] = "-";
    g[envTop - 1][cx + poreHalf - 2] = "-";
    g[envTop - 1][cx + poreHalf - 4] = "-";

    // Nuclear ring (bottom scaffold)
    g[envBot + 1][cx - poreHalf]     = "(";
    g[envBot + 1][cx + poreHalf]     = ")";
    g[envBot][cx - poreHalf]         = "|";
    g[envBot][cx + poreHalf]         = "|";
    g[envBot + 1][cx - poreHalf + 2] = "-";
    g[envBot + 1][cx - poreHalf + 4] = "-";
    g[envBot + 1][cx + poreHalf - 2] = "-";
    g[envBot + 1][cx + poreHalf - 4] = "-";

    // Vertical channel walls
    for (let y = envTop; y <= envBot; y++) {
      const wx = cx - poreHalf;
      const ex = cx + poreHalf;
      if (wx >= 0 && wx < cols) g[y][wx] = "|";
      if (ex >= 0 && ex < cols) g[y][ex] = "|";
    }

    // FG-nucleoporin meshwork — dynamic filaments gating the channel
    // Filaments sway with time, creating a fuzzy selective barrier
    for (let y = envTop + 1; y <= envBot - 1; y++) {
      const phase = y * 1.3 + t * 1.7;
      const sway  = Math.round(Math.sin(phase) * 2);
      for (let fx = -2; fx <= 2; fx++) {
        const mx = cx + sway + fx;
        if (mx > cx - poreHalf + 1 && mx < cx + poreHalf - 1 && mx >= 0 && mx < cols) {
          const density = Math.abs(Math.sin(y * 0.9 + t * 1.1 + fx * 0.7));
          if (density > 0.55) g[y][mx] = (density > 0.8) ? ":" : ".";
        }
      }
    }

    // Cargo molecules — 3 moving through the pore at staggered phases
    const numCargo = 3;
    for (let ci = 0; ci < numCargo; ci++) {
      const offset = (ci / numCargo) * 6.28318;
      // Travel from cytoplasm (above) down through pore into nucleus (below)
      // y goes from envTop-4 to envBot+4 over one period
      const period  = 4.5;
      const raw     = ((t * 0.7 + offset / 6.28318 * period) % period) / period; // 0..1
      const yf      = (envTop - 4) + raw * (envBot + 4 - (envTop - 4));
      const y       = Math.floor(yf);

      // Horizontal wobble inside pore channel, straight otherwise
      let xOff = 0;
      if (y >= envTop && y <= envBot) {
        xOff = Math.round(Math.sin(t * 2.1 + ci * 2.1) * 1.5);
      } else {
        // slight drift on approach / departure
        const drift = (y < envTop) ? (envTop - y) : (y - envBot);
        xOff = Math.round(Math.sin(t * 1.3 + ci * 1.8) * (drift * 0.4));
      }

      const cargoX = cx + xOff;
      const cargoY = y;

      if (cargoY >= 0 && cargoY < rows && cargoX >= 0 && cargoX < cols) {
        // Cargo glyph: bright core while inside pore, dimmer outside
        const inPore = (cargoY >= envTop && cargoY <= envBot);
        g[cargoY][cargoX] = inPore ? "O" : "o";
        // Halo / leading edge
        const trailY = cargoY - 1;
        if (trailY >= 0 && trailY < rows && g[trailY][cargoX] === " ") {
          g[trailY][cargoX] = (raw < 0.5) ? "^" : ".";
        }
      }
    }

    // Nuclear basket — funnel filaments hanging below on nuclear side
    const basketDepth = 3;
    for (let d = 1; d <= basketDepth; d++) {
      const by = envBot + 1 + d;
      if (by >= rows) break;
      const spread = d;
      const lx = cx - poreHalf + spread;
      const rx = cx + poreHalf - spread;
      if (lx >= 0 && lx < cols) g[by][lx] = "\\";
      if (rx >= 0 && rx < cols) g[by][rx] = "/";
    }
    // Basket terminal ring
    const ringY = envBot + 1 + basketDepth;
    if (ringY < rows) {
      const lx = cx - poreHalf + basketDepth;
      const rx = cx + poreHalf - basketDepth;
      for (let bx = lx; bx <= rx; bx++) {
        if (bx >= 0 && bx < cols) g[ringY][bx] = "-";
      }
    }

    // Cytoplasmic fibrils — short filaments above the pore, waving
    for (let fi = 0; fi < 4; fi++) {
      const fx   = cx - 4 + fi * 3;
      const wave = Math.sin(t * 1.4 + fi * 1.1);
      for (let d = 1; d <= 3; d++) {
        const fy = envTop - 1 - d;
        if (fy < 0 || fy >= rows) break;
        const wx = Math.round(fx + wave * d * 0.5);
        if (wx >= 0 && wx < cols && g[fy][wx] === " ") g[fy][wx] = "|";
      }
    }

    // Label: nucleus below, cytoplasm above
    const labelCyto = "cytoplasm";
    const labelNuc  = " nucleus ";
    const lx0 = 1;
    for (let i = 0; i < labelCyto.length; i++) {
      if (lx0 + i < cols) g[1][lx0 + i] = labelCyto[i];
    }
    for (let i = 0; i < labelNuc.length; i++) {
      if (lx0 + i < cols) g[rows - 2][lx0 + i] = labelNuc[i];
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
