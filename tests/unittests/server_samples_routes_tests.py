"""
Tests for the REST samples routes (field-projected reads, id-only spine,
grouped counts, skip-metadata) exercised through the public ASGI endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import unittest

from bson import ObjectId

import fiftyone as fo
import fiftyone.core.labels as fol

from fiftyone.server.routes.samples import GridSamples, Samples
from fiftyone.server.samples import paginate_samples

from decorators import drop_async_dataset


async def _dispatch(endpoint_cls, dataset_id, body):
    """Run a samples ASGI endpoint, returning ``(status, parsed_json)``."""
    payload = json.dumps(body).encode()

    async def receive():
        return {"type": "http.request", "body": payload, "more_body": False}

    sent = []

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "method": "POST",
        "headers": [],
        "path_params": {"dataset_id": dataset_id},
    }
    await endpoint_cls(scope, receive, send)

    (start,) = [m for m in sent if m["type"] == "http.response.start"]
    data = b"".join(
        m.get("body", b"") for m in sent if m["type"] == "http.response.body"
    )
    return start["status"], json.loads(data)


class SamplesRouteTests(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_include_projects_requested_fields(self, dataset):
        s1 = fo.Sample(
            filepath="a.png",
            uniqueness=0.5,
            metadata=fo.ImageMetadata(width=20, height=10),
            predictions=fol.Classification(label="cat", confidence=0.9),
        )
        s2 = fo.Sample(filepath="b.png", uniqueness=0.7)
        dataset.add_samples([s1, s2])

        status, body = await _dispatch(
            Samples, str(dataset._doc.id), {"fields": ["uniqueness"]}
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(body["samples"]), 2)

        item = next(s for s in body["samples"] if s["id"] == str(s1.id))
        self.assertIn("urls", item)
        # requested field kept, unrequested label field dropped
        self.assertIn("uniqueness", item["fields"])
        self.assertNotIn("predictions", item["fields"])
        # aspect ratio computed from metadata dimensions (20 / 10)
        self.assertAlmostEqual(item["aspectRatio"], 2.0)

    @drop_async_dataset
    async def test_skip_metadata_omits_aspect_ratio(self, dataset):
        sample = fo.Sample(
            filepath="a.png", metadata=fo.ImageMetadata(width=20, height=10)
        )
        dataset.add_sample(sample)

        status, body = await _dispatch(
            Samples, str(dataset._doc.id), {"skipMetadata": True}
        )
        self.assertEqual(status, 200)
        item = body["samples"][0]
        self.assertEqual(item["id"], str(sample.id))
        self.assertIn("urls", item)
        # the skip path must not ship a computed/placeholder aspect ratio
        self.assertNotIn("aspectRatio", item)

    @drop_async_dataset
    async def test_select_by_ids(self, dataset):
        s1 = fo.Sample(filepath="a.png")
        s2 = fo.Sample(filepath="b.png")
        dataset.add_samples([s1, s2])

        status, body = await _dispatch(
            Samples,
            str(dataset._doc.id),
            {"ids": [str(s2.id)], "skipMetadata": True},
        )
        self.assertEqual(status, 200)
        self.assertEqual([s["id"] for s in body["samples"]], [str(s2.id)])

    @drop_async_dataset
    async def test_grouped_read_labels_group_from_pipeline(self, dataset):
        # GroupBy's `$addFields` labels each doc with its dynamic-group value in
        # Mongo; the server never re-derives `_group` in Python
        dataset.add_samples(
            [
                fo.Sample(filepath="a0.png", scene="a"),
                fo.Sample(filepath="a1.png", scene="a"),
                fo.Sample(filepath="b0.png", scene="b"),
            ]
        )

        view = dataset.group_by("scene")
        status, body = await _dispatch(
            Samples,
            str(dataset._doc.id),
            {"view": view._serialize(), "skipMetadata": True},
        )
        self.assertEqual(status, 200)
        by_path = {
            s["fields"]["filepath"].rsplit("/", 1)[-1]: s["fields"]["_group"]
            for s in body["samples"]
        }
        self.assertEqual(by_path["a0.png"], "a")
        self.assertEqual(by_path["a1.png"], "a")
        self.assertEqual(by_path["b0.png"], "b")

    @drop_async_dataset
    async def test_unknown_dataset_returns_404(self, dataset):
        status, _ = await _dispatch(Samples, str(ObjectId()), {})
        self.assertEqual(status, 404)


class GridSamplesRouteTests(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_spine_returns_ordered_ids(self, dataset):
        samples = [fo.Sample(filepath="%d.png" % i) for i in range(3)]
        dataset.add_samples(samples)

        status, body = await _dispatch(GridSamples, str(dataset._doc.id), {})
        self.assertEqual(status, 200)
        self.assertEqual(
            [e["id"] for e in body["spine"]],
            [str(s.id) for s in samples],
        )
        # small dataset fits in one page: no continuation token
        self.assertIsNone(body["next"])

    @drop_async_dataset
    async def test_spine_after_skips(self, dataset):
        samples = [fo.Sample(filepath="%d.png" % i) for i in range(3)]
        dataset.add_samples(samples)

        status, body = await _dispatch(
            GridSamples, str(dataset._doc.id), {"after": 1}
        )
        self.assertEqual(status, 200)
        self.assertEqual(
            [e["id"] for e in body["spine"]],
            [str(samples[1].id), str(samples[2].id)],
        )

    @drop_async_dataset
    async def test_spine_carries_group_counts(self, dataset):
        # group "a" has 3 samples, group "b" has 2
        for i in range(3):
            dataset.add_sample(fo.Sample(filepath="a%d.png" % i, scene="a"))
        for i in range(2):
            dataset.add_sample(fo.Sample(filepath="b%d.png" % i, scene="b"))

        view = dataset.group_by("scene")
        status, body = await _dispatch(
            GridSamples, str(dataset._doc.id), {"view": view._serialize()}
        )
        self.assertEqual(status, 200)
        # one spine entry per group, each carrying its full group size
        self.assertEqual(
            sorted(e["groupCount"] for e in body["spine"]), [2, 3]
        )


class PaginateSamplesSkipMetadataTests(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_skip_metadata_still_pages(self, dataset):
        dataset.add_samples(
            [fo.Sample(filepath="a.png"), fo.Sample(filepath="b.png")]
        )

        conn = await paginate_samples(
            dataset.name, [], None, first=10, skip_metadata=True
        )
        self.assertEqual(len(conn.edges), 2)


if __name__ == "__main__":
    unittest.main()
