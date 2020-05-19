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
    def finalize_options(self):
        bdist_wheel.finalize_options(self)
        # pure Python, so build a wheel for any Python version
        self.universal = True


cmdclass = {
    "bdist_wheel": BdistWheelCustom,
}


with open("requirements/common.txt") as reqs:
    requirements = reqs.readlines()

requirements += [
    "fiftyone-brain",
    "fiftyone-db",
    "fiftyone-gui",
    "voxel51-eta",
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
