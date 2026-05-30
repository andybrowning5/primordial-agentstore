export default {
  id: 25,
  system: "Cytotoxic T-cell attack",
  title: "T-Cell Kill Shot",
  caption: "A killer cell locks on, punches holes, and watches the target dissolve.",
  cols: 54,
  rows: 18,
  palette: "immune",
  frame(t) {
    const cols = 54, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Phase drives the whole narrative: 0=approach, 1=synapse, 2=lysis, loops ~20s
    const phase = (t % 20) / 20; // 0..1

    // ── helper: clamp index ──────────────────────────────────────────────────
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }
    function putSafe(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows && g[yi][xi] === " ") g[yi][xi] = ch;
    }

    // ── draw an elliptical cell outline ─────────────────────────────────────
    function drawCell(cx, cy, rx, ry, outerCh, midCh, innerCh, damage) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          const r = Math.sqrt(dx * dx + dy * dy);
          // damage creates holes in the membrane: sine wave of angular gaps
          const angle = Math.atan2(dy, dx);
          const holePattern = damage > 0
            ? Math.sin(angle * 5 + t * 3) * 0.5 + 0.5
            : 1;
          const holed = damage > 0 && holePattern < damage;

          const edge = Math.abs(r - 1.0);
          if (!holed && edge < 0.09) {
            g[y][x] = outerCh;
          } else if (!holed && edge < 0.18 && g[y][x] === " ") {
            g[y][x] = midCh;
          } else if (r < 0.85 && g[y][x] === " ") {
            // interior organelles — sparse, deterministic noise
            const hash = (Math.floor(x * 17 + y * 31 + t * 4) % 23);
            if (hash === 0) g[y][x] = innerCh;
          }
        }
      }
    }

    // ── draw T-cell receptor spikes ──────────────────────────────────────────
    function drawSpikes(cx, cy, rx, ry, spikeLen, side) {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const bx = cx + Math.cos(angle) * rx;
        const by = cy + Math.sin(angle) * ry;
        // Only draw spikes on the side facing the target
        const facingTarget = side === "right"
          ? Math.cos(angle) > 0
          : Math.cos(angle) < 0;
        if (!facingTarget) continue;
        const ex = bx + Math.cos(angle) * spikeLen;
        const ey = by + Math.sin(angle) * spikeLen;
        // Draw a short line from bx,by toward ex,ey
        for (let s = 0; s <= 3; s++) {
          const frac = s / 3;
          const px = bx + (ex - bx) * frac;
          const py = by + (ey - by) * frac;
          putSafe(px, py, s === 3 ? "^" : "|");
        }
      }
    }

    // ── draw perforin projectiles ────────────────────────────────────────────
    function drawPerforin(tcx, tcy, targetCx, targetCy, progress) {
      if (progress <= 0) return;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const offset = (i - (n - 1) / 2) * 1.8;
        const startX = tcx + (targetCx > tcx ? 5 : -5);
        const startY = tcy + offset * 0.5;
        const endX = targetCx + (targetCx > tcx ? -4 : 4);
        const endY = tcy + offset * 0.5;
        // Animate each projectile along the path
        const delay = i * 0.12;
        const localP = Math.max(0, Math.min(1, progress * 1.4 - delay));
        if (localP <= 0) continue;
        const px = startX + (endX - startX) * localP;
        const py = startY + (endY - startY) * localP;
        // Trail
        for (let tr = 1; tr <= 3; tr++) {
          const tp = Math.max(0, localP - tr * 0.08);
          const tx2 = startX + (endX - startX) * tp;
          const ty2 = startY + (endY - startY) * tp;
          putSafe(tx2, ty2, tr === 1 ? "." : " ");
        }
        put(px, py, "o");
      }
    }

    // ── draw contact/synapse arc ─────────────────────────────────────────────
    function drawSynapse(x, cy, strength) {
      if (strength <= 0) return;
      const halfH = Math.round(strength * 3.5);
      for (let dy = -halfH; dy <= halfH; dy++) {
        const yi = Math.round(cy + dy);
        if (yi < 0 || yi >= rows) continue;
        const ch = Math.abs(dy) <= 1 ? "=" : (Math.abs(dy) <= 2 ? "-" : "~");
        putSafe(x, yi, ch);
        putSafe(x + (x > cols / 2 ? -1 : 1), yi, ch);
      }
    }

    // ── draw apoptosis particles (target disintegrating) ────────────────────
    function drawApoptosis(cx, cy, rx, ry, progress) {
      if (progress <= 0) return;
      const n = 12;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const speed = 0.6 + (i % 3) * 0.25;
        const dist = rx * (1 + progress * speed * 2.5);
        const drift = Math.sin(t * 2 + i) * 0.4;
        const px = cx + Math.cos(angle + drift) * dist;
        const py = cy + Math.sin(angle + drift) * dist * (ry / rx);
        const ch = progress > 0.6
          ? (i % 3 === 0 ? "." : " ")
          : (i % 2 === 0 ? "o" : "*");
        putSafe(px, py, ch);
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // NARRATIVE PHASES
    // 0.00–0.25  approach: T-cell moves toward target
    // 0.25–0.45  synapse: cells touch, synapse forms, spikes engage
    // 0.45–0.65  release: perforin granules fire
    // 0.65–0.85  lysis: target membrane holes grow
    // 0.85–1.00  collapse: target fragments, T-cell withdraws
    // ══════════════════════════════════════════════════════════════════════════

    // Target cell — always near right side, slightly shrinking during lysis
    const targetBaseX = cols * 0.68;
    const targetCy = rows * 0.50;
    const lysisProgress = phase < 0.65
      ? 0
      : Math.min(1, (phase - 0.65) / 0.25);
    const collapseProgress = phase < 0.85
      ? 0
      : Math.min(1, (phase - 0.85) / 0.15);
    const targetRx = 7.5 * (1 - collapseProgress * 0.7);
    const targetRy = 4.2 * (1 - collapseProgress * 0.7);
    const targetDamage = lysisProgress * 0.55 + collapseProgress * 0.3;

    if (collapseProgress < 1) {
      drawCell(targetBaseX, targetCy, targetRx, targetRy, "@", "o", ".", targetDamage);
    }
    drawApoptosis(targetBaseX, targetCy, targetRx, targetRy, collapseProgress);

    // T-cell — approaches, stops at contact, then slowly withdraws
    const approachEnd = targetBaseX - targetRx - 8.5;
    const startX = cols * 0.06;
    const contactX = approachEnd;
    const withdrawX = cols * 0.18;

    let tcx;
    if (phase < 0.25) {
      // approaching — ease in
      const ap = phase / 0.25;
      const ease = ap * ap * (3 - 2 * ap); // smoothstep
      tcx = startX + (contactX - startX) * ease;
    } else if (phase < 0.85) {
      tcx = contactX;
    } else {
      const wp = (phase - 0.85) / 0.15;
      tcx = contactX + (withdrawX - contactX) * wp;
    }
    const tcy = targetCy + Math.sin(t * 0.7) * 0.6; // slight wobble
    const trx = 5.5, try_ = 3.2;

    drawCell(tcx, tcy, trx, try_, "#", "+", ":", 0);

    // Spikes toward target during synapse phase
    const spikeProgress = phase >= 0.25 && phase < 0.85
      ? Math.min(1, (phase - 0.25) / 0.1)
      : (phase >= 0.85 ? Math.max(0, 1 - (phase - 0.85) / 0.1) : 0);
    if (spikeProgress > 0.3) {
      drawSpikes(tcx, tcy, trx + spikeProgress * 1.5, try_, spikeProgress * 2.5, "right");
    }

    // Synapse bridge
    const synapseStrength = phase >= 0.30 && phase < 0.80
      ? Math.min(1, (phase - 0.30) / 0.08) * Math.max(0, 1 - (phase - 0.72) / 0.08)
      : 0;
    if (synapseStrength > 0) {
      const sx = Math.round((tcx + trx + 1 + targetBaseX - targetRx - 1) / 2);
      drawSynapse(sx, tcy, synapseStrength);
    }

    // Perforin release
    const perforinProgress = phase >= 0.45 && phase < 0.72
      ? (phase - 0.45) / 0.27
      : (phase >= 0.72 ? 0 : 0);
    drawPerforin(tcx, tcy, targetBaseX, targetCy, perforinProgress);

    // ── label pulses ──────────────────────────────────────────────────────────
    // Dim label row at very bottom
    const labelRow = rows - 1;
    const label =
      phase < 0.25 ? "  [ SCANNING TARGET... ]  " :
      phase < 0.45 ? "  [ SYNAPSE LOCKED ]       " :
      phase < 0.65 ? "  [ RELEASING PERFORIN ]   " :
      phase < 0.85 ? "  [ MEMBRANE BREACH ]      " :
                     "  [ TARGET ELIMINATED ]    ";
    const labelPulse = Math.floor(t * 2) % 2 === 0 || phase < 0.25;
    if (labelPulse) {
      const lx = Math.floor((cols - label.length) / 2);
      for (let i = 0; i < label.length; i++) {
        const xi = lx + i;
        if (xi >= 0 && xi < cols) g[labelRow][xi] = label[i];
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
