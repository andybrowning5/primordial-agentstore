export default {
  id: 55,
  system: "Cell differentiation",
  title: "Fate Decision",
  caption: "A stem cell breathes out signals; daughters find their destiny.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cy = rows / 2;
    const cx = cols / 2;

    // --- helper: clamp to grid ---
    function put(x, y, ch, overwrite) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || xi >= cols || yi < 0 || yi >= rows) return;
      if (overwrite || g[yi][xi] === " ") g[yi][xi] = ch;
    }

    // === 1. Morphogen gradient rings radiating outward ===
    // Three concentric pulses expanding from center, looping
    for (let ring = 0; ring < 3; ring++) {
      const phase = (t * 0.6 + ring * 0.9) % 2.8;   // 0..2.8 then reset
      if (phase > 2.4) continue;                       // fade-out gap
      const rr = phase * 9 + 1;                        // radius in cell-units
      const chars = [".", ":", "~"];
      const ch = chars[ring];
      const steps = Math.ceil(2 * Math.PI * rr * 2);
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * 2 * Math.PI;
        const rx = rr * 1.6, ry = rr * 0.82;          // elliptical warp
        const px = cx + Math.cos(ang) * rx;
        const py = cy + Math.sin(ang) * ry;
        put(px, py, ch, false);
      }
    }

    // === 2. Stem cell at center — pulsing nucleus ===
    const pulse = Math.sin(t * 1.4) * 0.5 + 0.5;     // 0..1
    const stemR = 1.5 + pulse * 0.6;
    const stemRx = stemR * 1.5, stemRy = stemR * 0.8;
    const stemSteps = 48;
    for (let i = 0; i < stemSteps; i++) {
      const ang = (i / stemSteps) * 2 * Math.PI;
      put(cx + Math.cos(ang) * stemRx, cy + Math.sin(ang) * stemRy, "@", true);
    }
    put(cx, cy, pulse > 0.7 ? "O" : "o", true);       // nucleus flash

    // === 3. Daughter cells crystallizing at fixed orbital slots ===
    // 6 daughters, each on a slower orbit; they "emerge" progressively
    const numDaughters = 6;
    const cellTypes = [
      { sym: "#", orbitR: 13, speed: 0.18, born: 0.0 },  // neural
      { sym: "0", orbitR: 11, speed: -0.14, born: 0.4 }, // muscle
      { sym: "%", orbitR: 15, speed: 0.11, born: 0.8 },  // epithelial
      { sym: "&", orbitR: 9,  speed: -0.20, born: 1.2 }, // blood
      { sym: "8", orbitR: 14, speed: 0.15, born: 1.6 },  // bone
      { sym: "*", orbitR: 12, speed: -0.09, born: 2.0 }, // gland
    ];

    cellTypes.forEach((cell, idx) => {
      const baseAng = (idx / numDaughters) * 2 * Math.PI;
      const ang = baseAng + t * cell.speed;
      const orx = cell.orbitR * 1.55, ory = cell.orbitR * 0.78;
      const dcx = cx + Math.cos(ang) * orx;
      const dcy = cy + Math.sin(ang) * ory;

      // maturity: cells "solidify" over time, cycling every ~12 s
      const cycle = (t * 0.4 + cell.born) % (2 * Math.PI);
      const maturity = Math.sin(cycle) * 0.5 + 0.5;
      const dr = 1.0 + maturity * 0.7;
      const drx = dr * 1.4, dry = dr * 0.75;

      const steps = 32;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * 2 * Math.PI;
        put(dcx + Math.cos(a) * drx, dcy + Math.sin(a) * dry, cell.sym, false);
      }
      // nucleus
      if (maturity > 0.3) put(dcx, dcy, "o", false);
      if (maturity > 0.7) put(dcx, dcy, "O", true);
    });

    // === 4. Signal filaments — thin lines from center to each daughter ===
    cellTypes.forEach((cell, idx) => {
      const baseAng = (idx / numDaughters) * 2 * Math.PI;
      const ang = baseAng + t * cell.speed;
      const orx = cell.orbitR * 1.55, ory = cell.orbitR * 0.78;
      const dcx = cx + Math.cos(ang) * orx;
      const dcy = cy + Math.sin(ang) * ory;

      const steps = 18;
      for (let s2 = 1; s2 < steps - 1; s2++) {
        const f = s2 / steps;
        const lx = cx + (dcx - cx) * f;
        const ly = cy + (dcy - cy) * f;
        const twitch = Math.sin(t * 3 + idx * 1.1 + f * 4) * 0.35;
        const perpAng = ang + Math.PI / 2;
        const px = lx + Math.cos(perpAng) * twitch;
        const py = ly + Math.sin(perpAng) * twitch * 0.5;
        // animated dash — only draw certain segments to create dashed look
        const tick = Math.floor(t * 4 + f * 10 + idx) % 3;
        if (tick < 2) put(px, py, "-", false);
      }
    });

    return g.map((row) => row.join("")).join("\n");
  },
};
