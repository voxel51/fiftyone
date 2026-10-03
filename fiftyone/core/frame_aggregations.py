"""
Frame-first aggregations for video collections.

Aggregations of frame fields otherwise attach every frame of each video to
its sample and unwind them. The plans built here instead read frame documents
directly:

-   when no stage selects samples, or the collection selects a single sample,
    the aggregation runs on the frame collection itself
-   otherwise, a ``$lookup`` computes a bounded partial result for each
    sample, and the partial results are merged

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.fields as fof
import fiftyone.core.frame_pipelines as fofp
import fiftyone.core.media as fom
import fiftyone.core.utils as fou

foa = fou.lazy_import("fiftyone.core.aggregations")
fost = fou.lazy_import("fiftyone.core.stages")


_FRAMES_PREFIX = [{"$unwind": "$frames"}]

_PARTIALS = "_partials"

_PER_DOCUMENT_OPS = {
    "$addFields",
    "$match",
    "$project",
    "$replaceRoot",
    "$replaceWith",
    "$set",
    "$unset",
    "$unwind",
}


def to_frames_pipeline(pipeline):
    """Converts an aggregation pipeline that unwinds the ``frames`` of each
    sample into the equivalent pipeline on frame documents.

    Args:
        pipeline: a MongoDB aggregation pipeline

    Returns:
        the pipeline on frame documents, or ``None``
    """
    if pipeline[:1] != _FRAMES_PREFIX:
        return None

    rest = pipeline[1:]
    frame_pipeline = []

    if rest and "$project" in rest[0]:
        spec = rest[0]["$project"]
        if not all(
            path.startswith("frames.") and value is True
            for path, value in spec.items()
        ):
            return None

        frame_pipeline.append(
            {"$project": {path[len("frames.") :]: True for path in spec}}
        )
        rest = rest[1:]

    if rest[:1] == [{"$replaceRoot": {"newRoot": "$frames"}}]:
        rest = rest[1:]
    elif frame_pipeline or rest != [{"$count": "count"}]:
        return None

    return frame_pipeline + rest


def plan_aggregation(sample_collection, aggregation, pipeline):
    """Plans a frame-first execution of the given aggregation.

    Args:
        sample_collection: the
            :class:`fiftyone.core.collections.SampleCollection` being
            aggregated
        aggregation: a :class:`fiftyone.core.aggregations.Aggregation`
        pipeline: the aggregation's
            :meth:`fiftyone.core.aggregations.Aggregation.to_mongo` pipeline

    Returns:
        an :class:`AggregationPlan`, or ``None`` if the aggregation requires
        a sample-first pipeline
    """
    frame_pipeline = aggregation._to_frames_mongo(sample_collection, pipeline)
    if frame_pipeline is None:
        return None

    result = fofp.make_plan(sample_collection)
    if result is None:
        return None

    plan, _ = result
    dataset = sample_collection._dataset

    if not dataset._is_clips:
        if not plan.sample_stages and dataset.media_type == fom.VIDEO:
            return AggregationPlan(sample_collection, plan, frame_pipeline)

        if _selects_one_sample(sample_collection):
            return AggregationPlan(
                sample_collection, plan, frame_pipeline, resolve_ids=True
            )

    # Partials are bounded by the number of distinct values of each sample
    if _has_unbounded_values(sample_collection, aggregation):
        return None

    split = _split(frame_pipeline)
    if split is None:
        return None

    return AggregationPlan(sample_collection, plan, frame_pipeline, split)


class AggregationPlan(object):
    """A frame-first execution of an aggregation.

    If :attr:`ids_pipeline` is not ``None``, run it on the sample collection
    first and pass the resulting sample IDs to :meth:`build`.
    """

    def __init__(
        self,
        sample_collection,
        plan,
        frame_pipeline,
        split=None,
        resolve_ids=False,
    ):
        self._sample_collection = sample_collection
        self._plan = plan
        self._frame_pipeline = frame_pipeline
        self._split = split

        if resolve_ids:
            self.ids_pipeline = self._sample_pipeline(
                [{"$project": {"_id": True}}]
            )
        else:
            self.ids_pipeline = None

    def build(self, sample_ids=None):
        """Builds the aggregation pipeline.

        Args:
            sample_ids (None): the sample IDs that :attr:`ids_pipeline`
                returned, if any

        Returns:
            a tuple of the name of the collection on which to run the
            pipeline and the pipeline
        """
        dataset = self._sample_collection._dataset
        plan = self._plan

        if self._split is None:
            pipeline = []
            if self.ids_pipeline is not None:
                pipeline.append(
                    {"$match": {"_sample_id": {"$in": sample_ids}}}
                )

            pipeline.extend(plan.frame_stages)
            pipeline.extend(self._frame_pipeline)
            return dataset._frame_collection_name, pipeline

        partial, merge = self._split
        if dataset._is_clips:
            project = {"_sample_id": True, "support": True}
        else:
            project = {"_id": True}

        tail = [
            {"$project": project},
            plan._lookup(plan.frame_stages + partial, _PARTIALS),
            {"$unwind": "$" + _PARTIALS},
            {"$replaceRoot": {"newRoot": "$" + _PARTIALS}},
        ]
        tail.extend(merge)

        return dataset._sample_collection_name, self._sample_pipeline(tail)

    def _sample_pipeline(self, pipeline):
        sample_collection = self._sample_collection
        if not getattr(sample_collection, "_stages", None):
            return sample_collection._pipeline(pipeline=pipeline)

        return sample_collection._dataset_pipeline(
            self._plan.sample_stages, pipeline=pipeline
        )


def _has_unbounded_values(sample_collection, aggregation):
    if isinstance(aggregation, foa.FacetAggregations):
        aggregations = aggregation._aggregations.values()
    else:
        aggregations = [aggregation]

    for agg in aggregations:
        if not isinstance(agg, (foa.CountValues, foa.Distinct)):
            continue

        if agg._expr is not None:
            return True

        field = sample_collection.get_field(agg._field_name)
        while isinstance(field, fof.ListField):
            field = field.field

        # IDs and filepaths are distinct per label or frame
        if isinstance(field, fof.ObjectIdField) or field is None:
            return True

        if agg._field_name.rsplit(".", 1)[-1] == "filepath":
            return True

    return False


def _selects_one_sample(sample_collection):
    return any(
        isinstance(stage, fost.Select) and len(stage.sample_ids) == 1
        for stage in getattr(sample_collection, "_stages", [])
    )


def _split(pipeline):
    """Splits a pipeline on frame documents into a partial pipeline that runs
    on the frames of one sample and a pipeline that merges the partial
    results of all samples, or returns ``None``.
    """
    for idx, stage in enumerate(pipeline):
        if len(stage) != 1:
            return None

        op, spec = next(iter(stage.items()))
        if op in _PER_DOCUMENT_OPS:
            continue

        if op == "$count":
            partial = stage
            merge = [{"$group": {"_id": None, spec: {"$sum": "$" + spec}}}]
        elif op == "$group":
            split = _split_accumulators(
                {k: v for k, v in spec.items() if k != "_id"}
            )
            if split is None:
                return None

            accumulators, merge = split
            partial = {"$group": {"_id": spec["_id"], **accumulators}}
        elif op == "$bucket":
            output = spec.get("output", {"count": {"$sum": 1}})
            split = _split_accumulators(output)
            if split is None:
                return None

            accumulators, merge = split
            partial = {"$bucket": {**spec, "output": accumulators}}
        elif op == "$facet":
            split = _split_facet(spec)
            if split is None:
                return None

            partial, merge = split
        else:
            return None

        return pipeline[:idx] + [partial], merge + pipeline[idx + 1 :]

    return None


def _split_accumulators(accumulators):
    partial = {}
    merged = {}
    final = {}
    helpers = []

    for name, accumulator in accumulators.items():
        if not isinstance(accumulator, dict) or len(accumulator) != 1:
            return None

        op, expr = next(iter(accumulator.items()))
        if op in ("$sum", "$min", "$max"):
            partial[name] = accumulator
            merged[name] = {op: "$" + name}
        elif op == "$addToSet":
            partial[name] = accumulator
            merged[name] = {"$push": "$" + name}
            final[name] = {
                "$reduce": {
                    "input": "$" + name,
                    "initialValue": [],
                    "in": {"$setUnion": ["$$value", "$$this"]},
                }
            }
        elif op == "$avg":
            total, count = "_avg_sum_" + name, "_avg_count_" + name
            partial[total] = {"$sum": expr}
            partial[count] = {"$sum": {"$cond": [{"$isNumber": expr}, 1, 0]}}
            merged[total] = {"$sum": "$" + total}
            merged[count] = {"$sum": "$" + count}
            final[name] = {
                "$cond": [
                    {"$gt": ["$" + count, 0]},
                    {"$divide": ["$" + total, "$" + count]},
                    None,
                ]
            }
            helpers.extend([total, count])
        else:
            return None

    merge = [{"$group": {"_id": "$_id", **merged}}]
    if final:
        merge.append({"$addFields": final})

    if helpers:
        merge.append({"$project": {h: False for h in helpers}})

    return partial, merge


def _split_facet(spec):
    partial = {}
    merged = {}
    for name, pipeline in spec.items():
        split = _split(pipeline)
        if split is None:
            return None

        partial[name], merge = split
        merged[name] = [
            {"$unwind": "$" + name},
            {"$replaceRoot": {"newRoot": "$" + name}},
        ] + merge

    return {"$facet": partial}, [{"$facet": merged}]
