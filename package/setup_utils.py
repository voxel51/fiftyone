import os
import shutil


def make_tar(dir_path, tar_path):
    """Makes a tarfile containing the given directory.

    Supported formats include `.tar`, `.tar.gz`, `.tgz`, `.tar.bz`, and `.tbz`.

    Args:
        dir_path: the directory to tar
        tar_path: the path + filename of the .tar.gz file to create
    """
    outpath, format = _get_tar_format(tar_path)

    rootdir, basedir = os.path.split(os.path.realpath(dir_path))
    shutil.make_archive(outpath, format, rootdir, basedir)


def _get_tar_format(archive_path):
    basepath, ext = os.path.splitext(archive_path)
    if basepath.endswith(".tar"):
        # Handle .tar.gz and .tar.bz
        basepath, ext2 = os.path.splitext(basepath)
        ext = ext2 + ext

    if ext == ".tar":
        return basepath, "tar"

    if ext in (".tar.gz", ".tgz"):
        return basepath, "gztar"

    if ext in (".tar.bz", ".tbz"):
        return basepath, "bztar"

    raise ValueError("Unsupported archive format '%s'" % archive_path)
