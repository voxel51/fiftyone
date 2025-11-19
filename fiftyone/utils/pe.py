"""FiftyOne Integration with Perception Encoder by Meta.
"""
import fiftyone as fo
import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout

fou.ensure_package("huggingface_hub>=0.20.0")
from huggingface_hub import hf_hub_download

fou.ensure_package("perception_models")
import perception_models.core.vision_encoder.pe as pe
import perception_models.core.vision_encoder.transforms as pe_transforms


def download_pe_checkpoint(name: str, checkpoint_path: str):
    path = f"hf://facebook/{name}:{name}.pt"

    # Load from huggingface
    path = path[len("hf://") :]
    repo, file = path.split(":")

    split = checkpoint_path.rsplit("/", 1)[0]
    if len(split) == 1:
        local_dir = "."
    else:
        local_dir = split[0]

    return hf_hub_download(repo_id=repo, filename=file, local_dir=local_dir)


class PEVisionEncoderConfig(fout.TorchImageModelConfig):
    """Configuration for Perception Encoder Vision models.

    Inherits from :class:`fiftyone.utils.torch.TorchImageModelConfig`.

    Args (of note):
        entrypoint_fcn (None): the function to use to load the model. If `None`, defaults
            to `perception_models.core.vision_encoder.pe.VisionTransformer.from_config`.
        entrypoint_args (None): a dict of arguments to pass to the model entrypoint.
            - name ("PE-Core-T16-384"): the name of the model. See options at
            `https://github.com/facebookresearch/perception_models/tree/main/apps/pe`
            - pretrained (True): whether to use a pretrained model.
            - checkpoint_path (None): the path to the model checkpoint. If not provided,
                will default to `{fiftyone.config.model_zoo_dir}/{name}.pt`.
                If the checkpoint does not exist at this path, it will be downloaded
                from HuggingFace.
            Additional arguments can be passed to the model. See more details
                here: `perception_models.core.vision_encoder.pe.VisionTransformer.__init__`
        transforms_fcn (None): the function to use to generate the transforms. If `None`, defaults
            to `perception_models.core.vision_encoder.transforms.get_image_transform`.
        transforms_args (None): the arguments to pass to the transforms function. The default
            transforms have the following arguments:
            - image_size (None): the size to which to resize input images.
                If no size is provided, it will default to the model's default size.
            - center_crop (False): whether to apply center cropping.
            - interpolation (torchvision.transforms.InterpolationMode.BILINEAR):
                the interpolation mode to use.
        pool (True): whether to pool the output embeddings. Note that the `pool_type`
            argument passed to the model determines the pooling method. The `pool_type`
            argument can be passed through `entrypoint_args`. Note that if `pool` is `True`,
            `norm` is also applied, regardless of its value.
        project (False): whether to apply a linear projection to the pooled embeddings.
            If project is `True`, `pool` and `norm` are applied, regardless of their values.
        norm (True): whether to normalize the output embeddings.
        layer_idx (-1): the layer from which to extract features.
        strip_cls_token (False): whether to strip the class token from the output embeddings.
    """

    def __init__(self, d):
        super().__init__(d)
        # defaults
        # TODO: move to manifest
        if self.entrypoint_fcn is None:
            self.entrypoint_fcn = pe.VisionTransformer.from_config
        if self.entrypoint_args is None:
            self.entrypoint_args = {}
        default_entrypoint_args = {
            "name": "PE-Core-T16-384",
            "pretrained": True,
        }
        self.entrypoint_args = {
            **default_entrypoint_args,
            **self.entrypoint_args,
        }
        if "checkpoint_path" not in self.entrypoint_args:
            self.entrypoint_args["checkpoint_path"] = (
                fo.config.model_zoo_dir
                + "/"
                + self.entrypoint_args["name"]
                + ".pt"
            )
        if self.transforms_fcn is None:
            self.transforms_fcn = pe_transforms.get_image_transform

        if self.ragged_batches is None:
            if self.transforms_fcn == pe_transforms.get_image_transform:
                # if the user has not specified otherwise, batches should not be ragged
                self.ragged_batches = False

        self.pool = self.parse_bool(d, "pool", True)
        self.project = self.parse_bool(d, "project", False)
        self.norm = self.parse_bool(d, "norm", True)
        self.layer_idx = self.parse_int(d, "layer_idx", -1)
        self.strip_cls_token = self.parse_bool(d, "strip_cls_token", False)


class PEVisionEncoderEmbeddingsMixin(fom.EmbeddingsMixin):
    """Mixin for Perception Encoder Vision models that produce embeddings."""

    @property
    def has_embeddings(self) -> bool:
        return True

    def embed(self, arg):
        return self.predict(arg)

    def embed_all(self, args):
        return self.predict_all(args)


class PEVisionEncoder(PEVisionEncoderEmbeddingsMixin, fout.TorchImageModel):
    """Wrapper for Perception Encoder Vision models."""

    def _forward_pass(self, imgs):
        outputs = self._model.forward_features(
            imgs,
            norm=self.config.norm or self.config.project or self.config.pool,
            layer_idx=self.config.layer_idx,
            strip_cls_token=self.config.strip_cls_token,
        )

        if self.config.project or self.config.pool:
            outputs = self._model._pool(outputs)

        if self.config.project:
            outputs = outputs @ self._model.proj

        return outputs

    def _load_transforms(self, config):
        if self.config.transforms_args is None:
            self.config.transforms_args = {}
        if "image_size" not in self.config.transforms_args:
            # set to model default
            self.config.transforms_args["image_size"] = self._model.image_size
        return super()._load_transforms(config)

    def _download_model(self, config):
        download_pe_checkpoint(
            config.entrypoint_args["name"],
            checkpoint_path=config.entrypoint_args["checkpoint_path"],
        )
