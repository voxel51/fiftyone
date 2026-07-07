"""
FiftyOne Server ``/embeddings/v2`` route tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import struct
import unittest

import numpy as np

import fiftyone as fo
import fiftyone.brain as fob

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
    def test_runs_and_run_info(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}

        runs = v2.EmbeddingsV2Runs._post_sync(
            None, {"datasetName": dataset.name}
        )["runs"]
        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["brainKey"], "viz")
        self.assertEqual(runs[0]["method"], "manual")
        self.assertEqual(runs[0]["dims"], 2)
        self.assertIsNotNone(runs[0]["timestamp"])

        info = v2.EmbeddingsV2RunInfo._post_sync(None, base)
        self.assertEqual(info["n"], len(points))
        self.assertEqual(info["dims"], 2)
        self.assertIsNone(info["patchesField"])
        self.assertIsNotNone(info["timestamp"])

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

        meta = v2.EmbeddingsV2ColorMeta._post_sync(
            None, {**base, "field": "cluster"}
        )
        self.assertEqual(meta["style"], "categorical")
        self.assertEqual(len(meta["classes"]), 3)
        self.assertEqual(sum(c["count"] for c in meta["classes"]), len(points))

        dtype, _, n, _, payload = _parse(
            v2.EmbeddingsV2ColorValues._post_sync(
                None, {**base, "field": "cluster"}
            )
        )
        self.assertEqual(dtype, v2.DTYPE_U16)

        indices = np.frombuffer(payload, dtype="<u2")
        labels = [meta["classes"][i]["label"] for i in indices]
        self.assertEqual(labels, dataset.values("cluster"))

    @drop_datasets
    def test_color_continuous(self):
        dataset, points = _make_samples_run()
        base = {"datasetName": dataset.name, "brainKey": "viz"}

        meta = v2.EmbeddingsV2ColorMeta._post_sync(
            None, {**base, "field": "score"}
        )
        self.assertEqual(meta["style"], "continuous")
        self.assertEqual(meta["min"], 0.0)
        self.assertEqual(meta["max"], float(len(points) - 1))

        dtype, _, n, _, payload = _parse(
            v2.EmbeddingsV2ColorValues._post_sync(
                None, {**base, "field": "score"}
            )
        )
        self.assertEqual(dtype, v2.DTYPE_F32)

        values = np.frombuffer(payload, dtype="<f4")
        np.testing.assert_allclose(values, dataset.values("score"))

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
        self.assertTrue(res["mediaUrl"].startswith("/media?filepath="))

        with self.assertRaises(ValueError):
            v2.EmbeddingsV2SampleInfo._post_sync(
                None, {**base, "index": len(points)}
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
