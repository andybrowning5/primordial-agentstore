export default {
  id: 45,
  system: "Biofilm formation",
  title: "Biofilm Formation",
  caption: "Bacteria settle, spread, and weave a living slime fortress.",
  cols: 52,
  rows: 18,
  palette: "microbe",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: safely set a character (bounds-checked)
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function get(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // --- Phase timing ---
    // t=0..4  : free-swimming bacteria drift downward
    // t=4..10 : attachment + lateral spreading along surface
    // t=10..18: microcolony growth + EPS matrix fills in
    // Loop period ~20s
    const T = 20;
    const phase = (t % T) / T; // 0..1 over the full loop

    const surfaceY = rows - 4; // the colonised surface row

    // ---- 1. SURFACE LINE ----
    const surfaceChar = "=";
    for (let x = 0; x < cols; x++) g[surfaceY][x] = surfaceChar;

    // ---- 2. FREE-SWIMMING BACTERIA (phase 0 → 0.35) ----
    // 14 bacteria with pseudo-deterministic starting positions
    const bacteriaCount = 14;
    const swimEndPhase = 0.35;
    const attachPhase  = 0.55; // by this phase all are attached

    for (let i = 0; i < bacteriaCount; i++) {
      // deterministic spread across columns
      const bx0 = 3 + (i * 3.6 + 1.1 * (i % 3)) % (cols - 6);
      // each bacterium reaches the surface at a slightly different time
      const arrivalPhase = swimEndPhase * (0.6 + 0.4 * ((i * 7 + 3) % 10) / 10);

      if (phase < arrivalPhase) {
        // still swimming — oscillate x (Brownian-ish), y falls toward surface
        const frac = phase / arrivalPhase; // 0..1
        const y = 1 + frac * (surfaceY - 2);
        const wobble = Math.sin(t * 1.8 + i * 2.3) * 1.4;
        const x = Math.max(0, Math.min(cols - 1, bx0 + wobble));
        // bacterium body: '-O-' oriented randomly
        const angle = Math.sin(t * 0.7 + i) > 0;
        if (angle) {
          put(x - 1, y, "-"); put(x, y, "O"); put(x + 1, y, "-");
        } else {
          put(x, y - 1, "|"); put(x, y, "O"); put(x, y + 1, "|");
        }
      } else if (phase < attachPhase) {
        // just landed — show on surface with brief flagella twitch
        const fx = Math.max(1, Math.min(cols - 2, bx0 + Math.round(Math.sin(i * 1.7) * 3)));
        const flagella = (Math.floor(t * 4 + i) % 3 === 0) ? "~" : "-";
        put(fx - 1, surfaceY - 1, flagella);
        put(fx,     surfaceY - 1, "o");
        put(fx + 1, surfaceY - 1, flagella);
      }
      // else: subsumed into colony (drawn below)
    }

    // ---- 3. BIOFILM MAT — grows from phase 0.35 onward ----
    // Model: coverage expands from a few seed spots outward
    const matPhase = Math.max(0, (phase - swimEndPhase) / (1 - swimEndPhase)); // 0..1

    // 5 seed centres spread across the surface
    const seeds = [
      { cx: 7,  strength: 1.0 },
      { cx: 17, strength: 0.85 },
      { cx: 28, strength: 0.95 },
      { cx: 39, strength: 0.80 },
      { cx: 48, strength: 0.70 },
    ];

    // Maximum radius each colony can reach (in columns)
    const maxRadius = cols * 0.22;

    // Draw EPS matrix and cell bodies below surface
    for (let dy = 0; dy <= 2; dy++) {
      const my = surfaceY - 1 - dy; // rows just above surface
      if (my < 0) continue;
      for (let x = 0; x < cols; x++) {
        // Is this x within reach of any colony?
        let covered = false;
        let nearEdge = false;
        let density = 0;
        for (const seed of seeds) {
          const dist = Math.abs(x - seed.cx);
          const radius = maxRadius * matPhase * seed.strength;
          if (dist < radius) {
            covered = true;
            density = Math.max(density, 1 - dist / radius);
            if (dist > radius * 0.8) nearEdge = true;
          }
        }
        if (!covered) continue;

        // Thickness: colonies are taller in the middle
        const thicknessFrac = density;
        if (dy > thicknessFrac * 3) continue;

        // Pulsing EPS slime character
        const eps = Math.sin(t * 1.1 + x * 0.4 + dy * 0.9);
        const cell = Math.sin(t * 0.6 + x * 0.7 - dy * 1.3);

        let ch;
        if (nearEdge) {
          // advancing front — motile cells
          ch = (Math.floor(t * 3 + x) % 4 === 0) ? "o" : ".";
        } else if (cell > 0.55) {
          ch = "0"; // dense cell cluster
        } else if (cell > 0.2) {
          ch = "o";
        } else if (eps > 0.3) {
          ch = "~"; // EPS slime
        } else if (eps > -0.2) {
          ch = ":";
        } else {
          ch = ".";
        }
        if (g[my][x] === " " || g[my][x] === "=") g[my][x] = ch;
      }
    }

    // ---- 4. MUSHROOM TOWERS — late-phase 3D microcolony structures ----
    // Two towers rise as matPhase > 0.6
    const towerPhase = Math.max(0, (matPhase - 0.6) / 0.4); // 0..1
    const towerDefs = [
      { cx: 17, maxH: 5 },
      { cx: 37, maxH: 4 },
    ];
    for (const td of towerDefs) {
      const h = Math.round(towerPhase * td.maxH);
      for (let dh = 0; dh < h; dh++) {
        const ty = surfaceY - 2 - dh;
        if (ty < 0) break;
        // stalk width narrows with height
        const halfW = Math.max(0, Math.round(2 - dh * 0.4));
        const pulse = Math.sin(t * 1.4 + dh * 0.8) > 0 ? "@" : "0";
        for (let dx = -halfW; dx <= halfW; dx++) {
          const tx = td.cx + dx;
          if (tx >= 0 && tx < cols) g[ty][tx] = pulse;
        }
        // cap at top
        if (dh === h - 1) {
          const capW = halfW + 2;
          for (let dx = -capW; dx <= capW; dx++) {
            const tx = td.cx + dx;
            if (tx >= 0 && tx < cols) {
              const capChar = Math.abs(dx) === capW ? "o" :
                              Math.abs(dx) >= capW - 1 ? "O" : "#";
              if (ty >= 0) g[ty][tx] = capChar;
            }
          }
        }
      }
    }

    // ---- 5. WATER-CHANNEL GROOVES — gaps between colonies (late phase) ----
    if (matPhase > 0.75) {
      const channelFade = (matPhase - 0.75) / 0.25;
      // Channels at roughly x=22 and x=33
      const channels = [22, 33];
      for (const cx of channels) {
        for (let dy = 0; dy <= 2; dy++) {
          const cy2 = surfaceY - 1 - dy;
          if (cy2 < 0) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const tx = cx + dx;
            if (tx >= 0 && tx < cols) {
              // flow character pulses
              const flowChar = (Math.floor(t * 5 + dy * 2) % 3 === 0) ? "|" :
                               (dy === 0 ? ":" : " ");
              if (channelFade > 0.5) g[cy2][tx] = flowChar;
            }
          }
        }
      }
    }

    // ---- 6. DRIFTING PLANKTONIC CELLS IN WATER ABOVE ----
    // A handful of free cells always visible in the water column
    const plankCount = 6;
    for (let i = 0; i < plankCount; i++) {
      const px0 = 2 + (i * 8.1 + 2.3) % (cols - 4);
      const py0 = 1 + (i * 3.7) % (surfaceY - 3);
      const px = Math.max(0, Math.min(cols - 1, px0 + Math.sin(t * 0.5 + i * 1.9) * 2));
      const py = Math.max(0, Math.min(surfaceY - 2,
                   py0 + Math.sin(t * 0.3 + i * 2.7) * 1.5));
      if (g[Math.round(py)][Math.round(px)] === " ") {
        g[Math.round(py)][Math.round(px)] = (Math.floor(t * 2 + i) % 2 === 0) ? "." : "o";
      }
    }

    // ---- 7. SUBSTRATE (below surface) ----
    for (let x = 0; x < cols; x++) {
      if (surfaceY + 1 < rows) g[surfaceY + 1][x] = (x % 4 === 0) ? "+" : "-";
      if (surfaceY + 2 < rows) g[surfaceY + 2][x] = " ";
      if (surfaceY + 3 < rows) g[surfaceY + 3][x] = " ";
    }

    return g.map(row => row.join("")).join("\n");
  }
};
