export default {
  id: 90,
  system: "Alveolus gas exchange",
  title: "Breath at the Border",
  caption: "O2 seeps in, CO2 drifts out — life traded across a single cell.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- layout constants ---
    const cy = rows / 2;          // vertical center
    const alvCx = cols * 0.36;    // alveolus center x
    const alvRx = cols * 0.22;    // alveolus horizontal radius
    const alvRy = rows * 0.38;    // alveolus vertical radius

    // breathing pulse: alveolus gently inflates/deflates
    const breathPhase = Math.sin(t * 1.1);
    const breathScale = 1 + breathPhase * 0.07;

    // capillary band: right side of the grid
    const capLeft  = Math.floor(cols * 0.65);
    const capRight = cols - 1;

    // ---- draw alveolus wall (ellipse outline) ----
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < Math.floor(cols * 0.72); x++) {
        const dx = (x - alvCx) / (alvRx * breathScale);
        const dy = (y - cy)    / (alvRy * breathScale);
        const r  = Math.sqrt(dx * dx + dy * dy);
        const edge = Math.abs(r - 1);

        if (edge < 0.07) {
          // solid wall — thicker on the capillary-facing right side
          const wallChar = (x > alvCx) ? "=" : "-";
          g[y][x] = wallChar;
        } else if (edge < 0.15 && g[y][x] === " ") {
          g[y][x] = (x > alvCx) ? ":" : ".";
        }

        // interior of alveolus — sparse air turbulence
        if (r < 0.88) {
          const hash = ((x * 11 + y * 17 + Math.floor(t * 3)) % 23);
          if (hash === 0) g[y][x] = "'";
          else if (hash === 1) g[y][x] = "`";
        }
      }
    }

    // ---- label: AIR inside alveolus ----
    const airLabelX = Math.floor(alvCx - 3);
    const airLabelY = Math.floor(cy);
    if (airLabelY >= 0 && airLabelY < rows) {
      "AIR".split("").forEach((ch, i) => {
        const lx = airLabelX + i;
        if (lx >= 0 && lx < cols) g[airLabelY][lx] = ch;
      });
    }

    // ---- membrane zone between alveolus and capillary ----
    // thin vertical band where gas crosses
    const memX = Math.floor(cols * 0.615);
    for (let y = 1; y < rows - 1; y++) {
      if (g[y][memX] === " " || g[y][memX] === "." || g[y][memX] === ":") {
        g[y][memX] = "|";
      }
    }

    // ---- capillary (right band) ----
    // top and bottom edges
    for (let x = capLeft; x <= capRight; x++) {
      if (g[0][x] === " ")          g[0][x]        = "~";
      if (g[rows - 1][x] === " ")   g[rows - 1][x] = "~";
    }
    // side walls
    for (let y = 1; y < rows - 1; y++) {
      if (g[y][capLeft]  === " ") g[y][capLeft]  = "|";
      if (g[y][capRight] === " ") g[y][capRight] = "|";
    }

    // ---- blood cells flowing through capillary ----
    // two red-blood-cell shapes scrolling downward
    const capCx  = Math.floor((capLeft + capRight) / 2);
    const capWidth = capRight - capLeft - 2;

    for (let k = 0; k < 3; k++) {
      // each cell occupies ~4 rows, staggered
      const cellY = ((t * 3.5 + k * 6) % (rows * 1.5)) - 1;
      const cy0   = Math.floor(cellY);
      const shape = ["(O)", "(O)", " | ", "(O)"];
      shape.forEach((line, dy) => {
        const ry = cy0 + dy;
        if (ry < 1 || ry >= rows - 1) return;
        line.split("").forEach((ch, dx) => {
          const rx = capCx - 1 + dx;
          if (rx > capLeft && rx < capRight && g[ry][rx] === " ") {
            g[ry][rx] = ch;
          }
        });
      });
    }

    // ---- label: BLOOD in capillary ----
    const bLabelY = Math.floor(rows / 2) - 1;
    if (bLabelY >= 1 && bLabelY < rows - 1) {
      const bLabel = "BLD";
      bLabel.split("").forEach((ch, i) => {
        const bx = capLeft + 1 + i;
        if (bx < capRight && g[bLabelY][bx] === " ") g[bLabelY][bx] = ch;
      });
    }

    // ---- O2 molecules crossing from alveolus to capillary (left→right) ----
    // 4 O2 molecules at staggered phases
    for (let k = 0; k < 4; k++) {
      const phase  = k * (Math.PI / 2);
      const tOff   = t * 1.4 + phase;
      // x travels from just inside alveolus wall toward membrane
      const prog   = (tOff % (Math.PI * 2)) / (Math.PI * 2); // 0..1
      const ox     = Math.floor(alvCx + alvRx * breathScale * 0.5 + prog * (memX - alvCx - alvRx * breathScale * 0.55));
      const oy     = Math.floor(cy + Math.sin(tOff * 1.7 + k) * (rows * 0.28));
      if (oy >= 1 && oy < rows - 1 && ox >= 0 && ox < cols && g[oy][ox] === " ") {
        g[oy][ox] = "o"; // O2
      }
      // label first molecule
      if (k === 0) {
        const lx = ox + 1;
        if (lx < cols - 1 && oy >= 1 && oy < rows - 1 && g[oy][lx] === " ") {
          g[oy][lx] = "2";
        }
      }
    }

    // ---- CO2 molecules crossing from capillary to alveolus (right→left) ----
    for (let k = 0; k < 3; k++) {
      const phase  = k * (Math.PI * 0.67);
      const tOff   = t * 1.1 + phase;
      const prog   = (tOff % (Math.PI * 2)) / (Math.PI * 2);
      // x travels from membrane back toward interior of alveolus
      const ox = Math.floor(memX - prog * (memX - alvCx - 2));
      const oy = Math.floor(cy + Math.cos(tOff * 1.5 + k + 1) * (rows * 0.22));
      if (oy >= 1 && oy < rows - 1 && ox >= 0 && ox < cols && g[oy][ox] === " ") {
        g[oy][ox] = "*"; // CO2
      }
    }

    // ---- top label row ----
    const topLabel = "O2->  [MEMBRANE]  <-CO2";
    const tlStart  = Math.floor((cols - topLabel.length) / 2);
    topLabel.split("").forEach((ch, i) => {
      const tx = tlStart + i;
      if (tx >= 0 && tx < cols && g[0][tx] === " ") g[0][tx] = ch;
    });

    // ---- ensure every row is exactly cols wide (pad / truncate) ----
    return g.map(row => {
      const line = row.join("");
      if (line.length >= cols) return line.slice(0, cols);
      return line + " ".repeat(cols - line.length);
    }).join("\n");
  }
};
