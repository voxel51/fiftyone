"""
FiftyOne Server ``/embeddings/v2`` route tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import struct
import unittest
from unittest import mock

import numpy as np

import fiftyone as fo
import fiftyone.brain as fob
from fiftyone.core.odm.runs import RunDocument

from fiftyone.server.routes import embeddings_v2 as v2

from decorators import drop_datasets


def _parse(response):
    body = response.body
    magic, version, dtype, width, n, flags = struct.unpack(
        "<IHBBII", body[:16]
    )
    assert magic == v2.MAGIC
    assert version == v2.VERSION
    return dtype, width, n, flags, body[16:]


def _parse_color(response):
    """Splits a /v2/color body into (dtype, n, column bytes, meta dict)."""
    dtype, _, n, _, payload = _parse(response)
    itemsize = 2 if dtype == v2.DTYPE_U16 else 4
    column = payload[: n * itemsize]
    meta = json.loads(payload[n * itemsize :].decode("utf-8"))
    return dtype, n, column, meta


def _unpack_masks(payload, n):
    nbytes = (n + 7) // 8
    visible = np.unpackbits(
        np.frombuffer(payload[:nbytes], dtype=np.uint8), bitorder="little"
    )[:n]
    match = np.unpackbits(
        np.frombuffer(payload[nbytes:], dtype=np.uint8), bitorder="little"
    )[:n]
    return visible.astype(bool), match.astype(bool)


def _make_samples_run(n=20):
    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(
                filepath=f"/tmp/img{i}.png",
                cluster=f"c{i % 3}",
                score=float(i),
            )
            for i in range(n)
        ]
    )
    points = np.stack(
        [np.arange(n, dtype=float), -np.arange(n, dtype=float)], axis=1
    )
    fob.compute_visualization(dataset, points=points, brain_key="viz")
    return dataset, points


def _make_patches_run():
    dataset = fo.Dataset()
    samples = []
    for i in range(5):
        detections = [
            fo.Detection(label=f"d{j}", bounding_box=[0.1, 0.1, 0.2, 0.2])
            for j in range(2)
        ]
        samples.append(
            fo.Sample(
                filepath=f"/tmp/img{i}.png",
                ground_truth=fo.Detections(detections=detections),
            )
        )

    dataset.add_samples(samples)
    num_patches = dataset.count("ground_truth.detections")
    points = np.random.default_rng(51).normal(size=(num_patches, 2))
    fob.compute_visualization(
        dataset,
        patches_field="ground_truth",
        points=points,
        brain_key="viz_patches",
    )
    return dataset, points


class ServerEmbeddingsV2Tests(unittest.TestCase):
    @drop_datasets
    def test_run_info(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}

        info = v2.EmbeddingsV2RunInfo._post_sync(None, base)
        self.assertEqual(info["n"], len(points))
        self.assertEqual(info["dims"], 2)
        self.assertIsNone(info["patchesField"])
        self.assertIsNotNone(info["timestamp"])

    @drop_datasets
    def test_runs_status(self):
        # The status route peeks at run documents only, so it must agree
        # with the dataset query's own readiness/error verdicts without
        # loading results or reconstructing the dataset object
        dataset, _ = _make_samples_run()
        viz_doc = dataset._doc.brain_methods["viz"]

        pending_doc = RunDocument(
            dataset_id=viz_doc.dataset_id,
            key="pending",
            version=viz_doc.version,
            timestamp=viz_doc.timestamp,
            config=viz_doc.config,
        )
        pending_doc.save()

        broken_doc = RunDocument(
            dataset_id=viz_doc.dataset_id,
            key="broken",
            version=viz_doc.version,
            timestamp=viz_doc.timestamp,
            config={"cls": "fiftyone.brain.visualization.Removed"},
        )
        broken_doc.save()

        dataset._doc.brain_methods["pending"] = pending_doc
        dataset._doc.brain_methods["broken"] = broken_doc
        dataset._doc.save()

        statuses = {
            s["brainKey"]: s
            for s in v2.EmbeddingsV2RunsStatus._post_sync(
                None, {"datasetId": str(dataset._doc.id)}
            )["runs"]
        }
        self.assertTrue(statuses["viz"]["ready"])
        self.assertIsNone(statuses["viz"]["error"])
        self.assertFalse(statuses["pending"]["ready"])
        self.assertIsNone(statuses["pending"]["error"])
        self.assertIn("not importable", statuses["broken"]["error"])

    def test_dataset_query_reports_run_readiness(self):
        # A run doc exists as soon as a computation registers, but its
        # results-blob pointer is only set when results save — clicking
        # such a run must be preventable, so the dataset query reports
        # readiness on every brain run (presence of the reference, never
        # a load of it)
        from fiftyone.server.query import Dataset as DatasetQuery

        doc = {
            "_id": "5f99d2eb0e6c99c377f8886c",
            "brain_methods": {
                "done": {"key": "done", "results": "gridfs-ref"},
                "pending": {"key": "pending", "results": None},
            },
        }
        modified = DatasetQuery.modifier(doc)
        ready = {run["key"]: run["ready"] for run in modified["brain_methods"]}
        self.assertTrue(ready["done"])
        self.assertFalse(ready["pending"])

    def test_dataset_query_passes_run_references_through(self):
        # Raw dataset docs (the datasets-list paginator) hold brain_methods
        # as ObjectId REFERENCES, not dicts — only materialized run docs can
        # be decorated; references pass through untouched, as on develop
        from bson import ObjectId

        from fiftyone.server.query import Dataset as DatasetQuery

        ref = ObjectId()
        doc = {
            "_id": "5f99d2eb0e6c99c377f8886c",
            "brain_methods": {"viz": ref},
        }
        modified = DatasetQuery.modifier(doc)
        self.assertEqual(modified["brain_methods"], [ref])

    def test_dataset_query_reports_run_errors_without_loading_results(self):
        # A run whose stored config class no longer imports (it predates a
        # rename) is unusable, and the list page must say so — derived from
        # the run DOCUMENT alone, never by loading its results
        from fiftyone.server.query import Dataset as DatasetQuery

        doc = {
            "_id": "5f99d2eb0e6c99c377f8886c",
            "brain_methods": {
                "ok": {
                    "key": "ok",
                    "results": "ref",
                    "config": {"cls": "fiftyone.core.stages.Select"},
                },
                "stale": {
                    "key": "stale",
                    "results": "ref",
                    "config": {"cls": "fiftyone.gone.Missing"},
                },
                "malformed": {"key": "malformed", "results": "ref"},
            },
        }
        errors = {
            run["key"]: run["error"]
            for run in DatasetQuery.modifier(doc)["brain_methods"]
        }
        self.assertIsNone(errors["ok"])
        self.assertIn("not importable", errors["stale"])
        self.assertEqual(errors["malformed"], "run document has no config")

    @drop_datasets
    def test_geometry_columns(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}

        dtype, width, n, _, payload = _parse(
            v2.EmbeddingsV2Geometry._post_sync(None, base)
        )
        self.assertEqual((dtype, width, n), (v2.DTYPE_F32, 2, len(points)))

        xs = np.frombuffer(payload[: 4 * n], dtype="<f4")
        ys = np.frombuffer(payload[4 * n :], dtype="<f4")
        np.testing.assert_allclose(xs, points[:, 0].astype("f4"))
        np.testing.assert_allclose(ys, points[:, 1].astype("f4"))

    @drop_datasets
    def test_column_slicing(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}
        results = dataset.load_brain_results("viz")

        dtype, width, n, _, payload = _parse(
            v2.EmbeddingsV2Geometry._post_sync(
                None, {**base, "offset": 5, "limit": 7}
            )
        )
        self.assertEqual(n, 7)
        xs = np.frombuffer(payload[: 4 * n], dtype="<f4")
        np.testing.assert_allclose(xs, points[5:12, 0].astype("f4"))

        _, _, n, _, payload = _parse(
            v2.EmbeddingsV2Ids._post_sync(
                None, {**base, "offset": 5, "limit": 7}
            )
        )
        self.assertEqual(n, 7)
        self.assertEqual(payload[:12].hex(), str(results.sample_ids[5]))

        # A limit past the end clamps
        _, _, n, _, _ = _parse(
            v2.EmbeddingsV2Geometry._post_sync(
                None, {**base, "offset": 15, "limit": 100}
            )
        )
        self.assertEqual(n, 5)

    @drop_datasets
    def test_ids_column(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}
        results = dataset.load_brain_results("viz")

        dtype, width, n, _, payload = _parse(
            v2.EmbeddingsV2Ids._post_sync(None, base)
        )
        self.assertEqual((dtype, width, n), (v2.DTYPE_BYTES12, 1, len(points)))
        self.assertEqual(len(payload), n * 12)

        for i in (0, n - 1):
            self.assertEqual(
                payload[i * 12 : (i + 1) * 12].hex(),
                str(results.sample_ids[i]),
            )

    @drop_datasets
    def test_color_categorical(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}

        dtype, n, column, meta = _parse_color(
            v2.EmbeddingsV2Color._post_sync(None, {**base, "field": "cluster"})
        )
        self.assertEqual(dtype, v2.DTYPE_U16)
        self.assertEqual(n, len(points))
        self.assertEqual(meta["style"], "categorical")
        self.assertEqual(len(meta["classes"]), 3)
        self.assertEqual(sum(c["count"] for c in meta["classes"]), len(points))
        # Scalar field: column values ARE the field values, so clients
        # may evaluate filters against the column locally
        self.assertTrue(meta["exact"])

        indices = np.frombuffer(column, dtype="<u2")
        labels = [meta["classes"][i]["label"] for i in indices]
        self.assertEqual(labels, dataset.values("cluster"))

    @drop_datasets
    def test_color_continuous(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}

        dtype, _, column, meta = _parse_color(
            v2.EmbeddingsV2Color._post_sync(None, {**base, "field": "score"})
        )
        self.assertEqual(dtype, v2.DTYPE_F32)
        self.assertEqual(meta["style"], "continuous")
        self.assertEqual(meta["min"], 0.0)
        self.assertEqual(meta["max"], float(len(points) - 1))

        values = np.frombuffer(column, dtype="<f4")
        np.testing.assert_allclose(values, dataset.values("score"))

    @drop_datasets
    def test_color_aggregates_once_and_caches(self):
        dataset, _ = _make_samples_run()
        base = {
            "datasetName": dataset.name,
            "brainKey": "viz",
            "field": "cluster",
        }
        v2._color_cache.clear()

        # The whole point of the merged endpoint: one values aggregation
        # per (run, field), and the cache absorbs repeat selections
        with mock.patch.object(
            v2, "_color_data", wraps=v2._color_data
        ) as color_data:
            first = v2.EmbeddingsV2Color._post_sync(None, base)
            second = v2.EmbeddingsV2Color._post_sync(None, base)

        self.assertEqual(color_data.call_count, 1)
        self.assertEqual(first.body, second.body)

        # A different field is a different cache entry
        with mock.patch.object(
            v2, "_color_data", wraps=v2._color_data
        ) as color_data:
            v2.EmbeddingsV2Color._post_sync(None, {**base, "field": "score"})

        self.assertEqual(color_data.call_count, 1)

    @drop_datasets
    def test_masks(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}
        results = dataset.load_brain_results("viz")
        n = len(points)

        # No view, no filters: early-out flags, all ones
        _, width, _, flags, payload = _parse(
            v2.EmbeddingsV2Masks._post_sync(None, base)
        )
        self.assertEqual(width, 2)
        self.assertEqual(flags, v2.FLAG_ALL_VISIBLE | v2.FLAG_ALL_MATCH)
        visible, match = _unpack_masks(payload, n)
        self.assertTrue(visible.all())
        self.assertTrue(match.all())

        # A view subsets visibility; a selection subsets match
        view = dataset.take(7, seed=51)
        view_ids = set(view.values("id"))
        selection = dataset.values("id")[:3]

        _, _, _, flags, payload = _parse(
            v2.EmbeddingsV2Masks._post_sync(
                None,
                {
                    **base,
                    "view": view._serialize(),
                    "extendedSelection": selection,
                },
            )
        )
        self.assertEqual(flags, 0)
        visible, match = _unpack_masks(payload, n)
        run_ids = np.array([str(_id) for _id in results.sample_ids])
        self.assertEqual(set(run_ids[visible]), view_ids)
        self.assertEqual(set(run_ids[match]), set(selection))

    @drop_datasets
    def test_lasso_polygon(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}
        results = dataset.load_brain_results("viz")

        # Points are (i, -i); enclose the first five
        polygon = [[-0.5, 0.5], [4.5, 0.5], [4.5, -4.5], [-0.5, -4.5]]
        res = v2.EmbeddingsV2LassoStage._post_sync(
            None, {**base, "view": None, "polygon": polygon}
        )
        self.assertTrue(res["_cls"].endswith("Select"))
        self.assertEqual(res["count"], 5)
        self.assertEqual(
            set(res["kwargs"]["sample_ids"]),
            {str(_id) for _id in results.sample_ids[:5]},
        )

    @drop_datasets
    def test_lasso_indices(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}
        results = dataset.load_brain_results("viz")

        res = v2.EmbeddingsV2LassoStage._post_sync(
            None, {**base, "view": None, "indices": [1, 3]}
        )
        self.assertEqual(res["count"], 2)
        self.assertEqual(
            res["kwargs"]["sample_ids"],
            [str(results.sample_ids[1]), str(results.sample_ids[3])],
        )

    @drop_datasets
    def test_lasso_patches_plot_samples_view(self):
        dataset, _ = _make_patches_run()
        res = v2.EmbeddingsV2LassoStage._post_sync(
            None,
            {
                "datasetName": dataset.name,
                "brainKey": "viz_patches",
                "view": None,
                "indices": [0, 1],
            },
        )
        self.assertTrue(res["_cls"].endswith("MatchLabels"))
        self.assertEqual(res["count"], 2)

    @drop_datasets
    def test_patches_ids_kinds(self):
        dataset, points = _make_patches_run()
        base = {"datasetName": dataset.name, "brainKey": "viz_patches"}
        results = dataset.load_brain_results("viz_patches")
        n = len(points)

        _, _, _, _, payload = _parse(
            v2.EmbeddingsV2Ids._post_sync(None, {**base, "kind": "points"})
        )
        self.assertEqual(payload[:12].hex(), str(results.label_ids[0]))

        _, _, _, _, payload = _parse(
            v2.EmbeddingsV2Ids._post_sync(None, {**base, "kind": "samples"})
        )
        self.assertEqual(payload[:12].hex(), str(results.sample_ids[0]))

    @drop_datasets
    def test_sample_info(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}
        results = dataset.load_brain_results("viz")

        res = v2.EmbeddingsV2SampleInfo._post_sync(
            None, {**base, "index": 4, "field": "cluster"}
        )
        self.assertEqual(res["sampleId"], str(results.sample_ids[4]))
        self.assertEqual(res["id"], res["sampleId"])
        self.assertEqual(res["value"], "c1")
        # Media is a filepath for the client's getSampleSrc(), not a URL
        self.assertEqual(res["media"], res["filepath"])

        with self.assertRaises(ValueError):
            v2.EmbeddingsV2SampleInfo._post_sync(
                None, {**base, "index": len(points)}
            )

    @drop_datasets
    def test_sample_info_deleted_sample(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}
        results = dataset.load_brain_results("viz")

        deleted_id = str(results.sample_ids[0])
        dataset.delete_samples([deleted_id])

        res = v2.EmbeddingsV2SampleInfo._post_sync(None, {**base, "index": 0})
        self.assertEqual(res["sampleId"], deleted_id)
        self.assertIsNone(res["media"])
        self.assertIsNone(res["filepath"])
        self.assertIsNone(res["value"])

    @drop_datasets
    def test_color_high_cardinality_strings(self):
        # More distinct string values than MAX_CATEGORIES: must stay
        # categorical (strings can't encode as f32), capped to the top
        # MAX_CATEGORIES classes by count, remainder marked missing
        n = v2.MAX_CATEGORIES + 50
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath=f"/tmp/img{i}.png", name=f"unique_{i:04d}")
                for i in range(n)
            ]
        )
        points = np.zeros((n, 2))
        fob.compute_visualization(dataset, points=points, brain_key="viz")
        base = {"datasetName": dataset.name, "brainKey": "viz"}

        dtype, _, column, meta = _parse_color(
            v2.EmbeddingsV2Color._post_sync(None, {**base, "field": "name"})
        )
        self.assertEqual(meta["style"], "categorical")
        self.assertEqual(len(meta["classes"]), v2.MAX_CATEGORIES)
        self.assertTrue(meta["truncated"])

        self.assertEqual(dtype, v2.DTYPE_U16)
        indices = np.frombuffer(column, dtype="<u2")
        missing = int((indices == v2.MISSING_CATEGORY).sum())
        self.assertEqual(missing, n - v2.MAX_CATEGORIES)

    @drop_datasets
    def test_color_int_high_cardinality_is_continuous(self):
        n = v2.MAX_CATEGORIES + 50
        dataset = fo.Dataset()
        dataset.add_samples(
            [fo.Sample(filepath=f"/tmp/img{i}.png", index=i) for i in range(n)]
        )
        points = np.zeros((n, 2))
        fob.compute_visualization(dataset, points=points, brain_key="viz")
        base = {"datasetName": dataset.name, "brainKey": "viz"}

        _, _, _, meta = _parse_color(
            v2.EmbeddingsV2Color._post_sync(None, {**base, "field": "index"})
        )
        self.assertEqual(meta["style"], "continuous")
        self.assertEqual(meta["max"], float(n - 1))

    @drop_datasets
    def test_color_list_field_collapses_to_first(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="/tmp/a.png", letters=["a", "b"]),
                fo.Sample(filepath="/tmp/b.png", letters=["c"]),
                fo.Sample(filepath="/tmp/c.png", letters=[]),
            ]
        )
        points = np.zeros((3, 2))
        fob.compute_visualization(dataset, points=points, brain_key="viz")
        base = {"datasetName": dataset.name, "brainKey": "viz"}

        _, _, column, meta = _parse_color(
            v2.EmbeddingsV2Color._post_sync(None, {**base, "field": "letters"})
        )
        self.assertEqual(meta["style"], "categorical")
        self.assertEqual({c["label"] for c in meta["classes"]}, {"a", "c"})
        # Collapsed values are lossy: the ["a", "b"] sample's column
        # value says nothing about "b", so filters must NOT be
        # evaluated against the column client-side
        self.assertFalse(meta["exact"])

        indices = np.frombuffer(column, dtype="<u2")
        # The empty-list sample is missing
        self.assertEqual(indices[2], v2.MISSING_CATEGORY)

    @drop_datasets
    def test_color_label_list_field(self):
        # Label-list paths (detections.label) yield a LIST per point
        # while the schema's leaf field is a scalar StringField — the
        # values, not the schema, carry the listiness. Regression: this
        # crashed the endpoint (unhashable list) on any detections
        # dataset
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(
                    filepath="/tmp/a.png",
                    gt=fo.Detections(
                        detections=[
                            fo.Detection(label="cat"),
                            fo.Detection(label="dog"),
                        ]
                    ),
                ),
                fo.Sample(filepath="/tmp/b.png", gt=fo.Detections()),
            ]
        )
        points = np.zeros((2, 2))
        fob.compute_visualization(dataset, points=points, brain_key="viz")
        base = {"datasetName": dataset.name, "brainKey": "viz"}

        _, _, column, meta = _parse_color(
            v2.EmbeddingsV2Color._post_sync(
                None, {**base, "field": "gt.detections.label"}
            )
        )
        self.assertEqual(meta["style"], "categorical")
        self.assertEqual({c["label"] for c in meta["classes"]}, {"cat"})
        self.assertFalse(meta["exact"])

        indices = np.frombuffer(column, dtype="<u2")
        self.assertEqual(indices[1], v2.MISSING_CATEGORY)

    @drop_datasets
    def test_color_missing_values(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample(filepath="/tmp/a.png", grade="x", score=1.0),
                fo.Sample(filepath="/tmp/b.png"),
            ]
        )
        points = np.zeros((2, 2))
        fob.compute_visualization(dataset, points=points, brain_key="viz")
        base = {"datasetName": dataset.name, "brainKey": "viz"}

        _, _, column, meta = _parse_color(
            v2.EmbeddingsV2Color._post_sync(None, {**base, "field": "grade"})
        )
        self.assertEqual(sum(c["count"] for c in meta["classes"]), 1)

        indices = np.frombuffer(column, dtype="<u2")
        self.assertEqual(indices[1], v2.MISSING_CATEGORY)

        _, _, column, meta = _parse_color(
            v2.EmbeddingsV2Color._post_sync(None, {**base, "field": "score"})
        )
        self.assertEqual((meta["min"], meta["max"]), (1.0, 1.0))

        values = np.frombuffer(column, dtype="<f4")
        self.assertTrue(np.isnan(values[1]))

    @drop_datasets
    def test_sample_info_video_media_is_null(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(filepath="/tmp/clip.mp4"))
        points = np.zeros((1, 2))
        fob.compute_visualization(dataset, points=points, brain_key="viz")

        res = v2.EmbeddingsV2SampleInfo._post_sync(
            None,
            {"datasetName": dataset.name, "brainKey": "viz", "index": 0},
        )
        self.assertIsNone(res["media"])
        self.assertTrue(res["filepath"].endswith("clip.mp4"))

    @drop_datasets
    def test_negative_slices_are_rejected(self):
        # Python's negative slicing would "work" and return unrelated
        # wire-order rows — a protocol violation must raise instead
        dataset, _ = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}

        for bad in (
            {"offset": -1},
            {"limit": -5},
            # Fractions must reject, not truncate into a different slice
            {"offset": 0.5},
            {"limit": 1.5},
        ):
            with self.assertRaises(ValueError):
                v2.EmbeddingsV2Geometry._post_sync(None, {**base, **bad})

    @drop_datasets
    def test_invalid_lasso_indices_are_rejected(self):
        # Negative indices silently select from the end of the arrays
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz", "view": []}

        for bad in ([-1], [len(points)], [[0, 1]], [1.5]):
            with self.assertRaises(ValueError):
                v2.EmbeddingsV2LassoStage._post_sync(
                    None, {**base, "indices": bad}
                )

    @drop_datasets
    def test_unknown_brain_key_raises(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(filepath="/tmp/a.png"))

        with self.assertRaises(ValueError):
            v2.EmbeddingsV2RunInfo._post_sync(
                None,
                {"datasetName": dataset.name, "brainKey": "nope"},
            )

    def test_points_in_polygon(self):
        xs = np.array([0.5, 2.0, 0.5, -1.0])
        ys = np.array([0.5, 0.5, 2.0, 0.5])
        square = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=float)
        np.testing.assert_array_equal(
            v2._points_in_polygon(xs, ys, square),
            [True, False, False, False],
        )

        # Concave "C": the notch on the right is outside
        c_shape = np.array(
            [
                [0, 0],
                [10, 0],
                [10, 3],
                [3, 3],
                [3, 7],
                [10, 7],
                [10, 10],
                [0, 10],
            ],
            dtype=float,
        )
        xs = np.array([1.0, 8.0])
        ys = np.array([5.0, 5.0])
        np.testing.assert_array_equal(
            v2._points_in_polygon(xs, ys, c_shape), [True, False]
        )


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
