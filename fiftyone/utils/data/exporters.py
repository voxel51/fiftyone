"""
Dataset exporters.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import inspect
import logging
import os
import warnings
from collections import defaultdict

from bson import json_util
import pydash

import eta.core.datasets as etad
import eta.core.frameutils as etaf
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.collections as foc
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fomm
import fiftyone.core.metadata as fom
import fiftyone.core.odm as foo
import fiftyone.core.storage as fos
import fiftyone.core.threed as fo3d
import fiftyone.core.utils as fou
import fiftyone.utils.eta as foue
import fiftyone.utils.image as foui
import fiftyone.utils.patches as foup

from .parsers import (
    FiftyOneLabeledImageSampleParser,
    FiftyOneLabeledVideoSampleParser,
    FiftyOneUnlabeledImageSampleParser,
    FiftyOneUnlabeledMediaSampleParser,
    FiftyOneUnlabeledVideoSampleParser,
    ImageClassificationSampleParser,
    ImageSampleParser,
)

logger = logging.getLogger(__name__)


def export_samples(
    samples,
    export_dir=None,
    dataset_type=None,
    data_path=None,
    labels_path=None,
    export_media=None,
    rel_dir=None,
    dataset_exporter=None,
    label_field=None,
    frame_labels_field=None,
    progress=None,
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
        dataset_type (None): the :class:`fiftyone.types.Dataset` type to write
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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each media. When
            exporting media, this identifier is joined with ``data_path`` to
            generate an output path for each exported media. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
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
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
        num_samples (None): the number of samples in ``samples``. If omitted,
            this is computed (if possible) via ``len(samples)`` if needed for
            progress tracking
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
            rel_dir=rel_dir,
            **kwargs,
        )
    else:
        kwargs.update(
            dict(
                export_dir=export_dir,
                data_path=data_path,
                labels_path=labels_path,
                export_media=export_media,
                rel_dir=rel_dir,
            )
        )

        for key, value in kwargs.items():
            if value is not None:
                logger.warning("Ignoring unsupported parameter '%s'", key)

    sample_collection = samples

    if isinstance(
        dataset_exporter,
        (
            BatchDatasetExporter,
            GenericSampleDatasetExporter,
            GroupDatasetExporter,
        ),
    ):
        sample_parser = None
    elif isinstance(dataset_exporter, UnlabeledImageDatasetExporter):
        if found_patches:
            # Export unlabeled image patches
            samples = foup.ImagePatchesExtractor(
                samples,
                patches_field=label_field,
                include_labels=False,
                **patches_kwargs,
            )
            sample_parser = ImageSampleParser()
            num_samples = samples
        else:
            sample_parser = FiftyOneUnlabeledImageSampleParser(
                compute_metadata=True
            )

    elif isinstance(dataset_exporter, UnlabeledVideoDatasetExporter):
        if found_clips and not samples._is_clips:
            # Export unlabeled video clips
            samples = samples.to_clips(label_field)
            num_samples = samples

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
        if _export_media and samples._is_clips:
            dataset_exporter.export_media = "move"

        sample_parser = FiftyOneUnlabeledVideoSampleParser(
            compute_metadata=True,
            write_clips=_export_media,
            **clips_kwargs,
        )

    elif isinstance(dataset_exporter, UnlabeledMediaDatasetExporter):
        sample_parser = FiftyOneUnlabeledMediaSampleParser(
            compute_metadata=True
        )

    elif isinstance(dataset_exporter, LabeledImageDatasetExporter):
        if found_patches:
            # Export labeled image patches
            samples = foup.ImagePatchesExtractor(
                samples,
                patches_field=label_field,
                include_labels=True,
                **patches_kwargs,
            )
            sample_parser = ImageClassificationSampleParser()
            num_samples = samples
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
        if found_clips and not samples._is_clips:
            # Export labeled video clips
            samples = samples.to_clips(label_field)
            num_samples = samples

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
        if _export_media and samples._is_clips:
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
            write_clips=_export_media,
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
        sample_collection=sample_collection,
        progress=progress,
        num_samples=num_samples,
    )


def write_dataset(
    samples,
    sample_parser,
    dataset_exporter,
    sample_collection=None,
    progress=None,
    num_samples=None,
):
    """Writes the samples to disk as a dataset in the specified format.

    Args:
        samples: an iterable of samples that can be parsed by ``sample_parser``
        sample_parser: a :class:`fiftyone.utils.data.parsers.SampleParser` to
            use to parse the samples
        dataset_exporter: a :class:`DatasetExporter` to use to write the
            dataset
        sample_collection (None): the
            :class:`fiftyone.core.collections.SampleCollection` from which
            ``samples`` were extracted. If ``samples`` is itself a
            :class:`fiftyone.core.collections.SampleCollection`, this parameter
            defaults to ``samples``. This parameter is optional and is only
            passed to :meth:`DatasetExporter.log_collection`
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
        num_samples (None): the number of samples in ``samples``. If omitted,
            this is computed (if possible) via ``len(samples)`` if needed for
            progress tracking
    """
    if num_samples is None:
        num_samples = samples

    if sample_collection is None and isinstance(samples, foc.SampleCollection):
        sample_collection = samples

    if isinstance(dataset_exporter, BatchDatasetExporter):
        _write_batch_dataset(dataset_exporter, samples, progress=progress)
    elif isinstance(dataset_exporter, GenericSampleDatasetExporter):
        _write_generic_sample_dataset(
            dataset_exporter,
            samples,
            sample_collection=sample_collection,
            progress=progress,
            num_samples=num_samples,
        )
    elif isinstance(dataset_exporter, GroupDatasetExporter):
        _write_group_dataset(
            dataset_exporter,
            samples,
            sample_collection=sample_collection,
            progress=progress,
            num_samples=num_samples,
        )
    elif isinstance(
        dataset_exporter,
        (UnlabeledImageDatasetExporter, LabeledImageDatasetExporter),
    ):
        _write_image_dataset(
            dataset_exporter,
            samples,
            sample_parser,
            sample_collection=sample_collection,
            progress=progress,
            num_samples=num_samples,
        )
    elif isinstance(
        dataset_exporter,
        (UnlabeledVideoDatasetExporter, LabeledVideoDatasetExporter),
    ):
        _write_video_dataset(
            dataset_exporter,
            samples,
            sample_parser,
            sample_collection=sample_collection,
            progress=progress,
            num_samples=num_samples,
        )
    elif isinstance(dataset_exporter, UnlabeledMediaDatasetExporter):
        _write_unlabeled_dataset(
            dataset_exporter,
            samples,
            sample_parser,
            sample_collection=sample_collection,
            progress=progress,
            num_samples=num_samples,
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
        dataset_type: the :class:`fiftyone.types.Dataset` type
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

    if etau.is_str(dataset_type):
        dataset_type = etau.get_class(dataset_type)

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

    found_patches = False
    patches_kwargs = {}

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
        elif samples._is_patches:
            found_patches = True
            logger.info(
                "Detected an unlabeled image exporter and a patches view. "
                "Exporting image patches...",
            )
    elif isinstance(dataset_exporter, LabeledImageDatasetExporter):
        label_cls = dataset_exporter.label_cls

        if isinstance(label_cls, dict):
            export_types = list(label_cls.values())
        elif isinstance(label_cls, (list, tuple)):
            export_types = list(label_cls)
        elif label_cls is not None:
            export_types = [label_cls]
        else:
            export_types = None

        try:
            label_type = samples._get_label_field_type(label_field)
        except:
            label_type = None

        if (
            label_type is not None
            and export_types is not None
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
        elif samples._is_clips:
            found_clips = True
            logger.info(
                "Detected an unlabeled video exporter and a clips view. "
                "Exporting video clips...",
            )

        if found_clips:
            clips_kwargs, kwargs = fou.extract_kwargs_for_class(
                FiftyOneUnlabeledVideoSampleParser, kwargs
            )
    elif isinstance(dataset_exporter, LabeledVideoDatasetExporter):
        label_cls = dataset_exporter.label_cls

        if isinstance(label_cls, dict):
            export_types = list(label_cls.values())
        elif isinstance(label_cls, (list, tuple)):
            export_types = list(label_cls)
        elif label_cls is not None:
            export_types = [label_cls]
        else:
            export_types = None

        try:
            label_type = samples._get_label_field_type(label_field)
        except:
            label_type = None

        if (
            label_type is not None
            and export_types is not None
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
        elif samples._is_clips:
            found_clips = True

        if found_clips:
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

        if frames:
            field_path = sample_collection._FRAMES_PREFIX + label_field
        else:
            field_path = label_field

        field = sample_collection.get_field(field_path)

        if field is None:
            continue

        if isinstance(field, fof.EmbeddedDocumentField):
            label_type = field.document_type
        else:
            label_type = type(field)

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
                **dict(label.iter_attributes()),
            )
        ]
    )


def _write_batch_dataset(dataset_exporter, samples, progress=None):
    if not isinstance(samples, foc.SampleCollection):
        raise ValueError(
            "%s can only export %s instances"
            % (type(dataset_exporter), foc.SampleCollection)
        )

    with dataset_exporter:
        dataset_exporter.export_samples(samples, progress=progress)


def _write_generic_sample_dataset(
    dataset_exporter,
    samples,
    sample_collection=None,
    progress=None,
    num_samples=None,
):
    with fou.ProgressBar(total=num_samples, progress=progress) as pb:
        with dataset_exporter:
            if sample_collection is not None:
                dataset_exporter.log_collection(sample_collection)

            if (
                isinstance(samples, foc.SampleCollection)
                and samples.media_type == fomm.GROUP
            ):
                samples = samples.select_group_slices(_allow_mixed=True)

            for sample in pb(samples):
                dataset_exporter.export_sample(sample)


def _write_group_dataset(
    dataset_exporter,
    samples,
    sample_collection=None,
    progress=None,
    num_samples=None,
):
    if not isinstance(samples, foc.SampleCollection):
        raise ValueError(
            "%s can only export grouped collections; found %s"
            % (type(dataset_exporter), type(samples))
        )

    if samples.media_type != fomm.GROUP:
        raise ValueError(
            "%s can only export grouped collections; found media type '%s'"
            % (type(dataset_exporter), samples.media_type)
        )

    with fou.ProgressBar(total=num_samples, progress=progress) as pb:
        with dataset_exporter:
            if sample_collection is not None:
                dataset_exporter.log_collection(sample_collection)

            for group in pb(samples.iter_groups()):
                dataset_exporter.export_group(group)


def _write_image_dataset(
    dataset_exporter,
    samples,
    sample_parser,
    sample_collection=None,
    progress=None,
    num_samples=None,
):
    labeled_images = isinstance(dataset_exporter, LabeledImageDatasetExporter)

    with fou.ProgressBar(total=num_samples, progress=progress) as pb:
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
    sample_collection=None,
    progress=None,
    num_samples=None,
):
    labeled_videos = isinstance(dataset_exporter, LabeledVideoDatasetExporter)

    with fou.ProgressBar(total=num_samples, progress=progress) as pb:
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


def _write_unlabeled_dataset(
    dataset_exporter,
    samples,
    sample_parser,
    sample_collection=None,
    progress=None,
    num_samples=None,
):
    with fou.ProgressBar(total=num_samples, progress=progress) as pb:
        with dataset_exporter:
            if sample_collection is not None:
                dataset_exporter.log_collection(sample_collection)

            for sample in pb(samples):
                sample_parser.with_sample(sample)

                # Parse media
                filepath = sample_parser.get_media_path()

                # Parse metadata
                if dataset_exporter.requires_metadata:
                    if sample_parser.has_metadata:
                        metadata = sample_parser.get_metadata()
                    else:
                        metadata = None

                    if metadata is None:
                        metadata = fom.Metadata.build_for(filepath)
                else:
                    metadata = None

                # Export sample
                dataset_exporter.export_sample(filepath, metadata=metadata)


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
                data_path = fos.normalize_path(default) + ".json"
            elif export_dir is not None:
                data_path = default

        if data_path is not None:
            data_path = os.path.expanduser(data_path)

            if not os.path.isabs(data_path) and export_dir is not None:
                export_dir = fos.normalize_path(export_dir)
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
                export_dir = fos.normalize_path(export_dir)
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
            -   When ``export_media`` is False, this parameter has no effect
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each media. When
            exporting media, this identifier is joined with ``export_path`` to
            generate an output path for each exported media. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        chunk_size (None): an optional chunk size to use when exporting media
            files. If provided, media files will be nested in subdirectories
            of the output directory with at most this many media files per
            subdirectory. Has no effect if a ``rel_dir`` is provided
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
        rel_dir=None,
        chunk_size=None,
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
            export_path = fos.normalize_path(export_path)

        if rel_dir is not None:
            rel_dir = fos.normalize_path(rel_dir)
            chunk_size = None

        self.export_mode = export_mode
        self.export_path = export_path
        self.rel_dir = rel_dir
        self.chunk_size = chunk_size
        self.supported_modes = supported_modes
        self.default_ext = default_ext
        self.ignore_exts = ignore_exts

        self._filename_maker = None
        self._manifest = None
        self._manifest_path = None

    def _handle_fo3d_file(self, fo3d_path, fo3d_output_path):
        if self.export_mode in (False, "manifest"):
            return

        scene = fo3d.Scene.from_fo3d(fo3d_path)
        asset_paths = scene.get_asset_paths()

        input_to_output_paths = {}
        for asset_path in asset_paths:
            if not os.path.isabs(asset_path):
                absolute_asset_path = os.path.abspath(
                    os.path.join(os.path.dirname(fo3d_path), asset_path)
                )
            else:
                absolute_asset_path = asset_path

            seen = self._filename_maker.seen_input_path(absolute_asset_path)

            asset_output_path = self._filename_maker.get_output_path(
                absolute_asset_path
            )
            # By convention, we always write *relative* asset paths
            input_to_output_paths[asset_path] = os.path.relpath(
                asset_output_path, os.path.dirname(fo3d_output_path)
            )

            if seen:
                continue

            if self.export_mode is True:
                etau.copy_file(absolute_asset_path, asset_output_path)
            elif self.export_mode == "move":
                etau.move_file(absolute_asset_path, asset_output_path)
            elif self.export_mode == "symlink":
                etau.symlink_file(absolute_asset_path, asset_output_path)

        is_scene_modified = scene.update_asset_paths(input_to_output_paths)

        if is_scene_modified:
            scene.write(fo3d_output_path)
            if self.export_mode == "move":
                etau.delete_file(fo3d_path)
        else:
            if self.export_mode is True:
                etau.copy_file(fo3d_path, fo3d_output_path)
            elif self.export_mode == "move":
                etau.move_file(fo3d_path, fo3d_output_path)
            elif self.export_mode == "symlink":
                etau.symlink_file(fo3d_path, fo3d_output_path)

    def __enter__(self):
        self.setup()
        return self

    def __exit__(self, *args):
        self.close()

    def _write_media(self, media, outpath):
        raise NotImplementedError("subclass must implement _write_media()")

    def _get_uuid(self, path):
        if self.export_mode in (False, "manifest"):
            # `path` should be an input path
            rel_dir = self.rel_dir
        else:
            # `path` should be an output path
            rel_dir = self.export_path

        if rel_dir is not None:
            uuid = fou.safe_relpath(path, rel_dir)
        else:
            uuid = os.path.basename(path)

        if self.ignore_exts:
            uuid = os.path.splitext(uuid)[0]

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
            rel_dir=self.rel_dir,
            chunk_size=self.chunk_size,
            default_ext=self.default_ext,
            ignore_exts=self.ignore_exts,
            ignore_existing=True,
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
        if outpath is not None:
            outpath = fos.normalize_path(outpath)

        if etau.is_str(media_or_path):
            seen = False
            media_path = fos.normalize_path(media_or_path)

            if outpath is not None:
                uuid = self._get_uuid(outpath)
            elif self.export_mode in (False, "manifest"):
                outpath = media_or_path
                uuid = self._get_uuid(media_path)
            else:
                seen = self._filename_maker.seen_input_path(media_path)
                outpath = self._filename_maker.get_output_path(media_path)
                uuid = self._get_uuid(outpath)

            if not seen:
                if self.export_mode == "manifest":
                    self._manifest[uuid] = media_path
                elif media_path.endswith(".fo3d"):
                    self._handle_fo3d_file(media_path, outpath)
                elif self.export_mode is True:
                    etau.copy_file(media_path, outpath)
                elif self.export_mode == "move":
                    etau.move_file(media_path, outpath)
                elif self.export_mode == "symlink":
                    etau.symlink_file(media_path, outpath)
        else:
            media = media_or_path

            if outpath is not None:
                uuid = self._get_uuid(outpath)
            else:
                outpath = self._filename_maker.get_output_path()
                uuid = self._get_uuid(outpath)

            if self.export_mode is True:
                self._write_media(media, outpath)
            elif self.export_mode is not False:
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
        foui.write(img, outpath)


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
    """Base interface for exporting datasets.

    See :ref:`this page <writing-a-custom-dataset-exporter>` for information
    about implementing/using dataset exporters.

    Args:
        export_dir (None): the directory to write the export. This may be
            optional for some exporters
    """

    def __init__(self, export_dir=None):
        if export_dir is not None:
            export_dir = fos.normalize_path(export_dir)

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
        :meth:`fiftyone.core.collections.SampleCollection.info` of the
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

    def export_samples(self, sample_collection, progress=None):
        """Exports the given sample collection.

        Args:
            sample_collection: a
                :class:`fiftyone.core.collections.SampleCollection`
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
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


class GroupDatasetExporter(DatasetExporter):
    """Interface for exporting grouped datasets.

    See :ref:`this page <writing-a-custom-dataset-exporter>` for information
    about implementing/using dataset exporters.

    Args:
        export_dir (None): the directory to write the export. This may be
            optional for some exporters
    """

    def export_sample(self, *args, **kwargs):
        raise ValueError(
            "Use export_group() to perform exports with %s instances"
            % type(self)
        )

    def export_group(self, group):
        """Exports the given group to the dataset.

        Args:
            group: a dict mapping group slice names to
                :class:`fiftyone.core.sample.Sample` instances
        """
        raise NotImplementedError("subclass must implement export_group()")


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


class UnlabeledMediaDatasetExporter(DatasetExporter):
    """Interface for exporting datasets of unlabeled samples.

    See :ref:`this page <writing-a-custom-dataset-exporter>` for information
    about implementing/using dataset exporters.

    Args:
        export_dir (None): the directory to write the export. This may be
            optional for some exporters
    """

    @property
    def requires_metadata(self):
        """Whether this exporter requires
        :class:`fiftyone.core.metadata.Metadata` instances for each sample
        being exported.
        """
        raise NotImplementedError("subclass must implement requires_metadata")

    def export_sample(self, filepath, metadata=None):
        """Exports the given sample to the dataset.

        Args:
            filepath: a media path
            metadata (None): a :class:`fiftyone.core.metadata.Metadata`
                instance for the sample. Only required when
                :meth:`requires_metadata` is ``True``
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

        The :class:`fiftyone.types.FiftyOneDataset` format was upgraded in
        ``fiftyone==0.8`` and this exporter is now deprecated. The new exporter
        is :class:`FiftyOneDatasetExporter`.

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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each media. When
            exporting media, this identifier is joined with ``export_dir`` to
            generate an output path for each exported media. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        chunk_size (None): an optional chunk size to use when exporting media
            files. If provided, media files will be nested in subdirectories
            of the output directory with at most this many media files per
            subdirectory. Has no effect if a ``rel_dir`` is provided
        abs_paths (False): whether to store absolute paths to the media in the
            exported labels
        export_saved_views (True): whether to include saved views in the export.
            Only applicable when exporting full datasets
        export_runs (True): whether to include annotation/brain/evaluation
            runs in the export. Only applicable when exporting full datasets
        export_workspaces (True): whether to include saved workspaces in the
            export. Only applicable when exporting full datasets
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(
        self,
        export_dir,
        export_media=None,
        rel_dir=None,
        chunk_size=None,
        abs_paths=False,
        export_saved_views=True,
        export_runs=True,
        export_workspaces=True,
        pretty_print=False,
    ):
        if export_media is None:
            export_media = True

        if rel_dir is not None:
            rel_dir = fos.normalize_path(rel_dir)
            chunk_size = None

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.rel_dir = rel_dir
        self.chunk_size = chunk_size
        self.abs_paths = abs_paths
        self.export_saved_views = export_saved_views
        self.export_runs = export_runs
        self.export_workspaces = export_workspaces
        self.pretty_print = pretty_print

        self._data_dir = None
        self._fields_dir = None
        self._anno_dir = None
        self._brain_dir = None
        self._eval_dir = None
        self._runs_dir = None
        self._frame_labels_dir = None
        self._metadata_path = None
        self._samples_path = None
        self._metadata = None
        self._samples = None
        self._media_exporter = None
        self._media_fields = {}
        self._media_field_exporters = {}

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._fields_dir = os.path.join(self.export_dir, "fields")
        self._anno_dir = os.path.join(self.export_dir, "annotations")
        self._brain_dir = os.path.join(self.export_dir, "brain")
        self._eval_dir = os.path.join(self.export_dir, "evaluations")
        self._runs_dir = os.path.join(self.export_dir, "runs")
        self._frame_labels_dir = os.path.join(self.export_dir, "frames")
        self._metadata_path = os.path.join(self.export_dir, "metadata.json")
        self._samples_path = os.path.join(self.export_dir, "samples.json")
        self._metadata = {}
        self._samples = []

        self._media_exporter = MediaExporter(
            self.export_media,
            export_path=self._data_dir,
            rel_dir=self.rel_dir,
            chunk_size=self.chunk_size,
            supported_modes=(True, False, "move", "symlink"),
        )
        self._media_exporter.setup()

    def log_collection(self, sample_collection):
        self._metadata["name"] = sample_collection._dataset.name
        self._metadata["media_type"] = sample_collection.media_type
        if sample_collection.media_type == fomm.GROUP:
            self._metadata[
                "group_media_types"
            ] = sample_collection.group_media_types

        schema = sample_collection._serialize_field_schema()
        self._metadata["sample_fields"] = schema

        if sample_collection._contains_videos(any_slice=True):
            schema = sample_collection._serialize_frame_field_schema()
            self._metadata["frame_fields"] = schema

        self._media_fields = sample_collection._get_media_fields(
            blacklist="filepath",
        )

        info = dict(sample_collection.info)

        # Package extras into `info`, since the import API only supports
        # checking for `info`...

        if sample_collection.tags:
            info["tags"] = sample_collection.tags

        if sample_collection.description:
            info["description"] = sample_collection.description

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

        if sample_collection.app_config.is_custom():
            info["app_config"] = sample_collection.app_config.to_dict(
                extended=True
            )

        self._metadata["info"] = info

        dataset = sample_collection._root_dataset
        if sample_collection != dataset:
            return

        # Exporting the information below only makes sense when exporting an
        # entire dataset

        if dataset.has_saved_views and self.export_saved_views:
            self._metadata["saved_views"] = [
                json_util.dumps(v.to_dict())
                for v in dataset._doc.get_saved_views()
            ]

        if dataset.has_workspaces and self.export_workspaces:
            self._metadata["workspaces"] = [
                json_util.dumps(w.to_dict())
                for w in dataset._doc.get_workspaces()
            ]

        if dataset.has_annotation_runs and self.export_runs:
            self._metadata["annotation_runs"] = {
                k: json_util.dumps(v.to_dict())
                for k, v in dataset._doc.get_annotation_runs().items()
            }
            _export_annotation_results(dataset, self._anno_dir)

        if dataset.has_brain_runs and self.export_runs:
            self._metadata["brain_methods"] = {
                k: json_util.dumps(v.to_dict())
                for k, v in dataset._doc.get_brain_methods().items()
            }
            _export_brain_results(dataset, self._brain_dir)

        if dataset.has_evaluations and self.export_runs:
            self._metadata["evaluations"] = {
                k: json_util.dumps(v.to_dict())
                for k, v in dataset._doc.get_evaluations().items()
            }
            _export_evaluation_results(dataset, self._eval_dir)

        if dataset.has_runs and self.export_runs:
            self._metadata["runs"] = {
                k: json_util.dumps(v.to_dict())
                for k, v in dataset._doc.get_runs().items()
            }
            _export_run_results(dataset, self._runs_dir)

    def export_sample(self, sample):
        out_filepath, _ = self._media_exporter.export(sample.filepath)

        sd = sample.to_dict(include_private=True)

        if self.abs_paths:
            sd["filepath"] = out_filepath
        else:
            sd["filepath"] = fou.safe_relpath(
                out_filepath, self.export_dir, default=out_filepath
            )

        if self._media_fields:
            self._export_media_fields(sd)

        if sample.media_type == fomm.VIDEO:
            # Serialize frame labels separately
            uuid = os.path.splitext(os.path.basename(out_filepath))[0]
            outpath = self._export_frame_labels(sample, uuid)
            sd["frames"] = os.path.relpath(outpath, self.export_dir)

        self._samples.append(sd)

    def close(self, *args):
        etas.write_json(
            self._metadata, self._metadata_path, pretty_print=self.pretty_print
        )
        etas.write_json(
            {"samples": self._samples},
            self._samples_path,
            pretty_print=self.pretty_print,
        )

        self._media_exporter.close()
        for media_exporter in self._media_field_exporters.values():
            media_exporter.close()

    def _export_frame_labels(self, sample, uuid):
        # @todo export segmentation/heatmap masks stored as paths
        frames_dict = {"frames": sample.frames._to_frames_dict()}
        outpath = os.path.join(self._frame_labels_dir, uuid + ".json")
        etas.write_json(frames_dict, outpath, pretty_print=self.pretty_print)

        return outpath

    def _export_media_fields(self, sd):
        for field_name, key in self._media_fields.items():
            self._export_media_field(sd, field_name, key=key)

    def _export_media_field(self, d, field_name, key=None):
        value = pydash.get(d, field_name, None)
        if value is None:
            return

        media_exporter = self._get_media_field_exporter(field_name)

        if not isinstance(value, (list, tuple)):
            value = [value]

        for _d in value:
            if key is not None:
                _value = _d.get(key, None)
            else:
                _value = _d

            if _value is None:
                continue

            outpath, _ = media_exporter.export(_value)

            if not self.abs_paths:
                outpath = fou.safe_relpath(
                    outpath, self.export_dir, default=outpath
                )

            if key is not None:
                _d[key] = outpath
            else:
                pydash.set_(d, field_name, outpath)

    def _get_media_field_exporter(self, field_name):
        media_exporter = self._media_field_exporters.get(field_name, None)
        if media_exporter is not None:
            return media_exporter

        field_dir = os.path.join(self._fields_dir, field_name)
        media_exporter = MediaExporter(
            self.export_media,
            export_path=field_dir,
            rel_dir=self.rel_dir,
            chunk_size=self.chunk_size,
            supported_modes=(True, False, "move", "symlink"),
        )
        media_exporter.setup()
        self._media_field_exporters[field_name] = media_exporter

        return media_exporter


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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each media. When
            exporting media, this identifier is joined with ``export_dir`` to
            generate an output path for each exported media. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        chunk_size (None): an optional chunk size to use when exporting media
            files. If provided, media files will be nested in subdirectories
            of the output directory with at most this many media files per
            subdirectory. Has no effect if a ``rel_dir`` is provided
        export_saved_views (True): whether to include saved views in the export.
            Only applicable when exporting full datasets
        export_runs (True): whether to include annotation/brain/evaluation
            runs in the export. Only applicable when exporting full datasets
        export_workspaces (True): whether to include saved workspaces in the
            export. Only applicable when exporting full datasets
        use_dirs (False): whether to export metadata into directories of per
            sample/frame files
        ordered (True): whether to preserve the order of the exported
            collections
    """

    def __init__(
        self,
        export_dir,
        export_media=None,
        rel_dir=None,
        chunk_size=None,
        export_saved_views=True,
        export_runs=True,
        export_workspaces=True,
        use_dirs=False,
        ordered=True,
    ):
        if export_media is None:
            export_media = True

        if rel_dir is not None:
            rel_dir = fos.normalize_path(rel_dir)
            chunk_size = None

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.rel_dir = rel_dir
        self.chunk_size = chunk_size
        self.export_saved_views = export_saved_views
        self.export_runs = export_runs
        self.export_workspaces = export_workspaces
        self.use_dirs = use_dirs
        self.ordered = ordered

        self._data_dir = None
        self._fields_dir = None
        self._anno_dir = None
        self._brain_dir = None
        self._eval_dir = None
        self._runs_dir = None
        self._metadata_path = None
        self._samples_path = None
        self._frames_path = None
        self._media_exporter = None
        self._media_fields = {}
        self._media_field_exporters = {}

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._fields_dir = os.path.join(self.export_dir, "fields")
        self._anno_dir = os.path.join(self.export_dir, "annotations")
        self._brain_dir = os.path.join(self.export_dir, "brain")
        self._eval_dir = os.path.join(self.export_dir, "evaluations")
        self._runs_dir = os.path.join(self.export_dir, "runs")
        self._metadata_path = os.path.join(self.export_dir, "metadata.json")

        if self.use_dirs:
            self._samples_path = os.path.join(self.export_dir, "samples")
            self._frames_path = os.path.join(self.export_dir, "frames")
        else:
            self._samples_path = os.path.join(self.export_dir, "samples.json")
            self._frames_path = os.path.join(self.export_dir, "frames.json")

        self._media_exporter = MediaExporter(
            self.export_media,
            export_path=self._data_dir,
            rel_dir=self.rel_dir,
            chunk_size=self.chunk_size,
            supported_modes=(True, False, "move", "symlink"),
        )
        self._media_exporter.setup()

    def export_samples(self, sample_collection, progress=None):
        etau.ensure_dir(self.export_dir)

        if sample_collection.media_type == fomm.GROUP:
            _sample_collection = sample_collection.select_group_slices(
                _allow_mixed=True
            )
        else:
            _sample_collection = sample_collection

        self._media_fields = sample_collection._get_media_fields(
            blacklist="filepath"
        )

        logger.info("Exporting samples...")

        coll, pipeline = fod._get_samples_pipeline(_sample_collection)
        num_samples = foo.count_documents(coll, pipeline)
        _samples = foo.aggregate(coll, pipeline)

        def _prep_sample(sd):
            filepath = sd["filepath"]
            if self.export_media is not False:
                # Store relative path
                _, uuid = self._media_exporter.export(filepath)
                sd["filepath"] = os.path.join("data", uuid)
            elif self.rel_dir is not None:
                # Remove `rel_dir` prefix from filepath
                sd["filepath"] = fou.safe_relpath(
                    filepath, self.rel_dir, default=filepath
                )

            if self._media_fields:
                self._export_media_fields(sd)

            return sd

        if self.use_dirs:
            if self.ordered:
                patt = "{idx:06d}-{id}.json"
            else:
                patt = "{id}.json"
        else:
            patt = None

        foo.export_collection(
            map(_prep_sample, _samples),
            self._samples_path,
            key="samples",
            patt=patt,
            progress=progress,
            num_docs=num_samples,
        )

        if sample_collection._contains_videos(any_slice=True):
            logger.info("Exporting frames...")

            if sample_collection.media_type == fomm.GROUP and not isinstance(
                sample_collection, fod.Dataset
            ):
                # Export frames for all video samples
                _video_collection = sample_collection.select_group_slices(
                    media_type=fomm.VIDEO
                )
            else:
                _video_collection = sample_collection

            coll, pipeline = fod._get_frames_pipeline(_video_collection)
            num_frames = foo.count_documents(coll, pipeline)
            frames = foo.aggregate(coll, pipeline)

            # @todo export segmentation/heatmap masks stored as paths
            foo.export_collection(
                frames,
                self._frames_path,
                key="frames",
                patt=patt,
                num_docs=num_frames,
                progress=progress,
            )

        dataset = sample_collection._dataset
        dataset._doc.reload()
        dataset_dict = dataset._doc.to_dict()
        dataset_dict["saved_views"] = []
        dataset_dict["annotation_runs"] = {}
        dataset_dict["brain_methods"] = {}
        dataset_dict["evaluations"] = {}
        dataset_dict["runs"] = {}
        dataset_dict["workspaces"] = []

        #
        # Exporting saved views/runs/workspaces only makes sense if the entire
        # dataset is being exported, otherwise the view for the run cannot be
        # reconstructed based on the information encoded in the run's document
        #

        is_full_dataset = sample_collection == sample_collection._root_dataset

        _export_saved_views = self.export_saved_views and is_full_dataset
        _export_runs = self.export_runs and is_full_dataset
        _export_workspaces = self.export_workspaces and is_full_dataset

        if _export_saved_views and dataset.has_saved_views:
            dataset_dict["saved_views"] = [
                v.to_dict() for v in dataset._doc.get_saved_views()
            ]

        if _export_runs and dataset.has_annotation_runs:
            dataset_dict["annotation_runs"] = {
                k: v.to_dict()
                for k, v in dataset._doc.get_annotation_runs().items()
            }
            _export_annotation_results(dataset, self._anno_dir)

        if _export_runs and dataset.has_brain_runs:
            dataset_dict["brain_methods"] = {
                k: v.to_dict()
                for k, v in dataset._doc.get_brain_methods().items()
            }
            _export_brain_results(dataset, self._brain_dir)

        if _export_runs and dataset.has_evaluations:
            dataset_dict["evaluations"] = {
                k: v.to_dict()
                for k, v in dataset._doc.get_evaluations().items()
            }
            _export_evaluation_results(dataset, self._eval_dir)

        if _export_runs and dataset.has_runs:
            dataset_dict["runs"] = {
                k: v.to_dict() for k, v in dataset._doc.get_runs().items()
            }
            _export_run_results(dataset, self._runs_dir)

        if _export_workspaces and dataset.has_workspaces:
            dataset_dict["workspaces"] = [
                v.to_dict() for v in dataset._doc.get_workspaces()
            ]

        foo.export_document(dataset_dict, self._metadata_path)

        self._media_exporter.close()
        for media_exporter in self._media_field_exporters.values():
            media_exporter.close()

    def _export_media_fields(self, sd):
        for field_name, key in self._media_fields.items():
            self._export_media_field(sd, field_name, key=key)

    def _export_media_field(self, d, field_name, key=None):
        value = pydash.get(d, field_name, None)
        if value is None:
            return

        media_exporter = self._get_media_field_exporter(field_name)

        if not isinstance(value, (list, tuple)):
            value = [value]

        for _d in value:
            if key is not None:
                _value = _d.get(key, None)
            else:
                _value = _d

            if _value is None:
                continue

            if self.export_media is not False:
                # Store relative path
                _, uuid = media_exporter.export(_value)
                outpath = os.path.join("fields", field_name, uuid)
            elif self.rel_dir is not None:
                # Remove `rel_dir` prefix from path
                outpath = fou.safe_relpath(
                    _value, self.rel_dir, default=_value
                )
            else:
                continue

            if key is not None:
                _d[key] = outpath
            else:
                pydash.set_(d, field_name, outpath)

    def _get_media_field_exporter(self, field_name):
        media_exporter = self._media_field_exporters.get(field_name, None)
        if media_exporter is not None:
            return media_exporter

        field_dir = os.path.join(self._fields_dir, field_name)
        media_exporter = MediaExporter(
            self.export_media,
            export_path=field_dir,
            rel_dir=self.rel_dir,
            chunk_size=self.chunk_size,
            supported_modes=(True, False, "move", "symlink"),
        )
        media_exporter.setup()
        self._media_field_exporters[field_name] = media_exporter

        return media_exporter


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


def _export_run_results(sample_collection, runs_dir):
    for run_key in sample_collection.list_runs():
        results_path = os.path.join(runs_dir, run_key + ".json")
        results = sample_collection.load_run_results(run_key)
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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each image. When
            exporting media, this identifier is joined with ``export_dir`` to
            generate an output path for each exported image. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(
        self, export_dir, export_media=None, rel_dir=None, image_format=None
    ):
        if export_media is None:
            export_media = True

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.rel_dir = rel_dir
        self.image_format = image_format

        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return False

    def setup(self):
        self._media_exporter = ImageExporter(
            self.export_media,
            export_path=self.export_dir,
            rel_dir=self.rel_dir,
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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each video. When
            exporting media, this identifier is joined with ``export_dir`` to
            generate an output path for each exported video. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
    """

    def __init__(self, export_dir, export_media=None, rel_dir=None):
        if export_media is None:
            export_media = True

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.rel_dir = rel_dir

        self._media_exporter = None

    @property
    def requires_video_metadata(self):
        return False

    def setup(self):
        self._media_exporter = VideoExporter(
            self.export_media,
            export_path=self.export_dir,
            rel_dir=self.rel_dir,
            supported_modes=(True, "move", "symlink"),
        )
        self._media_exporter.setup()

    def export_sample(self, video_path, metadata=None):
        self._media_exporter.export(video_path)

    def close(self, *args):
        self._media_exporter.close()


class MediaDirectoryExporter(UnlabeledMediaDatasetExporter):
    """Exporter that writes a directory of media files of arbitrary type to
    disk.

    See :ref:`this page <MediaDirectory-export>` for format details.

    The filenames of the input media files will be maintained in the export
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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each output file. This
            identifier is joined with ``export_dir`` to generate an output path
            for each exported media. This argument allows for populating nested
            subdirectories that match the shape of the input paths. The path is
            converted to an absolute path (if necessary) via
            :func:`fiftyone.core.storage.normalize_path`
    """

    def __init__(self, export_dir, export_media=None, rel_dir=None):
        if export_media is None:
            export_media = True

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.rel_dir = rel_dir

        self._media_exporter = None

    @property
    def requires_metadata(self):
        return False

    def setup(self):
        self._media_exporter = MediaExporter(
            self.export_media,
            export_path=self.export_dir,
            rel_dir=self.rel_dir,
            supported_modes=(True, "move", "symlink"),
        )
        self._media_exporter.setup()

    def export_sample(self, filepath, metadata=None):
        self._media_exporter.export(filepath)

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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each image. When
            exporting media, this identifier is joined with ``data_path`` to
            generate an output path for each exported image. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        abs_paths (False): whether to store absolute paths to the images in the
            exported labels
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
        classes (None): the list of possible class labels
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
        rel_dir=None,
        abs_paths=False,
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
        self.rel_dir = rel_dir
        self.abs_paths = abs_paths
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
            rel_dir=self.rel_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._media_exporter.setup()

    def export_sample(self, image_or_path, label, metadata=None):
        out_image_path, uuid = self._media_exporter.export(image_or_path)

        if self.abs_paths:
            key = out_image_path
        else:
            key = uuid

        self._labels_dict[key] = _parse_classifications(
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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each image. When
            exporting media, this identifier is joined with ``export_dir`` to
            generate an output path for each exported image. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(
        self, export_dir, export_media=None, rel_dir=None, image_format=None
    ):
        if export_media is None:
            export_media = True

        if rel_dir is not None:
            rel_dir = fos.normalize_path(rel_dir)

        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.rel_dir = rel_dir
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
            export_path=self.export_dir,
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
            image_path = fos.normalize_path(image_or_path)
        else:
            image_path = self._default_filename_patt % (
                self._class_counts[_label]
            )

        if self.rel_dir is not None:
            filename = fou.safe_relpath(image_path, self.rel_dir)
        else:
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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each video. When
            exporting media, this identifier is joined with ``export_dir`` to
            generate an output path for each exported video. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
    """

    def __init__(self, export_dir, export_media=None, rel_dir=None):
        if export_media is None:
            export_media = True

        if rel_dir is not None:
            rel_dir = fos.normalize_path(rel_dir)

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.rel_dir = rel_dir

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
            export_path=self.export_dir,
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

        if self.rel_dir is not None:
            filename = fou.safe_relpath(video_path, self.rel_dir)
        else:
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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each image. When
            exporting media, this identifier is joined with ``data_path`` to
            generate an output path for each exported image. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        abs_paths (False): whether to store absolute paths to the images in the
            exported labels
        classes (None): the list of possible class labels
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
        rel_dir=None,
        abs_paths=False,
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
        self.rel_dir = rel_dir
        self.abs_paths = abs_paths
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
            rel_dir=self.rel_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._media_exporter.setup()

    def export_sample(self, image_or_path, detections, metadata=None):
        out_image_path, uuid = self._media_exporter.export(image_or_path)

        if self.abs_paths:
            key = out_image_path
        else:
            key = uuid

        self._labels_dict[key] = _parse_detections(
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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each video. When
            exporting media, this identifier is joined with ``data_path`` to
            generate an output path for each exported video. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        abs_paths (False): whether to store absolute paths to the videos in the
            exported labels
        use_timestamps (False): whether to export the support of each temporal
            detection in seconds rather than frame numbers
        classes (None): the list of possible class labels
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
        rel_dir=None,
        abs_paths=False,
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
        self.rel_dir = rel_dir
        self.abs_paths = abs_paths
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
            rel_dir=self.rel_dir,
            ignore_exts=True,
        )
        self._media_exporter.setup()

    def export_sample(self, video_path, temporal_detections, _, metadata=None):
        out_video_path, uuid = self._media_exporter.export(video_path)

        if self.abs_paths:
            key = out_video_path
        else:
            key = uuid

        self._labels_dict[key] = _parse_temporal_detections(
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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each image. When
            exporting media, this identifier is joined with ``data_path`` and
            ``labels_path`` to generate output paths for each exported image
            and mask. This argument allows for populating nested subdirectories
            that match the shape of the input paths. The path is converted to
            an absolute path (if necessary) via
            :func:`fiftyone.core.storage.normalize_path`
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
        rel_dir=None,
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
        self.rel_dir = rel_dir
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
            rel_dir=self.rel_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._media_exporter.setup()

    def export_sample(self, image_or_path, label, metadata=None):
        _, uuid = self._media_exporter.export(image_or_path)

        if label is None:
            return  # unlabeled

        if isinstance(label, (fol.Detections, fol.Polylines)):
            if self.mask_size is not None:
                frame_size = self.mask_size
            else:
                if metadata is None:
                    metadata = fom.ImageMetadata.build_for(image_or_path)

                frame_size = (metadata.width, metadata.height)

            if isinstance(label, fol.Detections):
                label = label.to_segmentation(
                    frame_size=frame_size, mask_targets=self.mask_targets
                )
            else:
                label = label.to_segmentation(
                    frame_size=frame_size,
                    mask_targets=self.mask_targets,
                    thickness=self.thickness,
                )
        elif not isinstance(label, fol.Segmentation):
            raise ValueError("Unsupported label type '%s'" % type(label))

        out_mask_path = os.path.join(self.labels_path, uuid + self.mask_format)
        label.export_mask(out_mask_path)

    def close(self, *args):
        self._media_exporter.close()


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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each image. When
            exporting media, this identifier is joined with ``export_dir`` to
            generate an output path for each exported image. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
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
        rel_dir=None,
        image_format=None,
        pretty_print=False,
    ):
        if export_media is None:
            export_media = True

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.rel_dir = rel_dir
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
            rel_dir=self.rel_dir,
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
                "data/" + uuid + os.path.splitext(out_image_path)[1],
                "labels/" + uuid + ".json",
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
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier for each video. When
            exporting media, this identifier is joined with ``export_dir`` to
            generate an output path for each exported video. This argument
            allows for populating nested subdirectories that match the shape of
            the input paths. The path is converted to an absolute path (if
            necessary) via :func:`fiftyone.core.storage.normalize_path`
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(
        self, export_dir, export_media=None, rel_dir=None, pretty_print=False
    ):
        if export_media is None:
            export_media = True

        super().__init__(export_dir=export_dir)

        self.export_media = export_media
        self.rel_dir = rel_dir
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
            rel_dir=self.rel_dir,
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
                "data/" + uuid + os.path.splitext(out_video_path)[1],
                "labels/" + uuid + ".json",
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
