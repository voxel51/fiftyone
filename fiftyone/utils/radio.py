"""
`C-RADIOv4 <https://github.com/NVlabs/RADIO>`_ wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)

DEFAULT_CRADIO_MODEL = "nvidia/C-RADIOv4-H"


class RadioGetItem(fout.GetItem):
    """GetItem transform for loading images for C-RADIOv4.

    Handles data loading in DataLoader workers for parallel I/O.
    """

    @property
    def required_keys(self):
        """Return list of fields needed from each sample."""
        return ["filepath"]

    def __call__(self, sample_dict):
        """Load and return a single image."""
        return fout._load_image(
            sample_dict["filepath"],
            use_numpy=False,
            force_rgb=True,
        )


class RadioOutputProcessor(fout.OutputProcessor):
    """Output processor for C-RADIOv4 summary embeddings.

    Converts raw summary tensors to numpy array embeddings.
    """

    def __call__(self, output, frame_size, **kwargs):
        """Processes model output into embeddings.

        Args:
            output: tensor of shape ``[B, C]`` containing summary embeddings
            frame_size: a ``(width, height)`` tuple (unused for embeddings)
            **kwargs: additional keyword arguments

        Returns:
            a list of numpy arrays containing embeddings
        """
        if isinstance(output, torch.Tensor):
            # Convert bfloat16 to float32 (numpy doesn't support bfloat16)
            if output.dtype == torch.bfloat16:
                output = output.float()
            output = output.detach().cpu().numpy()

        return [output[i] for i in range(output.shape[0])]


class SpatialHeatmapOutputProcessor(fout.OutputProcessor):
    """Output processor for C-RADIOv4 spatial attention heatmaps.

    Uses PCA to reduce high-dimensional spatial features to 1D attention maps,
    following the visualization approach from the C-RADIOv4 paper.

    Args:
        apply_smoothing (True): whether to apply Gaussian smoothing
        smoothing_sigma (1.51): sigma for Gaussian smoothing
    """

    def __init__(self, apply_smoothing=True, smoothing_sigma=1.51, **kwargs):
        super().__init__(**kwargs)
        self.apply_smoothing = apply_smoothing
        self.smoothing_sigma = smoothing_sigma

    def __call__(self, output, frame_sizes, **kwargs):
        """Processes spatial features into heatmap labels.

        Args:
            output: tensor of shape ``[B, C, H, W]`` or ``[B, N, C]``
            frame_sizes: list of ``(width, height)`` tuples
            **kwargs: additional keyword arguments

        Returns:
            a list of :class:`fiftyone.core.labels.Heatmap` instances
        """
        from PIL import Image
        from scipy.ndimage import gaussian_filter
        from sklearn.decomposition import PCA

        if isinstance(output, torch.Tensor):
            output = output.detach().cpu().numpy()

        if not isinstance(frame_sizes, list):
            frame_sizes = [frame_sizes] * output.shape[0]

        heatmaps = []

        for i in range(output.shape[0]):
            spatial = output[i]

            # Handle NLC format [N, C] -> [C, H, W]
            if spatial.ndim == 2:
                N, C = spatial.shape
                H = W = int(np.sqrt(N))
                if H * W != N:
                    for h in range(int(np.sqrt(N)), 0, -1):
                        if N % h == 0:
                            H, W = h, N // h
                            break
                spatial = spatial.reshape(H, W, C).transpose(2, 0, 1)

            C, H, W = spatial.shape

            # Handle NaN/Inf (RADIO can have noise patches per paper)
            spatial = np.nan_to_num(spatial, nan=0.0, posinf=0.0, neginf=0.0)

            # Clip outliers using percentiles
            p_low, p_high = np.percentile(spatial, [1, 99])
            spatial = np.clip(spatial, p_low, p_high)

            # PCA to 1D attention (paper visualization method)
            reshaped = spatial.reshape(C, -1).T
            pca = PCA(n_components=1)
            attention_1d = pca.fit_transform(reshaped).reshape(H, W)

            if self.apply_smoothing:
                attention_1d = gaussian_filter(
                    attention_1d, sigma=self.smoothing_sigma
                )

            # Resize to original image dimensions
            width, height = frame_sizes[i]
            attention_img = Image.fromarray(attention_1d.astype(np.float32))
            attention_img = attention_img.resize(
                (width, height), Image.Resampling.BILINEAR
            )
            attention_resized = np.array(attention_img)

            # Normalize to [0, 255] uint8
            att_min, att_max = attention_resized.min(), attention_resized.max()
            if att_max > att_min:
                attention_uint8 = (
                    (attention_resized - att_min) / (att_max - att_min) * 255
                ).astype(np.uint8)
            else:
                attention_uint8 = np.zeros_like(attention_resized, dtype=np.uint8)

            heatmaps.append(fol.Heatmap(map=attention_uint8, range=[0, 255]))

        return heatmaps


class CRadioV4ModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`CRadioV4Model`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        hf_repo ("nvidia/C-RADIOv4-H"): the HuggingFace repository name
        output_type ("summary"): output type. Supported values are
            ``("summary", "spatial")``
        use_mixed_precision (True): whether to use bfloat16 mixed precision.
            Requires Ampere+ GPU
        apply_smoothing (True): whether to apply Gaussian smoothing to spatial
            heatmaps
        smoothing_sigma (1.51): sigma for Gaussian smoothing
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.hf_repo = self.parse_string(
            d, "hf_repo", default=DEFAULT_CRADIO_MODEL
        )
        self.output_type = self.parse_string(d, "output_type", default="summary")
        self.use_mixed_precision = self.parse_bool(
            d, "use_mixed_precision", default=True
        )
        self.apply_smoothing = self.parse_bool(d, "apply_smoothing", default=True)
        self.smoothing_sigma = self.parse_number(d, "smoothing_sigma", default=1.51)

        # For summary (embeddings) mode, use as_feature_extractor
        if self.output_type == "summary":
            self.as_feature_extractor = True


class CRadioV4Model(fout.TorchImageModel, fom.SupportsGetItem):
    """Wrapper for running `C-RADIOv4 <https://github.com/NVlabs/RADIO>`_
    inference.

    C-RADIOv4 is a vision foundation model trained via multi-teacher
    distillation from SigLIP2, DINOv3, and SAM3. It produces both global
    summary embeddings and spatial attention features.

    Embeddings example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=25, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("c-radio-v4-h-torch")

        dataset.compute_embeddings(model, embeddings_field="radio_embeddings")

        session = fo.launch_app(dataset)

    Spatial heatmap example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=25, shuffle=True, seed=51
        )

        model = foz.load_zoo_model(
            "c-radio-v4-h-torch",
            output_type="spatial",
        )

        dataset.apply_model(model, label_field="radio_attention")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`CRadioV4ModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)
        fom.SupportsGetItem.__init__(self)

        self._preprocess = False
        self._image_processor = self._load_image_processor(config)
        self._mixed_precision_supported = self._check_mixed_precision_support()

        # Output processor setup
        if config.output_type == "summary":
            self._output_processor = RadioOutputProcessor()
        else:
            self._output_processor = SpatialHeatmapOutputProcessor(
                apply_smoothing=config.apply_smoothing,
                smoothing_sigma=config.smoothing_sigma,
            )

    def __enter__(self):
        return self

    def __exit__(self, *args):
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            torch.mps.empty_cache()
        return False

    @property
    def media_type(self):
        return "image"

    @property
    def has_embeddings(self):
        return self.config.output_type == "summary"

    @property
    def transforms(self):
        return None

    @property
    def preprocess(self):
        return self._preprocess

    @preprocess.setter
    def preprocess(self, value):
        self._preprocess = value

    @property
    def ragged_batches(self):
        # Must be False to enable batching
        return False

    @property
    def has_collate_fn(self):
        return True

    @property
    def collate_fn(self):
        """Custom collation that keeps PIL images as a list."""
        return lambda batch: batch

    def build_get_item(self, field_mapping=None):
        """Build the GetItem transform for data loading.

        Args:
            field_mapping: optional dict mapping required_keys to dataset fields

        Returns:
            a :class:`RadioGetItem` instance
        """
        return RadioGetItem(field_mapping=field_mapping)

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        from transformers import AutoModel

        logger.info("Loading C-RADIOv4 from HuggingFace: %s", config.hf_repo)

        model = AutoModel.from_pretrained(config.hf_repo, trust_remote_code=True)
        model = model.to(self._device)
        model.eval()
        return model

    def _load_image_processor(self, config):
        from transformers import CLIPImageProcessor

        return CLIPImageProcessor.from_pretrained(config.hf_repo)

    def _check_mixed_precision_support(self):
        """Check if GPU supports bfloat16 (Ampere+)."""
        if not self._using_gpu:
            return False

        try:
            if torch.cuda.is_available():
                capability = torch.cuda.get_device_capability(self._device)
                return capability[0] >= 8
            return False
        except Exception as e:
            logger.warning("Could not determine mixed precision support: %s", e)
            return False

    def _predict_all(self, imgs):
        """Process a batch of images.

        Args:
            imgs: list of PIL Images from GetItem/collate_fn

        Returns:
            list of predictions (embeddings or heatmaps)
        """
        import torch.nn.functional as F

        original_sizes = [img.size for img in imgs]  # (width, height)

        summaries = []
        spatial_features = []

        for img in imgs:
            pixel_values = self._image_processor(
                images=img,
                return_tensors="pt",
                do_resize=True,
            ).pixel_values.to(self._device)

            # Resize to RADIO-supported resolution
            h, w = pixel_values.shape[-2:]
            nearest_res = self._model.get_nearest_supported_resolution(h, w)
            if (h, w) != (nearest_res.height, nearest_res.width):
                pixel_values = F.interpolate(
                    pixel_values,
                    size=(nearest_res.height, nearest_res.width),
                    mode="bilinear",
                    align_corners=False,
                )

            use_amp = (
                self.config.use_mixed_precision
                and self._mixed_precision_supported
                and self._using_gpu
            )

            if use_amp:
                with torch.autocast("cuda", dtype=torch.bfloat16):
                    with torch.no_grad():
                        summary, spatial = self._model(pixel_values)
            else:
                with torch.no_grad():
                    summary, spatial = self._model(pixel_values)

            summaries.append(summary)
            spatial_features.append(spatial)

        if self.config.output_type == "summary":
            batch_output = torch.cat(summaries, dim=0)
            return self._output_processor(batch_output, original_sizes)
        else:
            batch_output = torch.cat(spatial_features, dim=0)
            return self._output_processor(batch_output, original_sizes)
