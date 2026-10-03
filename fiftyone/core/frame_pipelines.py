"""
Frame-first aggregation pipelines for video collections.

Sample-first pipelines attach every frame of each video as one ``frames``
array and then map over it, which exceeds MongoDB's memory limits for long
videos. The pipelines built here keep the sample pipeline in stage order but
run frame work inside ``$lookup`` sub-pipelines, one frame document at a time:

-   per-frame edits run in the sub-pipeline that attaches the frames
-   stages that select samples by their frames become existence lookups that
    stop at the first matching frame

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import contextlib
from datetime import date, datetime

from bson import ObjectId

import eta.core.utils as etau

import fiftyone.core.expressions as foe

_ENABLED = True

_MATCH_PREFIX = "_frames_match_"

_POSITIVE_OPS = {"$eq", "$gt", "$gte", "$lt", "$lte"}
_SCALAR_TYPES = (str, bool, int, float, ObjectId, datetime, date)


@contextlib.contextmanager
def _disabled():
    """Disables frame-first pipelines, to compare with sample-first ones."""
    global _ENABLED
    enabled = _ENABLED
    _ENABLED = False
    try:
        yield
    finally:
        _ENABLED = enabled


def make_pipeline(view, attach_frames=False, limit_frames=None, support=None):
    """Builds the frame-first pipeline for the stages of the given view.

    Args:
        view: a :class:`fiftyone.core.view.DatasetView`
        attach_frames (False): whether to attach the ``frames`` of each sample
        limit_frames (None): a maximum number of frames to attach per sample,
            counted after the view's per-frame stages
        support (None): an optional ``[first, last]`` frame range to which to
            restrict the frames of each sample

    Returns:
        the pipeline, or ``None`` if the view requires a sample-first pipeline
    """
    result = make_plan(view, support=support) if view._stages else None
    if result is None or not result[1]:
        return None

    plan = result[0]
    pipeline = plan.sample_stages
    if attach_frames:
        pipeline.append(plan.frames_lookup(limit_frames))

    return pipeline


def make_plan(sample_collection, support=None):
    """Splits the stages of the given collection into a pipeline on samples
    and a pipeline on frame documents.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        support (None): an optional ``[first, last]`` frame range to which to
            restrict the frames of each sample

    Returns:
        a tuple of the plan and whether a sample-first pipeline would attach
        frames for the stages, or ``None`` if the stages require a
        sample-first pipeline
    """
    if not _ENABLED:
        return None

    plan = _Plan(sample_collection._dataset, support)
    stages = getattr(sample_collection, "_stages", None)
    if not stages:
        return plan, False

    if sample_collection._is_dynamic_groups:
        return None

    attached = False

    _view = sample_collection._base_view
    for stage in stages:
        if (
            stage.flattens_groups
            or stage._needs_group_slices(_view)
            or stage._frame_role(_view) is None
        ):
            return None

        # Mirrors where a sample-first pipeline first attaches frames
        attached = attached or stage._needs_frames(_view)

        if not plan.add(stage.to_mongo(_view), attached):
            return None

        _view = _view._add_view_stage(stage, validate=False)

    return plan, attached


def is_frame_match(pipeline):
    """Whether the given ``$match`` pipeline selects samples by predicates
    that :func:`make_pipeline` can check one frame at a time.

    Args:
        pipeline: a MongoDB aggregation pipeline

    Returns:
        True/False
    """
    plan = _Plan(None, None)
    return all(
        "$match" in d and plan.compile_query(d["$match"]) is not None
        for d in pipeline
    )


class _Plan(object):
    def __init__(self, dataset, support):
        self.dataset = dataset
        self.support = support
        self.sample_stages = []
        self.frame_stages = []
        self._num_matches = 0
        self._lookups = []

    def add(self, pipeline, attached):
        for d in pipeline:
            if len(d) != 1:
                return False

            op, spec = next(iter(d.items()))

            if op == "$project":
                if not self._add_project(spec, attached):
                    return False
            elif not foe.is_frames_expr(d):
                self.sample_stages.append(d)
            elif not attached:
                return False
            elif op == "$addFields" and list(spec.keys()) == ["frames"]:
                frame_stage = _to_frame_stage(spec["frames"])
                if frame_stage is None:
                    return False

                self.frame_stages.append(frame_stage)
            elif op == "$match":
                if not self._add_match(spec):
                    return False
            else:
                return False

        return True

    def frames_lookup(self, limit_frames):
        pipeline = [{"$sort": {"frame_number": 1}}]
        pipeline.extend(self.frame_stages)
        if limit_frames:
            pipeline.append({"$limit": limit_frames})

        return self._lookup(pipeline, "frames")

    def compile_query(self, query):
        if not isinstance(query, dict):
            return None

        parts = []
        for key, value in query.items():
            if key in ("$and", "$or", "$nor") and isinstance(value, list):
                clauses = _all_or_none(self.compile_query(q) for q in value)
                clause = None if clauses is None else {key: clauses}
            elif key == "$expr":
                clause = self._compile_expr(value)
            elif key == "frames" or key.startswith("frames."):
                clause = self._compile_frames_path(key, value)
            elif key.startswith("$") or foe.is_frames_expr(value):
                clause = None
            else:
                clause = {key: value}

            if clause is None:
                return None

            parts.append(clause)

        if len(parts) <= 1:
            return parts[0] if parts else {}

        return {"$and": parts}

    def _add_project(self, spec, attached):
        if not all(isinstance(v, (bool, int)) for v in spec.values()):
            return False

        if spec.get("frames", True) is not True and spec.get("frames") != 1:
            return False

        sample_spec = {}
        frame_spec = {}
        for path, value in spec.items():
            if path.startswith("frames."):
                frame_spec[path[len("frames.") :]] = value
            elif path != "frames":
                sample_spec[path] = value

        inclusion = any(v for k, v in spec.items() if k != "_id")

        if inclusion:
            sample_spec["frames"] = True
            if "frames" in spec:
                frame_spec = {}
            elif frame_spec:
                frame_spec.setdefault("_id", False)

        if sample_spec:
            self.sample_stages.append({"$project": sample_spec})

        if attached and frame_spec:
            self.frame_stages.append({"$project": frame_spec})

        return True

    def _add_match(self, query):
        self._lookups = []
        clause = self.compile_query(query)
        if clause is None:
            return False

        names = [lookup["$lookup"]["as"] for lookup in self._lookups]
        self.sample_stages.extend(self._lookups)
        self.sample_stages.append({"$match": clause})
        if names:
            self.sample_stages.append({"$project": {n: False for n in names}})

        return True

    def _compile_expr(self, expr):
        if not foe.is_frames_expr(expr):
            return {"$expr": expr}

        if not isinstance(expr, dict) or len(expr) != 1:
            return None

        op, args = next(iter(expr.items()))
        if not isinstance(args, list):
            return None

        if op in ("$and", "$or") or (op == "$not" and len(args) == 1):
            clauses = _all_or_none(self._compile_expr(e) for e in args)
            if clauses is None:
                return None

            return {"$nor" if op == "$not" else op: clauses}

        if len(args) != 2:
            return None

        count, value = args
        if [op, value] in (["$gt", 0], ["$gte", 1]):
            positive = True
        elif [op, value] in (["$eq", 0], ["$lte", 0], ["$lt", 1]):
            positive = False
        else:
            return None

        predicate = _parse_frame_count(count)
        if predicate is None:
            return None

        return self._exists(predicate, positive)

    def _compile_frames_path(self, path, cond):
        field = path[len("frames.") :]
        if path == "frames" or any(c.isdigit() for c in field.split(".")):
            return None

        if isinstance(cond, dict):
            if not cond or not all(k.startswith("$") for k in cond):
                return None

            conds = list(cond.items())
        else:
            conds = [("$eq", cond)]

        # Array queries apply each operator to any element independently, so
        # each operator is its own existence check
        clauses = []
        for op, value in conds:
            if op in _POSITIVE_OPS and _is_scalar(value):
                query, positive = {field: {op: value}}, True
            elif op == "$ne" and _is_scalar(value):
                query, positive = {field: {"$eq": value}}, False
            elif op in ("$in", "$nin") and _is_scalar(value, many=True):
                query, positive = {field: {"$in": value}}, op == "$in"
            elif op == "$exists" and isinstance(value, bool):
                query, positive = {field: {"$exists": True}}, value
            else:
                return None

            clauses.append(self._exists([{"$match": query}], positive))

        if len(clauses) == 1:
            return clauses[0]

        return {"$and": clauses}

    def _exists(self, predicate, positive):
        name = _MATCH_PREFIX + str(self._num_matches)
        self._num_matches += 1

        if self.dataset is not None:
            pipeline = list(self.frame_stages)
            pipeline.extend(predicate)
            pipeline.extend([{"$limit": 1}, {"$project": {"_id": True}}])
            self._lookups.append(self._lookup(pipeline, name))

        return {name: {"$ne" if positive else "$eq": []}}

    def _lookup(self, pipeline, as_field):
        dataset = self.dataset
        support = self.support
        let = None
        local_field = "_id"

        if dataset._is_clips:
            first = {"$arrayElemAt": ["$support", 0]}
            last = {"$arrayElemAt": ["$support", 1]}
            if support is not None:
                first = {"$max": [first, support[0]]}
                last = {"$min": [last, support[1]]}

            let = {"first": first, "last": last}
            local_field = "_sample_id"
            match = {
                "$expr": {
                    "$and": [
                        {"$gte": ["$frame_number", "$$first"]},
                        {"$lte": ["$frame_number", "$$last"]},
                    ]
                }
            }
            pipeline = [{"$match": match}] + pipeline
        elif support is not None:
            match = {"frame_number": {"$gte": support[0], "$lte": support[1]}}
            pipeline = [{"$match": match}] + pipeline

        lookup = {
            "from": dataset._frame_collection_name,
            "localField": local_field,
            "foreignField": "_sample_id",
            "pipeline": pipeline,
            "as": as_field,
        }
        if let is not None:
            lookup["let"] = let

        return {"$lookup": lookup}


def _to_frame_stage(frames_expr):
    """Converts an expression that maps or filters the ``frames`` array into
    a stage on frame documents, or returns ``None``.
    """
    if not isinstance(frames_expr, dict) or len(frames_expr) != 1:
        return None

    op, spec = next(iter(frames_expr.items()))
    if op not in ("$map", "$filter") or spec.get("input") != "$frames":
        return None

    var = spec.get("as", "this")
    expr = spec.get("in") if op == "$map" else spec.get("cond")
    if expr is None or _has_root_refs(expr):
        return None

    frame_expr = {"$let": {"vars": {var: "$$ROOT"}, "in": expr}}
    if op == "$map":
        return {"$replaceWith": frame_expr}

    return {"$match": {"$expr": frame_expr}}


def _parse_frame_count(count):
    """Parses an expression that counts frames (or labels in frames) into
    the ``$match`` stages that select the frames that contribute to the
    count, or returns ``None``.
    """
    if count == {"$size": {"$ifNull": ["$frames", []]}}:
        return []

    if not isinstance(count, dict) or len(count) != 1:
        return None

    if "$reduce" in count:
        spec = count["$reduce"]
        add = spec.get("in")
        terms = (
            add.get("$add") if isinstance(add, dict) and len(add) == 1 else []
        )
        if (
            spec.get("input") != "$frames"
            or spec.get("initialValue") != 0
            or len(terms) != 2
            or terms[0] != "$$value"
        ):
            return None

        # Only nonnegative, non-null terms, so a positive sum means a positive
        # term: sizes, and booleans cast to 0 or 1
        term = terms[1]
        if (
            not isinstance(term, dict)
            or len(term) != 1
            or not _is_nonnegative_count(term)
            or _has_root_refs(term)
            or _contains(term, "$$value")
        ):
            return None

        expr = {"$gt": [{"$let": {"vars": {"this": "$$ROOT"}, "in": term}}, 0]}
        return [{"$match": {"$expr": expr}}]

    if "$size" in count:
        spec = count["$size"]
        single = isinstance(spec, dict) and len(spec) == 1
        args = spec.get("$ifNull") if single else None
        if not args or len(args) != 2 or args[1] != []:
            return None

        frame_stage = _to_frame_stage(args[0])
        return (
            [frame_stage] if frame_stage and "$match" in frame_stage else None
        )

    return None


_BOOLEAN_OPERATORS = {
    "$and",
    "$or",
    "$not",
    "$eq",
    "$ne",
    "$gt",
    "$gte",
    "$lt",
    "$lte",
    "$in",
    "$anyElementTrue",
    "$allElementsTrue",
    "$isArray",
    "$regexMatch",
}


def _is_nonnegative_count(term):
    """Whether a ``$reduce`` term is a ``$size`` or a boolean cast to 0 or 1."""
    op, arg = next(iter(term.items()))
    if op == "$size":
        return True

    return (
        op == "$toInt"
        and isinstance(arg, dict)
        and len(arg) == 1
        and next(iter(arg)) in _BOOLEAN_OPERATORS
    )


def _has_root_refs(expr):
    """Whether the expression references the root document, which is the
    sample in an array expression but the frame in a frame stage.
    """
    if etau.is_str(expr):
        if expr.startswith("$$"):
            return expr.startswith(("$$ROOT", "$$CURRENT"))

        return expr.startswith("$")

    if isinstance(expr, dict):
        return any(
            _has_root_refs(v) for k, v in expr.items() if k != "$literal"
        )

    if isinstance(expr, (list, tuple)):
        return any(_has_root_refs(e) for e in expr)

    return False


def _all_or_none(values):
    values = list(values)
    if any(v is None for v in values):
        return None

    return values


def _contains(expr, value):
    if isinstance(expr, dict):
        return any(_contains(v, value) for v in expr.values())

    if isinstance(expr, (list, tuple)):
        return any(_contains(e, value) for e in expr)

    return expr == value


def _is_scalar(value, many=False):
    if many:
        return isinstance(value, (list, tuple)) and all(map(_is_scalar, value))

    return isinstance(value, _SCALAR_TYPES)
