export default {
  id: 42,
  system: "Flagellum rotation",
  title: "Flagellar Drive",
  caption: "A molecular motor spins its helical filament through the dark.",
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

    // --- Motor body (left side) ---
    // Outer ring (stator) — static concentric rings
    const motorX = 8, motorY = rows / 2;
    const ringChars = ["@", "O", "o", ".", " "];
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      const ox = Math.round(motorX + 3.2 * Math.cos(angle));
      const oy = Math.round(motorY + 2.0 * Math.sin(angle));
      if (ox >= 0 && ox < cols && oy >= 0 && oy < rows) {
        g[oy][ox] = "@";
      }
    }
    // Inner rotor — spins with t
    const rotorSpeed = t * 3.5;
    for (let i = 0; i < 6; i++) {
      const a = rotorSpeed + (i * Math.PI * 2) / 6;
      const ox = Math.round(motorX + 1.6 * Math.cos(a));
      const oy = Math.round(motorY + 1.0 * Math.sin(a));
      if (ox >= 0 && ox < cols && oy >= 0 && oy < rows) {
        g[oy][ox] = "#";
      }
    }
    // Motor hub
    set(motorX, motorY, "0");

    // Phospholipid membrane — two horizontal lines around motor
    const memY1 = Math.round(motorY - 2.8), memY2 = Math.round(motorY + 2.8);
    for (let x = 2; x < 14; x++) {
      if (memY1 >= 0 && memY1 < rows) {
        const pulse = (Math.floor(t * 4 + x) % 5 === 0) ? "~" : "=";
        g[memY1][x] = pulse;
      }
      if (memY2 >= 0 && memY2 < rows) {
        const pulse = (Math.floor(t * 4 + x + 2) % 5 === 0) ? "~" : "=";
        g[memY2][x] = pulse;
      }
    }

    // --- Hook — short curved connector between motor and filament ---
    // Hook sweeps in a small arc as it transmits rotation
    const hookBaseX = motorX + 3;
    const hookPhase = t * 3.5;
    const hookAmp = 0.6;
    for (let i = 0; i <= 5; i++) {
      const frac = i / 5;
      const hx = hookBaseX + frac * 3.5;
      const hy = motorY + Math.sin(hookPhase + frac * Math.PI) * hookAmp * (1 - frac);
      const ch = i === 0 ? ">" : (i === 5 ? ")" : "-");
      set(hx, hy, ch);
    }

    // --- Helical filament — left-handed helix rotating as it propels ---
    // Filament starts around x=15, extends to x=cols-2
    const filStart = 15;
    const filEnd = cols - 2;
    const filLen = filEnd - filStart;
    const helixFreq = 1.2;   // cycles along length
    const helixAmp = 3.5;    // vertical amplitude in rows
    const spinRate = t * 3.5; // rotor speed drives filament spin

    // Draw back strand first (dimmer characters)
    for (let xi = filStart; xi <= filEnd; xi++) {
      const frac = (xi - filStart) / filLen;
      const phase = frac * Math.PI * 2 * helixFreq - spinRate;
      const cosVal = Math.cos(phase);
      const sinVal = Math.sin(phase);
      const yf = motorY + sinVal * helixAmp;
      // depth cue: back of helix uses lighter chars
      if (cosVal < 0) {
        const ch = cosVal < -0.7 ? "." : ":";
        set(xi, yf, ch);
      }
    }

    // Draw front strand on top (brighter characters)
    for (let xi = filStart; xi <= filEnd; xi++) {
      const frac = (xi - filStart) / filLen;
      const phase = frac * Math.PI * 2 * helixFreq - spinRate;
      const cosVal = Math.cos(phase);
      const sinVal = Math.sin(phase);
      const yf = motorY + sinVal * helixAmp;
      if (cosVal >= 0) {
        const ch = cosVal > 0.7 ? "O" : "o";
        set(xi, yf, ch);
      }
    }

    // Filament cross-bridges (rungs between top/bottom of helix)
    for (let xi = filStart + 1; xi < filEnd; xi += 3) {
      const frac = (xi - filStart) / filLen;
      const phase = frac * Math.PI * 2 * helixFreq - spinRate;
      const cosVal = Math.cos(phase);
      // only draw rung when helix is side-on (cos near 0)
      if (Math.abs(cosVal) < 0.35) {
        const sinVal = Math.sin(phase);
        const yTop = motorY + sinVal * helixAmp;
        // draw a short vertical rung
        for (let dy = -0.8; dy <= 0.8; dy += 0.4) {
          set(xi, yTop + dy, "|");
        }
      }
    }

    // Taper at filament tip — amplitude shrinks at the far end
    for (let xi = filEnd - 5; xi <= filEnd; xi++) {
      const frac = (xi - filStart) / filLen;
      const taper = 1 - (xi - (filEnd - 5)) / 5;
      const phase = frac * Math.PI * 2 * helixFreq - spinRate;
      const sinVal = Math.sin(phase);
      const cosVal = Math.cos(phase);
      const yf = motorY + sinVal * helixAmp * taper;
      const ch = cosVal >= 0 ? (cosVal > 0.7 ? "o" : ",") : ".";
      set(xi, yf, ch);
    }
    // Tip cap
    const tipPhase = (filEnd - filStart) / filLen * Math.PI * 2 * helixFreq - spinRate;
    set(filEnd + 1, motorY + Math.sin(tipPhase) * helixAmp * 0.1, ">");

    // --- Torque sparks — small glint particles near the motor hub ---
    for (let i = 0; i < 4; i++) {
      const a = t * 7 + (i * Math.PI * 2) / 4;
      const r = 4.0 + Math.sin(t * 5 + i) * 0.5;
      const sx = motorX + r * Math.cos(a);
      const sy = motorY + r * 0.6 * Math.sin(a);
      if (Math.sin(t * 9 + i * 1.3) > 0.6) {
        set(sx, sy, "*");
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
