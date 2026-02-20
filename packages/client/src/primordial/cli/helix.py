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


def _helix_frame(phase: float) -> list[Text]:
    lines = []
    for r in range(ROWS):
        t = r * 0.55 + phase
        x1 = int(round(CENTER + math.sin(t) * HALF))
        x2 = int(round(CENTER + math.sin(t + math.pi) * HALF))
        z1 = math.cos(t)
        dx1, dx2 = z1 * 0.55, -z1 * 0.55
        width = CENTER * 2 + 2
        ch = [" "] * width

        if abs(x1 - x2) <= 1:
            cx = min(x1, x2)
            if 0 <= cx < width:
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

        if 0 <= lx < width:
            ch[lx] = _strand_char(ldx, lz)
        if 0 <= rx < width:
            ch[rx] = _strand_char(rdx, rz)

        ln = Text("".join(ch))

        for pos, z, color in [(lx, lz, "green"), (rx, rz, "cyan")]:
            if 0 <= pos < width:
                if z > 0.2:
                    ln.stylize(f"bold bright_{color}", pos, pos + 1)
                elif z > -0.2:
                    ln.stylize(color, pos, pos + 1)
                else:
                    ln.stylize(f"dim {color}", pos, pos + 1)

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
        self._live.update(Text(""))
        self._live.stop()
        for line in self._completed:
            self._console.print(line)
        total = time.monotonic() - self._total_start
        self._console.print(f"  [dim]Setup complete in {total:.1f}s[/dim]\n")

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
