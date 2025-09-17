"""
Utilities for working with `VLM Run <https://vlm.run>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

import numpy as np
from PIL import Image

import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.core.utils as fou

vlmrun = fou.lazy_import(
    "vlmrun",
    callback=lambda: fou.ensure_package("vlmrun"),
)

logger = logging.getLogger(__name__)


def convert_vlm_model(
    domain=None,
    schema=None,
    api_key=None,
    base_url=None,
    **kwargs,
):
    """Creates a FiftyOne model wrapper for VLM Run.

    Args:
        domain (None): the VLM Run domain to use (e.g., "document.invoice",
            "document.markdown", "image.classification"). If not provided,
            schema must be specified
        schema (None): a custom Pydantic schema or dict schema for structured
            extraction. If not provided, domain must be specified
        api_key (None): a VLM Run API key. If not provided, it will be read
            from the ``VLMRUN_API_KEY`` environment variable
        base_url (None): the base URL for the VLM Run API. Defaults to
            "https://api.vlm.run/v1"
        **kwargs: additional keyword arguments for model configuration

    Returns:
        a :class:`VLMRunModel`
    """
    return VLMRunModel(
        domain=domain,
        schema=schema,
        api_key=api_key,
        base_url=base_url,
        **kwargs,
    )


def load_vlmrun_model(domain, api_key=None, base_url=None, **kwargs):
    """Loads a VLM Run model for the specified domain.

    Args:
        domain: the VLM Run domain to use (e.g., "document.invoice")
        api_key (None): a VLM Run API key. If not provided, it will be read
            from the ``VLMRUN_API_KEY`` environment variable
        base_url (None): the base URL for the VLM Run API
        **kwargs: additional keyword arguments for model configuration

    Returns:
        a :class:`VLMRunModel`
    """
    return VLMRunModel(
        domain=domain,
        api_key=api_key,
        base_url=base_url,
        **kwargs,
    )


def to_classification(result, confidence_thresh=None, label_field="label"):
    """Converts VLM Run structured output to FiftyOne classification format.

    Args:
        result: a VLM Run prediction result
        confidence_thresh (None): an optional confidence threshold
        label_field ("label"): the field name in the result containing the label

    Returns:
        a :class:`fiftyone.core.labels.Classification` or None
    """
    if result is None:
        return None

    # Handle VLM Run response format
    if hasattr(result, "response"):
        response_data = result.response

        # For image.classification domain, tags contain the classifications
        if isinstance(response_data, dict):
            # Get the first tag as the primary classification
            tags = response_data.get("tags", [])
            if tags and len(tags) > 0:
                label = tags[0]
            else:
                label = response_data.get(label_field)

            # Convert confidence levels
            conf_text = response_data.get("confidence", "medium")
            if conf_text == "hi" or conf_text == "high":
                confidence = 0.9
            elif conf_text == "medium":
                confidence = 0.7
            elif conf_text == "low":
                confidence = 0.3
            else:
                confidence = 0.5
        else:
            return None
    # Handle legacy format with "data" attribute
    elif hasattr(result, "data"):
        data = result.data
        if isinstance(data, dict):
            label = data.get(label_field)
            confidence = data.get("confidence", 1.0)
        elif hasattr(data, label_field):
            label = getattr(data, label_field)
            confidence = (
                getattr(data, "confidence", 1.0)
                if hasattr(data, "confidence")
                else 1.0
            )
        else:
            return None
    else:
        return None

    if label is None:
        return None

    if confidence_thresh is not None and confidence < confidence_thresh:
        return None

    return fol.Classification(label=str(label), confidence=confidence)


def to_detections(result, confidence_thresh=None):
    """Converts VLM Run structured output with bounding boxes to FiftyOne detections.

    Args:
        result: a VLM Run prediction result
        confidence_thresh (None): an optional confidence threshold

    Returns:
        a :class:`fiftyone.core.labels.Detections`
    """
    if result is None or not hasattr(result, "data"):
        return fol.Detections()

    data = result.data
    detections = []

    # Handle different data formats
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict) and "detections" in data:
        items = data["detections"]
    elif isinstance(data, dict) and "items" in data:
        items = data["items"]
    elif hasattr(data, "detections"):
        items = data.detections
    elif hasattr(data, "items"):
        items = data.items
    else:
        items = []

    for item in items:
        detection = _parse_detection(item, confidence_thresh)
        if detection is not None:
            detections.append(detection)

    return fol.Detections(detections=detections)


def _parse_detection(item, confidence_thresh=None):
    """Parse a single detection from VLM Run output."""
    if isinstance(item, dict):
        label = item.get("label") or item.get("class") or item.get("category")
        bbox = item.get("bbox") or item.get("bounding_box") or item.get("box")
        confidence = item.get("confidence", 1.0)
    elif hasattr(item, "label") or hasattr(item, "class_name"):
        label = getattr(item, "label", None) or getattr(
            item, "class_name", None
        )
        bbox = getattr(item, "bbox", None) or getattr(
            item, "bounding_box", None
        )
        confidence = getattr(item, "confidence", 1.0)
    else:
        return None

    if label is None or bbox is None:
        return None

    if confidence_thresh is not None and confidence < confidence_thresh:
        return None

    # Convert bbox to FiftyOne format [x, y, width, height] with values in [0, 1]
    if len(bbox) == 4:
        # Assume bbox is in [x1, y1, x2, y2] format
        x1, y1, x2, y2 = bbox
        x = x1
        y = y1
        width = x2 - x1
        height = y2 - y1

        # Normalize if values are > 1 (pixel coordinates)
        if any(v > 1 for v in [x, y, width, height]):
            # We'll need image dimensions for proper normalization
            # For now, we'll assume they're already normalized
            pass

        return fol.Detection(
            label=str(label),
            bounding_box=[x, y, width, height],
            confidence=confidence,
        )

    return None


def to_attributes(result, prefix=None):
    """Converts VLM Run structured output to FiftyOne attributes.

    Args:
        result: a VLM Run prediction result
        prefix (None): an optional prefix for attribute names

    Returns:
        a dict of attributes
    """
    if result is None:
        return {}

    attributes = {}

    # Handle VLM Run response with "response" attribute
    if hasattr(result, "response"):
        data = result.response
    # Handle VLM Run response with "data" attribute
    elif hasattr(result, "data"):
        data = result.data
    else:
        return {}

    # Flatten the data structure into attributes
    if isinstance(data, dict):
        for key, value in data.items():
            attr_key = f"{prefix}_{key}" if prefix else key
            if isinstance(value, (str, int, float, bool)):
                attributes[attr_key] = value
            elif isinstance(value, dict):
                # Recursively flatten nested dicts
                nested_attrs = to_attributes(
                    type("Result", (), {"data": value})(), prefix=attr_key
                )
                attributes.update(nested_attrs)
            elif isinstance(value, list):
                # Store lists as comma-separated strings
                if value and isinstance(value[0], (str, int, float)):
                    attributes[attr_key] = ", ".join(str(v) for v in value)
                else:
                    attributes[attr_key] = str(value)

    return attributes


def parse_visual_grounding(result):
    """Parse visual grounding data (bounding boxes) from VLM Run response.

    Args:
        result: a VLM Run prediction result with grounding enabled

    Returns:
        a :class:`fiftyone.core.labels.Detections` or None
    """
    if result is None:
        return None

    detections = []

    # Check for metadata with bounding boxes
    if hasattr(result, "metadata") and result.metadata:
        metadata = result.metadata
        if isinstance(metadata, dict):
            # Single detection
            if "bbox" in metadata:
                bbox = metadata["bbox"]
                confidence = metadata.get("confidence", 1.0)
                if isinstance(confidence, str):
                    # Convert hi/med/low to numeric
                    confidence = {
                        "hi": 0.9,
                        "high": 0.9,
                        "med": 0.7,
                        "medium": 0.7,
                        "low": 0.3,
                    }.get(confidence, 0.5)

                label = metadata.get("label", "object")
                detection = fol.Detection(
                    label=label,
                    bounding_box=[bbox["x"], bbox["y"], bbox["w"], bbox["h"]],
                    confidence=confidence,
                )
                detections.append(detection)

        elif isinstance(metadata, list):
            # Multiple detections
            for item in metadata:
                if "bbox" in item:
                    bbox = item["bbox"]
                    confidence = item.get("confidence", 1.0)
                    if isinstance(confidence, str):
                        confidence = {
                            "hi": 0.9,
                            "high": 0.9,
                            "med": 0.7,
                            "medium": 0.7,
                            "low": 0.3,
                        }.get(confidence, 0.5)

                    label = item.get("label", "object")
                    detection = fol.Detection(
                        label=label,
                        bounding_box=[
                            bbox["x"],
                            bbox["y"],
                            bbox["w"],
                            bbox["h"],
                        ],
                        confidence=confidence,
                    )
                    detections.append(detection)

    return fol.Detections(detections=detections) if detections else None


def parse_temporal_grounding(result):
    """Parse temporal grounding data (video/audio segments) from VLM Run response.

    Args:
        result: a VLM Run prediction result with temporal grounding

    Returns:
        a list of segment dictionaries with timestamps and content
    """
    if result is None:
        return []

    segments = []

    # Check for segments in response
    if hasattr(result, "response") and isinstance(result.response, dict):
        if "segments" in result.response:
            for seg in result.response["segments"]:
                segment = {
                    "start_time": seg.get("start_time", 0),
                    "end_time": seg.get("end_time", 0),
                    "audio_content": seg.get("audio_content", ""),
                    "video_content": seg.get("video_content", ""),
                    "text": seg.get("text", ""),
                }
                segments.append(segment)

        elif "total_duration" in result.response:
            # Single segment covering entire duration
            segment = {
                "start_time": 0,
                "end_time": result.response["total_duration"],
                "text": result.response.get("transcript", ""),
                "content": result.response.get("content", ""),
            }
            segments.append(segment)

    return segments


def list_vlmrun_domains(api_key=None):
    """List all available VLM Run domains.

    Args:
        api_key (None): a VLM Run API key. If not provided, it will be read
            from the ``VLMRUN_API_KEY`` environment variable

    Returns:
        a list of available domain names
    """
    from vlmrun.client import VLMRun

    api_key = api_key or os.getenv(  # pylint: disable=no-member
        "VLMRUN_API_KEY"
    )
    client = VLMRun(api_key=api_key)

    try:
        domains = client.hub.list_domains()
        # Domains might be strings or objects with domain attribute
        if domains and isinstance(domains[0], str):
            return domains
        else:
            return [
                d.domain if hasattr(d, "domain") else str(d) for d in domains
            ]
    except Exception as e:
        logger.warning(f"Failed to list domains: {e}")
        return []


def get_domain_schema(domain, api_key=None):
    """Get the schema for a specific VLM Run domain.

    Args:
        domain: the domain name
        api_key (None): a VLM Run API key. If not provided, it will be read
            from the ``VLMRUN_API_KEY`` environment variable

    Returns:
        the domain schema as a dict
    """
    from vlmrun.client import VLMRun

    api_key = api_key or os.getenv(  # pylint: disable=no-member
        "VLMRUN_API_KEY"
    )
    client = VLMRun(api_key=api_key)

    try:
        schema = client.hub.get_schema(domain)
        return schema.schema if hasattr(schema, "schema") else schema
    except Exception as e:
        logger.warning(f"Failed to get schema for domain {domain}: {e}")
        return {}


class VLMRunModelConfig(fom.ModelConfig):
    """Configuration for a VLM Run model.

    Args:
        domain: the VLM Run domain to use (e.g., "image.classification")
        api_key (None): the VLM Run API key
        base_url (None): the base URL for the VLM Run API
        timeout (120.0): the timeout for API calls
        max_retries (5): the maximum number of retries for API calls
        temperature (0.0): the temperature for generation
        max_tokens (65535): the maximum tokens for generation
        confidence (False): whether to return confidence scores
        grounding (False): whether to return visual grounding (bounding boxes)
        detail ("auto"): detail level for image processing
    """

    def __init__(
        self,
        domain,
        api_key=None,
        base_url=None,
        timeout=120.0,
        max_retries=5,
        temperature=0.0,
        max_tokens=65535,
        confidence=False,
        grounding=False,
        detail="auto",
        **kwargs,
    ):
        if not domain:
            raise ValueError("domain must be specified")

        self.domain = domain
        self.api_key = api_key or os.getenv(  # pylint: disable=no-member
            "VLMRUN_API_KEY"
        )
        self.base_url = base_url or "https://api.vlm.run/v1"
        self.timeout = timeout
        self.max_retries = max_retries
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.confidence = confidence
        self.grounding = grounding
        self.detail = detail


class VLMRunModel(fom.Model):
    """A FiftyOne wrapper for VLM Run models.

    Args:
        config: a :class:`VLMRunModelConfig`
    """

    def __init__(self, config=None, **kwargs):
        if config is None:
            config = VLMRunModelConfig(**kwargs)

        self.config = config
        self._client = None
        self._in_context_manager = False

    @property
    def media_type(self):
        """The media type supported by this model."""
        if self.config.domain:
            if self.config.domain.startswith("video."):
                return "video"
            elif self.config.domain.startswith("audio."):
                return "audio"
            elif self.config.domain.startswith("document."):
                return "document"
        return "image"

    @property
    def has_logits(self):
        """Whether this model supports returning logits."""
        return False

    @property
    def client(self):
        """The VLM Run client."""
        if self._client is None:
            from vlmrun.client import VLMRun

            self._client = VLMRun(
                api_key=self.config.api_key,
                base_url=self.config.base_url,
                timeout=self.config.timeout,
                max_retries=self.config.max_retries,
            )

        return self._client

    def __enter__(self):
        self._in_context_manager = True
        return self

    def __exit__(self, *args):
        self._in_context_manager = False
        if self._client is not None:
            # Clean up client if needed
            self._client = None

    def predict(self, media):
        """Performs prediction on the given media.

        Args:
            media: an image, video path, audio path, or document

        Returns:
            a VLM Run prediction result
        """
        from vlmrun.client.types import GenerationConfig

        # Build GenerationConfig with proper parameters
        gen_config_kwargs = {}
        if self.config.temperature != 0.0:
            gen_config_kwargs["temperature"] = self.config.temperature
        if self.config.max_tokens != 65535:
            gen_config_kwargs["max_tokens"] = self.config.max_tokens
        if self.config.grounding:
            gen_config_kwargs["grounding"] = True
        if self.config.confidence:
            gen_config_kwargs["confidence"] = True
        if self.config.detail and self.config.detail != "auto":
            gen_config_kwargs["detail"] = self.config.detail

        # Build kwargs for API calls
        kwargs = {}
        if gen_config_kwargs:
            kwargs["config"] = GenerationConfig(**gen_config_kwargs)

        # Domain-based processing
        if not self.config.domain:
            raise ValueError("domain must be specified")

        # Handle audio domains
        if self.config.domain.startswith("audio."):
            from pathlib import Path
            import time

            if not isinstance(media, str):
                raise ValueError("Audio processing requires a file path")

            # Audio requires batch mode like video
            response = self.client.audio.generate(
                file=Path(media),
                domain=self.config.domain,
                batch=True,  # Audio processing requires batch mode
                **kwargs,
            )

            # Wait for batch processing to complete (like video does)
            if hasattr(response, "id"):
                max_wait = 600  # 10 minutes max
                poll_interval = 5
                elapsed = 0

                while elapsed < max_wait:
                    status = self.client.predictions.get(id=response.id)
                    if status.status == "completed":
                        return status
                    elif status.status == "failed":
                        raise RuntimeError(
                            f"Audio prediction failed: {status.error}"
                        )

                    time.sleep(poll_interval)
                    elapsed += poll_interval

                raise TimeoutError(
                    f"Audio prediction timed out after {max_wait} seconds"
                )

            return response

        # Handle video domains
        if self.config.domain.startswith("video."):
            from pathlib import Path
            import time

            if not isinstance(media, str):
                raise ValueError("Video processing requires a file path")

            # Video requires batch mode
            response = self.client.video.generate(
                file=Path(media),
                domain=self.config.domain,
                batch=True,  # Video processing requires batch mode
                **kwargs,
            )

            # Poll for batch completion
            if hasattr(response, "id") and hasattr(response, "status"):
                prediction_id = response.id
                max_wait = 300  # 5 minutes max wait
                poll_interval = 2  # Check every 2 seconds
                elapsed = 0

                while elapsed < max_wait:
                    # Get the prediction status
                    pred_response = self.client.predictions.get(prediction_id)

                    if pred_response.status == "completed":
                        # Return the full response or the result field if it exists
                        if hasattr(pred_response, "result"):
                            return pred_response.result
                        else:
                            return pred_response
                    elif pred_response.status == "failed":
                        raise RuntimeError(
                            f"Video prediction failed: {pred_response}"
                        )

                    time.sleep(poll_interval)
                    elapsed += poll_interval

                raise TimeoutError(
                    f"Video prediction timed out after {max_wait} seconds"
                )

            return response

        # Handle document domains
        if self.config.domain.startswith("document."):
            from pathlib import Path

            # Documents expect file paths
            if isinstance(media, str):
                file_path = Path(media)
            elif isinstance(media, (np.ndarray, Image.Image)):
                # Save to temp file
                import tempfile

                if isinstance(media, np.ndarray):
                    media = Image.fromarray(media)
                with tempfile.NamedTemporaryFile(
                    suffix=".jpg", delete=False
                ) as tmp:
                    media.save(tmp.name)
                    file_path = Path(tmp.name)
            else:
                raise ValueError(f"Unsupported document type: {type(media)}")

            response = self.client.document.generate(
                file=file_path, domain=self.config.domain, **kwargs
            )
            return response

        # Handle image domains (default)
        if isinstance(media, np.ndarray):
            media = Image.fromarray(media)
        elif isinstance(media, str):
            media = Image.open(media)
        elif not isinstance(media, Image.Image):
            raise ValueError(f"Unsupported image type: {type(media)}")

        response = self.client.image.generate(
            images=[media], domain=self.config.domain, **kwargs
        )
        return response

    def predict_all(self, media_items):
        """Performs prediction on a batch of media items.

        Args:
            media_items: an iterable of media (images, videos, or documents)

        Returns:
            a list of VLM Run prediction results
        """
        results = []
        for media in media_items:
            try:
                result = self.predict(media)
                results.append(result)
            except Exception as e:
                logger.warning(f"Failed to process media: {e}")
                results.append(None)

        return results


def apply_vlmrun_model(
    samples,
    model=None,
    domain=None,
    schema=None,
    label_field="vlm_predictions",
    output_type="attributes",
    confidence_thresh=None,
    api_key=None,
    batch_size=None,
    progress=None,
    **kwargs,
):
    """Applies a VLM Run model to extract structured data from samples.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        model (None): a :class:`VLMRunModel` instance. If not provided,
            either domain or schema must be specified
        domain (None): the VLM Run domain to use if model is not provided
        schema (None): a custom schema if model is not provided
        label_field ("vlm_predictions"): the field to store results
        output_type ("attributes"): how to store results. Options are:
            - "attributes": store as sample attributes
            - "classification": store as Classification labels
            - "detections": store as Detections (if bbox data available)
            - "raw": store raw JSON response
        confidence_thresh (None): optional confidence threshold
        api_key (None): VLM Run API key if model is not provided
        batch_size (None): batch size for processing
        progress (None): whether to show progress bar
        **kwargs: additional keyword arguments

    Returns:
        None
    """
    # Create model if not provided
    if model is None:
        if domain is None and schema is None:
            raise ValueError(
                "Either model, domain, or schema must be specified"
            )

        model = VLMRunModel(
            domain=domain,
            schema=schema,
            api_key=api_key,
            **kwargs,
        )

    # Validate collection
    # Validate samples are images
    import fiftyone.core.validation as fov

    fov.validate_image_collection(samples)

    # Process samples
    with model:
        with fou.ProgressBar(progress=progress) as pb:
            for sample in pb(samples):
                try:
                    # Load image
                    img = Image.open(sample.filepath)

                    # Make prediction
                    result = model.predict(img)

                    # Convert result based on output_type
                    if output_type == "attributes":
                        attrs = to_attributes(result, prefix=label_field)
                        for key, value in attrs.items():
                            sample[key] = value
                    elif output_type == "classification":
                        label = to_classification(result, confidence_thresh)
                        if label is not None:
                            sample[label_field] = label
                    elif output_type == "detections":
                        detections = to_detections(result, confidence_thresh)
                        sample[label_field] = detections
                    elif output_type == "raw":
                        if hasattr(result, "data"):
                            sample[label_field] = result.data
                        else:
                            sample[label_field] = result
                    else:
                        raise ValueError(f"Unknown output_type: {output_type}")

                    # Save sample
                    sample.save()

                except Exception as e:
                    logger.warning(
                        f"Failed to process sample {sample.id}: {e}"
                    )
