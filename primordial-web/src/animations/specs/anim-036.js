export default {
  id: 36,
  system: "Heartbeat (cardiac cycle)",
  title: "Cardiac Pulse",
  caption: "Chambers contract, valves yield, and blood surges outward.",
  cols: 52,
  rows: 20,
  palette: "blood",
  frame(t) {
    const cols = 52, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill(" "));

    // Cardiac cycle: period ~1.6s, mimics lub-dub
    const period = 1.6;
    const phase = (t % period) / period; // 0..1 over one beat

    // Systole pulse shape: sharp contraction then relaxation
    // Use a fast attack, slow decay envelope
    function beatEnv(ph) {
      // Two peaks: systole (0.15) and diastole echo (0.55)
      const p1 = Math.exp(-Math.pow((ph - 0.15) * 18, 2));
      const p2 = Math.exp(-Math.pow((ph - 0.55) * 22, 2)) * 0.45;
      return p1 + p2;
    }
    const beat = beatEnv(phase);

    // Heart center
    const hcx = cols / 2 - 1;
    const hcy = Math.floor(rows * 0.46);

    // Heart size pulses with beat
    const baseRx = cols * 0.22;
    const baseRy = rows * 0.33;
    const rx = baseRx * (1 + beat * 0.18);
    const ry = baseRy * (1 + beat * 0.15);

    // Draw heart shape using cardioid-like formula
    // Heart: two circles + v-notch at top
    function isHeart(x, y) {
      const nx = (x - hcx) / rx;
      const ny = (y - hcy) / ry;
      // Shifted for two lobes at top
      const lobe1 = Math.pow(nx - 0.42, 2) + Math.pow(ny + 0.38, 2);
      const lobe2 = Math.pow(nx + 0.42, 2) + Math.pow(ny + 0.38, 2);
      // Main body (lower triangle)
      const body = Math.pow(nx, 2) + Math.pow(ny - 0.1, 2);
      // Combine: inside if near the lobes or the body
      const inLobe1 = lobe1 < 0.38;
      const inLobe2 = lobe2 < 0.38;
      const inBody = body < 0.72 && ny > -0.35;
      return inLobe1 || inLobe2 || inBody;
    }

    function heartDist(x, y) {
      // Approximate signed distance: positive inside
      const nx = (x - hcx) / rx;
      const ny = (y - hcy) / ry;
      const lobe1 = 0.38 - (Math.pow(nx - 0.42, 2) + Math.pow(ny + 0.38, 2));
      const lobe2 = 0.38 - (Math.pow(nx + 0.42, 2) + Math.pow(ny + 0.38, 2));
      const body = (ny > -0.35) ? 0.72 - (Math.pow(nx, 2) + Math.pow(ny - 0.1, 2)) : -1;
      return Math.max(lobe1, lobe2, body);
    }

    // Fill heart with internal detail
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = heartDist(x, y);
        if (d > 0.12) {
          // Deep interior: pulsing fill pattern
          const nx = (x - hcx) / rx;
          const ny = (y - hcy) / ry;
          // Divide into chambers: left/right by nx, upper/lower by ny
          const leftSide = nx < -0.06;
          const rightSide = nx > 0.06;
          const upperChamber = ny < 0.05;
          // Chamber labels: LA/RA upper, LV/RV lower
          // Flow ripples radiating outward from center
          const r = Math.sqrt(nx * nx + ny * ny);
          const ripple = (r * 8 - t * 5) % 1;
          const rippleVal = Math.exp(-Math.pow((ripple - 0.5) * 4, 2));
          const flowIntensity = rippleVal * beat;

          if (flowIntensity > 0.7) {
            g[y][x] = "%";
          } else if (flowIntensity > 0.45) {
            g[y][x] = "#";
          } else if (d > 0.35) {
            // Core fill
            const t2 = Math.floor(t * 8 + x * 0.3 + y * 0.5);
            g[y][x] = (t2 % 7 === 0) ? "o" : (t2 % 13 === 0) ? "*" : ":";
          } else {
            g[y][x] = ".";
          }
        } else if (d > 0.0) {
          // Heart wall — thick border chars
          g[y][x] = "@";
        } else if (d > -0.07) {
          // Outer glow
          g[y][x] = "O";
        } else if (d > -0.14) {
          g[y][x] = "o";
        }
      }
    }

    // Septum divider (vertical line in heart)
    {
      const nx0 = -0.06, nx1 = 0.06;
      for (let y = 0; y < rows; y++) {
        for (let xi = 0; xi < 2; xi++) {
          const nx = xi === 0 ? nx0 : nx1;
          const px = Math.round(hcx + nx * rx);
          if (px >= 0 && px < cols) {
            const d = heartDist(px, y);
            if (d > 0.1) g[y][px] = "|";
          }
        }
      }
    }

    // Aorta: upward arch from top of heart
    {
      const aortaBase = Math.round(hcy - ry * 0.55);
      const aortaX = Math.round(hcx - rx * 0.12);
      for (let i = 0; i < 4; i++) {
        const ay = aortaBase - i;
        const ax = aortaX + Math.round(i * 0.8);
        if (ay >= 0 && ay < rows && ax >= 0 && ax < cols) {
          g[ay][ax] = beat > 0.3 ? "#" : "|";
        }
      }
      // Arch right
      for (let i = 0; i < 5; i++) {
        const ay = aortaBase - 3;
        const ax = aortaX + i + 1;
        if (ay >= 0 && ay < rows && ax >= 0 && ax < cols) {
          g[ay][ax] = beat > 0.3 ? "#" : "-";
        }
      }
      // Down on the right
      for (let i = 0; i < 3; i++) {
        const ay = aortaBase - 3 + i + 1;
        const ax = aortaX + 5;
        if (ay >= 0 && ay < rows && ax >= 0 && ax < cols) {
          g[ay][ax] = beat > 0.3 ? "#" : "|";
        }
      }
    }

    // Pulmonary artery: upward left
    {
      const paBase = Math.round(hcy - ry * 0.5);
      const paX = Math.round(hcx + rx * 0.18);
      for (let i = 0; i < 3; i++) {
        const ay = paBase - i;
        const ax = paX - Math.round(i * 0.5);
        if (ay >= 0 && ay < rows && ax >= 0 && ax < cols) {
          g[ay][ax] = beat > 0.3 ? "%" : "|";
        }
      }
    }

    // ECG trace at the bottom of the canvas
    const ecgY = rows - 3;
    const ecgStartX = 2;
    const ecgWidth = cols - 4;

    // ECG waveform: P-QRS-T complex, scrolling
    for (let xi = 0; xi < ecgWidth; xi++) {
      const x = ecgStartX + xi;
      // Map xi to a position in the ECG cycle, scrolling with time
      const scroll = (t * 16) % ecgWidth;
      const pos = ((xi - scroll + ecgWidth) % ecgWidth) / ecgWidth; // 0..1 in cycle

      // P wave (atrial depol)
      const p = 0.5 * Math.exp(-Math.pow((pos - 0.12) * 40, 2));
      // Q dip
      const q = -0.3 * Math.exp(-Math.pow((pos - 0.22) * 80, 2));
      // R spike
      const r = 3.5 * Math.exp(-Math.pow((pos - 0.27) * 120, 2));
      // S dip
      const s2 = -0.6 * Math.exp(-Math.pow((pos - 0.32) * 80, 2));
      // T wave (ventricular repol)
      const twave = 0.8 * Math.exp(-Math.pow((pos - 0.52) * 30, 2));

      const amp = p + q + r + s2 + twave;

      // Map amplitude to row offset (higher amp = higher on screen = lower row index)
      const yOff = Math.round(amp * 1.5);
      const ey = ecgY - yOff;
      if (ey >= 0 && ey < rows && x >= 0 && x < cols && g[ey][x] === " ") {
        // Choose char by amplitude
        if (Math.abs(amp) < 0.15) {
          g[ey][x] = "-";
        } else if (amp > 2.0) {
          g[ey][x] = "^";
        } else if (amp > 0.5) {
          g[ey][x] = "+";
        } else if (amp < -0.3) {
          g[ey][x] = "v";
        } else {
          g[ey][x] = "~";
        }
      }
    }

    // Heartbeat rate label
    const bpmStr = "72 BPM";
    const bpmX = cols - bpmStr.length - 2;
    const bpmY = rows - 1;
    for (let i = 0; i < bpmStr.length; i++) {
      if (bpmX + i >= 0 && bpmX + i < cols) {
        g[bpmY][bpmX + i] = bpmStr[i];
      }
    }

    // Systole/diastole label
    const isSystematic = beat > 0.25;
    const stateStr = isSystematic ? "SYSTOLE " : "DIASTOLE";
    const stateX = 2;
    const stateY = rows - 1;
    for (let i = 0; i < stateStr.length; i++) {
      if (stateX + i < cols) {
        g[stateY][stateX + i] = stateStr[i];
      }
    }

    return g.map((row) => row.join("")).join("\n");
  }
};
