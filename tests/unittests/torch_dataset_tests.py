"""
FiftyOne torch dataset unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import unittest

import fiftyone as fo
from fiftyone.utils.torch import GetItem


class IdentityGetItem(GetItem):
    def __init__(self, required_keys=["filepath"], **kwargs):
        self._required_keys = required_keys
        super().__init__(**kwargs)

    def __call__(self, d):
        return [d[k] for k in self.required_keys]

    @property
    def required_keys(self):
        return self._required_keys


class IntIdentityGetItem(GetItem):
    def __init__(self, required_key="foo", **kwargs):
        self._required_key = required_key
        super().__init__(**kwargs)

    def __call__(self, d):
        return d[self._required_key] * 1

    @property
    def required_keys(self):
        return [self._required_key]


class ShortLivedDataset:
    def __init__(self, num_samples=10, **kwargs):
        super().__init__()
        self._dataset = fo.Dataset(**kwargs)

        self._dataset.add_samples(
            [fo.Sample(filepath=f"image{i}.png") for i in range(num_samples)]
        )

        self._dataset.persistent = True

    def __enter__(self):
        return self._dataset

    def __exit__(self, *args):
        self._dataset.persistent = False
        self._dataset.delete()


def _make_detection_dataset(n_per_sample=(2, 3, 2)):
    """Non-persistent in-memory dataset with image samples and ``Detections``."""
    dataset = fo.Dataset()
    samples = []
    for i, n in enumerate(n_per_sample):
        sample = fo.Sample(filepath=f"img{i}.png")
        sample["ground_truth"] = fo.Detections(
            detections=[
                fo.Detection(
                    label=f"obj{i}_{j}",
                    bounding_box=[0.1 * j, 0.1 * j, 0.2, 0.2],
                )
                for j in range(n)
            ]
        )
        samples.append(sample)
    dataset.add_samples(samples)
    return dataset


def _make_video_dataset(n_frames_per_sample=(2, 3)):
    """Non-persistent in-memory video dataset with the given frames per sample."""
    dataset = fo.Dataset()
    samples = []
    for i, n in enumerate(n_frames_per_sample):
        sample = fo.Sample(filepath=f"video{i}.mp4")
        for f in range(1, n + 1):
            sample.frames[f] = fo.Frame(frame_label=f"v{i}_f{f}")
        samples.append(sample)
    dataset.add_samples(samples)
    return dataset


class FiftyOneTorchDatasetTests(unittest.TestCase):
    def test_ids_correct(self):
        with ShortLivedDataset() as dataset:
            torch_dataset = dataset.to_torch(
                IdentityGetItem(["id", "filepath"])
            )
            self.assertEqual(
                [torch_dataset.keys[i] for i in range(len(torch_dataset))],
                dataset.values("id"),
            )
            self.assertEqual(
                [
                    torch_dataset._sample_ids[i]
                    for i in range(len(torch_dataset))
                ],
                dataset.values("id"),
            )

    def test_vectorize_correct(self):
        with ShortLivedDataset() as dataset:

            torch_dataset = dataset.to_torch(
                IdentityGetItem(["id", "filepath"]), vectorize=True
            )
            for cf in ["filepath", "id"]:
                self.assertTrue(
                    cf in torch_dataset.cached_fields,
                    f"Cached field {cf} not found in cached fields",
                )

                # `cached_fields[field]` is per-sample (length = n_samples). For
                # a top-level scalar field on an `id`-indexed dataset, that
                # equals `len(torch_dataset)`.
                self.assertEqual(
                    [
                        torch_dataset.cached_fields[cf][i]
                        for i in range(len(torch_dataset))
                    ],
                    dataset.values(cf),
                    f"Cached field {cf} not equal to dataset values",
                )

    def test_ids_correct_vectorize_no_ids(self):
        with ShortLivedDataset() as dataset:
            torch_dataset = dataset.to_torch(
                IdentityGetItem(["filepath"]), vectorize=True
            )
            self.assertEqual(
                [torch_dataset.keys[i] for i in range(len(torch_dataset))],
                dataset.values("id"),
            )

            self.assertTrue(
                "id" not in torch_dataset.cached_fields,
                "ID field found in cached fields",
            )

    def test_getitems(self):
        with ShortLivedDataset(100) as dataset:
            torch_dataset = dataset.to_torch(IdentityGetItem(["id"]))

            indices = [12, 35, 66, 21, 4, 15]

            ids = dataset.values("id")
            ids = [[ids[i]] for i in indices]

            _ids = torch_dataset.__getitems__(indices)

            self.assertEqual(
                _ids,
                ids,
                "Torch dataset getitem not equal to dataset values",
            )

    def test_skip_failures(self):
        with ShortLivedDataset() as dataset:
            for i, sample in enumerate(dataset):
                sample["foo"] = 1 if i % 2 == 0 else None
                sample.save()

            gi_foo = IntIdentityGetItem("foo")
            torch_dataset = dataset.to_torch(
                gi_foo,
                skip_failures=False,
            )

            # single get item, no skip
            for i in range(len(torch_dataset)):
                if i % 2 == 0:
                    self.assertEqual(torch_dataset[i], 1)
                else:
                    with self.assertRaises(Exception):
                        _ = torch_dataset[i]

            # batch get items, no skip
            indices = list(range(len(torch_dataset)))
            with self.assertRaises(Exception):
                _ = torch_dataset.__getitems__(indices)

            # single get item, skip
            torch_dataset = dataset.to_torch(
                gi_foo,
                skip_failures=True,
            )
            for i in range(len(torch_dataset)):
                if i % 2 == 0:
                    self.assertEqual(torch_dataset[i], 1)
                else:
                    res = torch_dataset[i]
                    self.assertTrue(isinstance(res, Exception))

            # batch get items, skip
            indices = list(range(len(torch_dataset)))
            res = torch_dataset.__getitems__(indices)
            for i in range(len(res)):
                if i % 2 == 0:
                    self.assertEqual(res[i], 1)
                else:
                    self.assertTrue(isinstance(res[i], Exception))

    # -------------------------------------------------------------------------
    # Tests for non-default `index_field` (per-detection / per-frame rows)
    # -------------------------------------------------------------------------

    def _per_detection_indexing_impl(self, vectorize):
        n_per_sample = (2, 3, 2)
        total = sum(n_per_sample)
        dataset = _make_detection_dataset(n_per_sample)

        get_item = IdentityGetItem(
            ["filepath", "label", "bbox"],
            field_mapping={
                "label": "ground_truth.detections.label",
                "bbox": "ground_truth.detections.bounding_box",
            },
        )
        torch_dataset = dataset.to_torch(
            get_item,
            index_field="ground_truth.detections.id",
            vectorize=vectorize,
        )

        self.assertEqual(len(torch_dataset), total)

        # Expected per-row data
        filepaths = dataset.values("filepath")
        labels = dataset.values("ground_truth.detections.label")
        bboxes = dataset.values("ground_truth.detections.bounding_box")
        det_ids = dataset.values("ground_truth.detections.id")

        # Verify keys match the flattened detection IDs
        flat_det_ids = [did for sample_dets in det_ids for did in sample_dets]
        self.assertEqual(
            [torch_dataset.keys[i] for i in range(len(torch_dataset))],
            flat_det_ids,
        )

        # Each row: [parent filepath (broadcast), per-detection label,
        # per-detection bbox]
        row = 0
        for sidx, n in enumerate(n_per_sample):
            for j in range(n):
                item = torch_dataset[row]
                self.assertEqual(item[0], filepaths[sidx])
                self.assertEqual(item[1], labels[sidx][j])
                self.assertEqual(item[2], bboxes[sidx][j])
                row += 1

    def test_per_detection_indexing_db(self):
        self._per_detection_indexing_impl(vectorize=False)

    def test_per_detection_indexing_vectorized(self):
        self._per_detection_indexing_impl(vectorize=True)

    def _per_frame_indexing_impl(self, vectorize):
        n_frames_per_sample = (2, 3)
        total = sum(n_frames_per_sample)
        dataset = _make_video_dataset(n_frames_per_sample)

        get_item = IdentityGetItem(
            ["filepath", "frame_label"],
            field_mapping={
                "frame_label": "frames.frame_label",
            },
        )
        torch_dataset = dataset.to_torch(
            get_item,
            index_field="frames.id",
            vectorize=vectorize,
        )

        self.assertEqual(len(torch_dataset), total)

        filepaths = dataset.values("filepath")
        frame_labels = dataset.values("frames.frame_label")
        frame_ids = dataset.values("frames.id")

        flat_frame_ids = [
            fid for sample_fids in frame_ids for fid in sample_fids
        ]
        self.assertEqual(
            [torch_dataset.keys[i] for i in range(len(torch_dataset))],
            flat_frame_ids,
        )

        row = 0
        for sidx, n in enumerate(n_frames_per_sample):
            for j in range(n):
                item = torch_dataset[row]
                self.assertEqual(item[0], filepaths[sidx])
                self.assertEqual(item[1], frame_labels[sidx][j])
                row += 1

    def test_per_frame_indexing_db(self):
        self._per_frame_indexing_impl(vectorize=False)

    def test_per_frame_indexing_vectorized(self):
        self._per_frame_indexing_impl(vectorize=True)

    def _sibling_branch_broadcast_impl(self, vectorize):
        """``index_field`` and a mapped field live on disjoint list branches.

        Concretely: index per-frame, but also map a sample-level
        ``ground_truth.detections.label``. The LCA is the sample dim, so
        the entire detections list of each sample must broadcast to every
        frame row of that sample (no positional fan-out across branches).
        """
        n_frames_per_sample = (2, 3)
        n_dets_per_sample = (2, 1)

        dataset = fo.Dataset()
        samples = []
        for i, (nf, nd) in enumerate(
            zip(n_frames_per_sample, n_dets_per_sample)
        ):
            sample = fo.Sample(filepath=f"video{i}.mp4")
            sample["ground_truth"] = fo.Detections(
                detections=[
                    fo.Detection(label=f"v{i}_obj{j}") for j in range(nd)
                ]
            )
            for f in range(1, nf + 1):
                sample.frames[f] = fo.Frame(frame_label=f"v{i}_f{f}")
            samples.append(sample)
        dataset.add_samples(samples)

        get_item = IdentityGetItem(
            ["frame_label", "det_labels"],
            field_mapping={
                "frame_label": "frames.frame_label",
                "det_labels": "ground_truth.detections.label",
            },
        )
        td = dataset.to_torch(
            get_item, index_field="frames.id", vectorize=vectorize
        )

        det_labels_per_sample = dataset.values("ground_truth.detections.label")
        frame_labels = dataset.values("frames.frame_label")

        row = 0
        for sidx, nf in enumerate(n_frames_per_sample):
            for j in range(nf):
                item = td[row]
                # Frame-level field walks both dims: per-frame value.
                self.assertEqual(item[0], frame_labels[sidx][j])
                # Sibling-branch field: whole sample's list broadcast.
                self.assertEqual(item[1], det_labels_per_sample[sidx])
                row += 1

    def test_sibling_branch_broadcast_db(self):
        self._sibling_branch_broadcast_impl(vectorize=False)

    def test_sibling_branch_broadcast_vectorized(self):
        self._sibling_branch_broadcast_impl(vectorize=True)

    def _nested_list_indexing_impl(self, vectorize):
        # ``index_field`` traverses two list levels: frames + per-frame
        # detections. Each row is one detection within one frame; the
        # per-detection label is resolved per row while the parent ``filepath``
        # is shared across all rows of the sample.
        n_dets_per_frame = ((1, 2), (3,))  # sample 0: 2 frames, sample 1: 1

        dataset = fo.Dataset()
        samples = []
        for i, frame_counts in enumerate(n_dets_per_frame):
            sample = fo.Sample(filepath=f"video{i}.mp4")
            for f, nd in enumerate(frame_counts, start=1):
                sample.frames[f] = fo.Frame(
                    ground_truth=fo.Detections(
                        detections=[
                            fo.Detection(label=f"v{i}_f{f}_d{j}")
                            for j in range(nd)
                        ]
                    )
                )
            samples.append(sample)
        dataset.add_samples(samples)

        get_item = IdentityGetItem(
            ["filepath", "label"],
            field_mapping={
                "label": "frames.ground_truth.detections.label",
            },
        )
        td = dataset.to_torch(
            get_item,
            index_field="frames.ground_truth.detections.id",
            vectorize=vectorize,
        )

        # Expectations derived from FiftyOne's own (fully unwound) values
        flat_ids = dataset.values(
            "frames.ground_truth.detections.id", unwind=True
        )
        flat_labels = dataset.values(
            "frames.ground_truth.detections.label", unwind=True
        )
        self.assertEqual(len(td), len(flat_ids))
        self.assertEqual([td.keys[i] for i in range(len(td))], flat_ids)

        filepaths = dataset.values("filepath")
        # Map each row to its sample to check the broadcast parent
        nested_ids = dataset.values("frames.ground_truth.detections.id")
        sample_of_row = []
        for sidx, per_frame in enumerate(nested_ids):
            for frame_dets in per_frame or []:
                for _ in frame_dets or []:
                    sample_of_row.append(sidx)

        items = td.__getitems__(list(range(len(td))))
        for row, item in enumerate(items):
            self.assertEqual(item[0], filepaths[sample_of_row[row]])
            self.assertEqual(item[1], flat_labels[row])

    def test_nested_list_indexing_db(self):
        self._nested_list_indexing_impl(vectorize=False)

    def test_nested_list_indexing_vectorized(self):
        self._nested_list_indexing_impl(vectorize=True)

    def test_vectorized_vs_db_parity_per_detection(self):
        n_per_sample = (2, 3, 2)
        dataset = _make_detection_dataset(n_per_sample)
        get_item = IdentityGetItem(
            ["filepath", "label", "bbox"],
            field_mapping={
                "label": "ground_truth.detections.label",
                "bbox": "ground_truth.detections.bounding_box",
            },
        )

        td_db = dataset.to_torch(
            get_item,
            index_field="ground_truth.detections.id",
            vectorize=False,
        )
        td_vec = dataset.to_torch(
            get_item,
            index_field="ground_truth.detections.id",
            vectorize=True,
        )

        self.assertEqual(len(td_db), len(td_vec))

        indices = list(range(len(td_db)))
        db_batch = td_db.__getitems__(indices)
        vec_batch = td_vec.__getitems__(indices)
        self.assertEqual(db_batch, vec_batch)

        # Also verify single-index access matches
        for i in indices:
            self.assertEqual(td_db[i], td_vec[i])

    def _skip_failures_per_detection_impl(self, vectorize):
        # Add a sample whose detections lack the requested field to trigger
        # an error when calling get_item.
        n_per_sample = (2, 2)
        dataset = _make_detection_dataset(n_per_sample)

        # Clear the `label` on the first detection of the first sample
        sample = dataset.first()
        sample["ground_truth"].detections[0].label = None
        sample.save()

        class RequireLabel(GetItem):
            @property
            def required_keys(self):
                return ["label"]

            def __call__(self, d):
                if d["label"] is None:
                    raise ValueError("missing label")
                return d["label"]

        gi = RequireLabel(
            field_mapping={"label": "ground_truth.detections.label"}
        )

        # Without skip_failures, the failing row raises. ``get_item``'s raw
        # ``ValueError`` is what bubbles up from ``_get_item``; no extra
        # wrapping happens for this code path.
        td = dataset.to_torch(
            gi,
            index_field="ground_truth.detections.id",
            vectorize=vectorize,
            skip_failures=False,
        )
        with self.assertRaises(ValueError):
            _ = td[0]

        # With skip_failures, the failing row returns the same ValueError,
        # others return their label.
        td = dataset.to_torch(
            gi,
            index_field="ground_truth.detections.id",
            vectorize=vectorize,
            skip_failures=True,
        )
        self.assertEqual(len(td), sum(n_per_sample))

        results = td.__getitems__(list(range(len(td))))
        # Row 0 is the one with `None` label
        self.assertIsInstance(results[0], ValueError)
        for i in range(1, len(results)):
            self.assertIsInstance(results[i], str)

    def test_skip_failures_per_detection_db(self):
        self._skip_failures_per_detection_impl(vectorize=False)

    def test_skip_failures_per_detection_vectorized(self):
        self._skip_failures_per_detection_impl(vectorize=True)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
