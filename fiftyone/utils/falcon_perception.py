"""
`Falcon Perception <https://huggingface.co/tiiuae/Falcon-Perception>`_
open-vocabulary instance segmentation wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)


def _ensure_falcon_perception():
    """Ensures the packages that load the release are installed."""
    # The release's attention requests auxiliary outputs from FlexAttention,
    # which torch provides from 2.9; its code decodes masks with pycocotools
    # and reshapes tensors with einops
    fou.ensure_package("torch>=2.9")
    fou.ensure_package("transformers>=4.56")
    fou.ensure_package("pycocotools")
    fou.ensure_package("einops")


transformers = fou.lazy_import(
    "transformers", callback=_ensure_falcon_perception
)
mask_utils = fou.lazy_import(
    "pycocotools.mask", callback=_ensure_falcon_perception
)

DEFAULT_FALCON_PERCEPTION_MODEL = "tiiuae/Falcon-Perception"

# The release runs its own code, so the default release loads a pinned
# revision when no revision is given: the head of its `19-08-2026` branch,
# the version post-trained with reinforcement learning
DEFAULT_FALCON_PERCEPTION_REVISION = "54916b3dec58565fafc6d82eb3051fe7246ab666"


def _prepare_image(img):
    """Converts image-like input to an RGB PIL image for the release.

    ``fout.to_rgb_pil`` expects channel-last layout and reads float arrays as
    0-1, wrapping anything above it, so tensors are converted and
    channel-first or 0-255 float input is normalized first.
    """
    if isinstance(img, torch.Tensor):
        img = img.detach().cpu().numpy()

    if isinstance(img, np.ndarray):
        # Transpose CHW to HWC when the first dim is channels and the last
        # cannot be
        if (
            img.ndim == 3
            and img.shape[0] in (1, 3, 4)
            and img.shape[2] not in (1, 3, 4)
        ):
            img = np.transpose(img, (1, 2, 0))

        if np.issubdtype(img.dtype, np.floating):
            scale = 255.0 if img.max() <= 1.0 else 1.0
            img = np.clip(img * scale, 0, 255).astype(np.uint8)

    return fout.to_rgb_pil(img)


def _collate_images(batch):
    """Keeps a batch of images, which may differ in size, as a list."""
    return list(batch)


def _to_detection(prediction, label):
    """Converts one of the release's predictions to a
    :class:`fiftyone.core.labels.Detection`.

    The detection takes the bounding rectangle of the predicted mask and the
    mask within it. A prediction whose mask is empty keeps the box the
    release predicts, given by its center and size, without a mask.

    Args:
        prediction: a dict with the instance's normalized center ``xy``, its
            normalized size ``hw`` and its COCO RLE ``mask_rle`` at the
            image's resolution
        label: the query that found the instance

    Returns:
        a :class:`fiftyone.core.labels.Detection`
    """
    rle = prediction["mask_rle"]
    mask = None
    if rle.get("counts"):
        counts = rle["counts"]
        if isinstance(counts, str):
            counts = counts.encode("utf-8")

        mask = mask_utils.decode({"size": list(rle["size"]), "counts": counts})

    if mask is not None and mask.any():
        return fol.Detection.from_mask(mask.astype(bool), label=label)

    x, y = prediction["xy"]["x"], prediction["xy"]["y"]
    h, w = prediction["hw"]["h"], prediction["hw"]["w"]
    x0, x1 = (min(max(v, 0.0), 1.0) for v in (x - w / 2, x + w / 2))
    y0, y1 = (min(max(v, 0.0), 1.0) for v in (y - h / 2, y + h / 2))
    return fol.Detection(label=label, bounding_box=[x0, y0, x1 - x0, y1 - y0])


class FalconPerceptionModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`FalconPerceptionModel`.

    Args:
        name_or_path ("tiiuae/Falcon-Perception"): the HuggingFace repository
            of a Falcon Perception release
        revision (None): the commit hash, branch or tag of the release to
            load. The release runs its own code, so the default release loads
            its pinned revision, which is post-trained with reinforcement
            learning, when this is omitted
        classes (None): the text queries to segment in each image, such as
            ``"car"`` or ``"person holding an umbrella"``; each becomes the
            label of the instances it finds
        min_dimension (256): the shortest side to which smaller images are
            upscaled before inference
        max_dimension (1024): the longest side to which larger images are
            downscaled before inference
        max_new_tokens (2048): the most tokens the release decodes per query,
            three per instance it finds
        segm_threshold (0.5): the probability above which a pixel belongs to
            an instance's mask
        queries_per_pass (4): the most image and query pairs decoded together,
            each reserving cache for its image and ``max_new_tokens``
        compile (True): whether the release compiles its layers with
            ``torch.compile`` on the first call
        dtype ("bfloat16"): the dtype of the weights and activations,
            ``"bfloat16"``, ``"float16"`` or ``"float32"``. The release is
            stored in float32, whose attention kernels need more shared
            memory per block than the 100 KB that Ampere and Ada GPUs such
            as the A10G, L4 and L40S provide; the A100 and H100 run it
    """

    def __init__(self, d):
        """Parses the config, rejecting invalid decoding settings."""
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_FALCON_PERCEPTION_MODEL
        )
        default_revision = (
            DEFAULT_FALCON_PERCEPTION_REVISION
            if self.name_or_path == DEFAULT_FALCON_PERCEPTION_MODEL
            else None
        )
        self.revision = self.parse_string(
            d, "revision", default=default_revision
        )
        self.min_dimension = self.parse_int(d, "min_dimension", default=256)
        self.max_dimension = self.parse_int(d, "max_dimension", default=1024)
        self.max_new_tokens = self.parse_int(d, "max_new_tokens", default=2048)
        self.segm_threshold = self.parse_number(
            d, "segm_threshold", default=0.5
        )
        self.queries_per_pass = self.parse_int(
            d, "queries_per_pass", default=4
        )
        self.compile = self.parse_bool(d, "compile", default=True)
        self.dtype = self.parse_string(d, "dtype", default="bfloat16")

        if self.dtype not in ("bfloat16", "float16", "float32"):
            raise ValueError(
                "dtype must be 'bfloat16', 'float16' or 'float32'; got %r"
                % self.dtype
            )

        if not 0 < self.min_dimension <= self.max_dimension:
            raise ValueError(
                "min_dimension and max_dimension must satisfy 0 < "
                "min_dimension <= max_dimension; got %s and %s"
                % (self.min_dimension, self.max_dimension)
            )

        if self.max_new_tokens <= 0 or self.queries_per_pass <= 0:
            raise ValueError(
                "max_new_tokens and queries_per_pass must be positive"
            )

        if not 0 < self.segm_threshold < 1:
            raise ValueError(
                "segm_threshold must lie between 0 and 1; got %s"
                % self.segm_threshold
            )

        self.raw_inputs = True


class FalconPerceptionModel(fout.TorchImageModel):
    """Wrapper for running open-vocabulary instance segmentation with Falcon
    Perception.

    Falcon Perception is a 0.6B early-fusion vision-language model that,
    given an image and a text query, returns every matching instance with a
    full-resolution mask. Each query in ``classes`` runs as its own request,
    and its instances are labeled with the query. The release returns no
    scores, so the detections carry no confidence.

    Example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=25)

        model = foz.load_zoo_model(
            "falcon-perception-torch",
            classes=["person", "car", "dog wearing a collar"],
        )

        dataset.apply_model(model, label_field="falcon", batch_size=4)

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`FalconPerceptionModelConfig`
    """

    def __init__(self, config):
        """Checks that queries are given, then loads the release."""
        if not config.classes:
            raise ValueError(
                "Falcon Perception needs text queries to segment; provide "
                "`classes`"
            )

        super().__init__(config)

    @property
    def ragged_batches(self):
        """False; :attr:`collate_fn` keeps images of different sizes as a
        list, so ``apply_model`` honors ``batch_size``."""
        return False

    @property
    def has_collate_fn(self):
        """True; batches are collated as lists of images."""
        return True

    @property
    def collate_fn(self):
        """The function that keeps a batch of images as a list."""
        return _collate_images

    def _download_model(self, config):
        """Leaves the download to the release's loader in
        :meth:`_load_model`."""
        pass

    def _load_model(self, config):
        """Loads the release with its own code.

        Args:
            config: a :class:`FalconPerceptionModelConfig`

        Returns:
            the release's model
        """
        model = transformers.AutoModelForCausalLM.from_pretrained(
            config.name_or_path,
            revision=config.revision,
            trust_remote_code=True,
            dtype=getattr(torch, config.dtype),
            device_map={"": str(self._device)},
        )
        return model.eval()

    def _predict_all(self, imgs):
        """Segments every query in a batch of images.

        Args:
            imgs: a list of images

        Returns:
            a list of :class:`fiftyone.core.labels.Detections`, one per image
        """
        images = [_prepare_image(img) for img in imgs]

        queries = list(self.classes)
        filter_classes = self.config.filter_classes
        if filter_classes is not None:
            queries = [q for q in queries if q in filter_classes]

        pairs = [(i, query) for i in range(len(images)) for query in queries]
        detections = [[] for _ in images]
        step = self.config.queries_per_pass
        for start in range(0, len(pairs), step):
            chunk = pairs[start : start + step]
            predictions = self._model.generate(
                [images[i] for i, _ in chunk],
                [query for _, query in chunk],
                max_new_tokens=self.config.max_new_tokens,
                min_dimension=self.config.min_dimension,
                max_dimension=self.config.max_dimension,
                compile=self.config.compile,
                segm_threshold=self.config.segm_threshold,
            )
            for (i, query), found in zip(chunk, predictions):
                detections[i].extend(_to_detection(p, query) for p in found)

        return [fol.Detections(detections=d) for d in detections]
