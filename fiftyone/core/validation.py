"""
Validation utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.utils as etau

import fiftyone.core.media as fom
import fiftyone.core.utils as fou

foc = fou.lazy_import("fiftyone.core.collections")
fov = fou.lazy_import("fiftyone.core.video")


def validate_image_sample(sample):
    """Validates that the sample's media is an image.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample`

    Raises:
        ValueError if the sample's media is not an image
    """
    if sample.media_type != fom.IMAGE:
        raise ValueError(
            "Expected media type '%s' but found '%s' for filepath '%s'"
            % (fom.IMAGE, sample.media_type, sample.filepath)
        )

    if isinstance(sample, fov.FrameView):
        _validate_image(sample.filepath)


def validate_video_sample(sample):
    """Validates that the sample's media is a video.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample`

    Raises:
        ValueError if the sample's media is not a video
    """
    if sample.media_type != fom.VIDEO:
        raise ValueError(
            "Expected media type '%s' but found '%s' for filepath '%s'"
            % (fom.VIDEO, sample.media_type, sample.filepath)
        )


def validate_collection(sample_collection):
    """Validates that the provided samples are a
    :class:`fiftyone.core.collections.SampleCollection`.

    Args:
        sample_collection: a sample collection

    Raises:
        ValueError: if ``samples`` is not a
        :class:`fiftyone.core.collections.SampleCollection`
    """
    if not isinstance(sample_collection, foc.SampleCollection):
        raise ValueError(
            "Expected samples to be a %s; found %s"
            % (foc.SampleCollection, sample_collection.__class__)
        )


def validate_image_collection(sample_collection):
    """Validates that the provided samples are an image
    :class:`fiftyone.core.collections.SampleCollection`.

    Args:
        sample_collection: a sample collection

    Raises:
        ValueError: if ``samples`` is not an image
        :class:`fiftyone.core.collections.SampleCollection`
    """
    validate_collection(sample_collection)

    if sample_collection.media_type != fom.IMAGE:
        raise ValueError(
            "Expected collection to have media type %s; found %s"
            % (fom.IMAGE, sample_collection.media_type)
        )

    if sample_collection._dataset._is_frames:
        try:
            filepath = sample_collection[:1].values("filepath")[0]
        except:
            return  # empty

        _validate_image(filepath)


def validate_video_collection(sample_collection):
    """Validates that the provided samples are a video
    :class:`fiftyone.core.collections.SampleCollection`.

    Args:
        sample_collection: a sample collection

    Raises:
        ValueError: if ``samples`` is not a video
        :class:`fiftyone.core.collections.SampleCollection`
    """
    validate_collection(sample_collection)

    if sample_collection.media_type != fom.VIDEO:
        raise ValueError(
            "Expected collection to have media type %s; found %s"
            % (fom.VIDEO, sample_collection.media_type)
        )


def validate_collection_label_fields(
    sample_collection, field_names, allowed_label_types, same_type=False
):
    """Validates that the :class:`fiftyone.core.collections.SampleCollection`
    has fields with the specified :class:`fiftyone.core.labels.Label` types.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        field_names: a field name or iterable of field names
        allowed_label_types: a :class:`fiftyone.core.labels.Label` type or
            iterable of allowed :class:`fiftyone.core.labels.Label` types
        same_type (False): whether to enforce that all fields have same type.
            This condition is enforced separately for sample- and frame-level
            fields

    Raises:
        ValueError if the required conditions are not met
    """
    validate_collection(sample_collection)

    if etau.is_str(field_names):
        field_names = [field_names]

    if not etau.is_container(allowed_label_types):
        allowed_label_types = [allowed_label_types]

    if sample_collection.media_type == fom.VIDEO:
        sample_fields, frame_fields = fou.split_frame_fields(field_names)
    else:
        sample_fields = field_names
        frame_fields = []

    if frame_fields:
        _validate_fields(
            sample_collection,
            frame_fields,
            allowed_label_types,
            same_type,
            frames=True,
        )

    if sample_fields:
        _validate_fields(
            sample_collection,
            sample_fields,
            allowed_label_types,
            same_type,
        )


def _validate_image(filepath):
    actual_media_type = fom.get_media_type(filepath)
    if actual_media_type != fom.IMAGE:
        raise ValueError(
            "The requested operation requires samples whose filepaths are "
            "images, but we found a sample whose filepath '%s' has media type "
            "'%s'.\n\nIf you are working with a frames view that was created "
            "via `to_frames(..., sample_frames=False)`, then re-create the "
            "view without `sample_frames=False` so that the necessary images "
            "will be available." % (filepath, actual_media_type)
        )


def _validate_fields(
    sample_collection,
    field_names,
    allowed_label_types,
    same_type,
    frames=False,
):
    if frames:
        schema = sample_collection.get_frame_field_schema()
    else:
        schema = sample_collection.get_field_schema()

    label_types = {}
    for field_name in field_names:
        if field_name not in schema:
            ftype = "frame field" if frames else "sample field"
            raise ValueError(
                "%s has no %s '%s'"
                % (sample_collection.__class__.__name__, ftype, field_name)
            )

        field = schema[field_name]

        try:
            label_type = field.document_type
        except:
            label_type = field

        if label_type not in allowed_label_types:
            ftype = "Frame field" if frames else "Sample field"
            raise ValueError(
                "%s '%s' is not a %s instance; found %s"
                % (ftype, field_name, allowed_label_types, label_type)
            )

        label_types[field_name] = label_type

    if same_type and len(set(label_types.values())) > 1:
        ftype = "Frame fields" if frames else "Sample fields"
        raise ValueError(
            "%s %s must have the same type; found %s"
            % (ftype, field_names, label_types)
        )


def get_field(sample, field_name, allowed_types=None, allow_none=True):
    """Gets the given sample field and optionally validates its type and value.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample`
        field_name: the name of the field to get
        allowed_types (None): an optional iterable of
            :class:`fiftyone.core.labels.Label` types to enforce that the field
            value has
        allow_none (True): whether to allow the field to be None

    Returns:
        the field value

    Raises:
        ValueError if the field does not exist or does not meet the specified
        criteria
    """
    try:
        value = sample[field_name]
    except KeyError:
        raise ValueError(
            "Sample '%s' has no field '%s'" % (sample.id, field_name)
        )

    if not allow_none and value is None:
        raise ValueError(
            "Sample '%s' field '%s' is None" % (sample.id, field_name)
        )

    if allowed_types is not None:
        field_type = type(value)
        if field_type not in allowed_types:
            raise ValueError(
                "Sample '%s' field '%s' is not a %s instance; found %s"
                % (sample.id, field_name, allowed_types, field_type)
            )

    return value


def get_fields(
    sample, field_names, allowed_types=None, same_type=False, allow_none=True
):
    """Gets the given sample fields and optionally validates their types and
    values.

    Args:
        sample: a :class:`fiftyone.core.sample.Sample`
        field_names: an iterable of field names to get
        allowed_types (None): an optional iterable of
            :class:`fiftyone.core.labels.Label` types to enforce that the
            field values have
        same_type (False): whether to enforce that all fields have same type
        allow_none (True): whether to allow the fields to be None

    Returns:
        a tuple of field values

    Raises:
        ValueError if a field does not exist or does not meet the specified
        criteria
    """
    label_types = {}
    values = []
    for field_name in field_names:
        value = get_field(
            sample,
            field_name,
            allowed_types=allowed_types,
            allow_none=allow_none,
        )

        if same_type:
            label_types[field_name] = type(value)
            values.append(value)

    if same_type and len(set(label_types.values())) > 1:
        raise ValueError(
            "Sample '%s' fields %s must have the same type; found %s"
            % (sample.id, field_names, label_types)
        )

    return tuple(values)
