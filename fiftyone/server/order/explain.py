"""
FiftyOne Server order plan checks from MongoDB explain output.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

_STREAMING_STAGES = {"$cursor", "$project", "$addFields", "$set", "$unset"}


def explain_serves(explain: dict, field: str) -> bool:
    """Whether the winning plan reads ``field``'s index in order and the
    index bounds serve every filter: no blocking sort, no collection scan,
    and no filter on a field the scan does not lead with.
    """
    for stage in explain.get("stages", []):
        if not set(stage) <= _STREAMING_STAGES:
            return False

    plans = list(_find(explain, "winningPlan"))
    if not plans:
        return False

    stages = []
    for plan in plans:
        stages.extend(_plan_stages(plan))

    if any(s.get("stage") in ("SORT", "COLLSCAN") for s in stages):
        return False

    filtered = set()
    for s in stages:
        filtered |= _fields(s.get("filter"))

    for s in stages:
        if s.get("stage") != "IXSCAN":
            continue

        keys = list(s.get("keyPattern", {}))
        if field in keys and filtered <= set(keys[: keys.index(field) + 1]):
            return True

    return False


def _fields(predicate) -> set:
    """The document fields a match predicate reads."""
    fields = set()
    if isinstance(predicate, dict):
        for k, v in predicate.items():
            if not k.startswith("$"):
                fields.add(k)
            fields |= _fields(v)
    elif isinstance(predicate, list):
        for v in predicate:
            fields |= _fields(v)
    elif isinstance(predicate, str):
        if predicate.startswith("$") and not predicate.startswith("$$"):
            fields.add(predicate[1:])

    return fields


def _find(value, name: str):
    if isinstance(value, dict):
        for k, v in value.items():
            if k == name:
                yield v
            else:
                yield from _find(v, name)
    elif isinstance(value, list):
        for v in value:
            yield from _find(v, name)


def _plan_stages(plan):
    if isinstance(plan, dict):
        if "stage" in plan:
            yield plan

        for k, v in plan.items():
            if k in ("inputStage", "inputStages", "queryPlan"):
                yield from _plan_stages(v)
    elif isinstance(plan, list):
        for v in plan:
            yield from _plan_stages(v)
