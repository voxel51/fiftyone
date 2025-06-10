"""
Adaptations for working with
`Ultralytics <https://github.com/ultralytics/ultralytics>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone as fo
from pathlib import Path
import fiftyone.core.utils as fou

fou.ensure_package("ultralytics")
import ultralytics
from ultralytics.nn import text_model

clip = fou.lazy_import("clip")
mobileclip = fou.lazy_import("mobileclip")


def build_text_model(variant: str, device=None):
    """Adaptation of ultralytics.nn.text_model.build_text_model.

    This is to ensure clip and mobileclip text encoding models are saved to
    FiftyOne model zoo directory.
    """
    base, size = variant.split(":")
    if base == "clip":
        return UltralyticsCLIP(size, device)
    elif base == "mobileclip":
        return UltralyticsMobileCLIP(size, device)
    else:
        raise ValueError(
            f"Unrecognized base model: '{base}'. Supported base models: 'clip', 'mobileclip'."
        )


class UltralyticsCLIP(text_model.CLIP):
    """Adaptor for ultralytics.nn.text_model.CLIP.

    Ensures that CLIP model is saved to FiftyOne model zoo directory.
    """

    def __init__(self, size: str, device):
        text_model.TextModel.__init__(self)
        self.model = clip.load(
            size, device=device, download_root=fo.config.model_zoo_dir
        )[0]
        self.to(device)
        self.device = device
        self.eval()


class UltralyticsMobileCLIP(text_model.MobileCLIP):
    """Adaptor for ultralytics.nn.text_model.MobileCLIP.

    Ensures that CLIP model is saved to FiftyOne model zoo directory.
    """

    def __init__(self, size, device):
        text_model.TextModel.__init__(self)
        config = self.config_size_map[size]
        file = f"mobileclip_{size}.pt"
        if not Path(file).is_file():
            from ultralytics import download

            download(
                f"https://docs-assets.developer.apple.com/ml-research/datasets/mobileclip/{file}",
                dir=fo.config.model_zoo_dir,
            )
        self.model = mobileclip.create_model_and_transforms(
            f"mobileclip_{config}",
            pretrained=Path(fo.config.model_zoo_dir) / Path(file),
            device=device,
        )[0]
        self.tokenizer = mobileclip.get_tokenizer(f"mobileclip_{config}")
        self.to(device)
        self.device = device
        self.eval()
