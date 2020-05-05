#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from setuptools import setup, find_packages

with open("requirements/common.txt") as f:
    requirements = f.readlines()

setup(
    name="fiftyone",
    version="0.1.0",
    description="Project FiftyOne",
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="",
    packages=find_packages(),
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
)
