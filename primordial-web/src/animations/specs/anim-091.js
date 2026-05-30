export default {
  id: 91,
  system: "Kidney nephron filtration",
  title: "Nephron Filtration",
  caption: "Glomerulus wrings plasma clean; solutes race the tubule home.",
  cols: 54,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 54, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    function set(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function get(x, y) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) return g[yi][xi];
      return " ";
    }

    // --- Glomerulus (capillary ball) on the left, col 7..17, row 4..13 ---
    const gcx = 12, gcy = 9;
    const gr = 4.2;
    // Draw glomerulus outer shell
    for (let a = 0; a < 200; a++) {
      const angle = (a / 200) * Math.PI * 2;
      const rx = gr * 1.15, ry = gr * 0.85;
      const x = gcx + Math.cos(angle) * rx;
      const y = gcy + Math.sin(angle) * ry;
      set(x, y, "O");
    }
    // Inner capillary coils — pulsing
    const pulse = Math.sin(t * 2.1) * 0.3 + 0.7;
    for (let a = 0; a < 160; a++) {
      const angle = (a / 160) * Math.PI * 2;
      const coilR = (gr * 0.55 + Math.sin(angle * 3 + t * 2.5) * 0.6) * pulse;
      const x = gcx + Math.cos(angle) * coilR * 1.1;
      const y = gcy + Math.sin(angle) * coilR * 0.82;
      const ch = ["+", "x", "o", "*"][(a + Math.floor(t * 4)) % 4];
      set(x, y, ch);
    }
    // Glomerulus label dot
    set(gcx, gcy, "@");

    // --- Afferent arteriole (blood in, top-left) ---
    for (let i = 0; i < 6; i++) {
      const prog = i / 5;
      const x = Math.round(1 + prog * 6);
      const y = Math.round(4 - prog * 0.5);
      set(x, y, "=");
    }
    // Blood flow droplets on afferent
    for (let d = 0; d < 2; d++) {
      const phase = ((t * 0.9 + d * 0.5) % 1);
      const x = Math.round(1 + phase * 6);
      const y = Math.round(4 - phase * 0.5);
      set(x, y, ">");
    }

    // --- Efferent arteriole (blood out, bottom-left) ---
    for (let i = 0; i < 6; i++) {
      const prog = i / 5;
      const x = Math.round(1 + prog * 6);
      const y = Math.round(14 + prog * 0.5);
      set(x, y, "=");
    }
    // Blood flow on efferent
    for (let d = 0; d < 2; d++) {
      const phase = ((t * 0.7 + d * 0.5) % 1);
      const x = Math.round(7 - phase * 6);
      const y = Math.round(14 + (1 - phase) * 0.5);
      set(x, y, "<");
    }

    // --- Bowman's capsule collar around glomerulus ---
    for (let a = 0; a < 220; a++) {
      const angle = (a / 220) * Math.PI * 2;
      const rx = gr * 1.45, ry = gr * 1.15;
      const x = gcx + Math.cos(angle) * rx;
      const y = gcy + Math.sin(angle) * ry;
      if (get(x, y) === " ") set(x, y, ".");
    }

    // --- Filtrate flows from Bowman's capsule into proximal tubule ---
    // Proximal tubule: horizontal from col 19 to col 36, row 3..5 (U-bend going down)
    // Top arm: row 2, col 18..36
    for (let x = 18; x <= 36; x++) set(x, 2, "-");
    set(18, 2, "("); set(36, 2, "+");
    set(18, 3, "|"); set(36, 3, "|");
    // Right bend down col 36, rows 2..6
    for (let y = 2; y <= 7; y++) set(36, y, "|");
    set(36, 7, "+");
    // Bottom arm: row 7, col 20..36
    for (let x = 20; x <= 36; x++) if (get(x, 7) === " " || get(x, 7) === "|") set(x, 7, "-");
    set(20, 7, "+");
    // Left bend col 20, rows 7..11
    for (let y = 7; y <= 11; y++) set(20, y, "|");
    set(20, 11, "+");
    // Loop of Henle bottom: row 11, col 20..38
    for (let x = 20; x <= 38; x++) set(x, 11, "-");
    set(38, 11, "+");
    // Right arm loop, col 38, rows 11..7
    for (let y = 7; y <= 11; y++) set(38, y, "|");
    set(38, 7, "+");
    // Distal tubule: row 7 col 38..52
    for (let x = 38; x <= 52; x++) set(x, 7, "-");
    set(52, 7, "+");
    // Collecting duct: col 52, rows 7..16
    for (let y = 7; y <= 16; y++) set(52, y, "|");
    set(52, 16, "v");

    // --- Filtrate particles flowing through tubule ---
    // Animate small particles along the tubule path segments
    // Segment 1: top arm row 2, col 18..36 (left to right)
    for (let d = 0; d < 3; d++) {
      const phase = ((t * 0.8 + d * 0.33) % 1);
      const x = Math.round(18 + phase * 18);
      set(x, 2, "o");
    }
    // Segment 2: right side col 36, row 2..7 (top to bottom)
    for (let d = 0; d < 2; d++) {
      const phase = ((t * 0.8 + d * 0.5) % 1);
      const y = Math.round(2 + phase * 5);
      set(36, y, "o");
    }
    // Segment 3: row 7, col 20..36 (right to left)
    for (let d = 0; d < 3; d++) {
      const phase = ((t * 0.8 + d * 0.33) % 1);
      const x = Math.round(36 - phase * 16);
      set(x, 7, "o");
    }
    // Segment 4: left col 20, rows 7..11 (down)
    for (let d = 0; d < 2; d++) {
      const phase = ((t * 0.8 + d * 0.5) % 1);
      const y = Math.round(7 + phase * 4);
      set(20, y, "o");
    }
    // Segment 5: row 11, col 20..38 (right)
    for (let d = 0; d < 3; d++) {
      const phase = ((t * 0.8 + d * 0.33) % 1);
      const x = Math.round(20 + phase * 18);
      set(x, 11, "*");
    }
    // Segment 6: col 38, rows 11..7 (up, ascending limb — solutes being reclaimed)
    for (let d = 0; d < 2; d++) {
      const phase = ((t * 0.8 + d * 0.5) % 1);
      const y = Math.round(11 - phase * 4);
      set(38, y, ":");
    }
    // Segment 7: distal tubule row 7, col 38..52 (right)
    for (let d = 0; d < 3; d++) {
      const phase = ((t * 0.8 + d * 0.33) % 1);
      const x = Math.round(38 + phase * 14);
      set(x, 7, ".");
    }
    // Segment 8: collecting duct col 52, rows 7..16 (down to urine)
    for (let d = 0; d < 3; d++) {
      const phase = ((t * 0.8 + d * 0.33) % 1);
      const y = Math.round(7 + phase * 9);
      set(52, y, "!");
    }

    // --- Reabsorption arrows: solutes leaving tubule into interstitium ---
    // Arrows pointing left from proximal tubule walls
    const raT = (t * 1.1) % 1;
    for (let i = 0; i < 4; i++) {
      const baseX = 22 + i * 4;
      const show = ((t * 1.1 + i * 0.25) % 1) < 0.5;
      if (show) {
        const arrowX = baseX - Math.floor(raT * 2);
        if (arrowX >= 18 && arrowX < cols) set(arrowX, 4, "<");
      }
    }
    // Arrows pointing right from loop (countercurrent exchange)
    for (let i = 0; i < 3; i++) {
      const baseX = 24 + i * 5;
      const show = ((t * 1.0 + i * 0.33) % 1) < 0.5;
      if (show) {
        const arrowX = baseX + Math.floor(raT * 2);
        if (arrowX >= 0 && arrowX < cols) set(arrowX, 9, "~");
      }
    }

    // --- Waste/urea droplets appearing near collecting duct bottom ---
    for (let d = 0; d < 2; d++) {
      const phase = ((t * 0.5 + d * 0.5) % 1);
      if (phase > 0.8) {
        const x = 50 + d;
        const y = 16;
        set(x, y, "u");
      }
    }

    // --- Labels (static, short) ---
    // "G" for glomerulus center already has "@"
    // Bowman's arrow from glomerulus to tubule
    set(17, 5, ">"); set(17, 4, "^");

    // Interstitium background gradient dots (sparse)
    for (let y = 4; y <= 14; y++) {
      for (let x = 22; x <= 50; x++) {
        if ((x * 3 + y * 7) % 23 === 0 && get(x, y) === " ") {
          const ripple = Math.sin(t * 1.3 + x * 0.4 + y * 0.5);
          set(x, y, ripple > 0.85 ? "'" : " ");
        }
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
