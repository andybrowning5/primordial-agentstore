export default {
  id: 49,
  system: "Calvin cycle",
  title: "Carbon Fixation",
  caption: "CO₂ enters the chloroplast wheel, reborn as living sugar.",
  cols: 52,
  rows: 18,
  palette: "photosynth",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }

    const cx = cols / 2, cy = rows / 2;
    const rx = cols * 0.30, ry = rows * 0.38;

    // Number of cycle nodes
    const N = 8;
    // Slowly rotate the whole cycle
    const spin = t * 0.35;

    // Draw the elliptical cycle track (dotted ring)
    const trackSteps = 120;
    for (let i = 0; i < trackSteps; i++) {
      const a = (i / trackSteps) * Math.PI * 2;
      const x = cx + rx * Math.cos(a);
      const y = cy + ry * Math.sin(a);
      const ch = (i % 4 === 0) ? "." : " ";
      put(x, y, ch);
    }

    // Cycle node labels (the key metabolites)
    const labels = ["RuBP", "3-PGA", "1,3BPG", "G3P", "G3P*", "DHAP", "FBP", "Ru5P"];
    const nodeAngles = labels.map((_, i) => (i / N) * Math.PI * 2 + spin);

    // Draw flow arrows moving along the track
    const arrowCount = N;
    for (let i = 0; i < arrowCount; i++) {
      // Arrow travels between node i and node i+1
      const a0 = nodeAngles[i];
      const a1 = nodeAngles[(i + 1) % N];
      // Interpolate with t-based progress
      const progress = ((t * 0.5) % 1);
      const a = a0 + ((a1 - a0 + Math.PI * 2) % (Math.PI * 2)) * progress;
      const x = cx + rx * Math.cos(a);
      const y = cy + ry * Math.sin(a);
      // Arrow character based on direction
      const da = ((a1 - a0 + Math.PI * 2) % (Math.PI * 2));
      const midA = a0 + da * 0.5;
      const tangentAngle = midA + Math.PI / 2;
      const tx = Math.cos(tangentAngle), ty = Math.sin(tangentAngle);
      let arrowCh = ">";
      if (Math.abs(tx) < Math.abs(ty)) arrowCh = ty > 0 ? "v" : "^";
      else arrowCh = tx > 0 ? ">" : "<";
      put(x, y, arrowCh);
    }

    // Draw nodes
    for (let i = 0; i < N; i++) {
      const a = nodeAngles[i];
      const nx = cx + rx * Math.cos(a);
      const ny = cy + ry * Math.sin(a);
      // Pulse size
      const pulse = Math.sin(t * 1.4 + i * 0.8) * 0.5 + 0.5;
      const nodeChar = pulse > 0.6 ? "O" : "o";
      put(nx, ny, nodeChar);
      // Label (short, placed just outside the ring)
      const lx = cx + (rx + 2.5) * Math.cos(a);
      const ly = cy + (ry + 1.0) * Math.sin(a);
      const lbl = labels[i];
      const lxi = Math.round(lx) - Math.floor(lbl.length / 2);
      const lyi = Math.round(ly);
      if (lyi >= 0 && lyi < rows) {
        for (let k = 0; k < lbl.length; k++) {
          const xi = lxi + k;
          if (xi >= 0 && xi < cols) g[lyi][xi] = lbl[k];
        }
      }
    }

    // CO2 molecules drifting inward toward top of cycle
    const co2Count = 3;
    for (let i = 0; i < co2Count; i++) {
      const phase = (t * 0.6 + i * (1.0 / co2Count)) % 1.0;
      // Travel from top-left toward the RuBP node (first node, angle=spin)
      const targetA = spin; // RuBP
      const tx2 = cx + rx * Math.cos(targetA);
      const ty2 = cy + ry * Math.sin(targetA);
      const startX = 2 + i * 5;
      const startY = 1;
      const x = startX + (tx2 - startX) * phase;
      const y = startY + (ty2 - startY) * phase;
      if (phase < 0.85) {
        put(x, y, "C");
        put(x + 1, y, "O");
        put(x + 2, y, "2");
      }
    }

    // G3P sugar product leaving toward bottom-right
    const g3pCount = 2;
    for (let i = 0; i < g3pCount; i++) {
      const phase = (t * 0.5 + i * 0.5) % 1.0;
      // Leave from G3P node (index 3)
      const srcA = nodeAngles[3];
      const sx = cx + rx * Math.cos(srcA);
      const sy = cy + ry * Math.sin(srcA);
      const endX = cols - 4 - i * 3;
      const endY = rows - 2;
      const x = sx + (endX - sx) * phase;
      const y = sy + (endY - sy) * phase;
      if (phase > 0.1) {
        put(x, y, "G");
        put(x + 1, y, "3");
        put(x + 2, y, "P");
      }
    }

    // ATP/NADPH energy pulses entering from left side (fueling 3-PGA -> G3P steps)
    const energyCount = 4;
    for (let i = 0; i < energyCount; i++) {
      const phase = (t * 0.7 + i * 0.25) % 1.0;
      const targetA = nodeAngles[1 + (i % 2)]; // nodes 1,2 (3-PGA, 1,3BPG)
      const tx3 = cx + rx * Math.cos(targetA);
      const ty3 = cy + ry * Math.sin(targetA);
      const startX = 0;
      const startY = rows * 0.3 + i * 1.5;
      const x = startX + (tx3 - startX) * phase;
      const y = startY + (ty3 - startY) * phase;
      const ch = (Math.floor(t * 3 + i) % 2 === 0) ? "~" : "*";
      if (phase < 0.9) put(x, y, ch);
    }

    // Center label
    const centerLabel = "CALVIN";
    const clx = Math.round(cx) - Math.floor(centerLabel.length / 2);
    const cly = Math.round(cy);
    if (cly >= 0 && cly < rows) {
      for (let k = 0; k < centerLabel.length; k++) {
        const xi = clx + k;
        if (xi >= 0 && xi < cols && g[cly][xi] === " ") g[cly][xi] = centerLabel[k];
      }
    }
    const cycleLabel = "CYCLE";
    const clx2 = Math.round(cx) - Math.floor(cycleLabel.length / 2);
    const cly2 = cly + 1;
    if (cly2 >= 0 && cly2 < rows) {
      for (let k = 0; k < cycleLabel.length; k++) {
        const xi = clx2 + k;
        if (xi >= 0 && xi < cols && g[cly2][xi] === " ") g[cly2][xi] = cycleLabel[k];
      }
    }

    return g.map(row => row.join("")).join("\n");
  }
};
