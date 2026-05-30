export default {
  id: 84,
  system: "Hydra tentacle capture",
  title: "Hydra Strikes",
  caption: "Sinuous arms reach, coil, and drag the prey inward.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: clamp-safe write
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }

    // Helper: draw a segment with given char, only if cell is empty or lower priority
    const priority = " .,:~-=+*oO0@#";
    function putP(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || xi >= cols || yi < 0 || yi >= rows) return;
      if (priority.indexOf(ch) > priority.indexOf(g[yi][xi])) g[yi][xi] = ch;
    }

    // Hydra body — column of cells at center-bottom
    const bodyX = cols / 2;
    const bodyBaseY = rows - 2;
    const bodyLen = 5;

    // Body column
    for (let i = 0; i < bodyLen; i++) {
      const y = bodyBaseY - i;
      const bulge = Math.sin(t * 1.2 + i * 0.7) * 0.6;
      const ch = i === 0 ? "#" : i === bodyLen - 1 ? "@" : "0";
      putP(bodyX + bulge, y, ch);
      putP(bodyX + bulge - 1, y, "O");
      putP(bodyX + bulge + 1, y, "O");
    }

    // Foot (anchor)
    put(bodyX - 1, bodyBaseY + 1, "=");
    put(bodyX,     bodyBaseY + 1, "=");
    put(bodyX + 1, bodyBaseY + 1, "=");

    // Tentacle count
    const nTentacles = 6;
    const headY = bodyBaseY - bodyLen + 1;
    const headX = bodyX;

    // Capture cycle: 0..1 — extend (0..0.5), curl/capture (0.5..1)
    const cycle = (t * 0.4) % 1; // slow cycle ~2.5s period

    // Prey position — drifts in from the right, gets pulled in
    const preyStartX = headX + 14;
    const preyStartY = headY - 3;
    // prey moves toward head as cycle progresses past 0.5
    const captureT = Math.max(0, (cycle - 0.5) / 0.5); // 0..1 during capture phase
    const preyX = preyStartX - captureT * (preyStartX - headX - 1);
    const preyY = preyStartY + captureT * (headY - preyStartY);

    // Draw prey (small crustacean-ish blob)
    const preyPulse = Math.sin(t * 3.0) * 0.3;
    put(Math.round(preyX), Math.round(preyY), captureT > 0.85 ? "@" : "O");
    if (captureT < 0.9) {
      putP(Math.round(preyX) - 1, Math.round(preyY), captureT > 0.7 ? "o" : "o");
      putP(Math.round(preyX) + 1, Math.round(preyY), captureT > 0.7 ? "o" : "o");
      putP(Math.round(preyX), Math.round(preyY) - 1, ".");
    }

    // Draw tentacles
    for (let ti = 0; ti < nTentacles; ti++) {
      // Base angle spread around head
      const baseAngle = (ti / nTentacles) * Math.PI * 2;
      // Each tentacle has a phase offset
      const phase = ti * (Math.PI * 2 / nTentacles);

      // How extended: 0=retracted, 1=fully extended
      const extend = Math.min(1, cycle < 0.5 ? cycle / 0.5 : 1);
      // How curled: 0=straight, 1=fully curled inward
      const curl = cycle < 0.5 ? 0 : (cycle - 0.5) / 0.5;

      // Tentacle length in segments
      const segCount = 10;
      const maxReach = 7 + Math.sin(phase) * 2; // varies per tentacle

      let px = headX, py = headY;

      for (let s = 1; s <= segCount; s++) {
        const frac = s / segCount;
        // Each segment's angle bends sinusoidally for waving motion
        const wave = Math.sin(t * 1.8 + phase + frac * 3.0) * 0.4 * (1 - curl * frac);

        // During curl, tentacles bend toward prey
        const curlAngle = curl * frac * Math.PI * 1.2;

        // Direction for this tentacle
        // Spread tentacles: upper ones reach up/outward, lower ones droop
        const spreadAngle = baseAngle + wave;

        // Curl brings the tip toward the center (and prey)
        const effectiveAngle = spreadAngle - curlAngle * Math.sign(Math.cos(baseAngle));

        const stepLen = (maxReach * extend) / segCount;
        const nx = px + Math.cos(effectiveAngle) * stepLen;
        const ny = py + Math.sin(effectiveAngle) * stepLen * 0.55; // squish vertically

        // Character by position in tentacle
        let ch;
        if (s === segCount) {
          ch = curl > 0.7 ? "*" : "+"; // nematocyst tip
        } else if (s > segCount * 0.7) {
          ch = "-";
        } else if (s > segCount * 0.3) {
          ch = "~";
        } else {
          ch = ":";
        }

        // Draw segment line between prev and next point
        const steps = 2;
        for (let sub = 0; sub <= steps; sub++) {
          const lx = px + (nx - px) * sub / steps;
          const ly = py + (ny - py) * sub / steps;
          putP(lx, ly, ch);
        }

        px = nx; py = ny;
      }
    }

    // Ambient water drift particles
    const particleCount = 8;
    for (let pi = 0; pi < particleCount; pi++) {
      const px2 = ((pi * 7.3 + t * 2.1 + pi * 1.4) % cols);
      const py2 = ((pi * 3.7 + Math.sin(t * 0.5 + pi) * 2 + rows * 0.3)) % rows;
      putP(px2, py2, ".");
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
