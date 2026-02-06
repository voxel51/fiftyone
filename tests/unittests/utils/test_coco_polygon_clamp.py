import json

import numpy as np
import pytest
from PIL import Image

import fiftyone as fo


def check_coco_validity(labels_path):
    """
    Check if all polygon vertices are within their bounding boxes.
    Returns (num_violations, max_deviation_px).
    """
    data = json.loads(labels_path.read_text())

    violations = 0
    max_dev = 0.0

    for ann in data.get("annotations", []):
        bbox = ann.get("bbox")
        seg = ann.get("segmentation")

        # COCO polygons are list[list[float]]; RLE is dict
        if not bbox or not seg or not isinstance(seg, list):
            continue

        x, y, w, h = bbox
        x2, y2 = x + w, y + h

        for poly in seg:
            if not isinstance(poly, list):
                continue

            # COCO polygon format: [x1, y1, x2, y2, ...]
            for i in range(0, len(poly) - 1, 2):
                px, py = poly[i], poly[i + 1]

                dx = max(x - px, px - x2, 0)
                dy = max(y - py, py - y2, 0)
                dev = max(dx, dy)

                if dev > 0:
                    violations += 1
                    max_dev = max(max_dev, dev)

    return violations, max_dev


@pytest.mark.parametrize(
    "bbox_px",
    [
        (753.65, 120.20, 50.0, 40.0),  # float-ish bbox edge case
        (0.25, 0.25, 10.0, 10.0),  # near origin
        (0.10, 0.10, 2.0, 2.0),  # tiny bbox
    ],
)
def test_coco_export_polygons_within_bbox_regression_2847(tmp_path, bbox_px):
    """
    Regression test for GitHub Issue #2847.

    Ensures that when exporting instance masks to COCO polygons, no polygon
    vertex lies outside the exported bbox. Before the clamp fix, some vertices
    could drift slightly outside (~1px) due to contour math + float bbox coords.
    """
    # Local import to avoid pylint/pre-commit import resolution issues on Windows
    import fiftyone.core.labels as fol  # pylint: disable=import-error

    W, H = 1024, 768

    # 1) Write a tiny blank image to disk
    img_path = tmp_path / "img.png"
    Image.fromarray(np.zeros((H, W, 3), dtype=np.uint8)).save(img_path)

    # 2) Build a single detection with a bbox (relative) + a mask (bbox coords)
    xmin, ymin, w, h = bbox_px
    rel_bbox = [xmin / W, ymin / H, w / W, h / H]

    mask_h = max(1, int(round(h)))
    mask_w = max(1, int(round(w)))
    mask = np.ones((mask_h, mask_w), dtype=np.uint8)

    det = fol.Detection(label="obj", bounding_box=rel_bbox, mask=mask)

    sample = fo.Sample(filepath=str(img_path))
    sample["ground_truth"] = fol.Detections(detections=[det])

    ds = fo.Dataset()
    ds.add_sample(sample)

    # 3) Export to COCO
    export_dir = tmp_path / "export_coco"
    ds.export(
        export_dir=str(export_dir),
        dataset_type=fo.types.COCODetectionDataset,
        label_field="ground_truth",
    )

    labels_path = export_dir / "labels.json"
    assert labels_path.exists(), "COCO labels.json was not created"

    # 4) Validate exported annotations
    violations, max_dev = check_coco_validity(labels_path)
    assert (
        violations == 0
    ), f"Found {violations} polygon vertices outside bbox (max dev {max_dev:.4f}px)"

    ds.delete()
