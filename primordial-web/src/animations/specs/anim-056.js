export default {
  id: 56,
  system: "Paramecium hunting prey",
  title: "Paramecium Hunt",
  caption: "Cilia spiral the hunter forward; prey vanishes into the oral groove.",
  cols: 52,
  rows: 18,
  palette: "microbe",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Helper: safe grid write
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }

    // Helper: safe read
    function get(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // --- Paramecium body ---
    // The organism drifts in a slow spiral path across the field
    const bodySpeed = 0.18;
    const driftX = Math.cos(t * bodySpeed) * 10 + Math.sin(t * bodySpeed * 0.37) * 5;
    const driftY = Math.sin(t * bodySpeed * 0.71) * 5 + Math.cos(t * bodySpeed * 0.53) * 2;
    const bcx = cols / 2 + driftX;
    const bcy = rows / 2 + driftY;

    // Body orientation tilts as it swims
    const bodyAngle = t * bodySpeed + 0.5;
    const cosA = Math.cos(bodyAngle);
    const sinA = Math.sin(bodyAngle);

    // Body shape: elongated ellipse, long axis ~14 cols, short axis ~5 rows
    const bLong = 7.0, bShort = 2.6;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // Rotate into body frame
        const dx = x - bcx, dy = (y - bcy) * 1.9;
        const lx = dx * cosA + dy * sinA;
        const ly = -dx * sinA + dy * cosA;
        const r = Math.sqrt((lx / bLong) ** 2 + (ly / bShort) ** 2);

        if (r < 0.85) {
          // Interior cytoplasm — animated dots showing cytoplasmic streaming
          const phase = (x * 3 + y * 7 + Math.floor(t * 6)) % 13;
          g[y][x] = phase === 0 ? "o" : phase === 1 ? "." : " ";
        } else if (r < 1.0) {
          // Membrane
          g[y][x] = "0";
        } else if (r < 1.08) {
          // Outer membrane fringe
          g[y][x] = "O";
        }
      }
    }

    // Oral groove: a concave indent on the ventral side, animated to "swallow"
    const groovePhase = t * 1.1;
    const grooveDepth = 1.5 + 0.5 * Math.sin(groovePhase * 2);
    for (let k = -2; k <= 2; k++) {
      // Groove runs along the body's ventral (short-axis positive) side
      const gx = bcx - cosA * k * 0.9 + sinA * grooveDepth;
      const gy = bcy + sinA * k * 0.9 + cosA * grooveDepth;
      put(gx, gy, ">"); // oral groove marker
    }
    // Funnel into oral groove
    const funnelChar = (Math.floor(t * 4) % 3 === 0) ? ")" : (Math.floor(t * 4) % 3 === 1) ? ">" : "}";
    put(bcx + sinA * (grooveDepth + 0.5), bcy + cosA * (grooveDepth + 0.5), funnelChar);

    // --- Cilia: rows of beating hairs around the perimeter ---
    const ciliaCount = 22;
    const ciliaSpeed = t * 4.5;
    for (let i = 0; i < ciliaCount; i++) {
      const angle = (i / ciliaCount) * Math.PI * 2;
      // Surface point on ellipse
      const cosI = Math.cos(angle), sinI = Math.sin(angle);
      // Ellipse surface in body frame
      const surfLx = bLong * cosI, surfLy = bShort * sinI;
      // Back to world frame
      const sx = bcx + surfLx * cosA - surfLy * sinA;
      const sy = bcy + surfLx * sinA + surfLy * cosA;
      // Cilia tip: extends outward with a phase wave
      const ciliaPhase = (i / ciliaCount) * Math.PI * 6 - ciliaSpeed;
      const ciliaLen = 1.2 + 0.4 * Math.sin(ciliaPhase);
      const tx2 = sx + (surfLx / bLong) * cosA * ciliaLen - (surfLy / bShort) * sinA * ciliaLen;
      const ty2 = sy + (surfLx / bLong) * sinA * ciliaLen + (surfLy / bShort) * cosA * ciliaLen;

      const ciliaChar = Math.sin(ciliaPhase) > 0.3 ? "|" : Math.sin(ciliaPhase) < -0.3 ? "-" : "/";
      put(tx2, ty2, ciliaChar);
    }

    // --- Macronucleus: large bean-shaped nucleus inside body ---
    const nucX = bcx - cosA * 1.5;
    const nucY = bcy - sinA * 1.5;
    for (let dy2 = -1; dy2 <= 1; dy2++) {
      for (let dx2 = -2; dx2 <= 2; dx2++) {
        const r2 = Math.sqrt((dx2 / 2.0) ** 2 + (dy2 / 1.0) ** 2);
        if (r2 < 0.9) {
          const wx = nucX + dx2 * cosA - dy2 * sinA;
          const wy = nucY + dx2 * sinA + dy2 * cosA;
          put(wx, wy, "#");
        }
      }
    }

    // --- Prey bacteria: small rods drifting, fleeing, being captured ---
    const preyCount = 5;
    for (let p = 0; p < preyCount; p++) {
      // Each prey has its own orbit offset and flee response
      const pSeed = p * 2.7183;
      const pOrbit = 0.22 + p * 0.055;
      const pSpeed = 0.13 + p * 0.031;
      const pPhaseX = pSeed;
      const pPhaseY = pSeed * 1.618;

      // Base wandering position
      let px = (cols * 0.15) + (cols * 0.7) * ((Math.sin(t * pSpeed + pPhaseX) * 0.5 + 0.5));
      let py = (rows * 0.1) + (rows * 0.8) * ((Math.cos(t * pSpeed * 0.83 + pPhaseY) * 0.5 + 0.5));

      // Distance from paramecium
      const distX = px - bcx, distY = (py - bcy) * 1.9;
      const dist = Math.sqrt(distX * distX + distY * distY);

      // If close, flee away from oral groove side
      if (dist < 10) {
        const fleeFactor = (10 - dist) / 10 * 1.5;
        px += (distX / (dist + 0.01)) * fleeFactor;
        py += (distY / (dist + 0.01)) * fleeFactor * 0.5;
      }

      // Check if prey is in capture zone (near oral groove)
      const grX = bcx + sinA * grooveDepth;
      const grY = bcy + cosA * grooveDepth;
      const captureDist = Math.sqrt((px - grX) ** 2 + ((py - grY) * 1.9) ** 2);

      if (captureDist < 2.5) {
        // Being ingested — spiral inward
        const ingestPhase = t * 8 + p;
        const shrink = Math.max(0, 1 - (2.5 - captureDist) / 2.5);
        const ix = grX + Math.cos(ingestPhase) * shrink * 0.8;
        const iy = grY + Math.sin(ingestPhase) * shrink * 0.4;
        put(ix, iy, "*");
      } else if (dist < bLong * 1.1) {
        // Too close — skip rendering (already inside body)
      } else {
        // Freely swimming prey rod (bacillus shape)
        const preyAngle = Math.atan2(distY, distX) + Math.PI + 0.3 * Math.sin(t * 2 + pSeed);
        const ch1 = "-";
        const ch2 = "=";
        put(px, py, ch2);
        put(px + Math.cos(preyAngle) * 0.8, py + Math.sin(preyAngle) * 0.4, ch1);
        put(px - Math.cos(preyAngle) * 0.8, py - Math.sin(preyAngle) * 0.4, ch1);
      }
    }

    // --- Food vacuole trail: small dots inside body showing digested prey ---
    const vacuoleCount = 3;
    for (let v = 0; v < vacuoleCount; v++) {
      const vPhase = t * 0.4 + v * 2.1;
      const vAngle = vPhase;
      const vR = 0.45 + 0.2 * Math.sin(vPhase * 1.3);
      const vx = bcx + Math.cos(vAngle) * bLong * vR * cosA - Math.sin(vAngle) * bShort * vR * sinA;
      const vy = bcy + Math.cos(vAngle) * bLong * vR * sinA + Math.sin(vAngle) * bShort * vR * cosA;
      const vxi = Math.round(vx), vyi = Math.round(vy);
      if (vxi >= 0 && vxi < cols && vyi >= 0 && vyi < rows) {
        if (g[vyi][vxi] !== "0" && g[vyi][vxi] !== "O" && g[vyi][vxi] !== "#") {
          g[vyi][vxi] = (v % 2 === 0) ? "o" : "*";
        }
      }
    }

    // Pad each row to exact cols width
    return g.map(row => {
      const s = row.join("");
      return s.length >= cols ? s.slice(0, cols) : s.padEnd(cols, " ");
    }).join("\n");
  }
};
