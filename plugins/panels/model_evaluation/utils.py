import json
import zlib
import numpy as np
from fiftyone.operators.cache.serialization import (
    auto_serialize,
    auto_deserialize,
)


def compress_confusion_matrix(matrix: np.ndarray, use_zlib=True):
    non_zero_indices = np.nonzero(matrix)
    non_zero_matrix = [
        {"i": int(i), "j": int(j), "v": int(matrix[i, j])}
        for i, j in zip(*non_zero_indices)
    ]
    compressed_matrix = {
        "shape": matrix.shape,
        "non_zero_matrix": non_zero_matrix,
    }
    compressed_matrix_binary = json.dumps(compressed_matrix).encode("utf-8")
    return (
        zlib.compress(compressed_matrix_binary)
        if use_zlib
        else compressed_matrix_binary
    )


def decompress_confusion_matrix(matrix, use_zlib=True):
    compressed_matrix_binary = zlib.decompress(matrix) if use_zlib else matrix
    compressed_matrix = json.loads(compressed_matrix_binary)
    shape = compressed_matrix["shape"]
    non_zero_matrix = compressed_matrix["non_zero_matrix"]
    computed_matrix = np.zeros(shape, dtype=np.int32)
    for item in non_zero_matrix:
        computed_matrix[item["i"], item["j"]] = item["v"]
    return computed_matrix


def compress_and_serialize(value):
    computed_value = value
    matrix = computed_value.get("confusion_matrix", {}).get("matrix", None)
    if matrix is not None:
        compressed_matrix = compress_confusion_matrix(matrix, use_zlib=True)
        computed_value = computed_value.copy()
        computed_value["confusion_matrix"] = computed_value[
            "confusion_matrix"
        ].copy()
        computed_value["confusion_matrix"]["matrix"] = compressed_matrix
    return auto_serialize(computed_value)


def decompress_and_deserialize(value):
    deserialized = auto_deserialize(value)
    matrix = deserialized.get("confusion_matrix", {}).get("matrix", None)
    if matrix is not None:
        decompressed_matrix = decompress_confusion_matrix(
            matrix, use_zlib=True
        )
        deserialized["confusion_matrix"]["matrix"] = decompressed_matrix
    return deserialized


def compress_and_serialize_scenario(value):
    computed_value = value.copy()
    subsets_data = computed_value.get("subsets_data", {}).copy()

    for subset in subsets_data:
        confusion_matrix = subsets_data[subset].get("confusion_matrix", None)
        matrix = confusion_matrix.get("matrix", None)
        if matrix is not None:
            compressed_matrix = compress_confusion_matrix(
                matrix, use_zlib=True
            )
            subsets_data[subset] = subsets_data[subset].copy()
            subsets_data[subset]["confusion_matrix"] = subsets_data[subset][
                "confusion_matrix"
            ].copy()
            subsets_data[subset]["confusion_matrix"][
                "matrix"
            ] = compressed_matrix

    computed_value["subsets_data"] = subsets_data

    return auto_serialize(computed_value)


def decompress_and_deserialize_scenario(value):
    deserialized = auto_deserialize(value)
    subsets_data = deserialized.get("subsets_data", {})

    for subset in subsets_data:
        confusion_matrix = subsets_data[subset].get("confusion_matrix", None)
        matrix = confusion_matrix.get("matrix", None)
        if matrix is not None:
            decompressed_matrix = decompress_confusion_matrix(
                matrix, use_zlib=True
            )
            deserialized["subsets_data"][subset]["confusion_matrix"][
                "matrix"
            ] = decompressed_matrix

    deserialized["subsets_data"] = subsets_data

    return deserialized
