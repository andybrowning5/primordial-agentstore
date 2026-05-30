export default {
  id: 62,
  system: "Osmotic lysis (a cell bursting)",
  title: "Osmotic Lysis",
  caption: "Water floods in, membrane strains, then the cell tears apart.",
  cols: 52,
  rows: 18,
  palette: "membrane",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cy = rows / 2 - 0.5;
    const cx = cols / 2;

    // Full cycle: 0..1  (period = 7 seconds)
    const period = 7;
    const phase = (t % period) / period; // 0..1

    // ---------- helpers ----------
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }

    function ellipseEdge(cx_, cy_, rx, ry, segs, charFn) {
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const x = cx_ + Math.cos(a) * rx;
        const y = cy_ + Math.sin(a) * ry;
        put(x, y, charFn(a, i));
      }
    }

    if (phase < 0.55) {
      // ---- PHASE 1: swelling (0..0.55) ----
      const sw = phase / 0.55; // 0..1 swell progress

      // Cell swells: radius grows and becomes rounder (more circular under pressure)
      const baseRx = cols * 0.14;
      const baseRy = rows * 0.30;
      const swellFactor = 1 + sw * 0.55;
      const rx = baseRx * swellFactor;
      const ry = baseRy * swellFactor * (1 - sw * 0.18); // becomes more circular

      // Subtle wobble increasing with pressure
      const wobbleAmp = sw * 0.08;
      const wobbleFreq = 3;

      const segs = 120;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const wobble = 1 + wobbleAmp * Math.sin(wobbleFreq * a + t * 4);
        const x = cx + Math.cos(a) * rx * wobble;
        const y = cy + Math.sin(a) * ry * wobble;
        // Membrane char: thickens/distorts under pressure
        let ch;
        if (sw > 0.7) {
          ch = (Math.floor(a * 6 + t * 3) % 5 === 0) ? "0" : "@";
        } else {
          ch = "@";
        }
        put(x, y, ch);
      }

      // Interior organelles / cytoplasm dots
      const density = Math.floor(6 + sw * 14);
      for (let k = 0; k < density; k++) {
        const ka = (k / density) * Math.PI * 2 + t * 0.3;
        const kr = (k % 3 === 0 ? 0.55 : k % 3 === 1 ? 0.30 : 0.70) * Math.min(rx, ry) * 0.85;
        const kx = cx + Math.cos(ka) * kr * (rx / Math.min(rx, ry));
        const ky = cy + Math.sin(ka) * kr * (ry / Math.min(rx, ry));
        const kch = (k % 4 === 0) ? "o" : (k % 4 === 1) ? "*" : (k % 4 === 2) ? ":" : ".";
        put(kx, ky, kch);
      }

      // Nucleus (center circle)
      const nr = 1.8 + sw * 0.4;
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        put(cx + Math.cos(a) * nr * 1.6, cy + Math.sin(a) * nr * 0.8, "o");
      }
      put(cx, cy, "O");

      // Water molecules rushing in (dots outside near membrane, increasing)
      if (sw > 0.2) {
        const wCount = Math.floor((sw - 0.2) / 0.8 * 20);
        for (let w = 0; w < wCount; w++) {
          const wa = ((w / wCount) * Math.PI * 2 + t * 1.5);
          const wDist = rx + 1.5 + (Math.sin(w * 7.3 + t * 2) * 0.5 + 0.5) * 2.5;
          const wx = cx + Math.cos(wa) * wDist;
          const wy = cy + Math.sin(wa) * wDist * (ry / rx);
          put(wx, wy, "~");
        }
      }

    } else if (phase < 0.65) {
      // ---- PHASE 2: rupture (0.55..0.65) ----
      const rp = (phase - 0.55) / 0.10; // 0..1 rupture progress

      const rx = cols * 0.14 * 1.55;
      const ry = rows * 0.30 * 1.37;

      // Draw distorted/torn membrane
      const segs = 120;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        // Tear opens: gaps appear and widen
        const tearAngle1 = 0.3, tearAngle2 = Math.PI + 0.2;
        const isTear1 = Math.abs((a % (Math.PI * 2)) - tearAngle1) < rp * 0.5;
        const isTear2 = Math.abs((a % (Math.PI * 2)) - tearAngle2) < rp * 0.4;
        if (isTear1 || isTear2) continue;

        const jagged = 1 + (Math.random() < 0.3 ? (Math.random() - 0.5) * rp * 0.3 : 0);
        const x = cx + Math.cos(a) * rx * jagged;
        const y = cy + Math.sin(a) * ry * jagged;
        const ch = (Math.floor(a * 8 + t * 5) % 4 === 0) ? "%" : "#";
        put(x, y, ch);
      }

      // Tear point markers — jagged edges
      const tearPts = [0.3, Math.PI + 0.2];
      for (const ta of tearPts) {
        for (let d = -3; d <= 3; d++) {
          const a = ta + d * 0.04;
          const outer = 1 + rp * 0.25;
          put(cx + Math.cos(a) * rx * outer, cy + Math.sin(a) * ry * outer, (d % 2 === 0) ? "/" : "\\");
          put(cx + Math.cos(a) * rx * 0.75, cy + Math.sin(a) * ry * 0.75, "*");
        }
      }

      // Interior still visible, starting to leak
      for (let k = 0; k < 8; k++) {
        const ka = (k / 8) * Math.PI * 2 + t * 0.3;
        const kr = 0.4 * Math.min(rx, ry);
        put(cx + Math.cos(ka) * kr * (rx / Math.min(rx, ry)) * 0.5,
            cy + Math.sin(ka) * kr * (ry / Math.min(rx, ry)) * 0.5, "o");
      }
      put(cx, cy, "O");

    } else {
      // ---- PHASE 3: explosion / scatter (0.65..1.0) ----
      const ep = (phase - 0.65) / 0.35; // 0..1 explosion progress
      const fadeIn = Math.min(ep * 3, 1);

      // Membrane fragments fly outward
      const fragCount = 16;
      for (let f = 0; f < fragCount; f++) {
        const baseAngle = (f / fragCount) * Math.PI * 2;
        const speed = 0.6 + (f % 3) * 0.25;
        const dist = ep * speed * cols * 0.38;
        const wobble = Math.sin(baseAngle * 3 + t * 2) * ep * 1.2;
        const fx = cx + Math.cos(baseAngle + wobble * 0.1) * dist;
        const fy = cy + Math.sin(baseAngle + wobble * 0.1) * dist * 0.7;
        const fragCh = (f % 4 === 0) ? "#" : (f % 4 === 1) ? "%" : (f % 4 === 2) ? "@" : "&";
        put(fx, fy, fragCh);
        // Small trailing debris
        if (dist > 2) {
          put(fx - Math.cos(baseAngle) * 1.5, fy - Math.sin(baseAngle) * 1.0, ":");
          put(fx - Math.cos(baseAngle) * 3.0, fy - Math.sin(baseAngle) * 2.0, ".");
        }
      }

      // Cytoplasm splash — radial streams
      const streamCount = 24;
      for (let s2 = 0; s2 < streamCount; s2++) {
        const sa = (s2 / streamCount) * Math.PI * 2 + 0.13;
        const sLen = ep * cols * 0.30 * (0.5 + (s2 % 5) * 0.12);
        const steps = Math.floor(sLen * 0.7);
        for (let step = 0; step < steps; step++) {
          const frac = step / steps;
          const sx = cx + Math.cos(sa) * sLen * frac;
          const sy = cy + Math.sin(sa) * sLen * frac * 0.7;
          const sch = (frac < 0.3) ? "~" : (frac < 0.6) ? "." : " ";
          if (sch !== " ") put(sx, sy, sch);
        }
      }

      // Organelle debris scattered
      const orgCount = 12;
      for (let o = 0; o < orgCount; o++) {
        const oa = (o / orgCount) * Math.PI * 2 + Math.sin(o) * 0.5;
        const od = ep * cols * 0.20 * (0.4 + (o % 4) * 0.18);
        const ox = cx + Math.cos(oa) * od;
        const oy = cy + Math.sin(oa) * od * 0.75;
        put(ox, oy, (o % 3 === 0) ? "o" : (o % 3 === 1) ? "*" : ":");
      }

      // Nucleus fragment (lingers in center briefly then flies)
      const nd = ep * cols * 0.12;
      const na = t * 0.4;
      put(cx + Math.cos(na) * nd, cy + Math.sin(na) * nd * 0.7,
          ep < 0.5 ? "O" : "o");

      // Silence at center as ep -> 1 (nothing left)
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
