export default {
  id: 14,
  system: "DNA transcription",
  title: "Gene to mRNA",
  caption: "RNA polymerase unzips the helix, weaving a strand of living code.",
  cols: 52,
  rows: 18,
  palette: "dna",
  frame(t) {
    const cols = 52, rows = 18;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // --- helpers ---
    function put(x, y, ch) {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) g[yi][xi] = ch;
    }

    // DNA helix scroll speed and polymerase position
    const speed = 0.35;
    const scroll = t * speed;          // helix drifts left as pol moves right
    const polX = cols * 0.5;           // polymerase stays centered
    const forkHalf = 4;                // half-width of the open bubble

    // Draw the double helix (template + coding strands)
    // Each strand is a sinusoid; they are offset by π to form the double helix
    const helixAmplitude = 3.2;
    const helixFreq = 0.55;            // radians per column
    const helixMidY = rows / 2;

    for (let col = 0; col < cols; col++) {
      const phase = col * helixFreq - scroll * helixFreq * cols;
      const y1 = helixMidY + helixAmplitude * Math.sin(phase);
      const y2 = helixMidY + helixAmplitude * Math.sin(phase + Math.PI);

      // Distance from polymerase (fork region)
      const distFromPol = col - polX;

      if (Math.abs(distFromPol) > forkHalf) {
        // Outside fork: intact double helix
        const depth1 = Math.sin(phase);
        const depth2 = Math.sin(phase + Math.PI);

        // Strand 1 (template)
        const ch1 = depth1 > 0.5 ? "O" : depth1 > -0.5 ? "o" : ".";
        put(col, y1, ch1);

        // Strand 2 (coding)
        const ch2 = depth2 > 0.5 ? "O" : depth2 > -0.5 ? "o" : ".";
        put(col, y2, ch2);

        // Base-pair rungs (only where strands are close-ish and in front)
        if (Math.abs(y1 - y2) > 1) {
          const minY = Math.min(y1, y2);
          const maxY = Math.max(y1, y2);
          for (let ry = Math.ceil(minY + 0.5); ry < maxY; ry++) {
            // depth check: only draw rungs when strands are on near side
            const midDepth = Math.sin(phase + Math.PI / 2);
            if (midDepth > -0.1) {
              put(col, ry, midDepth > 0.5 ? "-" : ":");
            }
          }
        }
      } else {
        // Inside fork: strands peel apart
        const openFrac = 1 - Math.abs(distFromPol) / forkHalf;
        const spread = openFrac * 2.5;

        // Template strand peels up
        put(col, y1 - spread, depth1Char(Math.sin(phase)));
        // Coding strand peels down
        put(col, y2 + spread, depth1Char(Math.sin(phase + Math.PI)));
      }
    }

    function depth1Char(d) {
      return d > 0.5 ? "O" : d > -0.5 ? "o" : ".";
    }

    // --- RNA polymerase body ---
    // A compact blocky shape centered at polX, helixMidY
    const py = Math.round(helixMidY);
    const px = Math.round(polX);
    // Core
    put(px,     py,     "@");
    put(px - 1, py,     "#");
    put(px + 1, py,     "#");
    put(px,     py - 1, "#");
    put(px,     py + 1, "#");
    put(px - 1, py - 1, "%");
    put(px + 1, py - 1, "%");
    put(px - 1, py + 1, "%");
    put(px + 1, py + 1, "%");

    // --- growing mRNA strand below the helix ---
    // mRNA nucleotides emerge from polymerase and trail to the left
    // Length of the mRNA grows with time (capped at ~col * 0.45 chars)
    const mrnaLen = Math.min(Math.floor(t * speed * cols * 0.55), Math.floor(cols * 0.46));
    const mrnaY = helixMidY + helixAmplitude + 2.5;

    // Anchor at polX, trail left
    for (let i = 0; i < mrnaLen; i++) {
      const mx = polX - i;
      if (mx < 0) break;

      // slight vertical wave on the mRNA strand
      const wave = Math.sin(i * 0.55 - t * 1.1) * 0.8;
      const my = mrnaY + wave;

      // nucleotide characters cycle: A U G C
      const nucs = ["A", "U", "G", "C"];
      // Use a deterministic hash based on position in the growing chain
      const nuc = nucs[Math.abs(Math.round(mx * 7 + 3)) % 4];

      const xi = Math.round(mx), yi = Math.round(my);
      if (xi >= 0 && xi < cols && yi >= 0 && yi < rows) {
        g[yi][xi] = i === 0 ? ">" : nuc;
      }
    }

    // Leading edge of mRNA (the newest nucleotide just synthesized)
    if (mrnaLen > 0) {
      const leadX = Math.round(polX);
      const leadY = Math.round(mrnaY);
      if (leadX >= 0 && leadX < cols && leadY >= 0 && leadY < rows) {
        // pulse the connection point
        const pulse = Math.sin(t * 4) > 0 ? "*" : "+";
        put(polX, mrnaY - 0.5, pulse);
      }
    }

    // --- nucleotide pool: floating dots below, drifting toward polymerase ---
    // Free NTPs drifting upward on the right side
    for (let n = 0; n < 10; n++) {
      const phase2 = n * 2.3 + t * 0.7;
      const nx = polX + 4 + (n % 5) * 2.2 + Math.sin(phase2 * 1.3) * 1.5;
      const ny = mrnaY + 1 + Math.sin(phase2) * 1.5;
      put(nx, ny, ".");
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
