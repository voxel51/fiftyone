"""
FiftyOne Server /frames route tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.core.view as fov

from decorators import drop_async_dataset


def _frames_projection(fields):
    projection = {"frame_number": True}
    for field in fields:
        projection[field] = True

    return [{"$project": projection}]


class FramesProjectionTests(unittest.IsolatedAsyncioTestCase):
    @drop_async_dataset
    async def test_field_projection_drops_other_fields(self, dataset):
        video = fo.Sample(filepath="video.mp4")
        for frame_number in range(1, 4):
            video[frame_number]["detections"] = fo.Detections(
                detections=[fo.Detection(label="person")]
            )
            video[frame_number]["other"] = fo.Detections(
                detections=[fo.Detection(label="thing")]
            )
        dataset.add_sample(video)

        view = fov.make_optimized_select_view(
            dataset.view(), video.id, flatten=True
        )
        collection = foo.get_async_db_conn()[
            view._dataset._sample_collection_name
        ]

        # Projected read: only `frame_number` + the requested field.
        projected = await foo.aggregate(
            collection,
            view._pipeline(
                frames_only=True,
                support=[1, 3],
                post_pipeline=_frames_projection(["detections"]),
            ),
        ).to_list(None)

        self.assertEqual(len(projected), 3)
        self.assertIn("detections", projected[0])
        self.assertNotIn("other", projected[0])

        # Unprojected read still carries every frame field.
        full = await foo.aggregate(
            collection,
            view._pipeline(frames_only=True, support=[1, 3]),
        ).to_list(None)

        self.assertIn("detections", full[0])
        self.assertIn("other", full[0])


if __name__ == "__main__":
    unittest.main()
