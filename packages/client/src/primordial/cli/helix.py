"""Animated ASCII double helix spinner with setup phase logging."""

import math
import threading
import time

from rich.console import Console, Group
from rich.live import Live
from rich.table import Table
from rich.text import Text

ROWS = 6
HALF = 5
CENTER = 6
SPINNER = "/-\\|"

TITLE_LINES = [
    "[bold bright_cyan]╭─╮ ╭─╮ ╷ ╭┬╮ ╭─╮ ╭─╮ ╭─╮ ╷ ╭─╮ ╷",
    "[bold bright_cyan]├─╯ ├┬╯ │ │││ │ │ ├┬╯ │ │ │ ├─┤ │",
    "[bold bright_cyan]╵   ╵╰╴ ╵ ╵ ╵ ╰─╯ ╵╰╴ ╰─╯ ╵ ╵ ╵ ╰─╴",
    "[bold bright_green]╭─╮ ╭─╴ ╭─╴ ╭╮╷ ─┬─ ╭─╴ ─┬─ ╭─╮ ╭─╮ ╭─╴",
    "[bold bright_green]├─┤ │╶╮ ├╴  │╰┤  │  ╰─╮  │  │ │ ├┬╯ ├╴",
    "[bold bright_green]╵ ╵ ╰─╯ ╰─╴ ╵ ╵  ╵  ╰─╯  ╵  ╰─╯ ╵╰╴ ╰─╴",
]


def _strand_char(dx: float, z: float) -> str:
    """Pick strand character based on visual slope and depth."""
    if abs(dx) < 0.12:
        return "|" if z > 0 else ":"
    if dx > 0:
        return "\\" if z > -0.2 else "."
    return "/" if z > -0.2 else "."


def _cell_chars(r: int, total: int) -> tuple[str, str]:
    """Pick left/right characters for the checklist box."""
    if r == 0 or r == total - 1:
        return ("┌", "┐") if r == 0 else ("└", "┘")
    return ("│", "│")


def _helix_frame(phase: float, morph: float = 0.0, morph_style: str = "checklist") -> list[Text]:
    """Render one frame of the helix. morph (0-1) blends toward a shape.

    morph_style: "checklist" (square with checkmarks) or "smiley" (ellipse with face).
    """
    morph = max(0.0, min(1.0, morph))
    lines = []
    for r in range(ROWS):
        t = r * 0.55 + phase
        # Helix positions
        hx1 = CENTER + math.sin(t) * HALF
        hx2 = CENTER + math.sin(t + math.pi) * HALF
        hz1 = math.cos(t)

        if morph_style == "smiley":
            # Ellipse target
            angle = r * math.pi / max(ROWS - 1, 1)
            cx1 = CENTER + math.sin(angle) * HALF
            cx2 = CENTER - math.sin(angle) * HALF
        else:
            # Square target: fixed-width rectangle
            cx1 = CENTER + HALF
            cx2 = CENTER - HALF

        # Lerp toward target
        x1 = int(round(hx1 + (cx1 - hx1) * morph))
        x2 = int(round(hx2 + (cx2 - hx2) * morph))
        # Depth flattens to front-facing as we morph
        z1 = hz1 * (1.0 - morph) + 0.5 * morph

        dx1, dx2 = z1 * 0.55, -z1 * 0.55
        width = CENTER * 2 + 2
        ch = [" "] * width

        if abs(x1 - x2) <= 1:
            cx = min(x1, x2)
            if 0 <= cx < width:
                if morph > 0.9:
                    ch[cx] = "~"
                else:
                    front_dx = dx1 if z1 > 0 else dx2
                    ch[cx] = _strand_char(front_dx, 0.5)
            ln = Text("".join(ch))
            if 0 <= cx < width:
                ln.stylize("bright_green", cx, cx + 1)
            lines.append(ln)
            continue

        lx, rx = (x1, x2) if x1 < x2 else (x2, x1)
        lz = z1 if x1 < x2 else -z1
        rz = -z1 if x1 < x2 else z1
        ldx = dx1 if x1 < x2 else dx2
        rdx = dx2 if x1 < x2 else dx1

        if morph > 0.9:
            if morph_style == "smiley":
                # Smiley face morph
                if 0 <= lx < width:
                    ch[lx] = "("
                if 0 <= rx < width:
                    ch[rx] = ")"
                mid = (lx + rx) // 2
                if r == 2:
                    le = lx + (rx - lx) // 3
                    re = rx - (rx - lx) // 3
                    if 0 <= le < width:
                        ch[le] = "o"
                    if 0 <= re < width:
                        ch[re] = "o"
                elif r == 3:
                    if 0 <= mid < width:
                        ch[mid] = "‿"
            else:
                # Checklist morph
                lc, rc = _cell_chars(r, ROWS)
                if 0 <= lx < width:
                    ch[lx] = lc
                if 0 <= rx < width:
                    ch[rx] = rc
                if r == 0 or r == ROWS - 1:
                    for cx in range(lx + 1, min(rx, width)):
                        ch[cx] = "─"
                else:
                    mark_x = lx + 2
                    line_start = mark_x + 2
                    line_end = rx - 1
                    if 0 <= mark_x < width:
                        ch[mark_x] = "✓" if r <= 3 else "·"
                    for cx in range(line_start, min(line_end, width)):
                        ch[cx] = "─"
        else:
            if 0 <= lx < width:
                ch[lx] = _strand_char(ldx, lz)
            if 0 <= rx < width:
                ch[rx] = _strand_char(rdx, rz)

        ln = Text("".join(ch))

        if morph > 0.9:
            if morph_style == "smiley":
                if r == 2:
                    le = lx + (rx - lx) // 3
                    re = rx - (rx - lx) // 3
                    for ep in (le, re):
                        if 0 <= ep < width:
                            ln.stylize("bold bright_cyan", ep, ep + 1)
                elif r == 3:
                    mid = (lx + rx) // 2
                    if 0 <= mid < width:
                        ln.stylize("bold bright_cyan", mid, mid + 1)
            elif 1 <= r <= ROWS - 2:
                mark_x = lx + 2
                line_start = mark_x + 2
                line_end = rx - 1
                if 0 <= mark_x < width:
                    style = "bold bright_green" if r <= 3 else "dim cyan"
                    ln.stylize(style, mark_x, mark_x + 1)
                if line_start < min(line_end, width):
                    ln.stylize("dim", line_start, min(line_end, width))

        for pos, z, c in [(lx, lz, "green"), (rx, rz, "cyan")]:
            if 0 <= pos < width:
                if morph > 0.9:
                    ln.stylize("bold bright_green", pos, pos + 1)
                elif z > 0.2:
                    ln.stylize(f"bold bright_{c}", pos, pos + 1)
                elif z > -0.2:
                    ln.stylize(c, pos, pos + 1)
                else:
                    ln.stylize(f"dim {c}", pos, pos + 1)

        lines.append(ln)
    return lines


def _build_banner(helix_lines: list[Text]) -> Table:
    """Build a side-by-side table: title on left, helix on right."""
    tbl = Table.grid(padding=(0, 2))
    tbl.add_column()  # title
    tbl.add_column()  # helix
    for i in range(max(len(TITLE_LINES), len(helix_lines))):
        title_ln = Text.from_markup(TITLE_LINES[i]) if i < len(TITLE_LINES) else Text("")
        helix_ln = helix_lines[i] if i < len(helix_lines) else Text("")
        tbl.add_row(title_ln, helix_ln)
    return tbl


class HelixSpinner:
    """Context manager: animated helix + timed phase log via Rich Live."""

    def __init__(self, console: Console, subtitle: str = ""):
        self._console = console
        self._subtitle = subtitle
        self._stop = threading.Event()
        self._phase = ""
        self._phase_start = 0.0
        self._total_start = 0.0
        self._completed: list[Text] = []
        self._lock = threading.Lock()
        self._frame_count = 0

    def set_phase(self, phase: str) -> None:
        with self._lock:
            now = time.monotonic()
            if self._phase:
                elapsed = now - self._phase_start
                line = Text()
                line.append("  + ", style="green")
                line.append(self._phase, style="dim")
                line.append(f" ({elapsed:.1f}s)", style="dim")
                self._completed.append(line)
            self._phase = phase
            self._phase_start = now

    def __enter__(self):
        self._total_start = time.monotonic()
        self._live = Live(console=self._console, refresh_per_second=15)
        self._live.start()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *_):
        self._stop.set()
        self._thread.join()
        with self._lock:
            if self._phase:
                elapsed = time.monotonic() - self._phase_start
                line = Text()
                line.append("  + ", style="green")
                line.append(self._phase, style="dim")
                line.append(f" ({elapsed:.1f}s)", style="dim")
                self._completed.append(line)
                self._phase = ""
            completed = list(self._completed)
        total = time.monotonic() - self._total_start

        # Play morph-to-cell animation (1s morph + 1s hold)
        morph_frames = 15
        hold_frames = 15
        phase = self._frame_count * 0.18
        for f in range(morph_frames + hold_frames):
            morph = min(1.0, f / morph_frames)
            helix = _helix_frame(phase + f * 0.18, morph=morph, morph_style="smiley")
            banner = _build_banner(helix)
            parts: list = [banner, Text("")]
            parts.extend(completed)
            parts.append(Text.from_markup(f"  [dim]Setup complete in {total:.1f}s[/dim]"))
            self._live.update(Group(*parts))
            time.sleep(1 / 15)

        # Stop Live — the last rendered frame stays on screen
        self._live.stop()

    def _loop(self):
        frame = 0
        while not self._stop.wait(1 / 15):
            helix = _helix_frame(frame * 0.18)
            banner = _build_banner(helix)
            with self._lock:
                parts = [banner]
                if self._subtitle:
                    parts.append(Text(""))
                    parts.append(Text.from_markup(f"[bold]{self._subtitle}[/bold]"))
                    parts.append(Text.from_markup("[dim]Type 'exit' or Ctrl+C to quit[/dim]"))
                parts.append(Text(""))
                parts.extend(list(self._completed))
                if self._phase:
                    elapsed = time.monotonic() - self._phase_start
                    sp = SPINNER[frame % len(SPINNER)]
                    cur = Text()
                    cur.append(f"  {sp} ", style="cyan")
                    cur.append(self._phase, style="dim")
                    cur.append(f" ({elapsed:.1f}s)", style="dim bold")
                    parts.append(cur)
            self._live.update(Group(*parts))
            frame += 1
        self._frame_count = frame
