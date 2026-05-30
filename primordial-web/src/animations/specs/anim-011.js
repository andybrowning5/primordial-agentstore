export default {
  id: 11,
  system: "Apoptosis (programmed cell death)",
  title: "Apoptotic Cascade",
  caption: "A cell folds inward, blebs, and dissolves into silence.",
  cols: 52,
  rows: 20,
  palette: "blood",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    const cy = rows / 2;
    const cx = cols / 2;

    // Apoptosis cycle: ~20s per full cycle
    const cycle = (t % 20) / 20; // 0..1

    // Phase 0-0.25: healthy cell (round, pulsing)
    // Phase 0.25-0.55: chromatin condenses, membrane blebs
    // Phase 0.55-0.80: cell shrinks, blebs swell and pinch off
    // Phase 0.80-1.0: apoptotic bodies drift apart, fade

    // Smooth phase transitions
    function smoothstep(a, b, x) {
      const t2 = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t2 * t2 * (3 - 2 * t2);
    }

    const bleb_progress = smoothstep(0.25, 0.65, cycle);
    const shrink_progress = smoothstep(0.45, 0.80, cycle);
    const fragment_progress = smoothstep(0.65, 0.90, cycle);
    const fade_progress = smoothstep(0.80, 1.0, cycle);

    // Main cell radius — shrinks as apoptosis proceeds
    const base_rx = cols * 0.28;
    const base_ry = rows * 0.40;
    const rx = base_rx * (1 - shrink_progress * 0.55);
    const ry = base_ry * (1 - shrink_progress * 0.55);

    // Breathing pulse for healthy phase
    const pulse = 1 + (1 - bleb_progress) * 0.04 * Math.sin(t * 2.8);

    // Draw main cell membrane (ellipse outline with blebbing)
    const bleb_count = 6;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / (rx * pulse);
        const dy = (y - cy) / (ry * pulse);
        const base_r = Math.sqrt(dx * dx + dy * dy);

        // Membrane blebbing: radial bumps that grow over time
        const angle = Math.atan2(dy, dx);
        let bleb_offset = 0;
        for (let b = 0; b < bleb_count; b++) {
          const bleb_angle = (b / bleb_count) * Math.PI * 2 + t * 0.3;
          const angular_dist = Math.abs(Math.sin((angle - bleb_angle) * 0.5));
          const bleb_strength = bleb_progress * 0.22 * Math.pow(Math.max(0, 1 - angular_dist * 3), 2);
          bleb_offset += bleb_strength * Math.sin(t * 1.1 + b * 1.7);
        }

        const r = base_r - bleb_offset * (1 - fragment_progress);
        const edge = Math.abs(r - 1.0);

        if (fragment_progress < 0.8 && fade_progress < 0.95) {
          // Outer membrane
          if (edge < 0.06) {
            g[y][x] = "@";
          } else if (edge < 0.14) {
            g[y][x] = "o";
          } else if (edge < 0.22 && g[y][x] === " ") {
            g[y][x] = ".";
          }

          // Interior: chromatin condensation pattern
          if (r < 0.88) {
            const chrom_phase = bleb_progress;
            // Condensed chromatin clumps near periphery
            const cx_off = Math.cos(angle) * 0.5 * chrom_phase;
            const cy_off = Math.sin(angle) * 0.5 * chrom_phase;
            const clump_dx = dx - cx_off * (rx / (rx * pulse));
            const clump_dy = dy - cy_off * (ry / (ry * pulse));
            const clump_r = Math.sqrt(clump_dx * clump_dx + clump_dy * clump_dy);

            // Chromatin hash pattern — condenses and darkens
            const hash = (Math.floor(x * 3 + t * 2) + Math.floor(y * 5)) % 7;
            if (chrom_phase > 0.1 && clump_r > 0.55 * chrom_phase && hash < 2) {
              g[y][x] = "#";
            } else if (r < 0.7 && g[y][x] === " ") {
              const inner_hash = (Math.floor(x * 2 + t * 3) + Math.floor(y * 4 + t)) % 13;
              if (inner_hash === 0) g[y][x] = "*";
              else if (inner_hash === 1) g[y][x] = ":";
            }
          }
        }
      }
    }

    // Apoptotic bodies — pinch off and drift
    if (fragment_progress > 0.05) {
      const body_count = 5;
      for (let b = 0; b < body_count; b++) {
        const body_angle = (b / body_count) * Math.PI * 2 + 0.4 * b;
        const drift_speed = 0.8 + b * 0.15;
        const drift = fragment_progress * drift_speed * 5.5;
        const body_cx = cx + Math.cos(body_angle) * (rx * 0.7 + drift);
        const body_cy = cy + Math.sin(body_angle) * (ry * 0.6 + drift * 0.6);
        const body_r = 1.8 + b * 0.3;
        const body_fade = 1 - fade_progress;

        // Only draw if still visible
        if (body_fade < 0.05) continue;

        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const bdx = x - body_cx;
            const bdy = y - body_cy;
            const br = Math.sqrt(bdx * bdx + bdy * bdy);
            if (br < body_r) {
              const bedge = Math.abs(br - body_r + 0.5);
              if (br < body_r - 0.8) {
                g[y][x] = body_fade > 0.5 ? "#" : "*";
              } else if (bedge < 1.2) {
                g[y][x] = body_fade > 0.5 ? "o" : ".";
              }
            }
          }
        }
      }
    }

    // Caspase cascade sparks — small dots radiating outward during active phase
    if (bleb_progress > 0.1 && fragment_progress < 0.9) {
      const spark_count = 8;
      for (let s = 0; s < spark_count; s++) {
        const spark_t = ((t * 0.7 + s * 1.3) % 3) / 3; // 0..1 lifetime
        const spark_angle = (s / spark_count) * Math.PI * 2 + s * 0.7;
        const spark_dist = spark_t * (rx * 1.6);
        const sx = Math.round(cx + Math.cos(spark_angle) * spark_dist);
        const sy = Math.round(cy + Math.sin(spark_angle) * spark_dist * 0.65);
        if (sx >= 0 && sx < cols && sy >= 0 && sy < rows) {
          if (spark_t < 0.3) g[sy][sx] = "*";
          else if (spark_t < 0.6) g[sy][sx] = ".";
          else g[sy][sx] = " ";
        }
      }
    }

    // Phase label band at bottom — subtle indicators
    const phase_row = rows - 1;
    const labels = ["alive", "alive", "alive", "blebs", "blebs", "frag.", "frag.", "gone.", "gone.", "...  "];
    const label_idx = Math.min(9, Math.floor(cycle * 10));
    const label = labels[label_idx];
    const label_x = Math.floor(cols / 2 - label.length / 2);
    for (let i = 0; i < label.length; i++) {
      if (label_x + i >= 0 && label_x + i < cols) {
        g[phase_row][label_x + i] = label[i];
      }
    }

    return g.map((row) => row.join("")).join("\n");
  },
};
