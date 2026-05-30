export default {
  id: 20,
  system: "ATP synthase rotor",
  title: "ATP Synthase Rotor",
  caption: "A proton torrent spins the c-ring, forging ATP from chaos.",
  cols: 50,
  rows: 18,
  palette: "energy",
  frame(t) {
    const cols = 50, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cx = Math.floor(cols / 2);
    const memY = Math.floor(rows * 0.58); // membrane midline row

    // --- Membrane bilayer (rows memY-1 and memY+1) ---
    for (let x = 2; x < cols - 2; x++) {
      if (g[memY - 1]) g[memY - 1][x] = "=";
      if (g[memY + 1]) g[memY + 1][x] = "=";
    }
    // membrane gap row (center of bilayer)
    for (let x = 2; x < cols - 2; x++) {
      g[memY][x] = "-";
    }

    // --- F0 c-ring rotor (spins in membrane plane, shown as ring around cx,memY) ---
    const rotorR = 7;       // radius of c-ring in char units (x scaled)
    const rotSpeed = t * 1.1; // rotation speed
    const numSubunits = 10;  // c-ring subunits
    for (let i = 0; i < numSubunits; i++) {
      const angle = rotSpeed + (i / numSubunits) * Math.PI * 2;
      // project onto ellipse: x stretched, y compressed to 1 row
      const px = Math.round(cx + rotorR * 1.9 * Math.cos(angle));
      const py = memY; // all in membrane plane
      if (px >= 0 && px < cols) {
        // alternate chars around the ring for texture
        const ch = (i % 2 === 0) ? "O" : "o";
        g[py][px] = ch;
      }
    }

    // --- Central stalk (connects F0 to F1, rotates with rotor) ---
    // stalk runs from membrane up to F1 head
    const stalkTop = 3;
    const stalkBot = memY - 1;
    for (let y = stalkTop; y <= stalkBot; y++) {
      // slight wobble from rotation
      const wobble = Math.round(Math.sin(rotSpeed + y * 0.5) * 0.8);
      const sx = cx + wobble;
      if (sx >= 0 && sx < cols) {
        g[y][sx] = "|";
      }
    }

    // --- F1 catalytic head (alpha3/beta3 hexamer, sits above membrane) ---
    const f1CY = 2; // top center of F1 head
    const f1RX = 9; // half-width
    const f1RY = 2.5; // half-height (in rows)
    // Draw the hexamer outline as 6 subunit blobs
    for (let sub = 0; sub < 6; sub++) {
      const subAngle = (sub / 6) * Math.PI * 2 + rotSpeed * 0.0; // stator doesn't rotate
      const bx = Math.round(cx + f1RX * 1.0 * Math.cos(subAngle));
      const by = Math.round(f1CY + f1RY * Math.sin(subAngle));
      if (by >= 0 && by < rows && bx >= 0 && bx < cols) {
        // alpha vs beta subunit
        const isAlpha = (sub % 2 === 0);
        g[by][bx] = isAlpha ? "@" : "0";
        // fill neighbors slightly
        const nx = bx + (bx < cx ? 1 : bx > cx ? -1 : 0);
        if (nx >= 0 && nx < cols && g[by][nx] === " ") g[by][nx] = isAlpha ? "(" : ")";
      }
    }

    // --- ATP release pulses: small dots that fly upward from F1 on each 1/3 revolution ---
    // Each ATP pulse spawns at one of 3 beta subunits
    for (let site = 0; site < 3; site++) {
      const cycleLen = (Math.PI * 2) / (1.1); // one full rotation period
      const siteOffset = (site / 3) * cycleLen;
      const phase = ((t + siteOffset) % cycleLen) / cycleLen; // 0..1 per cycle
      if (phase < 0.35) {
        // pulse travels upward from F1 head
        const subAngle = (site * 2 / 6) * Math.PI * 2; // beta subunit positions
        const originX = Math.round(cx + f1RX * Math.cos(subAngle));
        const originY = Math.round(f1CY + f1RY * Math.sin(subAngle));
        const travelY = originY - Math.round(phase * 4);
        const travelX = originX + Math.round(Math.sin(phase * Math.PI * 3) * 1.5);
        if (travelY >= 0 && travelY < rows && travelX >= 0 && travelX < cols) {
          g[travelY][travelX] = phase < 0.15 ? "*" : ".";
        }
      }
    }

    // --- Proton flow: dots moving through the c-ring (downward into matrix) ---
    const numProtons = 5;
    for (let p = 0; p < numProtons; p++) {
      const pPhase = ((t * 0.8 + p * (1 / numProtons)) % 1);
      // protons enter from top of membrane and exit below
      const entryAngle = (p / numProtons) * Math.PI * 2 + rotSpeed;
      const ex = Math.round(cx + (rotorR + 3) * 1.6 * Math.cos(entryAngle));
      // travel from above membrane to below
      const ey = Math.round(memY - 2 + pPhase * 5);
      if (ey >= 0 && ey < rows && ex >= 0 && ex < cols && g[ey][ex] === " ") {
        g[ey][ex] = pPhase < 0.3 ? "+" : ":";
      }
    }

    // --- b-subunit stator arm (peripheral stalk, static vertical bar on right) ---
    const statorX = cx + 10;
    if (statorX < cols - 1) {
      for (let y = 1; y <= memY - 1; y++) {
        if (g[y][statorX] === " ") g[y][statorX] = "|";
        if (g[y][statorX - 1] === " ") g[y][statorX - 1] = " ";
      }
      // delta subunit connector at top
      if (g[1][statorX] !== undefined) g[1][statorX] = "#";
    }

    // --- Rotor torque indicator: arc sweeping below membrane ---
    const arcR = 4;
    const arcAngleStart = rotSpeed;
    const arcLen = Math.PI * 0.6;
    for (let step = 0; step <= 12; step++) {
      const a = arcAngleStart + (step / 12) * arcLen;
      const ax = Math.round(cx + arcR * 2.0 * Math.cos(a));
      const ay = Math.round(memY + 2 + arcR * 0.6 * Math.sin(a));
      if (ay >= 0 && ay < rows && ax >= 0 && ax < cols && g[ay][ax] === " ") {
        g[ay][ax] = step === 12 ? ">" : "~";
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
