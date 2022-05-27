"""
Dataset exporters.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import inspect
import logging
import os
import warnings

from bson import json_util
import numpy as np

import eta.core.datasets as etad
import eta.core.image as etai
import eta.core.frameutils as etaf
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.collections as foc
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.media as fomm
import fiftyone.core.odm as foo
import fiftyone.core.utils as fou
import fiftyone.utils.eta as foue
import fiftyone.utils.patches as foup

from .parsers import (
    FiftyOneLabeledImageSampleParser,
    FiftyOneUnlabeledImageSampleParser,
    FiftyOneLabeledVideoSampleParser,
    FiftyOneUnlabeledVideoSampleParser,
    ImageSampleParser,
    ImageClassificationSampleParser,
)


logger = logging.getLogger(__name__)


def export_samples(
    samples,
    export_dir=None,
    dataset_type=None,
    data_path=None,
    labels_path=None,
    export_media=None,
    dataset_exporter=None,
    label_field=None,
    frame_labels_field=None,
    num_samples=None,
    **kwargs,
):
    """Exports the given samples to disk.

    You can perform exports with this method via the following basic patterns:

    (a) Provide ``export_dir`` and ``dataset_type`` to export the content to a
        directory in the default layout for the specified format, as documented
        in :ref:`this page <exporting-datasets>`

    (b) Provide ``dataset_type`` along with ``data_path``, ``labels_path``,
        and/or ``export_media`` to directly specify where to export the source
        media and/or labels (if applicable) in your desired format. This syntax
        provides the flexibility to, for example, perform workflows like
        labels-only exports

    (c) Provide a ``dataset_exporter`` to which to feed samples to perform a
        fully-customized export

    In all workflows, the remaining parameters of this method can be provided
    to further configure the export.

    See :ref:`this page <exporting-datasets>` for more information about the
    available export formats and examples of using this method.

    See :ref:`this guide <custom-dataset-exporter>` for more details about
    exporting datasets in custom formats by defining your own
    :class:`fiftyone.utils.data.exporters.DatasetExporter`.

    This method will automatically coerce the data to match the requested
    export in the following cases:

    -   When exporting in either an unlabeled image or image classification
        format, if a spatial label field is provided
        (:class:`fiftyone.core.labels.Detection`,
        :class:`fiftyone.core.labels.Detections`,
        :class:`fiftyone.core.labels.Polyline`, or
        :class:`fiftyone.core.labels.Polylines`), then the **image patches** of
        the provided samples will be exported

    -   When exporting in labeled image dataset formats that expect list-type
        labels (:class:`fiftyone.core.labels.Classifications`,
        :class:`fiftyone.core.labels.Detections`,
        :class:`fiftyone.core.labels.Keypoints`, or
        :class:`fiftyone.core.labels.Polylines`), if a label field contains
        labels in non-list format
        (e.g., :class:`fiftyone.core.labels.Classification`), the labels will
        be automatically upgraded to single-label lists

    -   When exporting in labeled image dataset formats that expect
        :class:`fiftyone.core.labels.Detections` labels, if a
        :class:`fiftyone.core.labels.Classification` field is provided, the
        labels will be automatically upgraded to detections that span the
        entire images

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        export_dir (None): the directory to which to export the samples in
            format ``dataset_type``
        dataset_type (None): the :class:`fiftyone.types.dataset_types.Dataset`
            type to write
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media for certain export formats.
            Can be any of the following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of a
                JSON manifest file in ``export_dir`` generated when
                ``export_media`` is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, a default value of this parameter will be chosen based on
            the value of the ``export_media`` parameter. Note that this
            parameter is not applicable to certain export formats such as
            binary types like TF records
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Only applicable when
            exporting in certain labeled dataset formats. Can be any of the
            following:

            -   a type-specific folder name like ``"labels"`` or ``"labels/"``
                or a filename like ``"labels.json"`` or ``"labels.xml"``
                specifying the location in ``export_dir`` in which to export
                the labels
            -   an absolute directory or filepath in which to export the
                labels. In this case, the ``export_dir`` has no effect on the
                location of the labels

            For labeled datasets, the default value of this parameter will be
            chosen based on the export format so that the labels will be
            exported into ``export_dir``
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media. This option is only useful when
                exporting labeled datasets whose label format stores sufficient
                information to locate the associated media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media

            If None, an appropriate default value of this parameter will be
            chosen based on the value of the ``data_path`` parameter. Note that
            some dataset formats may not support certain values for this
            parameter (e.g., when exporting in binary formats such as TF
            records, "symlink" is not an option)
        dataset_exporter (None): a :class:`DatasetExporter` to use to write the
            dataset
        label_field (None): the name of the label field to export, or a
            dictionary mapping field names to output keys describing the label
            fields to export. Only applicable if ``dataset_exporter`` is a
            :class:`LabeledImageDatasetExporter` or
            :class:`LabeledVideoDatasetExporter`, or if you are exporting image
            patches
        frame_labels_field (None): the name of the frame label field to export,
            or a dictionary mapping field names to output keys describing the
            frame label fields to export. Only applicable if
            ``dataset_exporter`` is a :class:`LabeledVideoDatasetExporter`
        num_samples (None): the number of samples in ``samples``. If omitted,
            this is computed (if possible) via ``len(samples)``
        **kwargs: optional keyword arguments to pass to the dataset exporter's
            constructor. If you are exporting image patches, this can also
            contain keyword arguments for
            :class:`fiftyone.utils.patches.ImagePatchesExtractor`
    """
    found_patches, patches_kwargs, kwargs = _check_for_patches_export(
        samples, dataset_exporter, label_field, kwargs
    )
    found_clips, clips_kwargs, kwargs = _check_for_clips_export(
        samples, dataset_exporter, label_field, kwargs
    )

    if dataset_exporter is None:
        dataset_exporter, _ = build_dataset_exporter(
            dataset_type,
            export_dir=export_dir,
            data_path=data_path,
            labels_path=labels_path,
            export_media=export_media,
            **kwargs,
        )
    else:
        kwargs.update(
            dict(
                export_dir=export_dir,
                data_path=data_path,
                labels_path=labels_path,
                export_media=export_media,
            )
        )

        for key, value in kwargs.items():
            if value is not None:
                logger.warning("Ignoring unsupported parameter '%s'", key)

    sample_collection = samples

    if isinstance(dataset_exporter, BatchDatasetExporter):
        _write_batch_dataset(dataset_exporter, samples)
        return

    if isinstance(dataset_exporter, GenericSampleDatasetExporter):
        sample_parser = None
    elif isinstance(dataset_exporter, UnlabeledImageDatasetExporter):
        if found_patches:
            # Export unlabeled image patches
            samples = foup.ImagePatchesExtractor(
                samples,
                label_field,
                include_labels=False,
                **patches_kwargs,
            )
            sample_parser = ImageSampleParser()
            num_samples = len(samples)
        else:
            sample_parser = FiftyOneUnlabeledImageSampleParser(
                compute_metadata=True
            )

    elif isinstance(dataset_exporter, UnlabeledVideoDatasetExporter):
        if found_clips:
            # Export unlabeled video clips
            samples = samples.to_clips(label_field)
            num_samples = len(samples)

        # True for copy/move/symlink, False for manifest/no export
        _export_media = getattr(
            dataset_exporter, "export_media", export_media
        ) not in {False, "symlink"}

        #
        # Clips are always written to a temporary directory first, so the
        # exporter should just move these to the ultimate destination
        #
        # Note that if the dataset exporter does not use `export_media`, this
        # will not work properly...
        #
        if samples._dataset._is_clips and _export_media:
            dataset_exporter.export_media = "move"

        sample_parser = FiftyOneUnlabeledVideoSampleParser(
            compute_metadata=True, export_media=_export_media, **clips_kwargs
        )

    elif isinstance(dataset_exporter, LabeledImageDatasetExporter):
        if found_patches:
            # Export labeled image patches
            samples = foup.ImagePatchesExtractor(
                samples,
                label_field,
                include_labels=True,
                **patches_kwargs,
            )
            sample_parser = ImageClassificationSampleParser()
            num_samples = len(samples)
        else:
            label_fcn = _make_label_coercion_functions(
                label_field, samples, dataset_exporter
            )
            sample_parser = FiftyOneLabeledImageSampleParser(
                label_field,
                label_fcn=label_fcn,
                compute_metadata=True,
            )

    elif isinstance(dataset_exporter, LabeledVideoDatasetExporter):
        if found_clips:
            # Export labeled video clips
            samples = samples.to_clips(label_field)
            num_samples = len(samples)

        # True for copy/move/symlink, False for manifest/no export
        _export_media = getattr(
            dataset_exporter, "export_media", export_media
        ) not in {False, "symlink"}

        #
        # Clips are always written to a temporary directory first, so the
        # exporter should just move these to the ultimate destination
        #
        # Note that if the dataset exporter does not use `export_media`, this
        # will not work properly...
        #
        if samples._dataset._is_clips and _export_media:
            dataset_exporter.export_media = "move"

        label_fcn = _make_label_coercion_functions(
            label_field, samples, dataset_exporter
        )
        frame_labels_fcn = _make_label_coercion_functions(
            frame_labels_field,
            samples,
            dataset_exporter,
            frames=True,
        )
        sample_parser = FiftyOneLabeledVideoSampleParser(
            label_field=label_field,
            frame_labels_field=frame_labels_field,
            label_fcn=label_fcn,
            frame_labels_fcn=frame_labels_fcn,
            compute_metadata=True,
            export_media=_export_media,
            **clips_kwargs,
        )

    else:
        raise ValueError(
            "Unsupported DatasetExporter %s" % type(dataset_exporter)
        )

    write_dataset(
        samples,
        sample_parser,
        dataset_exporter,
        num_samples=num_samples,
        sample_collection=sample_collection,
    )


def write_dataset(
    samples,
    sample_parser,
    dataset_exporter,
    num_samples=None,
    sample_collection=None,
):
    """Writes the samples to disk as a dataset in the specified format.

    Args:
        samples: an iterable of samples that can be parsed by ``sample_parser``
        sample_parser: a :class:`fiftyone.utils.data.parsers.SampleParser` to
            use to parse the samples
        dataset_exporter: a :class:`DatasetExporter` to use to write the
            dataset
        num_samples (None): the number of samples in ``samples``. If omitted,
            this is computed (if possible) via ``len(samples)``
        sample_collection (None): the
            :class:`fiftyone.core.collections.SampleCollection` from which
            ``samples`` were extracted. If ``samples`` is itself a
            :class:`fiftyone.core.collections.SampleCollection`, this parameter
            defaults to ``samples``. This parameter is optional and is only
            passed to :meth:`DatasetExporter.log_collection`
    """
    if num_samples is None:
        try:
            num_samples = len(samples)
        except:
            pass

    if sample_collection is None and isinstance(samples, foc.SampleCollection):
        sample_collection = samples

    if isinstance(dataset_exporter, GenericSampleDatasetExporter):
        _write_generic_sample_dataset(
            dataset_exporter,
            samples,
            num_samples=num_samples,
            sample_collection=sample_collection,
        )
    elif isinstance(
        dataset_exporter,
        (UnlabeledImageDatasetExporter, LabeledImageDatasetExporter),
    ):
        _write_image_dataset(
            dataset_exporter,
            samples,
            sample_parser,
            num_samples=num_samples,
            sample_collection=sample_collection,
        )
    elif isinstance(
        dataset_exporter,
        (UnlabeledVideoDatasetExporter, LabeledVideoDatasetExporter),
    ):
        _write_video_dataset(
            dataset_exporter,
            samples,
            sample_parser,
            num_samples=num_samples,
            sample_collection=sample_collection,
        )
    else:
        raise ValueError(
            "Unsupported DatasetExporter %s" % type(dataset_exporter)
        )


def build_dataset_exporter(
    dataset_type, strip_none=True, warn_unused=True, **kwargs
):
    """Builds the :class:`DatasetExporter` instance for the given parameters.

    Args:
        dataset_type: the :class:`fiftyone.types.dataset_types.Dataset` type
        strip_none (True): whether to exclude None-valued items from ``kwargs``
        warn_unused (True): whether to issue warnings for any non-None unused
            parameters encountered
        **kwargs: keyword arguments to pass to the dataset exporter's
            constructor via ``DatasetExporter(**kwargs)``

    Returns:
        a tuple of:

        -   the :class:`DatasetExporter` instance
        -   a dict of unused keyword arguments
    """
    if dataset_type is None:
        raise ValueError(
            "You must provide a `dataset_type` in order to build a dataset "
            "exporter"
        )

    if inspect.isclass(dataset_type):
        dataset_type = dataset_type()

    dataset_exporter_cls = dataset_type.get_dataset_exporter_cls()

    if strip_none:
        kwargs = {k: v for k, v in kwargs.items() if v is not None}

    kwargs, unused_kwargs = fou.extract_kwargs_for_class(
        dataset_exporter_cls, kwargs
    )

    try:
        dataset_exporter = dataset_exporter_cls(**kwargs)
    except Exception as e:
        raise ValueError(
            "Failed to construct exporter of type %s using the provided "
            "parameters. See above for the error. You may need to supply "
            "additional mandatory arguments. Please consult the documentation "
            "of %s to learn more"
            % (dataset_exporter_cls, dataset_exporter_cls)
        ) from e

    if warn_unused:
        for key, value in unused_kwargs.items():
            if value is not None:
                logger.warning(
                    "Ignoring unsupported parameter '%s' for exporter type %s",
                    key,
                    dataset_exporter_cls,
                )

    return dataset_exporter, unused_kwargs


def _check_for_patches_export(samples, dataset_exporter, label_field, kwargs):
    if isinstance(label_field, dict):
        if len(label_field) == 1:
            label_field = next(iter(label_field.keys()))
        else:
            label_field = None

    if label_field is None:
        return False, {}, kwargs

    found_patches = False

    if isinstance(dataset_exporter, UnlabeledImageDatasetExporter):
        try:
            label_type = samples._get_label_field_type(label_field)
            found_patches = issubclass(label_type, fol._PATCHES_FIELDS)
        except:
            pass

        if found_patches:
            logger.info(
                "Detected an unlabeled image exporter and a label field '%s' "
                "of type %s. Exporting image patches...",
                label_field,
                label_type,
            )

    elif isinstance(dataset_exporter, LabeledImageDatasetExporter):
        label_cls = dataset_exporter.label_cls

        if isinstance(label_cls, dict):
            export_types = list(label_cls.values())
        elif isinstance(label_cls, (list, tuple)):
            export_types = list(label_cls)
        else:
            export_types = [label_cls]

        try:
            label_type = samples._get_label_field_type(label_field)
        except:
            label_type = None

        if (
            label_type is not None
            and not issubclass(label_type, tuple(export_types))
            and fol.Classification in export_types
        ):
            found_patches = issubclass(label_type, fol._PATCHES_FIELDS)

        if found_patches:
            logger.info(
                "Detected an image classification exporter and a label field "
                "'%s' of type %s. Exporting image patches...",
                label_field,
                label_type,
            )

    if found_patches:
        patches_kwargs, kwargs = fou.extract_kwargs_for_class(
            foup.ImagePatchesExtractor, kwargs
        )
    else:
        patches_kwargs = {}

    return found_patches, patches_kwargs, kwargs


def _check_for_clips_export(samples, dataset_exporter, label_field, kwargs):
    if isinstance(label_field, dict):
        if len(label_field) == 1:
            label_field = next(iter(label_field.keys()))
        else:
            label_field = None

    found_clips = False
    clips_kwargs = {}

    if isinstance(dataset_exporter, UnlabeledVideoDatasetExporter):
        try:
            label_type = samples._get_label_field_type(label_field)
            found_clips = issubclass(
                label_type, (fol.TemporalDetection, fol.TemporalDetections)
            )
        except:
            pass

        if found_clips:
            logger.info(
                "Detected an unlabeled video exporter and a label field '%s' "
                "of type %s. Exporting video clips...",
                label_field,
                label_type,
            )

        if found_clips or samples._dataset._is_clips:
            clips_kwargs, kwargs = fou.extract_kwargs_for_class(
                FiftyOneUnlabeledVideoSampleParser, kwargs
            )

    elif isinstance(dataset_exporter, LabeledVideoDatasetExporter):
        label_cls = dataset_exporter.label_cls

        if isinstance(label_cls, dict):
            export_types = list(label_cls.values())
        elif isinstance(label_cls, (list, tuple)):
            export_types = list(label_cls)
        else:
            export_types = [label_cls]

        try:
            label_type = samples._get_label_field_type(label_field)
        except:
            label_type = None

        if (
            label_type is not None
            and not issubclass(label_type, tuple(export_types))
            and fol.Classification in export_types
        ):
            found_clips = issubclass(
                label_type, (fol.TemporalDetection, fol.TemporalDetections)
            )

        if found_clips:
            logger.info(
                "Detected a video classification exporter and a label field "
                "'%s' of type %s. Exporting video clips...",
                label_field,
                label_type,
            )

        if found_clips or samples._dataset._is_clips:
            clips_kwargs, kwargs = fou.extract_kwargs_for_class(
                FiftyOneLabeledVideoSampleParser, kwargs
            )

    return found_clips, clips_kwargs, kwargs


def _make_label_coercion_functions(
    label_field_or_dict,
    sample_collection,
    dataset_exporter,
    frames=False,
    validate=True,
):
    if frames:
        label_cls = dataset_exporter.frame_labels_cls
    else:
        label_cls = dataset_exporter.label_cls

    # Exporter doesn't declare types, so we cannot do anything
    if label_cls is None:
        return None

    return_dict = isinstance(label_field_or_dict, dict)

    if return_dict:
        label_fields = list(label_field_or_dict.keys())
    else:
        label_fields = [label_field_or_dict]

    if isinstance(label_cls, dict):
        export_types = list(label_cls.values())
    elif isinstance(label_cls, (list, tuple)):
        export_types = list(label_cls)
    else:
        export_types = [label_cls]

    coerce_fcn_dict = {}
    for label_field in label_fields:
        if label_field is None:
            continue

        field_type = sample_collection.get_field(
            f"{'frames.' if frames else ''}{label_field}"
        )

        if isinstance(field_type, fof.EmbeddedDocumentField):
            label_type = field_type.document_type
        else:
            label_type = type(field_type)

        # Natively supported types
        if any(issubclass(label_type, t) for t in export_types):
            continue

        # Single label -> list coercion
        for export_type in export_types:
            single_type = fol._LABEL_LIST_TO_SINGLE_MAP.get(export_type, None)
            if single_type is not None and issubclass(label_type, single_type):
                logger.info(
                    "Dataset exporter expects labels in %s format, but found "
                    "%s. Wrapping field '%s' as single-label lists...",
                    export_type,
                    label_type,
                    label_field,
                )

                coerce_fcn_dict[label_field] = _make_single_label_to_list_fcn(
                    export_type
                )
                break

        if label_field in coerce_fcn_dict:
            continue

        # `Classification` -> `Detections` coercion
        if (
            issubclass(label_type, fol.Classification)
            and fol.Detections in export_types
        ):
            logger.info(
                "Dataset exporter expects labels in %s format, but found %s. "
                "Converting field '%s' to detections whose bounding boxes "
                "span the entire image...",
                fol.Detections,
                label_type,
                label_field,
            )

            coerce_fcn_dict[label_field] = _classification_to_detections
            continue

        # Handle invalid field types
        if validate:
            ftype = "Frame field" if frames else "Field"
            raise ValueError(
                "%s '%s' of type %s is not supported by exporter type %s, "
                "which only supports %s"
                % (
                    ftype,
                    label_field,
                    label_type,
                    type(dataset_exporter),
                    export_types,
                )
            )

    if not coerce_fcn_dict:
        return None

    if not return_dict:
        return next(iter(coerce_fcn_dict.values()))

    return coerce_fcn_dict


def _make_single_label_to_list_fcn(label_cls):
    def single_label_to_list(label):
        if label is None:
            return label

        return label_cls(**{label_cls._LABEL_LIST_FIELD: [label]})

    return single_label_to_list


def _classification_to_detections(label):
    if label is None:
        return label

    return fol.Detections(
        detections=[
            fol.Detection(
                label=label.label,
                bounding_box=[0, 0, 1, 1],
                confidence=label.confidence,
            )
        ]
    )


def _write_batch_dataset(dataset_exporter, samples):
    if not isinstance(samples, foc.SampleCollection):
        raise ValueError(
            "%s can only export %s instances"
            % (type(dataset_exporter), foc.SampleCollection)
        )

    with dataset_exporter:
        dataset_exporter.export_samples(samples)


def _write_generic_sample_dataset(
    dataset_exporter,
    samples,
    num_samples=None,
    sample_collection=None,
):
    with fou.ProgressBar(total=num_samples) as pb:
        with dataset_exporter:
            if sample_collection is not None:
                dataset_exporter.log_collection(sample_collection)

            for sample in pb(samples):
                dataset_exporter.export_sample(sample)


def _write_image_dataset(
    dataset_exporter,
    samples,
    sample_parser,
    num_samples=None,
    sample_collection=None,
):
    labeled_images = isinstance(dataset_exporter, LabeledImageDatasetExporter)

    with fou.ProgressBar(total=num_samples) as pb:
        with dataset_exporter:
            if sample_collection is not None:
                dataset_exporter.log_collection(sample_collection)

            for sample in pb(samples):
                sample_parser.with_sample(sample)

                # Parse image
                if sample_parser.has_image_path:
                    try:
                        image_or_path = sample_parser.get_image_path()
                    except:
                        image_or_path = sample_parser.get_image()
                else:
                    image_or_path = sample_parser.get_image()

                # Parse metadata
                if dataset_exporter.requires_image_metadata:
                    if sample_parser.has_image_metadata:
                        metadata = sample_parser.get_image_metadata()
                    else:
                        metadata = None

                    if metadata is None:
                        metadata = fom.ImageMetadata.build_for(image_or_path)
                else:
                    metadata = None

                if labeled_images:
                    # Parse label
                    label = sample_parser.get_label()

                    # Export sample
                    dataset_exporter.export_sample(
                        image_or_path, label, metadata=metadata
                    )
                else:
                    # Export sample
                    dataset_exporter.export_sample(
                        image_or_path, metadata=metadata
                    )


def _write_video_dataset(
    dataset_exporter,
    samples,
    sample_parser,
    num_samples=None,
    sample_collection=None,
):
    labeled_videos = isinstance(dataset_exporter, LabeledVideoDatasetExporter)

    with fou.ProgressBar(total=num_samples) as pb:
        with dataset_exporter:
            if sample_collection is not None:
                dataset_exporter.log_collection(sample_collection)

            for sample in pb(samples):
                sample_parser.with_sample(sample)

                # Parse video
                video_path = sample_parser.get_video_path()

                # Parse metadata
                if dataset_exporter.requires_video_metadata:
                    if sample_parser.has_video_metadata:
                        metadata = sample_parser.get_video_metadata()
                    else:
                        metadata = None

                    if metadata is None:
                        metadata = fom.VideoMetadata.build_for(video_path)
                else:
                    metadata = None

                if labeled_videos:
                    # Parse labels
                    label = sample_parser.get_label()
                    frames = sample_parser.get_frame_labels()

                    # Export sample
                    dataset_exporter.export_sample(
                        video_path, label, frames, metadata=metadata
                    )
                else:
                    # Export sample
                    dataset_exporter.export_sample(
                        video_path, metadata=metadata
                    )


class ExportPathsMixin(object):
    """Mixin for :class:`DatasetExporter` classes that provides convenience
    methods for parsing the ``data_path``, ``labels_path``, and
    ``export_media`` parameters supported by many exporters.
    """

    @staticmethod
    def _parse_data_path(
        export_dir=None,
        data_path=None,
        export_media=None,
        default=None,
    ):
        """Helper function that computes default values for the ``data_path``
        and ``export_media`` parameters supported by many exporters.
        """
        if data_path is None:
            if export_media == "manifest" and default is not None:
                data_path = fou.normalize_path(default) + ".json"
            elif export_dir is not None:
                data_path = default

        if data_path is not None:
            data_path = os.path.expanduser(data_path)

            if not os.path.isabs(data_path) and export_dir is not None:
                export_dir = fou.normalize_path(export_dir)
                data_path = os.path.join(export_dir, data_path)

        if export_media is None:
            if data_path is None:
                export_media = False
            elif data_path.endswith(".json"):
                export_media = "manifest"
            else:
                export_media = True

        return data_path, export_media

    @staticmethod
    def _parse_labels_path(export_dir=None, labels_path=None, default=None):
        """Helper function that computes default values for the ``labels_path``
        parameter supported by many exporters.
        """
        if labels_path is None:
            labels_path = default

        if labels_path is not None:
            labels_path = os.path.expanduser(labels_path)

            if not os.path.isabs(labels_path) and export_dir is not None:
                export_dir = fou.normalize_path(export_dir)
                labels_path = os.path.join(export_dir, labels_path)

        return labels_path


class MediaExporter(object):
    """Base class for :class:`DatasetExporter` utilities that provide support
    for populating a directory or manifest of media files.

    This class is designed for populating a single, flat directory or manifest
    of media files, and automatically takes care of things like name clashes
    as necessary.

    The export strategy used is defined by the ``export_mode`` parameter, and
    users of this class can restrict the available options via the
    ``supported_modes`` parameter.

    Args:
        export_mode: the export mode to use. The supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media. This option is only useful when
                exporting labeled datasets whose label format stores sufficient
                information to locate the associated media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media
        export_path (None): the location to export the media. Can be any of the
            following:

            -   When ``export_media`` is True, "move", or "symlink", a
                directory in which to export the media
            -   When ``export_mode`` is "manifest", the path to write a JSON
                file mapping UUIDs to input filepaths
            -   When ``export_media`` is False, this parameter can optionally
                be a root directory to strip from each exported image's path to
                yield a UUID for each image. If no path is provided, only the
                filename of each image is used for UUID generation
        supported_modes (None): an optional tuple specifying a subset of the
            ``export_mode`` values that are allowed
        default_ext (None): the file extension to use when generating default
            output paths
        ignore_exts (False): whether to omit file extensions when generating
            UUIDs for files
    """

    def __init__(
        self,
        export_mode,
        export_path=None,
        supported_modes=None,
        default_ext=None,
        ignore_exts=False,
    ):
        if supported_modes is None:
            supported_modes = (True, False, "move", "symlink", "manifest")

        if export_mode not in supported_modes:
            raise ValueError(
                "Unsupported media export mode `%s`. The supported values are "
                "%s" % (export_mode, supported_modes)
            )

        if export_path is not None:
            export_path = fou.normalize_path(export_path)

        self.export_mode = export_mode
        self.export_path = export_path
        self.supported_modes = supported_modes
        self.default_ext = default_ext
        self.ignore_exts = ignore_exts

        self._filename_maker = None
        self._manifest = None
        self._manifest_path = None

    def _write_media(self, media, outpath):
        raise NotImplementedError("subclass must implement _write_media()")

    def _get_uuid(self, media_path):
        if self.export_mode == False and self.export_path is not None:
            media_path = fou.normalize_path(media_path)
            uuid = os.path.relpath(media_path, self.export_path)
        else:
            uuid = os.path.basename(media_path)

        if self.ignore_exts:
            return os.path.splitext(uuid)[0]

        return uuid

    def setup(self):
        """Performs necessary setup to begin exporting media.

        :class:`DatasetExporter` classes using this class should invoke this
        method in :meth:`DatasetExporter.setup`.
        """
        output_dir = None
        manifest_path = None
        manifest = None

        if self.export_mode in (True, "move", "symlink"):
            output_dir = self.export_path
        elif self.export_mode == "manifest":
            manifest_path = self.export_path
            manifest = {}

        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=output_dir,
            default_ext=self.default_ext,
            ignore_exts=self.ignore_exts,
        )
        self._manifest_path = manifest_path
        self._manifest = manifest

    def export(self, media_or_path, outpath=None):
        """Exports the given media.

        Args:
            media_or_path: the media or path to the media on disk
            outpath (None): a manually-specified location to which to export
                the media. By default, the media will be exported into
                :attr:`export_path`

        Returns:
            a tuple of:

            -   the path to the exported media
            -   the UUID of the exported media
        """
        if etau.is_str(media_or_path):
            media_path = media_or_path

            if outpath is not None:
                uuid = self._get_uuid(outpath)
            elif self.export_mode != False:
                outpath = self._filename_maker.get_output_path(media_path)
                uuid = self._get_uuid(outpath)
            else:
                outpath = None
                uuid = self._get_uuid(media_path)

            if self.export_mode == True:
                etau.copy_file(media_path, outpath)
            elif self.export_mode == "move":
                etau.move_file(media_path, outpath)
            elif self.export_mode == "symlink":
                etau.symlink_file(media_path, outpath)
            elif self.export_mode == "manifest":
                outpath = None
                self._manifest[uuid] = media_path
        else:
            media = media_or_path

            if outpath is None:
                outpath = self._filename_maker.get_output_path()

            uuid = self._get_uuid(outpath)

            if self.export_mode == True:
                self._write_media(media, outpath)
            elif self.export_mode != False:
                raise ValueError(
                    "Cannot export in-memory media when 'export_mode=%s'"
                    % self.export_mode
                )

        return outpath, uuid

    def close(self):
        """Performs any necessary actions to complete the export."""
        if self.export_mode == "manifest":
            etas.write_json(self._manifest, self._manifest_path)


class ImageExporter(MediaExporter):
    """Utility class for :class:`DatasetExporter` instances that export images.

    See :class:`MediaExporter` for details.
    """

    def __init__(self, *args, default_ext=None, **kwargs):
        if default_ext is None:
            default_ext = fo.config.default_image_ext

        super().__init__(*args, default_ext=default_ext, **kwargs)

    def _write_media(self, img, outpath):
        etai.write(img, outpath)


class VideoExporter(MediaExporter):
    """Utility class for :class:`DatasetExporter` instances that export videos.

    See :class:`MediaExporter` for details.
    """

    def __init__(self, *args, default_ext=None, **kwargs):
        if default_ext is None:
            default_ext = fo.config.default_video_ext

        super().__init__(*args, default_ext=default_ext, **kwargs)

    def _write_media(self, media, outpath):
        raise ValueError("Only video paths can be exported")


class DatasetExporter(object):
    """Base interface for exporting datsets.

    See :ref:`this page <writing-a-custom-dataset-exporter>` for information
    about implementing/using dataset exporters.

    Args:
        export_dir (None): the directory to write the export. This may be
            optional for some exporters
    """

    def __init__(self, export_dir=None):
        if export_dir is not None:
            export_dir = fou.normalize_path(export_dir)

        self.export_dir = export_dir

    def __enter__(self):
        self.setup()
        return self

    def __exit__(self, *args):
        self.close(*args)

    def setup(self):
        """Performs any necessary setup before exporting the first sample in
        the dataset.

        This method is called when the exporter's context manager interface is
        entered, :func:`DatasetExporter.__enter__`.
        """
        pass

    def log_collection(self, sample_collection):
        """Logs any relevant information about the
        :class:`fiftyone.core.collections.SampleCollection` whose samples will
        be exported.

        Subclasses can optionally implement this method if their export format
        can record information such as the
        :meth:`fiftyone.core.collections.SampleCollection.info` or
        :meth:`fiftyone.core.collections.SampleCollection.classes` of the
        collection being exported.

        By convention, this method must be optional; i.e., if it is not called
        before the first call to :meth:`export_sample`, then the exporter must
        make do without any information about the
        :class:`fiftyone.core.collections.SampleCollection` (which may not be
        available, for example, if the samples being exported are not stored in
        a collection).

        Args:
            sample_collection: the
                :class:`fiftyone.core.collections.SampleCollection` whose
                samples will be exported
        """
        pass

    def export_sample(self, *args, **kwargs):
        """Exports the given sample to the dataset.

        Args:
            *args: subclass-specific positional arguments
            **kwargs: subclass-specific keyword arguments
        """
        raise NotImplementedError("subclass must implement export_sample()")

    def close(self, *args):
        """Performs any necessary actions after the last sample has been
        exported.

        This method is called when the exporter's context manager interface is
        exited, :func:`DatasetExporter.__exit__`.

        Args:
            *args: the arguments to :func:`DatasetExporter.__exit__`
        """
        pass


class BatchDatasetExporter(DatasetExporter):
    """Base interface for exporters that export entire
    :class:`fiftyone.core.collections.SampleCollection` instances in a single
    batch.

    This interface allows for greater efficiency for export formats that
    handle aggregating over the samples themselves.

    Args:
        export_dir (None): the directory to write the export. This may be
            optional for some exporters
    """

    def export_sample(self, *args, **kwargs):
        raise ValueError(
            "Use export_samples() to perform exports with %s instances"
            % type(self)
        )

    def export_samples(self, sample_collection):
        """Exports the given sample collection.

        Args:
            sample_collection: a
                :class:`fiftyone.core.collections.SampleCollection`
        """
        raise NotImplementedError("subclass must implement export_samples()")


class GenericSampleDatasetExporter(DatasetExporter):
    """Interface for exporting datasets of arbitrary
    :class:`fiftyone.core.sample.Sample` instances.

    See :ref:`this page <writing-a-custom-dataset-exporter>` for information
    about implementing/using dataset exporters.

    Args:
        export_dir (None): the directory to write the export. This may be
            optional for some exporters
    """

    def export_sample(self, sample):
        """Exports the given sample to the dataset.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
        """
        raise NotImplementedError("subclass must implement export_sample()")


class UnlabeledImageDatasetExporter(DatasetExporter):
    """Interface for exporting datasets of unlabeled image samples.

    See :ref:`this page <writing-a-custom-dataset-exporter>` for information
    about implementing/using dataset exporters.

    Args:
        export_dir (None): the directory to write the export. This may be
            optional for some exporters
    """

    @property
    def requires_image_metadata(self):
        """Whether this exporter requires
        :class:`fiftyone.core.metadata.ImageMetadata` instances for each sample
        being exported.
        """
        raise NotImplementedError(
            "subclass must implement requires_image_metadata"
        )

    def export_sample(self, image_or_path, metadata=None):
        """Exports the given sample to the dataset.

        Args:
            image_or_path: an image or the path to the image on disk
            metadata (None): a :class:`fiftyone.core.metadata.ImageMetadata`
                instance for the sample. Only required when
                :meth:`requires_image_metadata` is ``True``
        """
        raise NotImplementedError("subclass must implement export_sample()")


class UnlabeledVideoDatasetExporter(DatasetExporter):
    """Interface for exporting datasets of unlabeled video samples.

    See :ref:`this page <writing-a-custom-dataset-exporter>` for information
    about implementing/using dataset exporters.

    Args:
        export_dir (None): the directory to write the export. This may be
            optional for some exporters
    """

    @property
    def requires_video_metadata(self):
        """Whether this exporter requires
        :class:`fiftyone.core.metadata.VideoMetadata` instances for each sample
        being exported.
        """
        raise NotImplementedError(
            "subclass must implement requires_video_metadata"
        )

    def export_sample(self, video_path, metadata=None):
        """Exports the given sample to the dataset.

        Args:
            video_path: the path to a video on disk
            metadata (None): a :class:`fiftyone.core.metadata.VideoMetadata`
                instance for the sample. Only required when
                :meth:`requires_video_metadata` is ``True``
        """
        raise NotImplementedError("subclass must implement export_sample()")


class LabeledImageDatasetExporter(DatasetExporter):
    """Interface for exporting datasets of labeled image samples.

    See :ref:`this page <writing-a-custom-dataset-exporter>` for information
    about implementing/using dataset exporters.

    Args:
        export_dir (None): the directory to write the export. This may be
            optional for some exporters
    """

    @property
    def requires_image_metadata(self):
        """Whether this exporter requires
        :class:`fiftyone.core.metadata.ImageMetadata` instances for each sample
        being exported.
        """
        raise NotImplementedError(
            "subclass must implement requires_image_metadata"
        )

    @property
    def label_cls(self):
        """The :class:`fiftyone.core.labels.Label` class(es) exported by this
        exporter.

        This can be any of the following:

        -   a :class:`fiftyone.core.labels.Label` class. In this case, the
            exporter directly exports labels of this type
        -   a list or tuple of :class:`fiftyone.core.labels.Label` classes. In
            this case, the exporter can export a single label field of any of
            these types
        -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
            In this case, the exporter can handle label dictionaries with
            value-types specified by this dictionary. Not all keys need be
            present in the exported label dicts
        -   ``None``. In this case, the exporter makes no guarantees about the
            labels that it can export
        """
        raise NotImplementedError("subclass must implement label_cls")

    def export_sample(self, image_or_path, label, metadata=None):
        """Exports the given sample to the dataset.

        Args:
            image_or_path: an image or the path to the image on disk
            label: an instance of :meth:`label_cls`, or a dictionary mapping
                field names to :class:`fiftyone.core.labels.Label` instances,
                or ``None`` if the sample is unlabeled
            metadata (None): a :class:`fiftyone.core.metadata.ImageMetadata`
                instance for the sample. Only required when
                :meth:`requires_image_metadata` is ``True``
        """
        raise NotImplementedError("subclass must implement export_sample()")


class LabeledVideoDatasetExporter(DatasetExporter):
    """Interface for exporting datasets of labeled video samples.

    See :ref:`this page <writing-a-custom-dataset-exporter>` for information
    about implementing/using dataset exporters.

    Args:
        export_dir (None): the directory to write the export. This may be
            optional for some exporters
    """

    @property
    def requires_video_metadata(self):
        """Whether this exporter requires
        :class:`fiftyone.core.metadata.VideoMetadata` instances for each sample
        being exported.
        """
        raise NotImplementedError(
            "subclass must implement requires_video_metadata"
        )

    @property
    def label_cls(self):
        """The :class:`fiftyone.core.labels.Label` class(es) that can be
        exported at the sample-level.

        This can be any of the following:

        -   a :class:`fiftyone.core.labels.Label` class. In this case, the
            exporter directly exports sample-level labels of this type
        -   a list or tuple of :class:`fiftyone.core.labels.Label` classes. In
            this case, the exporter can export a single sample-level label
            field of any of these types
        -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
            In this case, the exporter can export multiple label fields with
            value-types specified by this dictionary. Not all keys need be
            present in the exported sample-level labels
        -   ``None``. In this case, the exporter makes no guarantees about the
            sample-level labels that it can export
        """
        raise NotImplementedError("subclass must implement label_cls")

    @property
    def frame_labels_cls(self):
        """The :class:`fiftyone.core.labels.Label` class(es) that can be
        exported by this exporter at the frame-level.

        This can be any of the following:

        -   a :class:`fiftyone.core.labels.Label` class. In this case, the
            exporter directly exports frame labels of this type
        -   a list or tuple of :class:`fiftyone.core.labels.Label` classes. In
            this case, the exporter can export a single frame label field of
            any of these types
        -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
            In this case, the exporter can export multiple frame label fields
            with value-types specified by this dictionary. Not all keys need be
            present in the exported frame labels
        -   ``None``. In this case, the exporter makes no guarantees about the
            frame labels that it can export
        """
        raise NotImplementedError("subclass must implement frame_labels_cls")

    def export_sample(self, video_path, label, frames, metadata=None):
        """Exports the given sample to the dataset.

        Args:
            video_path: the path to a video on disk
            label: an instance of :meth:`label_cls`, or a dictionary mapping
                field names to :class:`fiftyone.core.labels.Label` instances,
                or ``None`` if the sample has no sample-level labels
            frames: a dictionary mapping frame numbers to dictionaries that map
                field names to :class:`fiftyone.core.labels.Label` instances,
                or ``None`` if the sample has no frame-level labels
            metadata (None): a :class:`fiftyone.core.metadata.VideoMetadata`
                instance for the sample. Only required when
                :meth:`requires_video_metadata` is ``True``
        """
        raise NotImplementedError("subclass must implement export_sample()")


class LegacyFiftyOneDatasetExporter(GenericSampleDatasetExporter):
    """Legacy exporter that writes an entire FiftyOne dataset to disk in a
    serialized JSON format along with its source media.

    .. warning::

        The :class:`fiftyone.types.dataset_types.FiftyOneDataset` format was
        upgraded in ``fiftyone==0.8`` and this exporter is now deprecated.
        The new exporter is :class:`FiftyOneDatasetExporter`.

    Args:
        export_dir: the directory to write the export
        export_media (None): defines how to export the raw media contained
            in the dataset. The supported values are:

            -   ``True`` (default): copy all media files into the export
                directory
            -   ``False``: don't export media
            -   ``"move"``: move media files into the export directory
            -   ``"symlink"``: create symlinks to each media file in the export
                directory
        relative_filepaths (True): whether to store relative (True) or absolute
            (False) filepaths to media files on disk in the output dataset
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(
        self,
        export_dir,
        export_media=None,
        relative_filepaths=True,
        pretty_print=False,
    ):
        if export_media is None:
            export_media = True

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.relative_filepaths = relative_filepaths
        self.pretty_print = pretty_print

        self._data_dir = None
        self._anno_dir = None
        self._brain_dir = None
        self._eval_dir = None
        self._frame_labels_dir = None
        self._metadata_path = None
        self._samples_path = None
        self._metadata = None
        self._samples = None
        self._media_exporter = None
        self._is_video_dataset = False

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._anno_dir = os.path.join(self.export_dir, "annotations")
        self._brain_dir = os.path.join(self.export_dir, "brain")
        self._eval_dir = os.path.join(self.export_dir, "evaluations")
        self._frame_labels_dir = os.path.join(self.export_dir, "frames")
        self._metadata_path = os.path.join(self.export_dir, "metadata.json")
        self._samples_path = os.path.join(self.export_dir, "samples.json")
        self._metadata = {}
        self._samples = []

        self._media_exporter = MediaExporter(
            self.export_media,
            supported_modes=(True, False, "move", "symlink"),
            export_path=self._data_dir,
        )
        self._media_exporter.setup()

    def log_collection(self, sample_collection):
        self._is_video_dataset = sample_collection.media_type == fomm.VIDEO

        self._metadata["name"] = sample_collection.name
        self._metadata["media_type"] = sample_collection.media_type

        schema = sample_collection._serialize_field_schema()
        self._metadata["sample_fields"] = schema

        if self._is_video_dataset:
            schema = sample_collection._serialize_frame_field_schema()
            self._metadata["frame_fields"] = schema

        info = dict(sample_collection.info)

        # Package classes and mask targets into `info`, since the import API
        # only supports checking for `info`

        if sample_collection.classes:
            info["classes"] = sample_collection.classes

        if sample_collection.default_classes:
            info["default_classes"] = sample_collection.default_classes

        if sample_collection.mask_targets:
            info["mask_targets"] = sample_collection._serialize_mask_targets()

        if sample_collection.default_mask_targets:
            info[
                "default_mask_targets"
            ] = sample_collection._serialize_default_mask_targets()

        if sample_collection.skeletons:
            info["skeletons"] = sample_collection._serialize_skeletons()

        if sample_collection.default_skeleton:
            info[
                "default_skeleton"
            ] = sample_collection._serialize_default_skeleton()

        self._metadata["info"] = info

        # Exporting runs only makes sense if the entire dataset is being
        # exported, otherwise the view for the run cannot be reconstructed
        # based on the information encoded in the run's document

        dataset = sample_collection._root_dataset
        if sample_collection != dataset:
            return

        if dataset.has_annotation_runs:
            d = dataset._doc.field_to_mongo("annotation_runs")
            d = {k: json_util.dumps(v) for k, v in d.items()}
            self._metadata["annotation_runs"] = d
            _export_annotation_results(dataset, self._anno_dir)

        if dataset.has_brain_runs:
            d = dataset._doc.field_to_mongo("brain_methods")
            d = {k: json_util.dumps(v) for k, v in d.items()}
            self._metadata["brain_methods"] = d
            _export_brain_results(dataset, self._brain_dir)

        if dataset.has_evaluations:
            d = dataset._doc.field_to_mongo("evaluations")
            d = {k: json_util.dumps(v) for k, v in d.items()}
            self._metadata["evaluations"] = d
            _export_evaluation_results(dataset, self._eval_dir)

    def export_sample(self, sample):
        out_filepath, _ = self._media_exporter.export(sample.filepath)
        if out_filepath is None:
            out_filepath = sample.filepath

        sd = sample.to_dict()
        sd["filepath"] = out_filepath

        if self.relative_filepaths:
            sd["filepath"] = os.path.relpath(out_filepath, self.export_dir)

        if self._is_video_dataset:
            # Serialize frame labels separately
            uuid = os.path.splitext(os.path.basename(out_filepath))[0]
            outpath = self._export_frame_labels(sample, uuid)
            sd["frames"] = os.path.relpath(outpath, self.export_dir)

        self._samples.append(sd)

    def close(self, *args):
        samples = {"samples": self._samples}
        etas.write_json(
            self._metadata, self._metadata_path, pretty_print=self.pretty_print
        )
        etas.write_json(
            samples, self._samples_path, pretty_print=self.pretty_print
        )
        self._media_exporter.close()

    def _export_frame_labels(self, sample, uuid):
        frames_dict = {"frames": sample.frames._to_frames_dict()}
        outpath = os.path.join(self._frame_labels_dir, uuid + ".json")
        etas.write_json(frames_dict, outpath, pretty_print=self.pretty_print)

        return outpath


class FiftyOneDatasetExporter(BatchDatasetExporter):
    """Exporter that writes an entire FiftyOne dataset to disk in a serialized
    JSON format along with its source media.

    See :ref:`this page <FiftyOneDataset-export>` for format details.

    Args:
        export_dir: the directory to write the export
        export_media (None): defines how to export the raw media contained
            in the dataset. The supported values are:

            -   ``True`` (default): copy all media files into the export
                directory
            -   ``False``: don't export media
            -   ``"move"``: move media files into the export directory
            -   ``"symlink"``: create symlinks to each media file in the export
                directory
        rel_dir (None): a relative directory to remove from the ``filepath`` of
            each sample, if possible. The path is converted to an absolute path
            (if necessary) via :func:`fiftyone.core.utils.normalize_path`.
            The typical use case for this argument is that your source data
            lives in a single directory and you wish to serialize relative,
            rather than absolute, paths to the data within that directory.
            Only applicable when ``export_media`` is False
    """

    def __init__(self, export_dir, export_media=None, rel_dir=None):
        if export_media is None:
            export_media = True

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.rel_dir = rel_dir

        self._data_dir = None
        self._anno_dir = None
        self._brain_dir = None
        self._eval_dir = None
        self._metadata_path = None
        self._samples_path = None
        self._frames_path = None
        self._media_exporter = None

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._anno_dir = os.path.join(self.export_dir, "annotations")
        self._brain_dir = os.path.join(self.export_dir, "brain")
        self._eval_dir = os.path.join(self.export_dir, "evaluations")
        self._metadata_path = os.path.join(self.export_dir, "metadata.json")
        self._samples_path = os.path.join(self.export_dir, "samples.json")
        self._frames_path = os.path.join(self.export_dir, "frames.json")

        self._media_exporter = MediaExporter(
            self.export_media,
            export_path=self._data_dir,
            supported_modes=(True, False, "move", "symlink"),
        )
        self._media_exporter.setup()

    def export_samples(self, sample_collection):
        etau.ensure_dir(self.export_dir)

        inpaths = sample_collection.values("filepath")

        if self.export_media != False:
            if self.rel_dir is not None:
                logger.warning(
                    "Ignoring `rel_dir` since `export_media` is True"
                )

            outpaths = [self._media_exporter.export(p)[0] for p in inpaths]

            # Replace filepath prefixes with `data/` for samples export
            _outpaths = ["data/" + os.path.basename(p) for p in outpaths]
        elif self.rel_dir is not None:
            # Remove `rel_dir` prefix from filepaths
            rel_dir = fou.normalize_path(self.rel_dir) + os.path.sep
            _outpaths = [
                p[len(rel_dir) :] if p.startswith(rel_dir) else p
                for p in inpaths
            ]
        else:
            # Export raw filepaths
            _outpaths = inpaths

        logger.info("Exporting samples...")

        coll, pipeline = fod._get_samples_pipeline(sample_collection)
        num_samples = foo.count_documents(coll, pipeline)
        _samples = foo.aggregate(coll, pipeline)

        def _prep_sample(sample, outpath):
            sample["filepath"] = outpath
            return sample

        samples = map(_prep_sample, _samples, _outpaths)
        foo.export_collection(
            samples, self._samples_path, key="samples", num_docs=num_samples
        )

        if sample_collection.media_type == fomm.VIDEO:
            logger.info("Exporting frames...")
            coll, pipeline = fod._get_frames_pipeline(sample_collection)
            num_frames = foo.count_documents(coll, pipeline)
            frames = foo.aggregate(coll, pipeline)
            foo.export_collection(
                frames, self._frames_path, key="frames", num_docs=num_frames
            )

        conn = foo.get_db_conn()
        dataset = sample_collection._dataset
        dataset_dict = conn.datasets.find_one({"name": dataset.name})

        # Exporting runs only makes sense if the entire dataset is being
        # exported, otherwise the view for the run cannot be reconstructed
        # based on the information encoded in the run's document

        export_runs = sample_collection == sample_collection._root_dataset

        if not export_runs:
            dataset_dict["annotation_runs"] = {}
            dataset_dict["brain_methods"] = {}
            dataset_dict["evaluations"] = {}

        foo.export_document(dataset_dict, self._metadata_path)

        if export_runs and sample_collection.has_annotation_runs:
            _export_annotation_results(sample_collection, self._anno_dir)

        if export_runs and sample_collection.has_brain_runs:
            _export_brain_results(sample_collection, self._brain_dir)

        if export_runs and sample_collection.has_evaluations:
            _export_evaluation_results(sample_collection, self._eval_dir)

        self._media_exporter.close()


def _export_annotation_results(sample_collection, anno_dir):
    for anno_key in sample_collection.list_annotation_runs():
        results_path = os.path.join(anno_dir, anno_key + ".json")
        results = sample_collection.load_annotation_results(anno_key)
        if results is not None:
            etas.write_json(results, results_path)


def _export_brain_results(sample_collection, brain_dir):
    for brain_key in sample_collection.list_brain_runs():
        results_path = os.path.join(brain_dir, brain_key + ".json")
        results = sample_collection.load_brain_results(brain_key)
        if results is not None:
            etas.write_json(results, results_path)


def _export_evaluation_results(sample_collection, eval_dir):
    for eval_key in sample_collection.list_evaluations():
        results_path = os.path.join(eval_dir, eval_key + ".json")
        results = sample_collection.load_evaluation_results(eval_key)
        if results is not None:
            etas.write_json(results, results_path)


class ImageDirectoryExporter(UnlabeledImageDatasetExporter):
    """Exporter that writes a directory of images to disk.

    See :ref:`this page <ImageDirectory-export>` for format details.

    The filenames of input image paths will be maintained in the export
    directory, unless a name conflict would occur, in which case an index of
    the form ``"-%d" % count`` is appended to the base filename.

    Args:
        export_dir: the directory to write the export
        export_media (None): defines how to export the raw media contained
            in the dataset. The supported values are:

            -   ``True`` (default): copy all media files into the export
                directory
            -   ``"move"``: move media files into the export directory
            -   ``"symlink"``: create symlinks to each media file in the export
                directory
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(self, export_dir, export_media=None, image_format=None):
        if export_media is None:
            export_media = True

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.image_format = image_format

        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return False

    def setup(self):
        self._media_exporter = ImageExporter(
            self.export_media,
            export_path=self.export_dir,
            supported_modes=(True, "move", "symlink"),
            default_ext=self.image_format,
        )
        self._media_exporter.setup()

    def export_sample(self, image_or_path, metadata=None):
        self._media_exporter.export(image_or_path)

    def close(self, *args):
        self._media_exporter.close()


class VideoDirectoryExporter(UnlabeledVideoDatasetExporter):
    """Exporter that writes a directory of videos to disk.

    See :ref:`this page <VideoDirectory-export>` for format details.

    The filenames of the input videos will be maintained in the export
    directory, unless a name conflict would occur, in which case an index of
    the form ``"-%d" % count`` is appended to the base filename.

    Args:
        export_dir: the directory to write the export
        export_media (None): defines how to export the raw media contained
            in the dataset. The supported values are:

            -   ``True`` (default): copy all media files into the export
                directory
            -   ``"move"``: move media files into the export directory
            -   ``"symlink"``: create symlinks to each media file in the export
                directory
    """

    def __init__(self, export_dir, export_media=None):
        if export_media is None:
            export_media = True

        super().__init__(export_dir=export_dir)

        self.export_media = export_media

        self._media_exporter = None

    @property
    def requires_video_metadata(self):
        return False

    def setup(self):
        self._media_exporter = VideoExporter(
            self.export_media,
            export_path=self.export_dir,
            supported_modes=(True, "move", "symlink"),
        )
        self._media_exporter.setup()

    def export_sample(self, video_path, metadata=None):
        self._media_exporter.export(video_path)

    def close(self, *args):
        self._media_exporter.close()


class FiftyOneImageClassificationDatasetExporter(
    LabeledImageDatasetExporter, ExportPathsMixin
):
    """Exporter that writes an image classification dataset to disk in a simple
    JSON format.

    See :ref:`this page <FiftyOneImageClassificationDataset-export>` for format
    details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path`` and ``labels_path`` are absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a JSON filename like ``"data.json"`` specifying the filename of
                the manifest file in ``export_dir`` generated when
                ``export_media`` is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, the default value of this parameter will be chosen based
            on the value of the ``export_media`` parameter
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Can be any of the
            following:

            -   a filename like ``"labels.json"`` specifying the location in
                ``export_dir`` in which to export the labels
            -   an absolute filepath to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of the
                labels

            If None, the labels will be exported into ``export_dir`` using the
            default filename
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
        include_confidence (False): whether to include classification
            confidences in the export. The supported values are:

            -   ``False`` (default): do not include confidences
            -   ``True``: always include confidences
            -   ``None``: include confidences only if they exist
        include_attributes (False): whether to include dynamic attributes of
            the classifications in the export. Supported values are:

            -   ``False`` (default): do not include attributes
            -   ``True``: always include a (possibly empty) attributes dict
            -   ``None``: include attributes only if they exist
            -   a name or iterable of names of specific attributes to include
        classes (None): the list of possible class labels. If not provided,
            this list will be extracted when :meth:`log_collection` is called,
            if possible
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        include_confidence=False,
        include_attributes=False,
        classes=None,
        image_format=None,
        pretty_print=False,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=labels_path,
            default="labels.json",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media
        self.include_confidence = include_confidence
        self.include_attributes = include_attributes
        self.classes = classes
        self.image_format = image_format
        self.pretty_print = pretty_print

        self._labels_dict = None
        self._labels_map_rev = None
        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return (fol.Classification, fol.Classifications)

    def setup(self):
        self._labels_dict = {}
        self._parse_classes()

        self._media_exporter = ImageExporter(
            self.export_media,
            export_path=self.data_path,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._media_exporter.setup()

    def log_collection(self, sample_collection):
        if self.classes is None:
            if sample_collection.default_classes:
                self.classes = sample_collection.default_classes
                self._parse_classes()
            elif sample_collection.classes:
                self.classes = next(iter(sample_collection.classes.values()))
                self._parse_classes()
            elif "classes" in sample_collection.info:
                self.classes = sample_collection.info["classes"]
                self._parse_classes()

    def export_sample(self, image_or_path, label, metadata=None):
        _, uuid = self._media_exporter.export(image_or_path)
        self._labels_dict[uuid] = _parse_classifications(
            label,
            labels_map_rev=self._labels_map_rev,
            include_confidence=self.include_confidence,
            include_attributes=self.include_attributes,
        )

    def close(self, *args):
        labels = {
            "classes": self.classes,
            "labels": self._labels_dict,
        }
        etas.write_json(
            labels, self.labels_path, pretty_print=self.pretty_print
        )
        self._media_exporter.close()

    def _parse_classes(self):
        if self.classes is not None:
            self._labels_map_rev = _to_labels_map_rev(self.classes)


class ImageClassificationDirectoryTreeExporter(LabeledImageDatasetExporter):
    """Exporter that writes an image classification directory tree to disk.

    See :ref:`this page <ImageClassificationDirectoryTree-export>` for format
    details.

    The filenames of the input images are maintained, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True`` (default): copy all media files into the output
                directory
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(self, export_dir, export_media=None, image_format=None):
        if export_media is None:
            export_media = True

        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.image_format = image_format

        self._class_counts = None
        self._filename_counts = None
        self._media_exporter = None
        self._default_filename_patt = (
            fo.config.default_sequence_idx + image_format
        )

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Classification

    def setup(self):
        self._class_counts = defaultdict(int)
        self._filename_counts = defaultdict(int)
        self._media_exporter = ImageExporter(
            self.export_media,
            supported_modes=(True, "move", "symlink"),
        )
        self._media_exporter.setup()

        etau.ensure_dir(self.export_dir)

    def export_sample(self, image_or_path, classification, metadata=None):
        _label = _parse_classifications(
            classification, include_confidence=False, include_attributes=False
        )

        if _label is None:
            _label = "_unlabeled"

        self._class_counts[_label] += 1

        if etau.is_str(image_or_path):
            image_path = image_or_path
        else:
            img = image_or_path
            image_path = self._default_filename_patt % (
                self._class_counts[_label]
            )

        filename = os.path.basename(image_path)
        name, ext = os.path.splitext(filename)

        key = (_label, filename)
        self._filename_counts[key] += 1
        count = self._filename_counts[key]
        if count > 1:
            filename = name + ("-%d" % count) + ext

        outpath = os.path.join(self.export_dir, _label, filename)

        self._media_exporter.export(image_or_path, outpath=outpath)

    def close(self, *args):
        self._media_exporter.close()


class VideoClassificationDirectoryTreeExporter(LabeledVideoDatasetExporter):
    """Exporter that writes a video classification directory tree to disk.

    See :ref:`this page <VideoClassificationDirectoryTree-export>` for format
    details.

    The filenames of the input images are maintained, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True`` (default): copy all media files into the output
                directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
    """

    def __init__(self, export_dir, export_media=None):
        if export_media is None:
            export_media = True

        super().__init__(export_dir=export_dir)

        self.export_media = export_media

        self._class_counts = None
        self._filename_counts = None
        self._media_exporter = None

    @property
    def requires_video_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Classification

    @property
    def frame_labels_cls(self):
        return None

    def setup(self):
        self._class_counts = defaultdict(int)
        self._filename_counts = defaultdict(int)
        self._media_exporter = VideoExporter(
            self.export_media,
            supported_modes=(True, "move", "symlink"),
        )
        self._media_exporter.setup()

        etau.ensure_dir(self.export_dir)

    def export_sample(self, video_path, classification, _, metadata=None):
        _label = _parse_classifications(
            classification, include_confidence=False, include_attributes=False
        )

        if _label is None:
            _label = "_unlabeled"

        self._class_counts[_label] += 1

        filename = os.path.basename(video_path)
        name, ext = os.path.splitext(filename)

        key = (_label, filename)
        self._filename_counts[key] += 1
        count = self._filename_counts[key]
        if count > 1:
            filename = name + ("-%d" % count) + ext

        outpath = os.path.join(self.export_dir, _label, filename)

        self._media_exporter.export(video_path, outpath=outpath)

    def close(self, *args):
        self._media_exporter.close()


class FiftyOneImageDetectionDatasetExporter(
    LabeledImageDatasetExporter, ExportPathsMixin
):
    """Exporter that writes an image detection dataset to disk in a simple JSON
    format.

    See :ref:`this page <FiftyOneImageDetectionDataset-export>` for format
    details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path`` and ``labels_path`` are absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a JSON filename like ``"data.json"`` specifying the filename of
                the manifest file in ``export_dir`` generated when
                ``export_media`` is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, the default value of this parameter will be chosen based
            on the value of the ``export_media`` parameter
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Can be any of the
            following:

            -   a filename like ``"labels.json"`` specifying the location in
                ``export_dir`` in which to export the labels
            -   an absolute filepath to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of the
                labels

            If None, the labels will be exported into ``export_dir`` using the
            default filename
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
        classes (None): the list of possible class labels. If not provided,
            this list will be extracted when :meth:`log_collection` is called,
            if possible
        include_confidence (None): whether to include detection confidences in
            the export. The supported values are:

            -   ``None`` (default): include confidences only if they exist
            -   ``True``: always include confidences
            -   ``False``: do not include confidences
        include_attributes (None): whether to include dynamic attributes of the
            detections in the export. Supported values are:

            -   ``None`` (default): include attributes only if they exist
            -   ``True``: always include a (possibly empty) attributes dict
            -   ``False``: do not include attributes
            -   a name or iterable of names of specific attributes to include
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        classes=None,
        include_confidence=None,
        include_attributes=None,
        image_format=None,
        pretty_print=False,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=labels_path,
            default="labels.json",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media
        self.classes = classes
        self.include_confidence = include_confidence
        self.include_attributes = include_attributes
        self.image_format = image_format
        self.pretty_print = pretty_print

        self._labels_dict = None
        self._labels_map_rev = None
        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._labels_dict = {}
        self._parse_classes()

        self._media_exporter = ImageExporter(
            self.export_media,
            export_path=self.data_path,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._media_exporter.setup()

    def log_collection(self, sample_collection):
        if self.classes is None:
            if sample_collection.default_classes:
                self.classes = sample_collection.default_classes
                self._parse_classes()
            elif sample_collection.classes:
                self.classes = next(iter(sample_collection.classes.values()))
                self._parse_classes()
            elif "classes" in sample_collection.info:
                self.classes = sample_collection.info["classes"]
                self._parse_classes()

    def export_sample(self, image_or_path, detections, metadata=None):
        _, uuid = self._media_exporter.export(image_or_path)
        self._labels_dict[uuid] = _parse_detections(
            detections,
            labels_map_rev=self._labels_map_rev,
            include_confidence=self.include_confidence,
            include_attributes=self.include_attributes,
        )

    def close(self, *args):
        labels = {
            "classes": self.classes,
            "labels": self._labels_dict,
        }
        etas.write_json(
            labels, self.labels_path, pretty_print=self.pretty_print
        )
        self._media_exporter.close()

    def _parse_classes(self):
        if self.classes is not None:
            self._labels_map_rev = _to_labels_map_rev(self.classes)


class FiftyOneTemporalDetectionDatasetExporter(
    LabeledVideoDatasetExporter, ExportPathsMixin
):
    """Exporter that writes a temporal video detection dataset to disk in a
    simple JSON format.

    See :ref:`this page <FiftyOneTemporalDetectionDataset-export>` for format
    details.

    Each input video is directly copied to its destination, maintaining the
    original filename, unless a name conflict would occur, in which case an
    index of the form ``"-%d" % count`` is appended to the base filename.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path`` and ``labels_path`` are absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a JSON filename like ``"data.json"`` specifying the filename of
                the manifest file in ``export_dir`` generated when
                ``export_media`` is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, the default value of this parameter will be chosen based
            on the value of the ``export_media`` parameter
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Can be any of the
            following:

            -   a filename like ``"labels.json"`` specifying the location in
                ``export_dir`` in which to export the labels
            -   an absolute filepath to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of the
                labels

            If None, the labels will be exported into ``export_dir`` using the
            default filename
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
        use_timestamps (False): whether to export the support of each temporal
            detection in seconds rather than frame numbers
        classes (None): the list of possible class labels. If not provided,
            this list will be extracted when :meth:`log_collection` is called,
            if possible
        include_confidence (None): whether to include detection confidences in
            the export. The supported values are:

            -   ``None`` (default): include confidences only if they exist
            -   ``True``: always include confidences
            -   ``False``: do not include confidences
        include_attributes (None): whether to include dynamic attributes of the
            detections in the export. Supported values are:

            -   ``None`` (default): include attributes only if they exist
            -   ``True``: always include a (possibly empty) attributes dict
            -   ``False``: do not include attributes
            -   a name or iterable of names of specific attributes to include
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        use_timestamps=False,
        classes=None,
        include_confidence=None,
        include_attributes=None,
        pretty_print=False,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=labels_path,
            default="labels.json",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media
        self.use_timestamps = use_timestamps
        self.classes = classes
        self.include_confidence = include_confidence
        self.include_attributes = include_attributes
        self.pretty_print = pretty_print

        self._labels_dict = None
        self._labels_map_rev = None
        self._media_exporter = None

    @property
    def requires_video_metadata(self):
        return self.use_timestamps

    @property
    def label_cls(self):
        return fol.TemporalDetections

    @property
    def frame_labels_cls(self):
        return None

    def setup(self):
        self._labels_dict = {}
        self._parse_classes()

        self._media_exporter = VideoExporter(
            self.export_media,
            export_path=self.data_path,
            ignore_exts=True,
        )
        self._media_exporter.setup()

    def log_collection(self, sample_collection):
        if self.classes is None:
            if sample_collection.default_classes:
                self.classes = sample_collection.default_classes
                self._parse_classes()
            elif sample_collection.classes:
                self.classes = next(iter(sample_collection.classes.values()))
                self._parse_classes()
            elif "classes" in sample_collection.info:
                self.classes = sample_collection.info["classes"]
                self._parse_classes()

    def export_sample(self, video_path, temporal_detections, _, metadata=None):
        _, uuid = self._media_exporter.export(video_path)
        self._labels_dict[uuid] = _parse_temporal_detections(
            temporal_detections,
            labels_map_rev=self._labels_map_rev,
            metadata=metadata,
            use_timestamps=self.use_timestamps,
            include_confidence=self.include_confidence,
            include_attributes=self.include_attributes,
        )

    def close(self, *args):
        labels = {
            "classes": self.classes,
            "labels": self._labels_dict,
        }
        etas.write_json(
            labels, self.labels_path, pretty_print=self.pretty_print
        )
        self._media_exporter.close()

    def _parse_classes(self):
        if self.classes is not None:
            self._labels_map_rev = _to_labels_map_rev(self.classes)


class ImageSegmentationDirectoryExporter(
    LabeledImageDatasetExporter, ExportPathsMixin
):
    """Exporter that writes an image segmentation dataset to disk.

    See :ref:`this page <ImageSegmentationDirectory-export>` for format
    details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path`` and ``labels_path`` are absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a JSON filename like ``"data.json"`` specifying the filename of
                the manifest file in ``export_dir`` generated when
                ``export_media`` is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, the default value of this parameter will be chosen based
            on the value of the ``export_media`` parameter
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Can be any of the
            following:

            -   a folder name like ``"labels"`` or ``"labels/"`` specifying the
                location in ``export_dir`` in which to export the masks
            -   an absolute directory in which to export the masks. In this
                case, the ``export_dir`` has no effect on the location of the
                masks

            If None, the masks will be exported into ``export_dir`` using the
            default folder name
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
        mask_format (".png"): the image format to use when writing masks to
            disk
        mask_size (None): the ``(width, height)`` at which to render
            segmentation masks when exporting instances or polylines. If not
            provided, masks will be rendered to match the resolution of each
            input image
        mask_targets (None): a dict mapping integer pixel values in
            ``[0, 255]`` to label strings defining which object classes to
            render and which pixel values to use for each class. If omitted,
            all objects are rendered with pixel value 255
        thickness (1): the thickness, in pixels, at which to render
            (non-filled) polylines
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        image_format=None,
        mask_format=".png",
        mask_size=None,
        mask_targets=None,
        thickness=1,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=labels_path,
            default="labels/",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media
        self.image_format = image_format
        self.mask_format = mask_format
        self.mask_size = mask_size
        self.mask_targets = mask_targets
        self.thickness = thickness

        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return (fol.Segmentation, fol.Detections, fol.Polylines)

    def setup(self):
        self._media_exporter = ImageExporter(
            self.export_media,
            export_path=self.data_path,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._media_exporter.setup()

    def export_sample(self, image_or_path, label, metadata=None):
        _, uuid = self._media_exporter.export(image_or_path)

        if label is None:
            return  # unlabeled

        if isinstance(label, fol.Segmentation):
            mask = label.mask
        elif isinstance(label, (fol.Detections, fol.Polylines)):
            if self.mask_size is not None:
                frame_size = self.mask_size
            else:
                if metadata is None:
                    metadata = fom.ImageMetadata.build_for(image_or_path)

                frame_size = (metadata.width, metadata.height)

            if isinstance(label, fol.Detections):
                segmentation = label.to_segmentation(
                    frame_size=frame_size, mask_targets=self.mask_targets
                )
            else:
                segmentation = label.to_segmentation(
                    frame_size=frame_size,
                    mask_targets=self.mask_targets,
                    thickness=self.thickness,
                )

            mask = segmentation.mask
        else:
            raise ValueError("Unsupported label type '%s'" % type(label))

        out_mask_path = os.path.join(self.labels_path, uuid + self.mask_format)
        _write_mask(mask, out_mask_path)

    def close(self, *args):
        self._media_exporter.close()


def _write_mask(mask, mask_path):
    if mask.dtype not in (np.uint8, np.uint16):
        if mask.max() <= 255:
            mask = mask.astype(np.uint8)
        else:
            mask = mask.astype(np.uint16)

    etai.write(mask, mask_path)


class FiftyOneImageLabelsDatasetExporter(LabeledImageDatasetExporter):
    """Exporter that writes a labeled image dataset to disk with labels stored
    in `ETA ImageLabels format <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.

    See :ref:`this page <FiftyOneImageLabelsDataset-export>` for format
    details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True`` (default): copy all media files into the output
                directory
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(
        self,
        export_dir,
        export_media=None,
        image_format=None,
        pretty_print=False,
    ):
        if export_media is None:
            export_media = True

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.image_format = image_format
        self.pretty_print = pretty_print

        self._dataset_index = None
        self._manifest_path = None
        self._data_dir = None
        self._labels_dir = None
        self._description = None
        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return {
            "attributes": fol.Classifications,
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        self._dataset_index = etad.LabeledDatasetIndex(
            etau.get_class_name(etad.LabeledImageDataset)
        )
        self._manifest_path = os.path.join(self.export_dir, "manifest.json")
        self._data_dir = os.path.join(self.export_dir, "data")
        self._labels_dir = os.path.join(self.export_dir, "labels")

        self._media_exporter = ImageExporter(
            self.export_media,
            export_path=self._data_dir,
            supported_modes=(True, "move", "symlink"),
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._media_exporter.setup()

    def log_collection(self, sample_collection):
        self._description = sample_collection.info.get("description", None)

    def export_sample(self, image_or_path, labels, metadata=None):
        out_image_path, uuid = self._media_exporter.export(image_or_path)

        out_labels_path = os.path.join(self._labels_dir, uuid + ".json")

        il = foue.to_image_labels(labels)
        etas.write_json(il, out_labels_path, pretty_print=self.pretty_print)

        self._dataset_index.append(
            etad.LabeledDataRecord(
                "data/" + os.path.basename(out_image_path),
                "labels/" + os.path.basename(out_labels_path),
            )
        )

    def close(self, *args):
        self._dataset_index.description = self._description or ""
        etas.write_json(
            self._dataset_index, self._manifest_path, pretty_print=True
        )

        self._media_exporter.close()


class FiftyOneVideoLabelsDatasetExporter(LabeledVideoDatasetExporter):
    """Exporter that writes a labeled video dataset with labels stored in
    `ETA VideoLabels format <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_.

    See :ref:`this page <FiftyOneVideoLabelsDataset-export>` for format
    details.

    If the path to a video is provided, the video is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True`` (default): copy all media files into the output
                directory
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(self, export_dir, export_media=None, pretty_print=False):
        if export_media is None:
            export_media = True

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.pretty_print = pretty_print

        self._dataset_index = None
        self._manifest_path = None
        self._data_dir = None
        self._labels_dir = None
        self._description = None
        self._media_exporter = None

    @property
    def requires_video_metadata(self):
        return False

    @property
    def label_cls(self):
        return (fol.Classifications, fol.TemporalDetections)

    @property
    def frame_labels_cls(self):
        return {
            "attributes": fol.Classifications,
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        self._dataset_index = etad.LabeledDatasetIndex(
            etau.get_class_name(etad.LabeledVideoDataset)
        )
        self._manifest_path = os.path.join(self.export_dir, "manifest.json")
        self._data_dir = os.path.join(self.export_dir, "data")
        self._labels_dir = os.path.join(self.export_dir, "labels")

        self._media_exporter = VideoExporter(
            self.export_media,
            export_path=self._data_dir,
            supported_modes=(True, "move", "symlink"),
            ignore_exts=True,
        )
        self._media_exporter.setup()

    def log_collection(self, sample_collection):
        self._description = sample_collection.info.get("description", None)

    def export_sample(self, video_path, label, frames, metadata=None):
        out_video_path, uuid = self._media_exporter.export(video_path)

        out_labels_path = os.path.join(self._labels_dir, uuid + ".json")

        vl = foue.to_video_labels(label=label, frames=frames)
        etas.write_json(vl, out_labels_path, pretty_print=self.pretty_print)

        self._dataset_index.append(
            etad.LabeledDataRecord(
                "data/" + os.path.basename(out_video_path),
                "labels/" + os.path.basename(out_labels_path),
            )
        )

    def close(self, *args):
        self._dataset_index.description = self._description or ""
        etas.write_json(
            self._dataset_index, self._manifest_path, pretty_print=True
        )

        self._media_exporter.close()


def _parse_classifications(
    label,
    labels_map_rev=None,
    include_confidence=False,
    include_attributes=None,
):
    if label is None:
        return None

    is_list = isinstance(label, fol.Classifications)

    if is_list:
        classifications = label.classifications
    else:
        classifications = [label]

    labels = []
    for classification in classifications:
        _label = classification.label

        if labels_map_rev is not None:
            if _label not in labels_map_rev:
                msg = (
                    "Ignoring classification with label '%s' not in provided "
                    "classes" % _label
                )
                warnings.warn(msg)
                continue

            _label = labels_map_rev[_label]

        if include_confidence != False or include_attributes != False:
            _label = {"label": _label}

            _parse_attributes(
                _label,
                classification,
                include_confidence=include_confidence,
                include_attributes=include_attributes,
            )

        labels.append(_label)

    if not labels:
        return None

    if is_list:
        return labels

    return labels[0]


def _parse_temporal_detections(
    temporal_detections,
    labels_map_rev=None,
    metadata=None,
    use_timestamps=False,
    include_confidence=None,
    include_attributes=None,
):
    if temporal_detections is None:
        return None

    if use_timestamps and metadata is None:
        raise ValueError(
            "Video metadata must be provided in order to export temporal "
            "detections as timestamps"
        )

    labels = []

    for detection in temporal_detections.detections:
        label = detection.label
        if labels_map_rev is not None:
            if label not in labels_map_rev:
                msg = (
                    "Ignoring temporal detection with label '%s' not in "
                    "provided classes" % label
                )
                warnings.warn(msg)
                continue

            label = labels_map_rev[label]

        label_dict = {"label": label}

        if use_timestamps:
            total_frame_count = metadata.total_frame_count
            duration = metadata.duration
            first, last = detection.support
            label_dict["timestamps"] = [
                etaf.frame_number_to_timestamp(
                    first, total_frame_count, duration
                ),
                etaf.frame_number_to_timestamp(
                    last, total_frame_count, duration
                ),
            ]
        else:
            label_dict["support"] = detection.support

        _parse_attributes(
            label_dict,
            detection,
            include_confidence=include_confidence,
            include_attributes=include_attributes,
        )

        labels.append(label_dict)

    return labels


def _parse_detections(
    detections,
    labels_map_rev=None,
    include_confidence=None,
    include_attributes=None,
):
    if detections is None:
        return None

    labels = []
    for detection in detections.detections:
        label = detection.label

        if labels_map_rev is not None:
            if label not in labels_map_rev:
                msg = (
                    "Ignoring detection with label '%s' not in provided "
                    "classes" % label
                )
                warnings.warn(msg)
                continue

            label = labels_map_rev[label]

        label_dict = {
            "label": label,
            "bounding_box": detection.bounding_box,
        }

        _parse_attributes(
            label_dict,
            detection,
            include_confidence=include_confidence,
            include_attributes=include_attributes,
        )

        labels.append(label_dict)

    return labels


def _parse_attributes(
    label_dict, label, include_confidence=None, include_attributes=None
):
    if include_confidence == True:
        label_dict["confidence"] = label.confidence
    elif include_confidence is None and label.confidence is not None:
        label_dict["confidence"] = label.confidence

    if include_attributes == True:
        label_dict["attributes"] = dict(label.iter_attributes())
    elif include_attributes is None:
        attributes = dict(label.iter_attributes())
        if attributes:
            label_dict["attributes"] = attributes
    elif isinstance(include_attributes, str):
        name = include_attributes
        label_dict["attributes"] = {
            name: label.get_attribute_value(name, None)
        }
    elif etau.is_container(include_attributes):
        label_dict["attributes"] = {
            name: label.get_attribute_value(name, None)
            for name in include_attributes
        }


def _to_labels_map_rev(classes):
    return {c: i for i, c in enumerate(classes)}
