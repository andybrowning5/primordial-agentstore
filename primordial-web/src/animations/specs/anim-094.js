export default {
  id: 94,
  system: "Circadian clock oscillation",
  title: "24-Hour Inner Clock",
  caption: "Protein tides ebb and surge as the cell counts the hours.",
  cols: 52,
  rows: 18,
  palette: "energy",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Clock center and radius
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    const R = 7.5; // clock face radius (in col units; rows are ~2x taller visually)
    const ry = R * 0.52; // row scale factor

    // Draw clock face ring
    for (let ang = 0; ang < Math.PI * 2; ang += 0.04) {
      const x = Math.round(cx + R * Math.cos(ang));
      const y = Math.round(cy + ry * Math.sin(ang));
      if (x >= 0 && x < cols && y >= 0 && y < rows) {
        // Hour tick marks at 12 positions
        const nearHour = Math.min(
          ...Array.from({ length: 12 }, (_, i) => Math.abs(ang - (i * Math.PI * 2) / 12))
        ) < 0.12;
        if (g[y][x] === " ") g[y][x] = nearHour ? "+" : "-";
      }
    }

    // 24-hour clock hand (full rotation every ~24s for visual drama, but looped)
    const handPeriod = 24; // seconds per full cycle
    const handAngle = (t / handPeriod) * Math.PI * 2 - Math.PI / 2;
    const handLen = R * 0.82;
    for (let r = 0.12; r <= 1.0; r += 0.04) {
      const x = Math.round(cx + handLen * r * Math.cos(handAngle));
      const y = Math.round(cy + ry * r * Math.sin(handAngle));
      if (x >= 0 && x < cols && y >= 0 && y < rows) {
        const ch = r > 0.75 ? ">" : r > 0.4 ? "=" : "-";
        g[y][x] = ch;
      }
    }

    // Minute-style secondary hand (faster, dimmer) — 1/12 period
    const fastAngle = (t / (handPeriod / 12)) * Math.PI * 2 - Math.PI / 2;
    const fastLen = R * 0.55;
    for (let r = 0.15; r <= 1.0; r += 0.06) {
      const x = Math.round(cx + fastLen * r * Math.cos(fastAngle));
      const y = Math.round(cy + ry * r * Math.sin(fastAngle));
      if (x >= 0 && x < cols && y >= 0 && y < rows) {
        if (g[y][x] === " ") g[y][x] = ".";
      }
    }

    // Clock center pip
    if (cy >= 0 && cy < rows && cx >= 0 && cx < cols) g[cy][cx] = "O";

    // ── Protein concentration wave bars on left and right flanks ──
    // Left flank: PER/CRY protein wave (peaks at subjective night)
    // Right flank: BMAL1/CLOCK wave (peaks at subjective day, anti-phase)
    const waveH = rows - 2;
    const barY0 = 1;
    const leftX = 2;
    const rightX = cols - 3;

    // Phase offsets: BMAL1 is ~anti-phase to PER
    const perPhase = t * (Math.PI * 2 / handPeriod);
    const bmalPhase = perPhase + Math.PI;

    const perLevel  = Math.sin(perPhase)  * 0.5 + 0.5;  // 0..1
    const bmalLevel = Math.sin(bmalPhase) * 0.5 + 0.5;  // 0..1

    const perBars  = Math.round(perLevel  * waveH);
    const bmalBars = Math.round(bmalLevel * waveH);

    // Left bar (PER/CRY) — bottom-up fill
    for (let i = 0; i < waveH; i++) {
      const gy = barY0 + (waveH - 1 - i);
      if (gy < rows) {
        if (i < perBars) {
          const ch = i === perBars - 1 ? "@" : i > perBars - 3 ? "o" : ":";
          g[gy][leftX] = ch;
          if (leftX + 1 < cols) g[gy][leftX + 1] = ch === "@" ? "o" : ".";
        } else {
          g[gy][leftX] = ".";
        }
      }
    }

    // Right bar (BMAL1) — bottom-up fill
    for (let i = 0; i < waveH; i++) {
      const gy = barY0 + (waveH - 1 - i);
      if (gy < rows) {
        if (i < bmalBars) {
          const ch = i === bmalBars - 1 ? "@" : i > bmalBars - 3 ? "o" : ":";
          g[gy][rightX] = ch;
          if (rightX - 1 >= 0) g[gy][rightX - 1] = ch === "@" ? "o" : ".";
        } else {
          g[gy][rightX] = ".";
        }
      }
    }

    // Labels for bars (static)
    // PER label top-left
    const perLabel  = "PER";
    const bmalLabel = "BMAL";
    for (let i = 0; i < perLabel.length && leftX + i < cols; i++) {
      if (g[0][leftX + i] === " ") g[0][leftX + i] = perLabel[i];
    }
    for (let i = 0; i < bmalLabel.length && rightX - bmalLabel.length + 1 + i < cols; i++) {
      const bx = rightX - bmalLabel.length + 1 + i;
      if (bx >= 0 && g[0][bx] === " ") g[0][bx] = bmalLabel[i];
    }

    // ── Day/Night ambient pulse radiating from clock face ──
    // A slow shimmer ring that contracts and expands with the 24h cycle
    const shimmer = Math.sin(perPhase * 0.5) * 0.5 + 0.5; // 0..1, slow
    const shimR = R * (1.15 + shimmer * 0.25);
    const shimRy = shimR * 0.52;
    for (let ang = 0; ang < Math.PI * 2; ang += 0.10) {
      const x = Math.round(cx + shimR * Math.cos(ang));
      const y = Math.round(cy + shimRy * Math.sin(ang));
      if (x > leftX + 2 && x < rightX - 2 && y >= 0 && y < rows) {
        if (g[y][x] === " ") {
          // Sparse sparkle based on position + time
          const spark = (Math.floor(ang * 7 + t * 3.1)) % 5 === 0;
          g[y][x] = spark ? "*" : "~";
        }
      }
    }

    // ── Bottom ticker: scrolling phase label ──
    // Shows which phase of clock: dawn / day / dusk / night
    const phaseNorm = ((t % handPeriod) / handPeriod); // 0..1
    const phases = ["  dawn  ", "   day  ", "  dusk  ", "  night "];
    const phaseIdx = Math.floor(phaseNorm * 4) % 4;
    const phaseLabel = phases[phaseIdx];
    const tickY = rows - 1;
    const tickMsg = `~~ ${phaseLabel} ~~`;
    const offset = Math.floor(t * 1.5) % cols;
    for (let i = 0; i < tickMsg.length; i++) {
      const tx = (cols / 2 - Math.floor(tickMsg.length / 2) + i + cols) % cols;
      if (tx > leftX + 2 && tx < rightX - 2 && g[tickY][tx] === " ") {
        g[tickY][tx] = tickMsg[i];
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
