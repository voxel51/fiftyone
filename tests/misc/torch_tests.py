"""
Tests for the :mod:`fiftyone.utils.torch` module.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import numpy as np
from PIL import Image
import torch
import torchvision

import fiftyone as fo
import fiftyone.utils.torch as fout


def _get_fake_img(h, w):
    array = np.random.randint(255, size=(w, h), dtype=np.uint8)
    return Image.fromarray(array)


def test_torch_min_size():
    image = _get_fake_img(32, 32)
    transf = fout.MinResize(64)
    res = transf(image)
    assert res.size == (64, 64)

    image = _get_fake_img(32, 32)
    transf = fout.MinResize((64, 32))
    result = transf(image)
    assert result.size == (64, 64)


def test_torch_max_size():
    image = _get_fake_img(400, 400)
    transf = fout.MaxResize(200)
    result = transf(image)
    assert result.size == (200, 200)

    image = _get_fake_img(400, 800)
    transf = fout.MaxResize(400)
    result = transf(image)
    assert result.size == (200, 400)

    image = _get_fake_img(400, 400)

    transf = fout.MaxResize((400, 200))
    result = transf(image)
    assert result.size == (200, 200)


@unittest.skip("Must be run manually")
def test_torch_image_patches_dataset():
    image_path = "/path/to/an/image.png"

    dataset = fo.Dataset()

    sample = fo.Sample(filepath=image_path)

    polylines = fo.Polylines(
        polylines=[
            fo.Polyline(
                label="square",
                points=[[(0.1, 0.1), (0.1, 0.4), (0.4, 0.4), (0.4, 0.1)]],
                closed=True,
                filled=True,
            ),
            fo.Polyline(
                label="triangle",
                points=[[(0.6, 0.1), (0.9, 0.1), (0.9, 0.4)]],
                closed=True,
                filled=True,
            ),
            fo.Polyline(
                label="diamond",
                points=[[(0.1, 0.75), (0.25, 0.6), (0.4, 0.75), (0.25, 0.9)]],
                closed=True,
                filled=True,
            ),
            fo.Polyline(
                label="triangle",
                points=[[(0.6, 0.6), (0.6, 0.9), (0.9, 0.9)]],
                closed=True,
                filled=True,
            ),
        ]
    )

    sample["polylines"] = polylines
    sample["detections"] = sample["polylines"].to_detections(
        mask_size=(64, 64)
    )
    sample["polylines2"] = sample["detections"].to_polylines()

    dataset.add_sample(sample)

    image_paths = [sample.filepath]
    patches = [sample.detections]

    transform = torchvision.transforms.Compose(
        [
            torchvision.transforms.Resize(
                size=[32, 32], interpolation=Image.BILINEAR
            ),
            torchvision.transforms.ToTensor(),
        ]
    )

    torch_dataset = fout.TorchImagePatchesDataset(
        image_paths=image_paths, patches=patches, transform=transform
    )

    data_loader = torch.utils.data.DataLoader(torch_dataset, batch_size=1)

    patches = next(iter(data_loader))
    patches = torch.squeeze(patches, dim=0)
    imgs = np.transpose(patches.numpy(), axes=(0, 2, 3, 1))
    imgs = np.array(255.0 * imgs, dtype=np.uint8)
    dataset.ingest_images(imgs)

    print(dataset)

    #
    # Inspect App to verity that detection <-> polyline conversion happened as
    # expected, and that the appropriate image patches were extracted from the
    # source image
    #

    session = fo.launch_app(dataset)
    session.wait()


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
