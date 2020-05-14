#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
from setuptools import setup, find_packages
from wheel.bdist_wheel import bdist_wheel


class BdistWheelCustom(bdist_wheel):
    def write_wheelfile(self, wheelfile_base, *args, **kwargs):
        bdist_wheel.write_wheelfile(self, wheelfile_base, *args, **kwargs)
        # ETA's constants.py looks up ETA's version information dynamically from
        # site-packages/ETA-x.y.z.dist-info, which is not created when we bundle
        # ETA with fiftyone. This is a workaround to make ETA use fiftyone's
        # version information instead.
        # TODO: package ETA separately to avoid this
        constants_path = os.path.join(self.bdist_dir, "eta", "constants.py")
        with open(constants_path, "r") as constants_file:
            contents = constants_file.read()
        if 'metadata("ETA")' not in contents:
            raise ValueError("Could not rewrite %r" % constants_path)
        contents = contents.replace('metadata("ETA")', 'metadata("fiftyone")')
        with open(constants_path, "w") as constants_file:
            constants_file.write(contents)


cmdclass = {
    "bdist_wheel": BdistWheelCustom,
}


with open("requirements/common.txt") as reqs, open(
    "eta/requirements/common.txt"
) as eta_reqs:
    requirements = eta_reqs.readlines() + reqs.readlines()

requirements += [
    "fiftyone-brain",
    "fiftyone-db",
    "fiftyone-gui",
]

setup(
    name="fiftyone",
    version="0.1.0",
    description="Project FiftyOne",
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="",
    packages=find_packages() + ["eta"],
    package_dir={"eta": "eta/eta"},
    include_package_data=True,
    classifiers=[
        "Operating System :: MacOS :: MacOS X",
        "Operating System :: POSIX :: Linux",
        "Programming Language :: Python :: 2.7",
        "Programming Language :: Python :: 3",
    ],
    scripts=["fiftyone/fiftyone"],
    python_requires=">=2.7",
    install_requires=requirements,
    cmdclass=cmdclass,
)
