"""

"""


def compute_filehash(filepath):
    with open(filepath, "rb") as f:
        filehash = hash(f.read())
    return filehash
