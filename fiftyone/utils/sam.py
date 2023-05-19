"""Segment-anything model integration.
"""
import eta.core.utils as etau
import numpy as np
import torch

import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()

from segment_anything import SamAutomaticMaskGenerator


class SegmentAnythingModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`SegmentAnythingModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        amg_kwargs: a dictionary of keyword arguments to pass to
            ``SamAutomaticMaskGenerator``
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self.amg_kwargs = self.parse_dict(d, "amg_kwargs", default={})


class SegmentAnythingModel(fout.TorchImageModel):
    """Wrapper for running 'segment-anything-model' from https://segment-anything.com/."""

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_network(self, config):
        entrypoint = etau.get_function(config.entrypoint_fcn)
        model = entrypoint(checkpoint=config.model_path)
        self.preprocess = False
        return model

    @staticmethod
    def _to_numpy_input(tensor):
        """Converts a float32 torch tensor to a uint8 numpy array.

        Args:
            tensor: a float32 torch tensor

        Returns:
            a uint8 numpy array
        """
        return (tensor.cpu().numpy() * 255).astype("uint8").transpose(1, 2, 0)

    @staticmethod
    def _to_torch_output(model_output):
        """Convert SAM's automatic mask output to a single mask torch tensor.

        Args:
            model_output: a list of masks from SAM's automatic mask generator

        Returns:
            a torch tensor of shape (num_masks, height, width)
        """
        masks = [one["segmentation"].astype(int) for one in model_output]
        masks.insert(
            0, np.zeros_like(model_output[0]["segmentation"])
        )  # background
        full_mask = np.stack(masks)
        return torch.from_numpy(full_mask)

    def _forward_pass(self, inputs):
        mask_generator = SamAutomaticMaskGenerator(
            self._model,
            **self.config.amg_kwargs,
        )
        masks = [
            mask_generator.generate(
                self._to_numpy_input(inp),
            )
            for inp in inputs
        ]
        masks = torch.stack([self._to_torch_output(m) for m in masks])
        return dict(out=masks)
