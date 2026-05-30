export default {
  id: 26,
  system: "Antibody binding an antigen",
  title: "Lock & Key Embrace",
  caption: "Y-shaped guardian closes its arms around a glowing invader.",
  cols: 52,
  rows: 20,
  palette: "immune",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Binding progress: 0 = antibody far, approaching; 1 = fully bound
    // Oscillate: antibody approaches, binds, holds, then cycles again
    const cycle = (t * 0.35) % 1; // 0..1 cycle
    // ease in/out for smooth approach
    const bind = cycle < 0.5
      ? 2 * cycle * cycle
      : 1 - Math.pow(-2 * cycle + 2, 2) / 2;

    // Pulse for bound state glow
    const pulse = Math.sin(t * 3.1) * 0.5 + 0.5;
    const boundPulse = bind > 0.85 ? pulse : 0;

    // ── ANTIGEN (target) ───────────────────────────────────────────
    // Sits at fixed position center-right, gently pulsing
    const agX = 34, agY = 9;
    const agR = 2.5 + boundPulse * 0.4;

    function drawCircle(cx, cy, r, outerCh, innerCh) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - cx) * 0.55; // aspect correction
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - r) < 0.6) {
            if (g[y][x] === " ") g[y][x] = outerCh;
          } else if (dist < r - 0.6) {
            if (g[y][x] === " ") g[y][x] = innerCh;
          }
        }
      }
    }

    // Antigen body
    const agCh = bind > 0.85 ? (boundPulse > 0.5 ? "@" : "O") : "O";
    const agInner = bind > 0.85 ? (boundPulse > 0.7 ? "*" : "o") : "o";
    drawCircle(agX, agY, agR, agCh, agInner);

    // Antigen surface spikes (epitope markers)
    const spikeAngles = [0, 60, 120, 180, 240, 300];
    for (const deg of spikeAngles) {
      const rad = (deg * Math.PI) / 180;
      const spikeLen = 1.5 + (deg === 0 || deg === 60 ? 1 : 0); // epitope site bigger
      for (let r2 = 0; r2 <= spikeLen; r2 += 0.5) {
        const sx = Math.round(agX + Math.cos(rad) * (agR / 0.55 + r2 * 1.8));
        const sy = Math.round(agY + Math.sin(rad) * (agR + r2));
        if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) {
          const spikeCh = r2 < 0.6 ? "+" : (r2 < 1.1 ? ":" : ".");
          if (g[sy][sx] === " ") g[sy][sx] = spikeCh;
        }
      }
    }

    // ── ANTIBODY (Y-shape) ─────────────────────────────────────────
    // Fc stem at left; two Fab arms reach right toward antigen
    // Approach: antibody moves from far left toward antigen
    const maxDist = 20;
    const abOffset = Math.round((1 - bind) * maxDist);
    const abBaseX = 10 + abOffset; // stem anchor X
    const abBaseY = 9;             // stem anchor Y (aligns with antigen)

    // Stem (Fc region) — vertical bar downward from junction
    const stemLen = 5;
    for (let i = 0; i <= stemLen; i++) {
      const sx = abBaseX;
      const sy = abBaseY + i;
      if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) {
        g[sy][sx] = i === 0 ? "+" : (i === stemLen ? "=" : "|");
      }
      // Hinge decoration
      if (i === 1 && sx + 1 < cols) g[sy][sx + 1] = "-";
      if (i === 1 && sx - 1 >= 0)   g[sy][sx - 1] = "-";
    }

    // Arm opening angle: arms spread when far, close when bound
    // When binding, arms angle toward antigen epitope
    const openAngle = (1 - bind) * 0.55 + 0.12; // radians from horizontal
    const armLen = 10;

    // Two Fab arms diverging upward-right and downward-right from junction
    for (let arm = 0; arm < 2; arm++) {
      const sign = arm === 0 ? -1 : 1; // up / down
      const angle = sign * openAngle;

      for (let step = 0; step <= armLen; step++) {
        const frac = step / armLen;
        const ax = Math.round(abBaseX + Math.cos(angle) * step * 1.0);
        const ay = Math.round(abBaseY + Math.sin(angle) * step * 1.8);

        if (ax < 0 || ax >= cols || ay < 0 || ay >= rows) continue;

        let ch;
        if (step === 0) {
          ch = "+"; // junction
        } else if (step === armLen) {
          // Fab tip — binding domain
          ch = bind > 0.75 ? "#" : (bind > 0.4 ? "%" : "Y");
        } else {
          // Arm body: alternate chars by direction
          const isHoriz = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle) * 1.8);
          ch = isHoriz
            ? (frac < 0.5 ? "=" : "-")
            : (frac < 0.5 ? "|" : ":");
          if (frac > 0.7) ch = bind > 0.5 ? "~" : "-";
        }
        if (g[ay][ax] === " ") g[ay][ax] = ch;
      }
    }

    // ── BINDING EFFECT ────────────────────────────────────────────
    // When close to bound, draw bond lines between Fab tips and antigen
    if (bind > 0.7) {
      const bondStrength = (bind - 0.7) / 0.3;
      const bondChar = bondStrength > 0.7 ? "=" : (bondStrength > 0.4 ? "-" : ".");

      // Upper bond line
      const upAngle = -openAngle;
      const tipX1 = Math.round(abBaseX + Math.cos(upAngle) * armLen);
      const tipY1 = Math.round(abBaseY + Math.sin(upAngle) * armLen * 1.8);
      // Draw dots from tip toward antigen upper epitope
      const tgtX1 = Math.round(agX + Math.cos((0 * Math.PI) / 180) * (agR / 0.55 + 2));
      const tgtY1 = Math.round(agY + Math.sin((0 * Math.PI) / 180) * (agR + 2));
      const steps1 = Math.max(Math.abs(tgtX1 - tipX1), Math.abs(tgtY1 - tipY1));
      if (steps1 > 0) {
        for (let i = 0; i <= steps1; i++) {
          const bx = Math.round(tipX1 + ((tgtX1 - tipX1) * i) / steps1);
          const by = Math.round(tipY1 + ((tgtY1 - tipY1) * i) / steps1);
          if (bx >= 0 && bx < cols && by >= 0 && by < rows && g[by][bx] === " ")
            g[by][bx] = bondChar;
        }
      }

      // Lower bond line
      const dnAngle = openAngle;
      const tipX2 = Math.round(abBaseX + Math.cos(dnAngle) * armLen);
      const tipY2 = Math.round(abBaseY + Math.sin(dnAngle) * armLen * 1.8);
      const tgtX2 = Math.round(agX + Math.cos((60 * Math.PI) / 180) * (agR / 0.55 + 2));
      const tgtY2 = Math.round(agY + Math.sin((60 * Math.PI) / 180) * (agR + 2));
      const steps2 = Math.max(Math.abs(tgtX2 - tipX2), Math.abs(tgtY2 - tipY2));
      if (steps2 > 0) {
        for (let i = 0; i <= steps2; i++) {
          const bx = Math.round(tipX2 + ((tgtX2 - tipX2) * i) / steps2);
          const by = Math.round(tipY2 + ((tgtY2 - tipY2) * i) / steps2);
          if (bx >= 0 && bx < cols && by >= 0 && by < rows && g[by][bx] === " ")
            g[by][bx] = bondChar;
        }
      }
    }

    // ── PARTICLE TRAILS (immune signaling) ────────────────────────
    // Small particles drifting toward the antigen when bound
    if (bind > 0.85) {
      for (let p = 0; p < 6; p++) {
        const ph = p * 1.047; // 60° phase steps
        const pAngle = ph + t * 1.5;
        const pDist = 6 + Math.sin(t * 2 + ph) * 3;
        const px = Math.round(agX + Math.cos(pAngle) * pDist * 1.8);
        const py = Math.round(agY + Math.sin(pAngle) * pDist);
        if (px >= 0 && px < cols && py >= 0 && py < rows && g[py][px] === " ")
          g[py][px] = ".";
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
