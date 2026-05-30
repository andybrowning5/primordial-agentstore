export default {
  id: 13,
  system: "DNA replication fork",
  title: "Replication Fork",
  caption: "The helix unwinds and two daughters emerge from one.",
  cols: 54,
  rows: 18,
  palette: "dna",
  frame(t) {
    const cols = 54, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // helper: safe set
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }

    // ── parameters ──────────────────────────────────────────────────────────
    const speed = 0.6;
    const forkX = cols * 0.38 + Math.sin(t * speed * 0.4) * 2; // fork advances slowly
    const helixAmp = 3.2;                                        // helix strand amplitude
    const period = 8;                                            // base-pair period (cols)

    // ── parent double helix (right of fork, incoming template) ──────────────
    // Two strands winding toward the fork from the right
    const templateStart = Math.floor(forkX);
    for (let x = templateStart; x < cols - 1; x++) {
      const phase = (x / period) * Math.PI * 2 - t * speed;
      const yTop = rows / 2 - helixAmp * Math.sin(phase);
      const yBot = rows / 2 + helixAmp * Math.sin(phase);

      // strand characters — vary by position on wave for depth effect
      const depthTop = Math.sin(phase);
      const depthBot = -Math.sin(phase);
      const chTop = depthTop > 0.3 ? "O" : depthTop > -0.3 ? "o" : ".";
      const chBot = depthBot > 0.3 ? "O" : depthBot > -0.3 ? "o" : ".";

      put(x, yTop, chTop);
      put(x, yBot, chBot);

      // base pair rungs between the two strands
      const dist = Math.abs(yTop - yBot);
      if (dist < rows * 0.6 && Math.round(x % (period / 2)) === 0) {
        const yMid = (yTop + yBot) / 2;
        // draw rung as short vertical connecting marks
        const steps = Math.floor(dist / 2);
        for (let s = -steps; s <= steps; s++) {
          const ry = Math.round(yMid + s);
          if (ry > Math.round(yTop) && ry < Math.round(yBot)) put(x, ry, "|");
        }
        // rung endpoints
        put(x, yTop, "=");
        put(x, yBot, "=");
      }
    }

    // ── fork junction label ──────────────────────────────────────────────────
    const fxI = Math.round(forkX);
    const midRow = Math.round(rows / 2);
    put(fxI, midRow, "*");

    // ── leading strand (continuous, upper arm of fork) ───────────────────────
    // Synthesized left-to-right from fork outward to the left
    const leadAmp = 2.0;
    const leadPeriod = 7;
    for (let x = 1; x < fxI - 1; x++) {
      const phase = (x / leadPeriod) * Math.PI * 2 + t * speed * 1.1;
      const y = rows / 2 - leadAmp - leadAmp * Math.sin(phase) * 0.5;
      // growing front: only show up to a synthesis wavefront
      const synthFront = (t * speed * 4) % fxI;
      if (x > fxI - synthFront && x < fxI) {
        const ch = Math.sin(phase) > 0.4 ? "C" : Math.sin(phase) < -0.4 ? "G" : "-";
        put(x, y, ch);
        // template (upper) stays dim
        put(x, y - 1, ".");
      }
    }

    // ── lagging strand (discontinuous, lower arm) — Okazaki fragments ────────
    // Each fragment is a short segment synthesized in the opposite direction
    const lagAmp = 2.0;
    const fragLen = 7;
    const lagSpeed = speed * 0.8;
    for (let frag = 0; frag < 6; frag++) {
      // each fragment shifts over time (synthesis proceeds right→left)
      const offset = ((t * lagSpeed * 3 + frag * fragLen) % (fxI + fragLen)) - fragLen;
      for (let s = 0; s < fragLen - 1; s++) {
        const x = fxI - Math.round(offset) - s;
        if (x < 1 || x >= fxI - 1) continue;
        const phase = (x / 6) * Math.PI * 2 + frag * 2.1;
        const y = rows / 2 + lagAmp + lagAmp * Math.sin(phase) * 0.45;
        const ch = s === 0 ? ">" : (Math.sin(phase) > 0.4 ? "A" : Math.sin(phase) < -0.4 ? "T" : "-");
        put(x, y, ch);
        // template (lower) stays dim
        put(x, y + 1, ".");
      }
    }

    // ── polymerase blobs at active synthesis points ──────────────────────────
    // Leading strand polymerase rides the fork
    const polyLead_x = fxI - 2;
    const polyLead_y = Math.round(rows / 2 - leadAmp - 1);
    put(polyLead_x,     polyLead_y,     "@");
    put(polyLead_x - 1, polyLead_y,     "(");
    put(polyLead_x + 1, polyLead_y,     ")");

    // Lagging strand polymerase (one per fragment, show first active)
    const lagFragOffset = Math.round(((t * lagSpeed * 3) % (fxI + fragLen)) - fragLen);
    const polyLag_x = fxI - lagFragOffset - 1;
    const polyLag_y = Math.round(rows / 2 + lagAmp + 1);
    if (polyLag_x >= 2 && polyLag_x < fxI - 2) {
      put(polyLag_x,     polyLag_y,     "@");
      put(polyLag_x - 1, polyLag_y,     "(");
      put(polyLag_x + 1, polyLag_y,     ")");
    }

    // ── helicase at the fork tip (unwinds the helix) ─────────────────────────
    put(fxI + 1, midRow - 1, "H");
    put(fxI + 1, midRow,     "#");
    put(fxI + 1, midRow + 1, "H");
    // dynamic "unwind" sparks
    const sparkPhase = t * 3.0;
    for (let i = 0; i < 3; i++) {
      const sx = fxI + 2 + i;
      const sy = midRow + Math.round(Math.sin(sparkPhase + i * 1.2) * 1.5);
      put(sx, sy, "~");
    }

    // ── direction arrows along each arm ─────────────────────────────────────
    // Leading strand arrow (moves leftward from fork)
    const arrX = Math.max(2, Math.round(fxI * 0.45));
    put(arrX, Math.round(rows / 2 - leadAmp - 1), "<");
    // Lagging strand arrow (moves rightward toward fork, then resets)
    const lagArrX = Math.max(2, Math.round(fxI * 0.6));
    put(lagArrX, Math.round(rows / 2 + lagAmp + 1), ">");

    // ── labels ───────────────────────────────────────────────────────────────
    // "5'" / "3'" ends on parent strand at right edge
    put(cols - 2, Math.round(rows / 2 - helixAmp - 1), "5");
    put(cols - 1, Math.round(rows / 2 - helixAmp - 1), "'");
    put(cols - 2, Math.round(rows / 2 + helixAmp + 1), "3");
    put(cols - 1, Math.round(rows / 2 + helixAmp + 1), "'");

    return g.map(row => row.join("")).join("\n");
  }
};
