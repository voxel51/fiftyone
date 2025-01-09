"""
Plotting utils.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import warnings

import numpy as np
import sklearn.linear_model as skl
import sklearn.metrics as skm

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.expressions as foe
import fiftyone.core.labels as fol


def parse_scatter_inputs(
    points,
    samples=None,
    ids=None,
    link_field=None,
    labels=None,
    sizes=None,
    edges=None,
    classes=None,
):
    points = np.asarray(points)
    num_dims = points.shape[1]

    if ids is None and samples is not None:
        if num_dims != 2:
            msg = "Interactive selection is only supported in 2D"
            warnings.warn(msg)
        else:
            ids = _get_ids(samples, link_field=link_field, ref=points)

    labels = _parse_values(
        labels,
        "labels",
        samples=samples,
        ids=ids,
        link_field=link_field,
        ref=points,
    )

    sizes = _parse_values(
        sizes,
        "sizes",
        samples=samples,
        ids=ids,
        link_field=link_field,
        ref=points,
    )

    if ids is not None:
        ids = np.asarray(ids)

    if sizes is not None:
        sizes = np.asarray(sizes)

    if edges is not None:
        edges = np.asarray(edges)

    if labels is None:
        return points, ids, None, sizes, edges, None, False

    labels = np.asarray(labels)

    if not etau.is_str(labels[0]):
        return points, ids, labels, sizes, edges, None, False

    if classes is None:
        classes = sorted(set(labels))
        return points, ids, labels, sizes, edges, classes, True

    found = np.array([l in classes for l in labels])
    if not np.all(found):
        points = points[found, :]
        labels = labels[found]

        if sizes is not None:
            sizes = sizes[found]

        if ids is not None:
            ids = ids[found]

        if edges is not None:
            i = set(np.nonzero(found)[0])
            edges = np.array([e for e in edges if e[0] in i and e[1] in i])

    return points, ids, labels, sizes, edges, classes, True


def parse_locations(locations, samples, ids=None):
    if locations is not None and not etau.is_str(locations):
        return np.asarray(locations)

    if samples is None:
        raise ValueError(
            "You must provide `samples` in order to extract `locations` from "
            "your dataset"
        )

    if locations is None:
        location_field = samples._get_geo_location_field()
    else:
        location_field = locations
        samples.validate_field_type(
            location_field, embedded_doc_type=fol.GeoLocation
        )

    path = location_field + ".point.coordinates"
    if ids is not None:
        locations = samples._get_values_by_id(path, ids)
    else:
        locations = samples.values(path)

    return np.asarray(locations)


def parse_lines_inputs(
    x=None,
    y=None,
    samples=None,
    ids=None,
    link_field=None,
    labels=None,
    sizes=None,
):
    if y is None:
        raise ValueError("You must provide 'y' values")

    raw_y_values = not (etau.is_str(y) or _is_expr(y))

    if raw_y_values:
        is_frames = y and etau.is_container(y[0])
    elif samples is not None and samples._contains_videos():
        is_frames = foe.is_frames_expr(y)
    else:
        is_frames = False

    if is_frames and link_field is None:
        link_field = "frames"

    if ids is None and samples is not None:
        ref = y if raw_y_values else None
        ids = _get_ids(
            samples, link_field=link_field, ref=ref, is_frames=is_frames
        )

    x = _parse_values(
        x,
        "x",
        samples=samples,
        ids=ids,
        link_field=link_field,
        is_frames=is_frames,
    )

    y = _parse_values(
        y,
        "y",
        samples=samples,
        ids=ids,
        link_field=link_field,
        is_frames=is_frames,
    )

    sizes = _parse_values(
        sizes,
        "sizes",
        samples=samples,
        ids=ids,
        link_field=link_field,
        ref=y,
        is_frames=is_frames,
    )

    if x is None:
        if is_frames:
            x = [np.arange(1, len(yi) + 1) for yi in y]
        else:
            x = np.arange(1, len(y) + 1)

    if is_frames and x and not etau.is_container(x[0]):
        x = [x] * len(y)

    if is_frames:
        if sizes is None:
            sizes = [None] * len(y)

        if ids is None:
            ids = [None] * len(y)

        if labels is None:
            labels = [str(i) for i in range(1, len(y) + 1)]
        else:
            labels = _parse_values(labels, "labels", samples=samples)
    else:
        x = [x]
        y = [y]
        ids = [ids]
        sizes = [sizes]
        labels = [labels]

    return x, y, ids, link_field, labels, sizes, is_frames


def best_fit_line(points, label=None):
    x = points[:, 0]
    y = points[:, 1]

    model = skl.LinearRegression()
    model.fit(x[:, np.newaxis], y)

    xline = np.array([x.min(), x.max()])
    yline = model.predict(xline[:, np.newaxis])

    if label is None:
        r2_score = skm.r2_score(x, y, sample_weight=None)
        label = "r^2: %0.3f" % r2_score

    return xline, yline, label


def _is_expr(arg):
    return isinstance(arg, (foe.ViewExpression, dict))


def _parse_values(
    values,
    parameter,
    samples=None,
    ids=None,
    link_field=None,
    ref=None,
    is_frames=False,
):
    if values is None:
        return None

    if etau.is_str(values) or isinstance(values, foe.ViewExpression):
        if samples is None:
            raise ValueError(
                "You must provide `samples` in order to extract field values "
                "for the `%s` parameter" % parameter
            )

        if ids is not None and not is_frames:
            values = samples._get_values_by_id(
                values, ids, link_field=link_field
            )
        else:
            values = samples.values(values)

    if is_frames:
        values = [_unwind_values(v) for v in values]
    else:
        values = _unwind_values(values)

    if ref is not None:
        _validate_values(values, ref, parameter, is_frames=is_frames)

    return values


def _get_ids(samples, link_field=None, ref=None, is_frames=False):
    if link_field is None:
        ids = samples.values("id")
        ptype = "sample"
    elif link_field == "frames":
        ids = samples.values("frames.id")
        ptype = "frame"
    else:
        _, id_path = samples._get_label_field_path(link_field, "id")
        ids = samples.values(id_path)
        ptype = "label"

    if is_frames:
        ids = [_unwind_values(_ids) for _ids in ids]
    else:
        ids = _unwind_values(ids)

    if ref is not None:
        values_type = "%s IDs" % ptype
        _validate_values(ids, ref, values_type, is_frames=is_frames)

    return ids


def _unwind_values(values):
    if values is None:
        return None

    while any(etau.is_container(v) for v in values):
        values = list(itertools.chain.from_iterable(v for v in values if v))

    return np.array(values)


def _validate_values(values, ref, values_type, is_frames=False):
    if not is_frames:
        if len(values) != len(ref):
            raise ValueError(
                "Inconsistent number of %s (%d != %d). You may have missing "
                "data/labels that you need to omit from your view"
                % (values_type, len(values), len(ref))
            )

        return

    if len(values) != len(ref):
        raise ValueError(
            "Inconsistent number of %s traces (%d != %d). You may have "
            "missing data/labels that you need to omit from your view"
            % (values_type, len(values), len(ref))
        )

    for idx, (_values, _ref) in enumerate(zip(values, ref), 1):
        if len(_values) != len(_ref):
            raise ValueError(
                "Inconsistent number of %s (%d != %d) in trace %d/%d. You may "
                "have missing data/labels that you need to omit from your view"
                % (values_type, len(_values), len(_ref), idx, len(values))
            )


def load_button_icon(name):
    return load_icon(_BUTTON_ICONS[name])


def load_icon(icon_bytes):
    alpha = etas.deserialize_numpy_array(icon_bytes)
    h, w = alpha.shape
    img = np.zeros((h, w, 4), dtype=alpha.dtype)
    img[:, :, -1] = alpha
    return img


def serialize_icon(img):
    if img.shape[2] < 4 or np.any(img[:, :, :-1] > 0):
        raise ValueError("Image must be alpha-only")

    alpha = img[:, :, -1]
    return etas.serialize_numpy_array(alpha)


def pad_icon(img, pad, fill=0):
    h, w, c = img.shape[:3]
    img_pad = np.full((h + 2 * pad, w + 2 * pad, c), fill, dtype=img.dtype)
    img_pad[pad : (pad + h), pad : (pad + w), :] = img
    return img_pad


# Original images from https://www.iconfinder.com
_BUTTON_ICONS = {
    "map": "eJztk79LG2Ech9+jcgdddFKaLDcYTiWNuCTQVeymyWCGTiXEJEdbGklMl7aT4FKERAeJk/4Dpd1bx3avm0bQrFl00Io/+nr33q/3vfu+74VS6PI+w4V88+QZPiHbS8XFwgsFvUPvjZVKs9wwnunGh9ackdaNar2x1ii9fVlvrFTs+/PSm2bFujfN0mrFej+Vy6b1XHY6rX/U/5LHSCL5LxQ3ng7lZQoTMUbqBGN8+iS2lPqK8eWCyBjbvMM2v9vi2tjmja0d8Y0Rc4A9rjuJITyuMn+Iabg1yuOU7AFCgDXGA0vuALG1kCccAF+R5xlcowfltIIB7rtl8qpWqdpWEvBegS1qgINZtOw6aq0fqsEeZ4BeXkGUw9ZmuJ6HUvUHuGhq9oV26BoWeA7r/gA7486FdbRwjePZnLvKN//vHHbYGt9DyDGOlxTEdzTTq4k9cvihUhfo99FMctwTe+SwjITOsJ5syZZsyZZsyZZsyRZB3ScnU4tpqT/jWkr+GDv02RrP4zuZ7ziAqXG8c15rvHuPGfo1NcZbh1ta6wJH8GugN6gqUEsp9Dzj5tPM1rVfO3NqoDeKENCaPfC//GXSOifDNY4Xbb3e/eMZv+bdDxIdpkZey4AXbvkMao+Cj5gaeV6BHtiKDEDXRF60FR0ArkEe24IGgGo8L2jBA7i1dlATeehINEC4div2Fi6tAVLCEql9tlK9OG+ikIkt2aQ3ikN5Esk/5wFTASSi",
    "sync": "eJztll9IU1Ecx28u7zWVCp1BS2tPbtP1UISDIIIeon8zJ/2hBwnJifRHZTezKImQ2V5FEgwpIoIKzTR76yGSWAZFT6EvZS77o840N/8s9XbVc86uu+fcc67tKfZ92u73y+ee39nvd86aCo87i06t4S5xVy1lbvGMx7LbbLlWs8NiN1vKqzwXPaWVp6s8Ze7F5/tLz4tu+blYUVrtlr9bHQV2s6PAZjfXmVepVC6hhBKKkcEhtvYMBCML4UDv/Zo9PDLyusOhLis7iC9un5BWKPTkpLCMWjLGWWFGb1DCKNiwSTa7l790MpHSfGEcaVFhbzoHzEkWlCtAIi0q4ISf6KSU21okpaio7A+sKCrL+oUZRWNZh5Xheb/XlZ/BJ623FTX0LuhkZStXNVhrUno5dd/1sFIUezVSnqyyxXF2Vks09yADF9j8nJXlQqmIW2XKM6hjv9JRi4YPqlETsSRNlg+t6oDa7FajNFhZqAZ1gRyHG1Ayy4u2HeeG1CjybPPwkBnG/oJdalYHkVUMI+VY2zoeixrLJbLaQWRQ1aIA1jm5osAOMmrtbxCqJUaY5QCoeRM9S5MIWP5/R3GtgOWNA6sHsFxxYA0AVn4cWLBTsY2qUxHA4unR+LN2vpgOP8vDWnprtC1NwYQN5+ndezBybTgP9kQxG0qYBgOOM2GvNrCx9oH4DM70APMNG6sJxPtxJprtLSwoHl7v93CuAd4zl1lYJfAYO4G124AbYOiwpI/wREzH+uiiraCz3DDbivf5UeCPZtJQWXC3FuyERD182UMaC26H9JSUyERXIKXKKpibIw8Jumz/HNZCOedgrpkcSkV/5KY0YIemYGpoo8YbCyW0srOkTFkEhY5orZ5rRjnpkREX2HA3mmjURHHC+2g0eE6ItQ0l36L+a8L9jmT6HA1LQ1dylF7mhT6F2ZdFQXFc7k9FXpp/e/PYdqMgGG2u668iSiewlYqSYcqVEdW/jQEll/mOjuqlF7gs4RYN1ajj4nMOaJG+HmUnyUqtnySRZn1pulCyMm6M4EhjPqYjPFbJhY9/rQSF2kt0rwnJsKu65eWnkdmZH/3+O5V7160alFBC/63+Asl9Dog=",
    "disconnect": "eJztmG9IE2Ecx28ribQ/qGQUledGTHFSYWpYRilYUYqCRoYh1i6tLG2rREosaC8Mk2gQlI2cK6NQ8nUJ0ZtSiBaCEigpkdpfnTqkctu16e+5u9nzPHc4e7fvu/t+v8/n7rk9z90xS25hTl6RirnEXNYZONMJoy6d1V25uE2nZ3UnK40XjKXnSiqNBs7vZ5dWmDifbyovreJ8x/FpqXo2LTVBz9ayC1Q4E1JIIf1vxZjs9vNrFgV1dIr3afLwIqAOeflZebKDRqk/8qAPqmBZKbygLcGyCkVWXrCsIyKrYAHDUzumXG0aMkvb7ppxHFSEOubxD/wWR2Jpv8/+rEUKUAfccyOfkljtc0d/smRRm50wcorEcsHhWJwMKuwdGumUY/HdS+msq8LIFhLrmWDUUFGaX6g3up7ESvYgY3ojjfUY1b4mMCQWwwmOjYKKR6ecTkYWbq3WI8etwXP8uoNKnGDh9tCSN8i6RUSFT0DluehtF1lJgpk4A9bPZSQWugZPouipBxCqT9K8h8wcEssOhTapuQ/uoTtTYmrRjb1PYo1AITPALZyd+Xh+gNkJ1SECKhbyUXWgH11htZ6JCvTK0CTX4Vm5EDeTrlsiLWLtx+cmiMsUsJgfUD6Ljxsh3qWE9RrK9fjYBjGrhNUG5SZ8/ATiaCWsB1B+iI9bIY5RwkJrkbC970JM2bCiOqBswcc3IN6thPUWymZ8fBpigwKUaoJezoLYqoClR2s1A5/HQDyogFUJXW8kodALhR3yrC6oOkgFCxSIDxJBwhQbSI09UPi9QY71CLHSSQ3VEDRaZFAp6FHYT+7UotPRvxXC0OLiq8mlyEnojFD30U2EGltJaZlRqzuCXBLftXW0M674jGovV5E6JW7UGVxOYzEFwjkd+E8idZ3Q4HOpKIZpEZrOYkzMvhBRssswok8sv5q/2aKvT4tpD32Gfmm+iHW+69RaIQjba3VJouFNsiiG2erkpeq115YXH6+63ekKsMeT5El+2Cgvq2FlKN80e+VQPbEKUb6Pp2Y6qkn+tkuU/4lMGpJbV/MVcc2JJ43VLeD/pNU1A/+S+quJe0tGOxvfe0WO19FAfPQpUlQGZ7bYbBazIYP0mggppJAWSX8Bi5hqdQ==",
}
