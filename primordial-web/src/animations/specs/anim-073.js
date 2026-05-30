export default {
  id: 73,
  system: "Receptor-ligand binding",
  title: "Lock & Key Docking",
  caption: "A ligand drifts in, finds its pocket, and the gate swings open.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    function set(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function get(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // --- Membrane: bottom third of canvas ---
    const memY = rows - 5;

    // Membrane bilayer — two rows of phospholipid heads
    for (let x = 0; x < cols; x++) {
      const wave = Math.sin(x * 0.45 + t * 0.7) * 0.6;
      const y1 = Math.round(memY + wave);
      const y2 = Math.round(memY + 2 + wave);
      if (y1 >= 0 && y1 < rows) g[y1][x] = (x % 4 === 0) ? "o" : "-";
      if (y2 >= 0 && y2 < rows) g[y2][x] = (x % 4 === 0) ? "o" : "-";
    }

    // --- Receptor protein: centered on membrane ---
    const recCx = Math.floor(cols / 2);

    // Binding cycle period: 5 seconds
    const period = 5.0;
    const phase = (t % period) / period; // 0..1

    // Phases:
    //   0.0–0.3  ligand approaches
    //   0.3–0.5  docking / conformational shift
    //   0.5–0.7  bound state (receptor open, signal pulse)
    //   0.7–0.9  ligand departs, receptor closes
    //   0.9–1.0  reset

    // Receptor arm opening angle (0 = closed pocket, 1 = open)
    let openFrac;
    if (phase < 0.3) openFrac = 0;
    else if (phase < 0.5) openFrac = (phase - 0.3) / 0.2;
    else if (phase < 0.7) openFrac = 1;
    else if (phase < 0.9) openFrac = 1 - (phase - 0.7) / 0.2;
    else openFrac = 0;

    // Smooth it
    openFrac = openFrac * openFrac * (3 - 2 * openFrac);

    const armSpread = Math.round(openFrac * 5); // max 5 cols spread

    // Receptor body: two vertical stubs below membrane pocket
    for (let dy = 1; dy <= 3; dy++) {
      const ry = memY + dy;
      if (ry < rows) {
        set(recCx - 1, ry, "|");
        set(recCx + 1, ry, "|");
      }
    }

    // Receptor arms: two arms reaching up above membrane, spread open/closed
    const armBaseY = memY - 1;
    for (let dy = 0; dy <= 4; dy++) {
      const ry = armBaseY - dy;
      if (ry < 0 || ry >= rows) continue;
      const spread = Math.round((dy / 4) * armSpread);
      const lx = recCx - 2 - spread;
      const rx = recCx + 2 + spread;
      const ch = dy === 4 ? "+" : "|";
      set(lx, ry, ch);
      set(rx, ry, ch);
    }

    // Pocket interior fill when open
    if (openFrac > 0.1) {
      const pocketY = armBaseY - 2;
      if (pocketY >= 0 && pocketY < rows) {
        set(recCx, pocketY, openFrac > 0.8 ? "*" : ":");
        set(recCx - 1, pocketY, ":");
        set(recCx + 1, pocketY, ":");
      }
    }

    // --- Signal pulse down receptor when bound ---
    if (phase >= 0.5 && phase < 0.7) {
      const pulseProgress = (phase - 0.5) / 0.2;
      const pulseY = Math.round(memY + 1 + pulseProgress * 2);
      if (pulseY < rows) {
        set(recCx - 1, pulseY, "!");
        set(recCx + 1, pulseY, "!");
      }
    }

    // --- Ligand molecule ---
    // Ligand starts high, drifts down during approach, docks, then leaves
    let ligX, ligY;
    let drawLigand = true;

    if (phase < 0.3) {
      // Approach: drifts from upper area down toward pocket
      const ap = phase / 0.3;
      // Slight wobble as it drifts
      const wobbleX = Math.sin(t * 2.1) * 2.5 * (1 - ap);
      const wobbleY = Math.cos(t * 1.7) * 1.0 * (1 - ap);
      const targetY = armBaseY - 3;
      ligX = recCx + wobbleX + (1 - ap) * 10 * Math.sin(t * 0.3 + 1.2);
      ligY = 2 + (targetY - 2) * ap + wobbleY;
    } else if (phase < 0.5) {
      // Docking: snaps into pocket
      const dp = (phase - 0.3) / 0.2;
      ligX = recCx;
      ligY = armBaseY - 2 - dp * 1;
    } else if (phase < 0.7) {
      // Bound: nestled in pocket with a tiny pulse
      const bp = Math.sin(t * 6) * 0.15;
      ligX = recCx;
      ligY = armBaseY - 3 + bp;
    } else if (phase < 0.9) {
      // Departure: exits upward
      const ep = (phase - 0.7) / 0.2;
      ligX = recCx + ep * 8 * Math.sin(t * 0.5 + 2.0);
      ligY = armBaseY - 3 - ep * 6;
    } else {
      // Reset: ligand offscreen at top
      drawLigand = false;
    }

    if (drawLigand) {
      // Draw ligand as a small molecule: core + fuzzy shell
      const lxi = Math.round(ligX), lyi = Math.round(ligY);
      const boundPulse = (phase >= 0.5 && phase < 0.7)
        ? Math.sin(t * 6) * 0.5 + 0.5
        : 0;
      const coreChar = phase >= 0.5 && phase < 0.7
        ? (boundPulse > 0.7 ? "@" : "O")
        : "O";

      set(lxi, lyi, coreChar);
      set(lxi - 1, lyi, "(");
      set(lxi + 1, lyi, ")");
      set(lxi, lyi - 1, "^");
      set(lxi, lyi + 1, "v");

      // Outer haze
      const hazeChars = [".", ":", "`", "'"];
      for (let angle = 0; angle < 8; angle++) {
        const a = (angle / 8) * Math.PI * 2 + t * 0.5;
        const hx = lxi + Math.round(Math.cos(a) * 2.5);
        const hy = lyi + Math.round(Math.sin(a) * 1.4);
        const hch = hazeChars[angle % hazeChars.length];
        if (hx >= 0 && hx < cols && hy >= 0 && hy < rows && g[hy][hx] === " ") {
          g[hy][hx] = hch;
        }
      }
    }

    // --- Floating ambient molecules (background) ---
    const numAmbient = 4;
    for (let i = 0; i < numAmbient; i++) {
      const seed = i * 7.3 + 1.1;
      const ax = (Math.sin(t * 0.4 + seed) * 0.4 + 0.5) * (cols - 6) + 3;
      const ay = (Math.sin(t * 0.3 + seed * 1.7) * 0.3 + 0.2) * (memY - 3);
      const axi = Math.round(ax), ayi = Math.round(ay);
      if (axi >= 0 && axi < cols && ayi >= 0 && ayi < rows && g[ayi][axi] === " ") {
        g[ayi][axi] = "o";
        if (axi + 1 < cols && g[ayi][axi + 1] === " ") g[ayi][axi + 1] = ".";
        if (axi - 1 >= 0 && g[ayi][axi - 1] === " ") g[ayi][axi - 1] = ".";
      }
    }

    // Ensure each row is exactly cols wide
    return g.map(row => row.join("").padEnd(cols).slice(0, cols)).join("\n");
  }
};
