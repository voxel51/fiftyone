"""
Dataset exporters.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import inspect
import os
import warnings

import eta.core.datasets as etad
import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.collections as foc
import fiftyone.core.eta_utils as foe
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.media as fomm
import fiftyone.core.utils as fou
import fiftyone.types as fot

from .parsers import (
    FiftyOneLabeledImageSampleParser,
    FiftyOneUnlabeledImageSampleParser,
    FiftyOneLabeledVideoSampleParser,
    FiftyOneUnlabeledVideoSampleParser,
)


def export_samples(
    samples,
    export_dir=None,
    dataset_type=None,
    dataset_exporter=None,
    label_field_or_dict=None,
    frame_labels_field_or_dict=None,
    num_samples=None,
    **kwargs
):
    """Exports the given samples to disk as a dataset in the specified format.

    Provide either ``export_dir`` and ``dataset_type`` or ``dataset_exporter``
    to perform the export.

    Args:
        samples: an iterable of :class:`fiftyone.core.sample.Sample` instances.
            For example, this may be a :class:`fiftyone.core.dataset.Dataset`
            or a :class:`fifyone.core.view.DatasetView`
        export_dir (None): the directory to which to export the samples in
            format ``dataset_type``
        dataset_type (None): the :class:`fiftyone.types.dataset_types.Dataset`
            type to write
        dataset_exporter (None): a
            :class:`fiftyone.utils.data.exporters.DatasetExporter` to use to
            write the dataset
        label_field_or_dict (None): the name of the label field to export, or
            a dictionary mapping field names to output keys describing the
            label fields to export. Only applicable if ``dataset_exporter`` is
            a :class:`LabeledImageDatasetExporter` or
            :class:`LabeledVideoDatasetExporter`
        frame_labels_field_or_dict (None): the name of the frame label field to
            export, or a dictionary mapping field names to output keys
            describing the frame label fields to export. Only applicable if
            ``dataset_exporter`` is a :class:`LabeledVideoDatasetExporter`
        num_samples (None): the number of samples in ``samples``. If omitted,
            this is computed (if possible) via ``len(samples)``
        **kwargs: optional keyword arguments to pass to
            ``dataset_type.get_dataset_exporter_cls(export_dir, **kwargs)``
    """
    dataset_exporter = _get_dataset_exporter(
        export_dir, dataset_type, dataset_exporter, **kwargs
    )

    if isinstance(dataset_exporter, GenericSampleDatasetExporter):
        sample_parser = None
    elif isinstance(dataset_exporter, UnlabeledImageDatasetExporter):
        sample_parser = FiftyOneUnlabeledImageSampleParser(
            compute_metadata=True
        )
    elif isinstance(dataset_exporter, UnlabeledVideoDatasetExporter):
        sample_parser = FiftyOneUnlabeledVideoSampleParser(
            compute_metadata=True
        )
    elif isinstance(dataset_exporter, LabeledImageDatasetExporter):
        sample_parser = FiftyOneLabeledImageSampleParser(
            label_field_or_dict, compute_metadata=True
        )
    elif isinstance(dataset_exporter, LabeledVideoDatasetExporter):
        sample_parser = FiftyOneLabeledVideoSampleParser(
            label_field_or_dict=label_field_or_dict,
            frame_labels_field_or_dict=frame_labels_field_or_dict,
            compute_metadata=True,
        )
    else:
        raise ValueError(
            "Unsupported DatasetExporter %s" % type(dataset_exporter)
        )

    write_dataset(
        samples,
        sample_parser,
        dataset_exporter=dataset_exporter,
        num_samples=num_samples,
    )


def write_dataset(
    samples,
    sample_parser,
    dataset_dir=None,
    dataset_type=None,
    dataset_exporter=None,
    num_samples=None,
    **kwargs
):
    """Writes the samples to disk as a dataset in the specified format.

    Provide either ``dataset_dir`` and ``dataset_type`` or ``dataset_exporter``
    to perform the write.

    Args:
        samples: an iterable of samples
        sample_parser: a :class:`fiftyone.utils.data.parsers.SampleParser` to
            use to parse the samples
        dataset_dir (None): the directory to which to write the dataset in
            format ``dataset_type``
        dataset_type (None): the :class:`fiftyone.types.dataset_types.Dataset`
            type to write
        dataset_exporter (None): a
            :class:`fiftyone.utils.data.exporters.DatasetExporter` to use to
            write the dataset
        num_samples (None): the number of samples in ``samples``. If omitted,
            this is computed (if possible) via ``len(samples)``
        **kwargs: optional keyword arguments to pass to
            ``dataset_type.get_dataset_exporter_cls(dataset_dir, **kwargs)``
    """
    dataset_exporter = _get_dataset_exporter(
        dataset_dir, dataset_type, dataset_exporter, **kwargs
    )

    if num_samples is None:
        try:
            num_samples = len(samples)
        except:
            pass

    if isinstance(dataset_exporter, GenericSampleDatasetExporter):
        _write_generic_sample_dataset(dataset_exporter, samples, num_samples)
    elif isinstance(
        dataset_exporter,
        (UnlabeledImageDatasetExporter, LabeledImageDatasetExporter),
    ):
        _write_image_dataset(
            dataset_exporter, samples, sample_parser, num_samples
        )
    elif isinstance(
        dataset_exporter,
        (UnlabeledVideoDatasetExporter, LabeledVideoDatasetExporter),
    ):
        _write_video_dataset(
            dataset_exporter, samples, sample_parser, num_samples
        )
    else:
        raise ValueError(
            "Unsupported DatasetExporter %s" % type(dataset_exporter)
        )


def _get_dataset_exporter(
    export_dir, dataset_type, dataset_exporter, **kwargs
):
    if dataset_type is not None:
        if inspect.isclass(dataset_type):
            dataset_type = dataset_type()

        if not isinstance(
            dataset_type,
            (
                fot.UnlabeledImageDataset,
                fot.LabeledImageDataset,
                fot.UnlabeledVideoDataset,
                fot.LabeledVideoDataset,
            ),
        ):
            raise ValueError(
                "Unsupported `dataset_type` %s" % type(dataset_type)
            )

    if dataset_exporter is None:
        dataset_exporter_cls = dataset_type.get_dataset_exporter_cls()
        dataset_exporter = dataset_exporter_cls(export_dir, **kwargs)

    return dataset_exporter


def _write_generic_sample_dataset(dataset_exporter, samples, num_samples):
    with fou.ProgressBar(total=num_samples) as pb:
        with dataset_exporter:
            if isinstance(samples, foc.SampleCollection):
                dataset_exporter.log_collection(samples)

            for sample in pb(samples):
                dataset_exporter.export_sample(sample)


def _write_image_dataset(
    dataset_exporter, samples, sample_parser, num_samples
):
    labeled_images = isinstance(dataset_exporter, LabeledImageDatasetExporter)

    with fou.ProgressBar(total=num_samples) as pb:
        with dataset_exporter:
            if isinstance(samples, foc.SampleCollection):
                dataset_exporter.log_collection(samples)

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

                    #
                    # SPECIAL CASE
                    #
                    # Convert `Classification` labels to `Detections` format,
                    # if necessary
                    #
                    label = _check_classification_to_detections(
                        dataset_exporter, label
                    )

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
    dataset_exporter, samples, sample_parser, num_samples
):
    labeled_videos = isinstance(dataset_exporter, LabeledVideoDatasetExporter)

    with fou.ProgressBar(total=num_samples) as pb:
        with dataset_exporter:
            if isinstance(samples, foc.SampleCollection):
                dataset_exporter.log_collection(samples)

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

                    #
                    # SPECIAL CASE
                    #
                    # Convert `Classification` labels to `Detections` format,
                    # if necessary
                    #
                    label = _check_classification_to_detections(
                        dataset_exporter, label
                    )

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


def _check_classification_to_detections(dataset_exporter, label):
    if dataset_exporter.label_cls is not fol.Detections:
        return label

    if not isinstance(label, fol.Classification):
        return label

    msg = (
        "Dataset exporter expects labels in %s format, but found %s. "
        "Converting labels to detections whose bounding boxes span the entire "
        "image" % (fol.Detections, label.__class__)
    )
    warnings.warn(msg)

    return fol.Detections(
        detections=[
            fol.Detection(
                label=label.label,
                bounding_box=[0, 0, 1, 1],  # entire image
                confidence=label.confidence,
            )
        ]
    )


class DatasetExporter(object):
    """Base interface for exporting collections of
    :class:`fiftyone.core.sample.Sample` instances to disk.

    Example usage::

        import fiftyone as fo

        samples = ...  # a SampleCollection (e.g., Dataset or DatasetView)

        exporter = GenericSampleDatasetExporter(export_dir, ...)
        with exporter:
            exporter.log_collection(samples)

            for sample in samples:
                # Extract relevant information from `sample` and feed to
                # `export_sample()`
                exporter.export_sample(*args, **kwargs)

    Args:
        export_dir: the directory to write the export
    """

    def __init__(self, export_dir):
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
        :meth:`fiftyone.core.collections.SampleCollection.name` and
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


class ExportsImages(object):
    """Mixin for :class:`DatasetExporter` classes that export images."""

    @staticmethod
    def _is_image_path(image_or_path):
        """Determines whether the input is the path to an image on disk

        Args:
            image_or_path: an image or the path to the image on disk

        Returns:
            True/False
        """
        return etau.is_str(image_or_path)

    @staticmethod
    def _export_image_or_path(image_or_path, filename_maker):
        """Exports the image, using the given
        :class:`fiftyone.core.utils.UniqueFilenameMaker` to generate the output
        path for the image.

        Args:
            image_or_path: an image or the path to the image on disk
            filename_maker: a :class:`fiftyone.core.utils.UniqueFilenameMaker`
                to use to generate the output image path

        Returns:
            the path to the exported image
        """
        if ExportsImages._is_image_path(image_or_path):
            image_path = image_or_path
            out_image_path = filename_maker.get_output_path(image_path)
            etau.copy_file(image_path, out_image_path)
        else:
            img = image_or_path
            out_image_path = filename_maker.get_output_path()
            etai.write(img, out_image_path)

        return out_image_path


class ExportsVideos(object):
    """Mixin for :class:`DatasetExporter` classes that export videos."""

    @staticmethod
    def _export_video(video_path, filename_maker):
        """Exports the video, using the given
        :class:`fiftyone.core.utils.UniqueFilenameMaker` to generate the output
        path for the video.

        Args:
            video_path: the path to a video on disk
            filename_maker: a :class:`fiftyone.core.utils.UniqueFilenameMaker`
                to use to generate the output video path

        Returns:
            the path to the exported video
        """
        out_video_path = filename_maker.get_output_path(video_path)
        etau.copy_file(video_path, out_video_path)

        return out_video_path


class GenericSampleDatasetExporter(DatasetExporter):
    """Interface for exporting datasets of arbitrary
    :class:`fiftyone.core.sample.Sample` instances.

    Example usage::

        import fiftyone as fo

        samples = ...  # a SampleCollection (e.g., Dataset or DatasetView)

        exporter = GenericSampleDatasetExporter(export_dir, ...)
        with exporter:
            exporter.log_collection(samples)

            for sample in samples:
                exporter.export_sample(sample)

    Args:
        export_dir: the directory to write the export
    """

    def export_sample(self, sample):
        """Exports the given sample to the dataset.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
        """
        raise NotImplementedError("subclass must implement export_sample()")


class UnlabeledImageDatasetExporter(DatasetExporter, ExportsImages):
    """Interface for exporting datasets of unlabeled image samples.

    Example usage::

        import fiftyone as fo

        samples = ...  # a SampleCollection (e.g., Dataset or DatasetView)

        exporter = UnlabeledImageDatasetExporter(export_dir, ...)
        with exporter:
            exporter.log_collection(samples)

            for sample in samples:
                image_path = sample.filepath

                metadata = sample.metadata
                if exporter.requires_image_metadata and metadata is None:
                    metadata = fo.ImageMetadata.build_for(image_path)

                exporter.export_sample(image_path, metadata=metadata)

    Args:
        export_dir: the directory to write the export
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


class UnlabeledVideoDatasetExporter(DatasetExporter, ExportsVideos):
    """Interface for exporting datasets of unlabeled video samples.

    Example usage::

        import fiftyone as fo

        samples = ...  # a SampleCollection (e.g., Dataset or DatasetView)

        exporter = UnlabeledVideoDatasetExporter(export_dir, ...)
        with exporter:
            exporter.log_collection(samples)

            for sample in samples:
                video_path = sample.filepath

                metadata = sample.metadata
                if exporter.requires_video_metadata and metadata is None:
                    metadata = fo.VideoMetadata.build_for(video_path)

                exporter.export_sample(video_path, metadata=metadata)

    Args:
        export_dir: the directory to write the export
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


class LabeledImageDatasetExporter(DatasetExporter, ExportsImages):
    """Interface for exporting datasets of labeled image samples.

    Example usage::

        import fiftyone as fo

        samples = ...  # a SampleCollection (e.g., Dataset or DatasetView)
        label_field = ...

        exporter = LabeledImageDatasetExporter(export_dir, ...)
        with exporter:
            exporter.log_collection(samples)

            for sample in samples:
                image_path = sample.filepath

                metadata = sample.metadata
                if exporter.requires_image_metadata and metadata is None:
                    metadata = fo.ImageMetadata.build_for(image_path)

                # Assumes single label field case
                label = sample[label_field]

                exporter.export_sample(image_path, label, metadata=metadata)

    Args:
        export_dir: the directory to write the export
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


class LabeledVideoDatasetExporter(DatasetExporter, ExportsVideos):
    """Interface for exporting datasets of labeled video samples.

    Example usage::

        import fiftyone as fo

        samples = ...  # a SampleCollection (e.g., Dataset or DatasetView)

        exporter = LabeledVideoDatasetExporter(export_dir, ...)
        with exporter:
            exporter.log_collection(samples)

            for sample in samples:
                video_path = sample.filepath

                metadata = sample.metadata
                if exporter.requires_video_metadata and metadata is None:
                    metadata = fo.VideoMetadata.build_for(video_path)

                # Extract relevant sample-level labels to export
                label = ...

                # Extract relevant frame-level labels to export
                frames = ...

                exporter.export_sample(
                    video_path, label, frames, metadata=metadata
                )

    Args:
        export_dir: the directory to write the export
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


class FiftyOneDatasetExporter(GenericSampleDatasetExporter):
    """Exporter that writes a FiftyOne dataset to disk along with its source
    data in a serialized JSON format.

    See :class:`fiftyone.types.dataset_types.FiftyOneDataset` for format
    details.

    Args:
        export_dir: the directory to write the export
        move_media (False): whether to move (True) or copy (False) the source
            media into its output destination
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(self, export_dir, move_media=False, pretty_print=False):
        export_dir = os.path.abspath(os.path.expanduser(export_dir))
        super().__init__(export_dir)
        self.move_media = move_media
        self.pretty_print = pretty_print
        self._data_dir = None
        self._frame_labels_dir = None
        self._metadata_path = None
        self._samples_path = None
        self._metadata = None
        self._samples = None
        self._filename_maker = None
        self._is_video_dataset = False

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._frame_labels_dir = os.path.join(self.export_dir, "frames")
        self._metadata_path = os.path.join(self.export_dir, "metadata.json")
        self._samples_path = os.path.join(self.export_dir, "samples.json")
        self._metadata = {}
        self._samples = []
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir
        )

    def log_collection(self, sample_collection):
        self._is_video_dataset = sample_collection.media_type == fomm.VIDEO

        self._metadata["name"] = sample_collection.name
        self._metadata["media_type"] = sample_collection.media_type

        schema = sample_collection._serialize_field_schema()
        self._metadata["sample_fields"] = schema

        if self._is_video_dataset:
            schema = sample_collection._serialize_frame_field_schema()
            self._metadata["frame_fields"] = schema

        self._metadata["info"] = sample_collection.info

    def export_sample(self, sample):
        out_filepath = self._filename_maker.get_output_path(sample.filepath)
        if self.move_media:
            etau.move_file(sample.filepath, out_filepath)
        else:
            etau.copy_file(sample.filepath, out_filepath)

        sd = sample.to_dict()
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

    def _export_frame_labels(self, sample, uuid):
        frames_dict = {"frames": sample.frames._to_frames_dict()}
        outpath = os.path.join(self._frame_labels_dir, uuid + ".json")
        etas.write_json(frames_dict, outpath, pretty_print=self.pretty_print)

        return outpath


class ImageDirectoryExporter(UnlabeledImageDatasetExporter):
    """Exporter that writes a directory of images to disk.

    See :class:`fiftyone.types.dataset_types.ImageDirectory` for format
    details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(self, export_dir, image_format=None):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.image_format = image_format
        self._filename_maker = None

    @property
    def requires_image_metadata(self):
        return False

    def setup(self):
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self.export_dir, default_ext=self.image_format
        )

    def export_sample(self, image_or_path, metadata=None):
        self._export_image_or_path(image_or_path, self._filename_maker)


class VideoDirectoryExporter(UnlabeledVideoDatasetExporter):
    """Exporter that writes a directory of videos to disk.

    See :class:`fiftyone.types.dataset_types.VideoDirectory` for format
    details.

    If the path to a video is provided, the video is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
    """

    def __init__(self, export_dir):
        super().__init__(export_dir)
        self._filename_maker = None

    @property
    def requires_video_metadata(self):
        return False

    def setup(self):
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self.export_dir
        )

    def export_sample(self, video_path, metadata=None):
        self._export_video(video_path, self._filename_maker)


class FiftyOneImageClassificationDatasetExporter(LabeledImageDatasetExporter):
    """Exporter that writes an image classification dataset to disk in
    FiftyOne's default format.

    See :class:`fiftyone.types.dataset_types.FiftyOneImageClassificationDataset`
    for format details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
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
        self, export_dir, classes=None, image_format=None, pretty_print=False
    ):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.classes = classes
        self.image_format = image_format
        self.pretty_print = pretty_print
        self._data_dir = None
        self._labels_path = None
        self._labels_dict = None
        self._labels_map_rev = None
        self._filename_maker = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Classification

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._labels_path = os.path.join(self.export_dir, "labels.json")
        self._labels_dict = {}
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._parse_classes()

    def log_collection(self, sample_collection):
        if self.classes is None and "classes" in sample_collection.info:
            self.classes = sample_collection.info["classes"]
            self._parse_classes()

    def export_sample(self, image_or_path, classification, metadata=None):
        out_image_path = self._export_image_or_path(
            image_or_path, self._filename_maker
        )
        name = os.path.splitext(os.path.basename(out_image_path))[0]
        self._labels_dict[name] = _parse_classification(
            classification, labels_map_rev=self._labels_map_rev
        )

    def close(self, *args):
        labels = {
            "classes": self.classes,
            "labels": self._labels_dict,
        }
        etas.write_json(
            labels, self._labels_path, pretty_print=self.pretty_print
        )

    def _parse_classes(self):
        if self.classes is not None:
            self._labels_map_rev = _to_labels_map_rev(self.classes)


class ImageClassificationDirectoryTreeExporter(LabeledImageDatasetExporter):
    """Exporter that writes an image classification directory tree to disk.

    See :class:`fiftyone.types.dataset_types.ImageClassificationDirectoryTree`
    for format details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(self, export_dir, image_format=None):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.image_format = image_format
        self._class_counts = None
        self._filename_counts = None
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
        etau.ensure_dir(self.export_dir)

    def export_sample(self, image_or_path, classification, metadata=None):
        is_image_path = self._is_image_path(image_or_path)

        _label = _parse_classification(classification)
        if _label is None:
            _label = "_unlabeled"

        self._class_counts[_label] += 1

        if is_image_path:
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

        out_image_path = os.path.join(self.export_dir, _label, filename)

        if is_image_path:
            etau.copy_file(image_path, out_image_path)
        else:
            etai.write(img, out_image_path)


class VideoClassificationDirectoryTreeExporter(LabeledVideoDatasetExporter):
    """Exporter that writes a video classification directory tree to disk.

    See :class:`fiftyone.types.dataset_types.VideoClassificationDirectoryTree`
    for format details.

    The source videos are directly copied to their export destination,
    maintaining the original filename, unless a name conflict would occur, in
    which case an index of the form ``"-%d" % count`` is appended to the base
    filename.

    Args:
        export_dir: the directory to write the export
    """

    def __init__(self, export_dir):
        super().__init__(export_dir)
        self._class_counts = None
        self._filename_counts = None

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
        etau.ensure_dir(self.export_dir)

    def export_sample(self, video_path, classification, _, metadata=None):
        _label = _parse_classification(classification)
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

        out_video_path = os.path.join(self.export_dir, _label, filename)

        etau.copy_file(video_path, out_video_path)


class FiftyOneImageDetectionDatasetExporter(LabeledImageDatasetExporter):
    """Exporter that writes an image detection dataset to disk in FiftyOne's
    default format.

    See :class:`fiftyone.types.dataset_types.FiftyOneImageDetectionDataset` for
    format details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
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
        self, export_dir, classes=None, image_format=None, pretty_print=False
    ):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.classes = classes
        self.image_format = image_format
        self.pretty_print = pretty_print
        self._data_dir = None
        self._labels_path = None
        self._labels_dict = None
        self._labels_map_rev = None
        self._filename_maker = None

    @property
    def requires_image_metadata(self):
        return False

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._labels_path = os.path.join(self.export_dir, "labels.json")
        self._labels_dict = {}
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )
        self._parse_classes()

    def log_collection(self, sample_collection):
        if self.classes is None and "classes" in sample_collection.info:
            self.classes = sample_collection.info["classes"]
            self._parse_classes()

    def export_sample(self, image_or_path, detections, metadata=None):
        out_image_path = self._export_image_or_path(
            image_or_path, self._filename_maker
        )
        name = os.path.splitext(os.path.basename(out_image_path))[0]
        self._labels_dict[name] = _parse_detections(
            detections, labels_map_rev=self._labels_map_rev
        )

    def close(self, *args):
        labels = {
            "classes": self.classes,
            "labels": self._labels_dict,
        }
        etas.write_json(
            labels, self._labels_path, pretty_print=self.pretty_print
        )

    def _parse_classes(self):
        if self.classes is not None:
            self._labels_map_rev = _to_labels_map_rev(self.classes)


class FiftyOneImageLabelsDatasetExporter(LabeledImageDatasetExporter):
    """Exporter that writes a labeled image dataset to disk with labels stored
    in `ETA ImageLabels format <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.

    See :class:`fiftyone.types.dataset_types.FiftyOneImageLabelsDataset` for
    format details.

    If the path to an image is provided, the image is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(self, export_dir, image_format=None, pretty_print=False):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.image_format = image_format
        self.pretty_print = pretty_print
        self._labeled_dataset = None
        self._data_dir = None
        self._labels_dir = None
        self._filename_maker = None
        self._description = None

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
        self._labeled_dataset = etad.LabeledImageDataset.create_empty_dataset(
            self.export_dir
        )
        self._data_dir = self._labeled_dataset.data_dir
        self._labels_dir = self._labeled_dataset.labels_dir
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir,
            default_ext=self.image_format,
            ignore_exts=True,
        )

    def log_collection(self, sample_collection):
        self._description = sample_collection.info.get("description", None)

    def export_sample(self, image_or_path, labels, metadata=None):
        is_image_path = self._is_image_path(image_or_path)

        if is_image_path:
            image_path = image_or_path
            out_image_path = self._filename_maker.get_output_path(image_path)
        else:
            img = image_or_path
            out_image_path = self._filename_maker.get_output_path()

        name, ext = os.path.splitext(os.path.basename(out_image_path))
        new_image_filename = name + ext
        new_labels_filename = name + ".json"

        _image_labels = foe.to_image_labels(labels)

        if etau.is_str(image_or_path):
            image_labels_path = os.path.join(
                self._labels_dir, new_labels_filename
            )
            _image_labels.write_json(
                image_labels_path, pretty_print=self.pretty_print
            )

            self._labeled_dataset.add_file(
                image_path,
                image_labels_path,
                new_data_filename=new_image_filename,
                new_labels_filename=new_labels_filename,
            )
        else:
            self._labeled_dataset.add_data(
                img, _image_labels, new_image_filename, new_labels_filename,
            )

    def close(self, *args):
        self._labeled_dataset.set_description(self._description)
        self._labeled_dataset.write_manifest()


class FiftyOneVideoLabelsDatasetExporter(LabeledVideoDatasetExporter):
    """Exporter that writes a labeled video dataset with labels stored in
    `ETA VideoLabels format <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_.

    See :class:`fiftyone.types.dataset_types.FiftyOneVideoLabelsDataset` for
    format details.

    If the path to a video is provided, the video is directly copied to its
    destination, maintaining the original filename, unless a name conflict
    would occur, in which case an index of the form ``"-%d" % count`` is
    appended to the base filename.

    Args:
        export_dir: the directory to write the export
        pretty_print (False): whether to render the JSON in human readable
            format with newlines and indentations
    """

    def __init__(self, export_dir, pretty_print=False):
        super().__init__(export_dir)
        self.pretty_print = pretty_print
        self._labeled_dataset = None
        self._data_dir = None
        self._labels_dir = None
        self._filename_maker = None
        self._description = None

    @property
    def requires_video_metadata(self):
        return False

    @property
    def label_cls(self):
        return None

    @property
    def frame_labels_cls(self):
        return {
            "attributes": fol.Classifications,
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        self._labeled_dataset = etad.LabeledVideoDataset.create_empty_dataset(
            self.export_dir
        )
        self._data_dir = self._labeled_dataset.data_dir
        self._labels_dir = self._labeled_dataset.labels_dir
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir, ignore_exts=True,
        )

    def log_collection(self, sample_collection):
        self._description = sample_collection.info.get("description", None)

    def export_sample(self, video_path, _, frames, metadata=None):
        out_video_path = self._filename_maker.get_output_path(video_path)

        name, ext = os.path.splitext(os.path.basename(out_video_path))
        new_image_filename = name + ext
        new_labels_filename = name + ".json"

        _video_labels = foe.to_video_labels(frames)

        video_labels_path = os.path.join(self._labels_dir, new_labels_filename)
        _video_labels.write_json(
            video_labels_path, pretty_print=self.pretty_print
        )

        self._labeled_dataset.add_file(
            video_path,
            video_labels_path,
            new_data_filename=new_image_filename,
            new_labels_filename=new_labels_filename,
        )

    def close(self, *args):
        self._labeled_dataset.set_description(self._description)
        self._labeled_dataset.write_manifest()


def _parse_classification(classification, labels_map_rev=None):
    if classification is None:
        return None

    label = classification.label
    if labels_map_rev is not None:
        label = labels_map_rev[label]

    return label


def _parse_detections(detections, labels_map_rev=None):
    if detections is None:
        return None

    _detections = []
    for detection in detections.detections:
        label = detection.label
        if labels_map_rev is not None:
            label = labels_map_rev[label]

        _detection = {
            "label": label,
            "bounding_box": detection.bounding_box,
        }
        if detection.confidence is not None:
            _detection["confidence"] = detection.confidence

        if detection.attributes:
            _detection["attributes"] = {
                name: attr.value for name, attr in detection.attributes.items()
            }

        _detections.append(_detection)

    return _detections


def _to_labels_map_rev(classes):
    return {c: i for i, c in enumerate(classes)}
