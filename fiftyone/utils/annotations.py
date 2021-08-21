"""
Annotation utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import getpass
import logging

import eta.core.annotations as etaa
import eta.core.frames as etaf
import eta.core.image as etai
import eta.core.utils as etau
import eta.core.video as etav

import fiftyone as fo
import fiftyone.core.annotation as foa
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


def annotate(
    samples,
    anno_key,
    label_schema=None,
    label_field=None,
    label_type=None,
    classes=None,
    attributes=True,
    media_field="filepath",
    backend=None,
    launch_editor=False,
    **kwargs,
):
    """Exports the samples and optional label field(s) to the given
    annotation backend.

    The ``backend`` parameter controls which annotation backend to use.
    Depending on the backend you use, you may want/need to provide extra
    keyword arguments to this function for the constructor of the backend's
    annotation API:

    -   ``"cvat"``: :class:`fiftyone.utils.cvat.CVATAnnotationAPI`

    See :ref:`this page <annotation>` for more information about using this
    method, including how to define label schemas and how to configure login
    credentials for your annotation provider.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        anno_key: a string key to use to refer to this annotation run
        label_schema (None): a dictionary defining the label schema to use.
            If this argument is provided, it takes precedence over
            ``label_field`` and ``label_type``
        label_field (None): a string indicating either a new or existing
            label field to annotate
        label_type (None): a string indicating the type of labels to expect
            when creating a new ``label_field``. Supported values are
            ``("detections", "classifications", "polylines", "keypoints", "scalar")``
        classes (None): a list of strings indicating the class options for
            either ``label_field`` or all fields in ``label_schema``
            without classes specified. All new label fields must have a
            class list provided via one of the supported methods. For
            existing label fields, if classes are not provided by this
            argument nor ``label_schema``, they are parsed from
            :meth:`fiftyone.core.dataset.Dataset.classes` or
            :meth:`fiftyone.core.dataset.Dataset.default_classes`
        attributes (True): specifies the label attributes of each label
            field to include (other than their ``label``, which is always
            included) in the annotation export. Can be any of the
            following:

            -   ``True``: export all label attributes
            -   ``False``: don't export any custom label attributes
            -   an attribute or list of attributes to export
            -   a dict mapping attribute names to dicts specifying the details
                of the attribute field

            If provided, this parameter will apply to all label fields in
            ``label_schema`` that do not define their attributes
        media_field ("filepath"): the field containing the paths to the
            media files to upload
        backend (None): the annotation backend to use. The supported values are
            ``fiftyone.annotation_config.backends.keys()`` and the default
            is ``fiftyone.annotation_config.default_backend``
        launch_editor (False): whether to launch the annotation backend's
            editor after uploading the samples
        **kwargs: keyword arguments for the :class:`AnnotationBackendConfig`

    Returns:
        an :class:`AnnnotationResults`
    """
    config = _parse_config(backend, None, media_field, **kwargs)

    anno_backend = config.build()

    config.label_schema = _build_label_schema(
        samples,
        anno_backend,
        label_schema=label_schema,
        label_field=label_field,
        label_type=label_type,
        classes=classes,
        attributes=attributes,
    )

    # Don't allow overwriting an existing run with same `anno_key`
    anno_backend.register_run(samples, anno_key, overwrite=False)

    results = anno_backend.upload_annotations(
        samples, launch_editor=launch_editor
    )

    anno_backend.save_run_results(samples, anno_key, results)

    return results


def _parse_config(name, label_schema, media_field, **kwargs):
    if name is None:
        name = fo.annotation_config.default_backend

    backends = fo.annotation_config.backends

    if name not in backends:
        raise ValueError(
            "Unsupported backend '%s'. The available backends are %s"
            % (name, sorted(backends.keys()))
        )

    params = deepcopy(backends[name])

    config_cls = kwargs.pop("config_cls", None)

    if config_cls is None:
        config_cls = params.pop("config_cls", None)

    if config_cls is None:
        raise ValueError("Annotation backend '%s' has no `config_cls`" % name)

    if etau.is_str(config_cls):
        config_cls = etau.get_class(config_cls)

    params.update(**kwargs)
    return config_cls(name, label_schema, media_field=media_field, **params)


def _add_new_labels(
    samples, annotation_results, results, label_type, label_field, is_video
):
    fo_label_type = _LABEL_TYPES_MAP[label_type]
    if issubclass(fo_label_type, fol._LABEL_LIST_FIELDS):
        is_list = True
        list_field = fo_label_type._LABEL_LIST_FIELD
    else:
        is_list = False

    samples = samples.select_fields([])
    logger.info("Adding labels for '%s'..." % label_field)
    with fou.ProgressBar() as pb:
        for sample in pb(samples):
            sample_id = sample.id
            if sample_id in annotation_results:
                sample_annots = annotation_results[sample_id]
                if is_video:
                    images = sample.frames.values()
                else:
                    images = [sample]

                for image in images:
                    if is_video:
                        if image.id not in sample_annots:
                            continue

                        image_annots = sample_annots[image.id]
                    else:
                        image_annots = sample_annots

                    if is_list:
                        new_label = fo_label_type()
                        annot_list = list(image_annots.values())
                        new_label[list_field] = annot_list
                    elif not image_annots:
                        continue
                    else:
                        new_label = list(image_annots.values())[0]

                    image[label_field] = new_label

                sample.save()


def _merge_existing_labels(
    samples, annotation_results, results, label_type, label_field, is_video
):
    # Setting a label field, need to parse, add, delete, and merge labels
    annotation_label_ids = []
    for sample in annotation_results.values():
        if is_video:
            for frame in sample.values():
                annotation_label_ids.extend(list(frame.keys()))

        else:
            annotation_label_ids.extend(list(sample.keys()))

    sample_ids = list(annotation_results.keys())

    prev_label_ids = []
    for ids in results.id_map[label_field].values():
        if ids is None:
            continue

        if len(ids) > 0 and type(ids[0]) == list:
            for frame_ids in ids:
                prev_label_ids.extend(frame_ids)
        else:
            prev_label_ids.extend(ids)

    prev_ids = set(prev_label_ids)
    ann_ids = set(annotation_label_ids)
    deleted_labels = prev_ids - ann_ids
    added_labels = ann_ids - prev_ids
    labels_to_merge = ann_ids - deleted_labels - added_labels

    # Remove deleted labels
    deleted_view = samples.select_labels(ids=list(deleted_labels))
    samples._dataset.delete_labels(view=deleted_view, fields=label_field)

    if is_video and label_type in ("detections", "keypoints", "polylines"):
        tracking_index_map, max_tracking_index = _get_tracking_index_map(
            samples, label_field, annotation_results
        )
    else:
        tracking_index_map = {}
        max_tracking_index = 0

    # Add or merge remaining labels
    annotated_samples = samples._dataset.select(sample_ids).select_fields(
        [label_field]
    )

    logger.info("Merging labels for '%s'..." % label_field)
    added_id_map = {}
    with fou.ProgressBar() as pb:
        for sample in pb(annotated_samples):
            sample_id = sample.id
            formatted_label_field = label_field
            if is_video:
                formatted_label_field, _ = samples._handle_frame_field(
                    label_field
                )
                images = sample.frames.values()
            else:
                images = [sample]

            sample_annots = annotation_results[sample_id]
            for image in images:
                if is_video:
                    image_annots = sample_annots[image.id]
                else:
                    image_annots = sample_annots

                has_label_list = False
                image_label = image[formatted_label_field]

                if image_label is None:
                    # A previously unlabeled image is being labeled
                    # Or a singular label was deleted (e.g. classification)
                    # either in CVAT or FiftyOne
                    # TODO

                    # Update added_id_map, for singular labels adds list for
                    # videos for each frame
                    continue

                if isinstance(image_label, fol._HasLabelList):
                    has_label_list = True
                    list_field = image_label._LABEL_LIST_FIELD
                    labels = image_label[list_field]
                else:
                    labels = [image_label]

                # Merge label or labels that existed before and after
                # annotation
                for label in labels:
                    label_id = label.id
                    if label_id in labels_to_merge:
                        annot_label = image_annots[label_id]
                        if is_video and "index" in annot_label:
                            (
                                annot_label,
                                max_tracking_index,
                            ) = _update_tracking_index(
                                annot_label,
                                tracking_index_map[sample_id],
                                max_tracking_index,
                            )

                        for field in annot_label._fields_ordered:
                            if (
                                field in label._fields_ordered
                                and label[field] == annot_label[field]
                            ):
                                pass
                            else:
                                if field == "attributes":
                                    for (
                                        attr,
                                        val,
                                    ) in annot_label.attributes.items():
                                        label.attributes[attr] = val
                                else:
                                    label[field] = annot_label[field]

                # Add new labels for label list fields only
                # Non-list fields would have been deleted and replaced above
                if has_label_list:
                    for annot_label_id, annot_label in image_annots.items():
                        if annot_label_id in added_labels:
                            if is_video and "index" in annot_label:
                                (
                                    annot_label,
                                    max_tracking_index,
                                ) = _update_tracking_index(
                                    annot_label,
                                    tracking_index_map[sample_id],
                                    max_tracking_index,
                                )

                            labels.append(annot_label)

                            if sample.id not in added_id_map:
                                added_id_map[sample.id] = []
                            added_id_map[sample.id].append(annot_label.id)

            sample.save()

    return added_id_map


def _update_tracking_index(annot_label, sample_index_map, max_tracking_index):
    """Remaps the object tracking index of annotations to existing indices if
    possible. For new object tracks, the previous maximum index is used to
    assign a new index.
    """
    if annot_label.index in sample_index_map:
        annot_label.index = sample_index_map[annot_label.index]
    else:
        sample_index_map[annot_label.index] = max_tracking_index
        annot_label.index = max_tracking_index
        max_tracking_index += 1

    return annot_label, max_tracking_index


def load_annotations(samples, anno_key, cleanup=False, **kwargs):
    """Downloads the labels from the given annotation run from the annotation
    backend and merges them into the collection.

    See :ref:`this page <loading-annotations>` for more information about
    using this method to import annotations that you have scheduled by calling
    :func:`annotate`.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        anno_key: an annotation key
        cleanup (False): whether to delete any informtation regarding this run
            from the annotation backend after loading the annotations
        **kwargs: optional keyword arguments for
            :meth:`AnnotationResults.load_credentials`
    """
    results = samples.load_annotation_results(anno_key, **kwargs)
    backend = results.backend
    annotations = results.backend.download_annotations(results)

    if not annotations:
        logger.warning("No annotations found")
        return

    is_video = samples.media_type == fom.VIDEO

    label_schema = results.config.label_schema
    for label_field in label_schema:
        annotation_results = annotations.get(label_field, {})
        if not annotation_results:
            logger.info("No annotations found for field '%s'", label_field)
            continue

        label_info = label_schema[label_field]
        label_type = label_info["type"]
        existing_field = label_info["existing_field"]

        #
        # First add unexpected labels to new fields
        #
        for new_type, new_annotations in annotation_results.items():
            if new_type == label_type:
                continue

            new_field_name = input(
                "\nFound unexpected labels of type '%s' when loading "
                "annotations for field '%s'.\nPlease enter a new field "
                "name in which to store these annotations, or an empty "
                "name to skip them: " % (new_type, label_field)
            )
            while True:
                frame_fields = samples.get_frame_field_schema() or []
                fields = samples.get_field_schema() or []
                existing_field = (
                    new_field_name in frame_fields or new_field_name in fields
                )
                if existing_field:
                    new_field_name = input(
                        "\nField '%s' already exists.\nPlease enter a new "
                        "field name in which to store these annotations, "
                        "or an empty name to skip them: " % new_field_name
                    )
                else:
                    break

            if not new_field_name:
                logger.info(
                    "Skipping unexpected labels of type '%s' in field " "'%s'",
                    new_type,
                    label_field,
                )
                continue

            if is_video and not new_field_name.startswith("frames."):
                new_field_name = "frames." + new_field_name

            _add_new_labels(
                samples,
                new_annotations,
                results,
                new_type,
                new_field_name,
                is_video,
            )

        #
        # Now import expected labels into their appropriate fields
        #
        annotation_results = annotation_results[label_type]

        formatted_label_field = label_field
        if is_video and label_field.startswith("frames."):
            formatted_label_field = label_field[len("frames.") :]

        if not isinstance(list(annotation_results.values())[0], dict):
            # Only setting top-level sample or frame field, label parsing is
            # not required
            logger.info("Adding labels for '%s'..." % formatted_label_field)
            with fou.ProgressBar() as pb:
                for sample_id, value in pb(annotation_results.items()):
                    sample = samples[sample_id]
                    if type(value) == dict:
                        frame_ids = list(value.keys())
                        frames = samples.select_frames(frame_ids).first()
                        for frame in frames.values():
                            if frame.id in value:
                                frame_value = value[frame.id]
                                frame[formatted_label_field] = frame_value
                                frame.save()
                    else:
                        sample[label_field] = value
                        sample.save()

        elif not existing_field:
            _add_new_labels(
                samples,
                annotation_results,
                results,
                label_type,
                formatted_label_field,
                is_video,
            )

        else:
            added_id_map = _merge_existing_labels(
                samples,
                annotation_results,
                results,
                label_type,
                label_field,
                is_video,
            )

            # Update id map for loading future annotations
            results.id_map = results.backend.update_label_id_map(
                results.id_map, added_id_map, label_field,
            )

    # Store the id map updates in the database
    backend.save_run_results(samples, anno_key, results)

    if cleanup:
        results.cleanup()


def _get_tracking_index_map(samples, label_field, annotations):
    """Maps the object tracking indices of incoming annotations to existing
    indices for every sample. Also finds the absolute maximum index that is
    then used to assign new indices if needed in the future.

    The tracking_index_map is structured as follows::

        {
            "<sample-id>": {
                "<new-index>": "<existing-index>",
                ...
            },
            ...
        }
    """
    _, index_path = samples._get_label_field_path(label_field, "index")
    indices = samples.values(index_path, unwind=True)
    max_index = max([i for i in indices if i is not None]) + 1

    _, id_path = samples._get_label_field_path(label_field, "id")
    ids = samples.values(id_path, unwind=True)

    existing_index_map = dict(zip(ids, indices))
    tracking_index_map = {}
    for sid, sample_annots in annotations.items():
        if sid not in tracking_index_map:
            tracking_index_map[sid] = {}

        for fid, frame_annots in sample_annots.items():
            for lid, annot_label in frame_annots.items():
                if lid in existing_index_map:
                    tracking_index_map[sid][
                        annot_label.index
                    ] = existing_index_map[lid]

    return tracking_index_map, max_index


class AnnotationBackendConfig(foa.AnnotationRunConfig):
    """Base class for configuring an :class:`AnnotationBackend` instances.

    Args:
        name: the name of the backend
        label_schema: a dictionary containing the description of label fields,
            classes and attribute to annotate
        media_field ("filepath"): string field name containing the paths to
            media files on disk to upload
        **kwargs: any leftover keyword arguments after subclasses have done
            their parsing
    """

    def __init__(self, name, label_schema, media_field="filepath", **kwargs):
        self.name = name
        self.label_schema = label_schema
        self.media_field = media_field
        super().__init__(**kwargs)

    @property
    def method(self):
        """The name of the annotation backend."""
        return self.name


class AnnotationBackend(foa.AnnotationRun):
    """Base class for annotation backends."""

    @property
    def supported_label_types(self):
        """The set of supported label types supported by the backend."""
        raise NotImplementedError(
            "subclass must implement supported_label_types"
        )

    @property
    def supported_scalar_types(self):
        """The set of supported scalar field types supported by the backend."""
        raise NotImplementedError(
            "subclass must implement supported_label_types"
        )

    @property
    def supported_attr_types(self):
        """The list of attribute types supported by the backend."""
        raise NotImplementedError(
            "subclass must implement supported_attr_types"
        )

    @property
    def default_attr_type(self):
        """The default type for attributes with values of unspecified type."""
        raise NotImplementedError("subclass must implement default_attr_type")

    @property
    def default_categorical_attr_type(self):
        """The default type for attributes with categorical values."""
        raise NotImplementedError(
            "subclass must implement default_categorical_attr_type"
        )

    def requires_attr_values(self, attr_type):
        """Determines whether the list of possible values are required for
        attributes of the given type.

        Args:
            attr_type: the attribute type string

        Returns:
            True/False
        """
        raise NotImplementedError(
            "subclass must implement supported_attr_types"
        )

    def upload_annotations(self, samples, launch_editor=False):
        """Uploads the samples and relevant existing labels from the label
        schema to the annotation backend.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            launch_editor (False): whether to launch the annotation backend's
                editor after uploading the samples

        Returns:
            an :class:`AnnotationResults`
        """
        raise NotImplementedError(
            "subclass must implement upload_annotations()"
        )

    def download_annotations(self, results):
        """Downloads the annotations from the annotation backend for the given
        results.

        Args:
            results: an :class:`AnnotationResults`

        Returns:
            a tuple of

            -   **results**: a dictionary of annotations
            -   **additional_results**: a dictionary of additional annotations
        """
        raise NotImplementedError(
            "subclass must implement download_annotations()"
        )

    def build_label_id_map(self, samples):
        """Builds a label ID dictionary for the current label schema for the
        given collection.

        The dictionary is structured as follows::

            {
                "<label-field>": {
                    "<sample-id>": "<label-id>" or ["<label-id>", ...],
                    ...
                },
                ...
            }

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`

        Returns:
            a dict
        """
        id_map = {}
        for label_field, label_info in self.config.label_schema.items():
            if (
                not label_info["existing_field"]
                or label_info["type"] == "scalar"
            ):
                continue

            _, label_id_path = samples._get_label_field_path(label_field, "id")
            sample_ids, label_ids = samples.values(["id", label_id_path])
            id_map[label_field] = dict(zip(sample_ids, label_ids))

        return id_map

    def update_label_id_map(self, id_map, id_map_updates, label_field):
        """Updates a label ID dictionary adding in the given label ids.

        The dictionary is structured as follows::

            {
                "<label-field>": {
                    "<sample-id>": "<label-id>" or ["<label-id>", ...],
                    ...
                },
                ...
            }

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            id_map: a dict storing the sample id map to label ids for every
                label field
            id_map_updates: a dict storing the sample id map to newly added
                label ids for the given label field
            label_field: the name of the label field being updated

        Returns:
            a dict
        """
        for sample_id, label_ids in id_map_updates.items():
            if isinstance(label_ids, list):
                if id_map[label_field][sample_id] is None:
                    id_map[label_field][sample_id] = []

                id_map[label_field][sample_id] += label_ids

            elif label_ids is not None:
                # Set a single label id instead of list
                id_map[label_field][sample_id] = label_ids

        return id_map

    def get_fields(self, samples, anno_key):
        return list(self.config.label_schema.keys())

    def cleanup(self, samples, anno_key):
        pass


class AnnotationResults(foa.AnnotationResults):
    """Base class for storing the results of an annotation run.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        config: a :class:`AnnotationBackendConfig`
        backend (None): a :class:`AnnotationBackend`
    """

    def __init__(self, samples, config, backend=None):
        if backend is None:
            backend = config.build()

        self._samples = samples
        self._backend = backend
        self.config = config

    @property
    def backend(self):
        """The :class:`AnnotationBackend` for these results."""
        return self._backend

    def load_credentials(self, **kwargs):
        """Loads any credentials from the given keyword arguments or the
        FiftyOne annotation config.

        Args:
            **kwargs: subclass-specific credentials
        """
        raise NotImplementedError("subclass must implement load_credentials()")

    def cleanup(self):
        """Deletes all information for this run from the annotation backend."""
        raise NotImplementedError("subclass must implement cleanup()")

    def _load_config_parameters(self, **kwargs):
        config = self._backend.config

        # make sure `config` and `_backend.config` are in-sync
        self.config = config

        parameters = fo.annotation_config.backends.get(config.name, {})

        for name, value in kwargs.items():
            if value is None:
                value = parameters.get(name, None)

            if value is not None:
                setattr(config, name, value)


class AnnotationAPI(object):
    """Base class for APIs that connect to annotation backend."""

    def _prompt_username_password(self, name, username=None, password=None):
        prefix = "FIFTYONE_%s_" % name.upper()
        logger.info(
            "Please enter your login credentials.\nYou can avoid this in the "
            "future by setting your `%sUSERNAME` and/or `%sPASSWORD` "
            "environment variables",
            prefix,
            prefix,
        )

        if username is None:
            username = input("Username: ")

        if password is None:
            password = getpass.getpass(prompt="Password: ")

        return username, password

    def _prompt_api_key(self, name):
        prefix = "FIFTYONE_%s_" % name.upper()
        logger.info(
            "Please enter your API key.\nYou can avoid this in the future by "
            "setting your `%sKEY` environment variable",
            prefix,
        )

        return getpass.getpass(prompt="API key: ")


#
# @todo: the default values for the fields customized in `__init__()` below are
# incorrect in the generated docstring
#
class DrawConfig(etaa.AnnotationConfig):
    """.. autoclass:: eta.core.annotations.AnnotationConfig"""

    __doc__ = etaa.AnnotationConfig.__doc__

    def __init__(self, d):
        #
        # Assume that the user is likely comparing multiple sets of labels,
        # e.g.., ground truth vs predicted, and therefore would prefer that
        # labels have one color per field rather than different colors for each
        # label
        #
        if "per_object_label_colors" not in d:
            d["per_object_label_colors"] = False

        if "per_polyline_label_colors" not in d:
            d["per_polyline_label_colors"] = False

        if "per_keypoints_label_colors" not in d:
            d["per_keypoints_label_colors"] = False

        super().__init__(d)


def draw_labeled_images(samples, output_dir, label_fields=None, config=None):
    """Renders annotated versions of the images in the collection with the
    specified label data overlaid to the given directory.

    The filenames of the sample images are maintained, unless a name conflict
    would occur in ``output_dir``, in which case an index of the form
    ``"-%d" % count`` is appended to the base filename.

    The images are written in format ``fo.config.default_image_ext``.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        output_dir: the directory to write the annotated images
        label_fields (None): a list of :class:`fiftyone.core.labels.ImageLabel`
            fields to render. If omitted, all compatiable fields are rendered
        config (None): an optional :class:`DrawConfig` configuring how to draw
            the labels

    Returns:
        the list of paths to the labeled images
    """
    if config is None:
        config = DrawConfig.default()

    filename_maker = fou.UniqueFilenameMaker(output_dir=output_dir)
    output_ext = fo.config.default_image_ext

    outpaths = []
    for sample in samples.iter_samples(progress=True):
        outpath = filename_maker.get_output_path(
            sample.filepath, output_ext=output_ext
        )
        draw_labeled_image(
            sample, outpath, label_fields=label_fields, config=config
        )
        outpaths.append(outpath)

    return outpaths


def draw_labeled_image(sample, outpath, label_fields=None, config=None):
    """Renders an annotated version of the sample's image with the specified
    label data overlaid to disk.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample`
        outpath: the path to write the annotated image
        label_fields (None): a list of :class:`fiftyone.core.labels.ImageLabel`
            fields to render. If omitted, all compatiable fields are rendered
        config (None): an optional :class:`DrawConfig` configuring how to draw
            the labels
    """
    if config is None:
        config = DrawConfig.default()

    img = etai.read(sample.filepath)
    frame_labels = _to_frame_labels(sample, label_fields=label_fields)

    anno_img = etaa.annotate_image(img, frame_labels, annotation_config=config)
    etai.write(anno_img, outpath)


def draw_labeled_videos(samples, output_dir, label_fields=None, config=None):
    """Renders annotated versions of the videos in the collection with the
    specified label data overlaid to the given directory.

    The filenames of the videos are maintained, unless a name conflict would
    occur in ``output_dir``, in which case an index of the form
    ``"-%d" % count`` is appended to the base filename.

    The videos are written in format ``fo.config.default_video_ext``.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        output_dir: the directory to write the annotated videos
        label_fields (None): a list of :class:`fiftyone.core.labels.ImageLabel`
            fields on the frames of the samples to render. If omitted, all
            compatiable fields are rendered
        config (None): an optional :class:`DrawConfig` configuring how to draw
            the labels

    Returns:
        the list of paths to the labeled videos
    """
    if config is None:
        config = DrawConfig.default()

    filename_maker = fou.UniqueFilenameMaker(output_dir=output_dir)
    output_ext = fo.config.default_video_ext

    outpaths = []
    for sample in samples.iter_samples(progress=True):
        outpath = filename_maker.get_output_path(
            sample.filepath, output_ext=output_ext
        )
        draw_labeled_video(
            sample, outpath, label_fields=label_fields, config=config
        )
        outpaths.append(outpath)

    return outpaths


def draw_labeled_video(sample, outpath, label_fields=None, config=None):
    """Renders an annotated version of the sample's video with the specified
    label data overlaid to disk.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample`
        outpath: the path to write the annotated image
        label_fields (None): a list of :class:`fiftyone.core.labels.ImageLabel`
            fields on the frames of the sample to render. If omitted, all
            compatiable fields are rendered
        config (None): an optional :class:`DrawConfig` configuring how to draw
            the labels
    """
    if config is None:
        config = DrawConfig.default()

    video_path = sample.filepath
    video_labels = _to_video_labels(sample, label_fields=label_fields)

    etaa.annotate_video(
        video_path, video_labels, outpath, annotation_config=config
    )


def _to_frame_labels(sample_or_frame, label_fields=None):
    frame_labels = etaf.FrameLabels()

    if label_fields is None:
        for name, field in sample_or_frame.iter_fields():
            if isinstance(field, fol.ImageLabel):
                frame_labels.merge_labels(field.to_image_labels(name=name))
    else:
        for name in label_fields:
            label = sample_or_frame[name]
            if label is not None:
                frame_labels.merge_labels(label.to_image_labels(name=name))

    return frame_labels


def _to_video_labels(sample, label_fields=None):
    video_labels = etav.VideoLabels()
    for frame_number, frame in sample.frames.items():
        video_labels[frame_number] = _to_frame_labels(
            frame, label_fields=label_fields
        )

    return video_labels


_LABEL_TYPES_MAP = {
    "classification": fol.Classification,
    "classifications": fol.Classifications,
    "detection": fol.Detection,
    "detections": fol.Detections,
    "keypoint": fol.Keypoint,
    "keypoints": fol.Keypoints,
    "polyline": fol.Polyline,
    "polylines": fol.Polylines,
}

_LABEL_TYPES_MAP_REV = {v: k for k, v in _LABEL_TYPES_MAP.items()}


def _build_label_schema(
    samples,
    backend,
    label_schema=None,
    label_field=None,
    label_type=None,
    classes=None,
    attributes=None,
):
    if label_schema is None and label_field is None:
        raise ValueError("Either `label_schema` or `label_field` is required")

    if label_schema is None:
        label_schema = _init_label_schema(
            label_field, label_type, classes, attributes
        )
    elif isinstance(label_schema, list):
        label_schema = {lf: {} for lf in label_schema}

    _label_schema = {}
    for _label_field, _label_info in label_schema.items():
        _label_type, _existing_field = _get_label_type(
            samples, backend, label_type, _label_field, _label_info
        )

        _classes = _get_classes(
            samples,
            classes,
            _label_field,
            _label_info,
            _existing_field,
            _label_type,
        )

        if _label_type != "scalar":
            _attributes = _get_attributes(
                samples,
                backend,
                attributes,
                _label_field,
                _label_info,
                _existing_field,
                _label_type,
            )
        else:
            _attributes = {}

        _label_schema[_label_field] = {
            "type": _label_type,
            "classes": _classes,
            "attributes": _attributes,
            "existing_field": _existing_field,
        }

    return _label_schema


def _init_label_schema(label_field, label_type, classes, attributes):
    d = {}

    if label_type is not None:
        d["type"] = label_type

    if classes is not None:
        d["classes"] = classes

    if attributes not in (True, False, None):
        d["attributes"] = attributes

    return {label_field: d}


def _get_label_type(
    samples, backend, label_type, label_field, label_info,
):
    if "type" in label_info:
        label_type = label_info["type"]

    field, is_frame_field = samples._handle_frame_field(label_field)

    if is_frame_field:
        schema = samples.get_frame_field_schema()
    else:
        schema = samples.get_field_schema()

    if field in schema:
        field_type = schema[field]
        _label_type = _get_existing_label_type(
            backend, label_field, field_type
        )

        if label_type is not None and _label_type != label_type:
            raise ValueError(
                "Manually reported label type '%s' for existing field '%s' "
                "does not match its actual type '%s'"
                % (_label_type, label_field, label_type)
            )

        return _label_type, True

    if label_type is None:
        raise ValueError(
            "You must specify the type of new label field '%s'" % label_field
        )

    if label_type != "scalar":
        fo_label_type = _LABEL_TYPES_MAP[label_type]
        if fo_label_type not in backend.supported_label_types:
            raise ValueError(
                "Unsupported label type '%s'. Supported values are %s"
                % (fo_label_type, backend.supported_label_types)
            )

    return label_type, False


def _get_existing_label_type(backend, label_field, field_type):
    if isinstance(field_type, fof.EmbeddedDocumentField):
        fo_label_type = field_type.document_type
        if fo_label_type not in backend.supported_label_types:
            raise ValueError(
                "Field '%s' has unsupported label type %s. Supported "
                "label types are %s"
                % (label_field, fo_label_type, backend.supported_label_types,)
            )

        return _LABEL_TYPES_MAP_REV[fo_label_type]

    if type(field_type) not in backend.supported_scalar_types:
        raise TypeError(
            "Field '%s' has unsupported type %s. Supported label types "
            "are %s and supported scalar types are %s"
            % (
                label_field,
                field_type,
                backend.supported_label_types,
                backend.supported_scalar_types,
            )
        )

    return "scalar"


def _get_classes(
    samples, classes, label_field, label_info, existing_field, label_type
):
    if "classes" in label_info:
        return label_info["classes"]

    if classes:
        return classes

    if label_type == "scalar":
        return []

    if not existing_field:
        raise ValueError(
            "You must provide a class list for new label field '%s'"
            % label_field
        )

    if label_field in samples.classes:
        return samples.classes[label_field]

    if samples.default_classes:
        return samples.default_classes

    _, label_path = samples._get_label_field_path(label_field, "label")
    return samples._dataset.distinct(label_path)


def _get_attributes(
    samples,
    backend,
    attributes,
    label_field,
    label_info,
    existing_field,
    label_type,
):
    if "attributes" in label_info:
        attributes = label_info["attributes"]

    if attributes in [True, False, None]:
        if label_type == "scalar":
            attributes = {}
        elif existing_field and attributes == True:
            attributes = _get_label_attributes(samples, backend, label_field)
        else:
            attributes = {}

    return _format_attributes(backend, attributes)


def _get_label_attributes(samples, backend, label_field):
    _, label_path = samples._get_label_field_path(label_field)
    labels = samples.values(label_path, unwind=True)

    attributes = {}
    for label in labels:
        for name, _ in label.iter_attributes():
            if name not in attributes:
                attributes[name] = {"type": backend.default_attr_type}

    return attributes


def _format_attributes(backend, attributes):
    if etau.is_str(attributes):
        attributes = [attributes]

    if isinstance(attributes, list):
        attributes = {a: {} for a in attributes}

    output_attrs = {}
    for attr, attr_info in attributes.items():
        formatted_info = {}

        attr_type = attr_info.get("type", None)
        values = attr_info.get("values", None)
        default = attr_info.get("default", None)

        if attr_type is None:
            if values is None:
                formatted_info["type"] = backend.default_attr_type
            else:
                formatted_info["type"] = backend.default_categorical_attr_type
                formatted_info["values"] = values
                if default not in (None, "") and default in values:
                    formatted_info["default"] = default
        else:
            if attr_type in backend.supported_attr_types:
                formatted_info["type"] = attr_type
            else:
                raise ValueError(
                    "Attribute type '%s' is not supported by backend '%s'"
                    % (attr_type, backend.config.name)
                )

            if values is not None:
                formatted_info["values"] = values
            elif backend.requires_attr_values(attr_type):
                raise ValueError(
                    "Attribute type '%s' requires a list of values" % attr_type
                )

            if default not in (None, ""):
                if values is not None and default not in values:
                    raise ValueError(
                        "Default value '%s' does not appear in list of "
                        "values '%s'" % (default, ", ".join(values))
                    )

                formatted_info["default"] = default

        output_attrs[attr] = formatted_info

    return output_attrs
