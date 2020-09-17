#!/usr/bin/env python
"""
Installs FiftyOne.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from setuptools import setup, find_packages
from wheel.bdist_wheel import bdist_wheel


class BdistWheelCustom(bdist_wheel):
    def finalize_options(self):
        bdist_wheel.finalize_options(self)
        # make just the wheel require these packages, since they aren't needed
        # for a development installation
        self.distribution.install_requires += [
            "fiftyone-brain>=0.1.8,<0.2",
            "fiftyone-gui>=0.5.5,<0.6",
            "fiftyone-db>=0.1.1,<0.2",
        ]


setup(
    name="fiftyone",
    version="0.5.5",
    description=(
        "FiftyOne: a powerful package for dataset curation, analysis, and "
        "visualization"
    ),
    author="Voxel51, Inc.",
    author_email="info@voxel51.com",
    url="https://github.com/voxel51/fiftyone",
    license="Apache",
    packages=find_packages() + ["fiftyone.recipes", "fiftyone.tutorials"],
    package_dir={
        "fiftyone.recipes": "docs/source/recipes",
        "fiftyone.tutorials": "docs/source/tutorials",
    },
    include_package_data=True,
    install_requires=[
        # third-party packages
        "argcomplete",
        "eventlet",
        "Flask",
        "Flask-Cors",
        "flask-socketio",
        "future",
        "Jinja2",
        "mongoengine",
        "numpy",
        "packaging",
        "Pillow<7,>=6.2",
        "pprintpp",
        "psutil",
        "pymongo",
        "python-engineio[client]",
        "python-socketio[client]",
        "retrying",
        "setuptools",
        "tabulate",
        "xmltodict",
        # internal packages
        "voxel51-eta>=0.1.5,<0.2",
    ],
    classifiers=[
        "Operating System :: MacOS :: MacOS X",
        "Operating System :: POSIX :: Linux",
        "Operating System :: Microsoft :: Windows",
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software License",
    ],
    entry_points={"console_scripts": ["fiftyone=fiftyone.core.cli:main"]},
    python_requires=">=3.5",
    cmdclass={"bdist_wheel": BdistWheelCustom},
)
