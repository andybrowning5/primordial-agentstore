export default {
  id: 34,
  system: "Saltatory conduction along myelin",
  title: "Saltatory Leap",
  caption: "A spark leaps node to node, skipping the silent myelin.",
  cols: 52,
  rows: 18,
  palette: "neuron",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Axon runs horizontally through center
    const axonY = Math.floor(rows / 2);

    // Myelin sheath geometry: segments separated by nodes of Ranvier
    // 5 nodes evenly spaced across the axon
    const nodeCount = 5;
    const axonStart = 3;
    const axonEnd = cols - 3;
    const axonLen = axonEnd - axonStart;
    const nodeSpacing = axonLen / (nodeCount - 1);

    // Node x positions
    const nodeX = Array.from({ length: nodeCount }, (_, i) =>
      Math.round(axonStart + i * nodeSpacing)
    );

    // Draw myelin sheath segments between nodes
    for (let seg = 0; seg < nodeCount - 1; seg++) {
      const x0 = nodeX[seg] + 2;
      const x1 = nodeX[seg + 1] - 2;
      for (let x = x0; x <= x1; x++) {
        // Upper and lower sheath walls
        if (axonY - 2 >= 0) g[axonY - 2][x] = "=";
        if (axonY + 2 < rows) g[axonY + 2][x] = "=";
        // Inner sheath lining
        if (axonY - 1 >= 0) g[axonY - 1][x] = "-";
        if (axonY + 1 < rows) g[axonY + 1][x] = "-";
        // Axon core (resting, quiet under myelin)
        g[axonY][x] = ".";
      }
    }

    // Draw nodes of Ranvier (gaps in the sheath — active sites)
    for (let n = 0; n < nodeCount; n++) {
      const nx = nodeX[n];
      // Node markers on axon
      if (nx >= 0 && nx < cols) {
        g[axonY][nx] = "|";
        if (axonY - 1 >= 0) g[axonY - 1][nx] = "|";
        if (axonY + 1 < rows) g[axonY + 1][nx] = "|";
        // Cap the sheath ends around the node
        if (nx - 1 >= 0 && axonY - 2 >= 0) g[axonY - 2][nx - 1] = ")";
        if (nx + 1 < cols && axonY - 2 >= 0) g[axonY - 2][nx + 1] = "(";
        if (nx - 1 >= 0 && axonY + 2 < rows) g[axonY + 2][nx - 1] = ")";
        if (nx + 1 < cols && axonY + 2 < rows) g[axonY + 2][nx + 1] = "(";
      }
    }

    // === Saltatory conduction: action potential leaps from node to node ===
    // The pulse travels at a steady rate, spending brief time at each node
    // Period: time to traverse all nodes + a rest pause
    const period = 3.6;
    const tMod = ((t % period) + period) % period;
    // tMod in [0, period): maps across nodeCount - 1 gaps
    const pulsePos = tMod / period * (nodeCount - 1 + 0.6) - 0.3;

    // For each node, compute its activation intensity
    for (let n = 0; n < nodeCount; n++) {
      const dist = pulsePos - n;
      // Sharp Gaussian-like peak as pulse arrives at this node
      const intensity = Math.exp(-dist * dist * 18);

      if (intensity > 0.08) {
        const nx = nodeX[n];
        // Action potential burst at node
        const chars = ["*", "O", "@", "O", "*"];
        const charIdx = Math.floor(intensity * (chars.length - 1));
        const ch = chars[Math.min(charIdx, chars.length - 1)];

        if (nx >= 0 && nx < cols) {
          g[axonY][nx] = ch;
          if (axonY - 1 >= 0) g[axonY - 1][nx] = intensity > 0.5 ? "@" : "o";
          if (axonY + 1 < rows) g[axonY + 1][nx] = intensity > 0.5 ? "@" : "o";
          if (axonY - 2 >= 0) g[axonY - 2][nx] = intensity > 0.7 ? "o" : ":";
          if (axonY + 2 < rows) g[axonY + 2][nx] = intensity > 0.7 ? "o" : ":";

          // Radiate outward sparks at peak
          if (intensity > 0.6) {
            const spread = Math.round(intensity * 3);
            for (let dy = -spread; dy <= spread; dy++) {
              const ry2 = axonY + dy;
              if (ry2 >= 0 && ry2 < rows && Math.abs(dy) === spread) {
                if (nx - 1 >= 0) g[ry2][nx - 1] = "'";
                if (nx + 1 < cols) g[ry2][nx + 1] = "'";
                g[ry2][nx] = ":";
              }
            }
          }
        }
      }
    }

    // Draw the "flying spark" between nodes (the saltatory jump in progress)
    // Only visible between nodes, not at a node
    const fracPart = pulsePos - Math.floor(pulsePos);
    const fromNode = Math.floor(pulsePos);
    if (fromNode >= 0 && fromNode < nodeCount - 1 && fracPart > 0.15 && fracPart < 0.85) {
      const x0 = nodeX[fromNode];
      const x1 = nodeX[fromNode + 1];
      const sparkX = Math.round(x0 + fracPart * (x1 - x0));
      const sparkBrightness = Math.sin(fracPart * Math.PI);
      const sparkChar = sparkBrightness > 0.7 ? "*" : (sparkBrightness > 0.4 ? "+" : ".");

      // Spark flies along upper edge of sheath (over the insulation)
      const sparkY = axonY - 3;
      if (sparkY >= 0 && sparkX >= 0 && sparkX < cols) {
        g[sparkY][sparkX] = sparkChar;
        if (sparkX - 1 >= 0) g[sparkY][sparkX - 1] = ".";
        if (sparkX + 1 < cols) g[sparkY][sparkX + 1] = ".";
      }
      // Mirror on lower edge
      const sparkY2 = axonY + 3;
      if (sparkY2 < rows && sparkX >= 0 && sparkX < cols) {
        g[sparkY2][sparkX] = sparkChar;
        if (sparkX - 1 >= 0) g[sparkY2][sparkX - 1] = ".";
        if (sparkX + 1 < cols) g[sparkY2][sparkX + 1] = ".";
      }
    }

    // Label lines (top and bottom context)
    // Resting potential ripple along the axon (slow membrane oscillation)
    const rippleT = t * 1.4;
    for (let x = axonStart; x <= axonEnd; x++) {
      const ripple = Math.sin(x * 0.35 - rippleT) * 0.5 + 0.5;
      // Only paint resting dots far from any active node
      let nearNode = false;
      for (let n = 0; n < nodeCount; n++) {
        if (Math.abs(x - nodeX[n]) <= 1) { nearNode = true; break; }
      }
      if (!nearNode && g[axonY][x] === ".") {
        g[axonY][x] = ripple > 0.85 ? ":" : ".";
      }
    }

    // Axon terminals at left (dendrite end marker) and right (synaptic end)
    if (axonStart - 1 >= 0) g[axonY][axonStart - 1] = "<";
    if (axonStart - 2 >= 0) g[axonY][axonStart - 2] = "<";
    if (axonEnd + 1 < cols) g[axonY][axonEnd + 1] = ">";
    if (axonEnd + 2 < cols) g[axonY][axonEnd + 2] = ">";

    return g.map((row) => row.join("")).join("\n");
  },
};
