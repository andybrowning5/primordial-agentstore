export default {
  id: 35,
  system: "Dendritic growth",
  title: "Branching Dendrite",
  caption: "A dendrite unfurls its fractal arms into the dark.",
  cols: 52,
  rows: 20,
  palette: "neuron",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: clamp and draw a character if in bounds
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        g[yi][xi] = ch;
      }
    }

    // Pulse: a slow brightness wave travelling outward from soma
    const pulse = (Math.sin(t * 1.4) * 0.5 + 0.5); // 0..1

    // Draw soma (cell body) at left-center
    const somaX = 8;
    const somaY = rows / 2;
    const somaR = 1.4 + 0.3 * Math.sin(t * 2.2);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < somaR) put(somaX + dx, somaY + dy, "@");
        else if (r < somaR + 0.9) put(somaX + dx, somaY + dy, "O");
        else if (r < somaR + 1.6) put(somaX + dx, somaY + dy, "o");
      }
    }

    // Recursive branch drawer
    // growth: 0..1 (how far along this branch is grown)
    // len: total pixel length of this branch
    // depth: recursion depth (0 = trunk)
    function branch(x, y, angle, len, depth, phaseOffset) {
      if (depth > 4 || len < 1.5) return;

      // Each branch grows over time with a staggered phase
      const branchPhase = t * 0.7 - phaseOffset;
      const growth = Math.max(0, Math.min(1, branchPhase));
      if (growth <= 0) return;

      const actualLen = len * growth;
      const steps = Math.ceil(actualLen * 2);
      const stepSize = actualLen / steps;

      // Character selection by depth
      const chars = ["#", "+", "*", ".", "·"];
      const tipChar  = ["%", "o", "+", ".", ","];
      const ch = chars[Math.min(depth, chars.length - 1)];
      const tip = tipChar[Math.min(depth, tipChar.length - 1)];

      // Subtle wave along the branch (gives a living-flex feel)
      const wave = 0.08 * Math.sin(t * 2.0 + phaseOffset * 3.1 + depth);

      let cx = x, cy = y;
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        // Lateral wave, perpendicular to angle
        const lateralOff = wave * Math.sin(frac * Math.PI) * (len / 8);
        const perpAngle = angle + Math.PI / 2;
        const wx = cx + Math.cos(perpAngle) * lateralOff;
        const wy = cy + Math.sin(perpAngle) * lateralOff;

        const drawCh = (i === steps) ? tip : ch;
        put(wx, wy, drawCh);

        cx += Math.cos(angle) * stepSize;
        cy += Math.sin(angle) * stepSize;
      }

      // Spawn child branches at intervals along the grown portion
      const numSplits = depth < 2 ? 3 : 2;
      for (let s = 1; s <= numSplits; s++) {
        const splitFrac = s / (numSplits + 1);
        if (growth < splitFrac) continue; // hasn't grown to this split yet

        const splitX = x + Math.cos(angle) * len * splitFrac;
        const splitY = y + Math.sin(angle) * len * splitFrac;

        // Alternate branches above and below
        const spread = (Math.PI / 5) + 0.08 * Math.sin(t * 0.5 + phaseOffset + s);
        const sign = (s % 2 === 0) ? 1 : -1;
        const childAngle = angle + sign * spread * (1 - depth * 0.08);
        const childLen = len * (0.55 + 0.05 * Math.sin(t * 0.3 + s));
        const childPhase = phaseOffset + splitFrac * 2.5 + s * 0.4;

        branch(splitX, splitY, childAngle, childLen, depth + 1, childPhase);
      }
    }

    // Main trunk emerges from soma rightward
    const trunkAngle = 0.0 + 0.04 * Math.sin(t * 0.6);
    branch(somaX + 2, somaY, trunkAngle, 36, 0, 0.0);

    // Secondary thin axon going up-right at a shallow angle (apical dendrite)
    branch(somaX + 1, somaY - 1, -Math.PI / 10 + 0.03 * Math.sin(t * 0.5), 18, 1, 1.2);

    // Basal dendrite stub going down-right
    branch(somaX + 1, somaY + 1, Math.PI / 9 + 0.03 * Math.sin(t * 0.7 + 1), 14, 1, 1.6);

    // Subtle pulse glow: periodically brighten the soma ring
    if (pulse > 0.85) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r > 1.8 && r < 2.8) put(somaX + dx, somaY + dy, "*");
        }
      }
    }

    // Travelling signal dot along the main trunk axis (action potential)
    const sigPos = ((t * 8) % 38); // travels left to right along trunk
    const sigX = somaX + 2 + sigPos;
    const sigY = somaY + Math.round(0.5 * Math.sin(sigPos * 0.25));
    if (sigX >= 0 && sigX < cols && sigY >= 0 && sigY < rows) {
      g[Math.round(sigY)][Math.round(sigX)] = "0";
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
