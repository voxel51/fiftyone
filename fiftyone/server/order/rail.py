"""
FiftyOne Server order rails: where sort values sit between an order's
bounds, and evenly spaced ticks to label them.

A fraction is a place on the rail in view order: 0 is the start of the order
and 1 its end, so descending orders run from the maximum to the minimum.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import math
import typing as t

from bson import ObjectId

import fiftyone.core.fields as fof
import fiftyone.core.utils as fou

from fiftyone.server.order.backend import Bounds, Mode, OrderHandle, Scale

DEFAULT_TICKS = 6

_NICE_STEPS = (1, 2, 5)
_DAY_STEPS = (1, 2, 7, 14)
_HOUR_STEPS = (1, 3, 6, 12)
_MONTH_STEPS = (1, 2, 3, 6)
_SECOND_MS = 1000.0


@dataclass
class Tick:
    value: t.Any
    fraction: float
    label: str


def scale_of(field) -> t.Optional[Scale]:
    """The scale of a sort field, or None when its values have no linear
    measure (strings and booleans)."""
    if isinstance(field, (fof.DateField, fof.DateTimeField)):
        return Scale.DATE

    if isinstance(field, fof.ObjectIdField):
        return Scale.ID

    if isinstance(field, (fof.IntField, fof.FloatField)):
        return Scale.NUMBER

    return None


def to_number(value, scale: Scale) -> t.Optional[float]:
    """A sort value as a number on its scale: dates and ids as milliseconds
    since epoch (an id by its generation time)."""
    if value is None:
        return None

    if scale == Scale.ID:
        return value.generation_time.timestamp() * _SECOND_MS

    if scale == Scale.DATE:
        return fou.datetime_to_timestamp(value)

    number = float(value)
    return None if math.isnan(number) else number


def from_number(number: float, scale: Scale):
    if scale == Scale.ID:
        return ObjectId.from_datetime(_utc(number))

    if scale == Scale.DATE:
        return _utc(number).replace(tzinfo=None)

    return number


def fraction(value, bounds: Bounds, desc: bool) -> t.Optional[float]:
    """The place of ``value`` on the rail, or None without a scale. None
    values sort first, so they sit at the start ascending and at the end
    descending."""
    if bounds.scale is None:
        return None

    if value is None:
        return 1.0 if desc else 0.0

    lo, hi = _ends(bounds)
    number = to_number(value, bounds.scale)
    if number is None or lo is None:
        return None

    f = 0.0 if hi == lo else (number - lo) / (hi - lo)
    f = min(max(f, 0.0), 1.0)
    return 1.0 - f if desc else f


def sample_fraction(
    handle: OrderHandle, value, offset: t.Optional[int]
) -> t.Optional[float]:
    """The place of a page's sample on its order's rail: its offset over the
    total in ``SMALL`` mode, its sort value between the bounds in
    ``INDEXED`` mode, and None otherwise."""
    if handle.plan.mode == Mode.SMALL:
        if offset is None or not handle.total:
            return None

        return offset / handle.total

    if handle.plan.mode == Mode.INDEXED:
        return fraction(value, handle.bounds, handle.spec.desc)

    return None


def value_at(f: float, bounds: Bounds, desc: bool):
    """The sort value at a place on the rail, interpolated linearly between
    the bounds."""
    lo, hi = _ends(bounds)
    f = min(max(f, 0.0), 1.0)
    if desc:
        f = 1.0 - f

    return from_number(lo + f * (hi - lo), bounds.scale)


def value_ticks(
    bounds: Bounds, desc: bool, count: int = DEFAULT_TICKS
) -> t.List[Tick]:
    """At most ``count`` evenly spaced ticks between the bounds: round
    numbers, or calendar steps for dates and ids."""
    if bounds.scale is None or count <= 0:
        return []

    lo, hi = _ends(bounds)
    if lo is None:
        return []

    if bounds.scale == Scale.NUMBER:
        integer = isinstance(bounds.min, int) and isinstance(bounds.max, int)
        numbers = nice_numbers(lo, hi, count, integer=integer)
        labels = [compact_number(n) for n in numbers]
    else:
        numbers, labels = calendar_numbers(lo, hi, count)

    ticks = []
    for number, label in zip(numbers, labels):
        value = from_number(number, bounds.scale)
        ticks.append(
            Tick(
                value=value,
                fraction=fraction(value, bounds, desc),
                label=label,
            )
        )

    return ticks


def offset_ticks(total: int, count: int = DEFAULT_TICKS) -> t.List[Tick]:
    """At most ``count`` ticks at round offsets of a ``SMALL`` order,
    labeled by 1-based position."""
    if total <= 0 or count <= 0:
        return []

    return [
        Tick(
            value=int(n), fraction=n / total, label=compact_number(int(n) + 1)
        )
        for n in nice_numbers(0, total - 1, count, integer=True)
    ]


def nice_numbers(
    lo: float, hi: float, count: int, integer: bool
) -> t.List[float]:
    """Multiples of the smallest 1, 2 or 5 times a power of ten step that
    puts at most ``count`` of them in ``[lo, hi]``."""
    span = hi - lo
    if span <= 0:
        return [lo]

    exponent = math.floor(math.log10(span / count))
    while True:
        for base in _NICE_STEPS:
            step = base * 10.0**exponent
            if integer and step < 1:
                continue

            first = math.ceil(lo / step)
            last = math.floor(hi / step)
            if last - first + 1 <= count:
                return [
                    _round(i * step, exponent) for i in range(first, last + 1)
                ]

        exponent += 1


def calendar_numbers(
    lo: float, hi: float, count: int
) -> t.Tuple[t.List[float], t.List[str]]:
    """Calendar boundaries between two times in milliseconds since epoch:
    the finest of hours, days, months or years that fits ``count``."""
    start, end = _utc(lo), _utc(hi)
    for unit, steps in (
        ("hour", _HOUR_STEPS),
        ("day", _DAY_STEPS),
        ("month", _MONTH_STEPS),
    ):
        for step in steps:
            times = _calendar(start, end, unit, step, count)
            if times is not None:
                return times

    step = 1
    while True:
        for base in _NICE_STEPS:
            times = _calendar(start, end, "year", base * step, count)
            if times is not None:
                return times

        step *= 10


_FORMATS = {
    "hour": "%b %d %H:%M",
    "day": "%b %d %Y",
    "month": "%b %Y",
    "year": "%Y",
}


def _calendar(start, end, unit, step, count):
    current = _floor(start, unit, step)
    if current < start:
        current = _add(current, unit, step)

    times = []
    while current <= end:
        times.append(current)
        if len(times) > count:
            return None

        current = _add(current, unit, step)

    return (
        [current.timestamp() * _SECOND_MS for current in times],
        [current.strftime(_FORMATS[unit]) for current in times],
    )


def _floor(dt: datetime, unit: str, step: int) -> datetime:
    if unit == "hour":
        return dt.replace(
            hour=dt.hour - dt.hour % step, minute=0, second=0, microsecond=0
        )

    day = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    if unit == "day":
        return day

    month = day.replace(day=1, month=dt.month - (dt.month - 1) % step)
    if unit == "month":
        return month

    return month.replace(month=1, year=dt.year - dt.year % step)


def _add(dt: datetime, unit: str, step: int) -> datetime:
    if unit == "hour":
        return datetime.fromtimestamp(
            dt.timestamp() + step * 3600, tz=timezone.utc
        )

    if unit == "day":
        return datetime.fromtimestamp(
            dt.timestamp() + step * 86400, tz=timezone.utc
        )

    if unit == "month":
        months = dt.year * 12 + dt.month - 1 + step
        return dt.replace(year=months // 12, month=months % 12 + 1)

    return dt.replace(year=dt.year + step)


def _utc(ms: float) -> datetime:
    return datetime.fromtimestamp(ms / _SECOND_MS, tz=timezone.utc)


def _ends(bounds: Bounds):
    return (
        to_number(bounds.min, bounds.scale),
        to_number(bounds.max, bounds.scale),
    )


def _round(value: float, exponent: int) -> float:
    return round(value, max(-exponent, 0))


def compact_number(value: float) -> str:
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)

    magnitude = abs(value)
    for bound, suffix in ((1e9, "B"), (1e6, "M"), (1e3, "k")):
        if magnitude >= bound:
            return f"{value / bound:.3g}{suffix}"

    if isinstance(value, int) or float(value).is_integer():
        return str(int(value))

    return f"{value:.3g}"
