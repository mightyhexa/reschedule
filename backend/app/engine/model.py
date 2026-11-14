"""Plain data types shared by the solver, dispatch rules and the API."""
from __future__ import annotations

from dataclasses import dataclass, field

CHANGEOVER_MIN = 10          # setup minutes when a machine switches job family
TARIFF_PEAK = (18, 22)       # peak electricity hours (18:00 to 22:00)
KW_PER_MACHINE = 20.0
RATE_NORMAL = 6.0            # Rs per kWh
RATE_PEAK = 9.0


@dataclass
class OpIn:
    id: str
    job: str
    seq: int
    elig: list[str]
    dur: int


@dataclass
class JobIn:
    id: str
    due: int | None
    priority: int = 2      # 1 = most urgent
    release: int = 0
    family: str = ""

    @property
    def weight(self) -> int:
        return max(1, 5 - int(self.priority))


@dataclass
class Window:
    machine: str
    start: int
    end: int
    kind: str
    label: str = ""

    def as_dict(self) -> dict:
        return {"machine": self.machine, "start": self.start, "end": self.end, "kind": self.kind, "label": self.label}


@dataclass
class Placed:
    op_id: str
    job: str
    seq: int
    machine: str
    start: int
    end: int
    state: str = "planned"
    moved: bool = False
    added: bool = False
    old_machine: str | None = None
    old_start: int | None = None

    def as_dict(self) -> dict:
        return {f: getattr(self, f) for f in self.__dataclass_fields__}


@dataclass
class SolveResult:
    placed: list[Placed]
    status: str
    objective: float | None = None
    bound: float | None = None
    gap: float | None = None
    wall_s: float = 0.0
    notes: list[str] = field(default_factory=list)
