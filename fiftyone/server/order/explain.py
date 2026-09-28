"""
FiftyOne Server order plan checks from MongoDB explain output.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""


def explain_streams(explain: dict, field: str) -> bool:
    """Whether the winning plan reads ``field``'s index in order, with no
    blocking sort in the query layer or the pipeline."""
    for stage in explain.get("stages", []):
        if "$sort" in stage or "$setWindowFields" in stage:
            return False

    plans = list(_find(explain, "winningPlan"))
    if not plans:
        return False

    stages = []
    for plan in plans:
        stages.extend(_plan_stages(plan))

    if any(s.get("stage") == "SORT" for s in stages):
        return False

    return any(
        s.get("stage") == "IXSCAN"
        and next(iter(s.get("keyPattern", {})), None) == field
        for s in stages
    )


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
