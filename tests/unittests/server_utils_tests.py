import unittest
from unittest.mock import patch

from fiftyone.server.utils import convert_frames_overlay_paths_to_cloud_urls


class TestConvertFramesOverlayPathsToCloudUrls(unittest.TestCase):
    @patch("fiftyone.server.utils.get_cached_media_url")
    def test_convert_frames_overlay_paths(self, mock_get_cached_media_url):
        frames = [
            {
                "_id": "1",
                "frame_number": 1,
                "detections": {
                    "_cls": "Detections",
                    "detections": [
                        {
                            "_id": "2",
                            "_cls": "Detection",
                            "attributes": {},
                            "tags": [],
                            "label": "vehicle",
                            "bounding_box": [0, 0, 1, 1],
                            "index": 0,
                            "mask_path": "s3://bucket/path/to/detection_mask.png",
                        }
                    ],
                },
                "heatmap": {
                    "_id": "3",
                    "_cls": "Heatmap",
                    "tags": [],
                    "map_path": "s3://bucket/path/to/heatmap.png",
                    "range": None,
                },
            }
        ]

        mock_get_cached_media_url.return_value = "https://cached.url/path"

        convert_frames_overlay_paths_to_cloud_urls(frames)

        mock_get_cached_media_url.assert_any_call(
            "s3://bucket/path/to/detection_mask.png"
        )
        mock_get_cached_media_url.assert_any_call(
            "s3://bucket/path/to/heatmap.png"
        )

        self.assertEqual(mock_get_cached_media_url.call_count, 2)

        updated_mask_path = frames[0]["detections"]["detections"][0][
            "mask_path"
        ]
        updated_map_path = frames[0]["heatmap"]["map_path"]
        self.assertEqual(updated_mask_path, "https://cached.url/path")
        self.assertEqual(updated_map_path, "https://cached.url/path")


if __name__ == "__main__":
    unittest.main()
