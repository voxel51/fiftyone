"""
The FiftyOne Notebook Zoo.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import IPython
import IPython.core.magic as icm
import IPython.extensions.storemagic as ies
import notebook.notebookapp as nn
import os

import eta.core.serial as etas

import fiftyone.core.collections as foc
import fiftyone.core.dataset as fod
import fiftyone.core.view as fov


_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_NOTEBOOK_MANIFEST_PATH = os.path.join(_THIS_DIR, "manifest.json")


def launch_notebook(name, **kwargs):
    nb_path = connect_to_notebook(name, **kwargs)
    app = nn.NotebookApp()
    app.initialize([])
    app.launch_instance([nb_path])


def connect_to_notebook(name, **kwargs):
    manifest = ZooNotebookManifest.from_json(_NOTEBOOK_MANIFEST_PATH)
    expected_kwargs = manifest.get_notebook_kwargs(name)
    for arg_str, arg_val in kwargs.items():
        if arg_str in expected_kwargs:
            store_variable(arg_str, arg_val)

    return os.path.join(_THIS_DIR, manifest.get_notebook_path(name))


def store_variable(var_str, var_value):
    if isinstance(var_value, foc.SampleCollection):
        # @todo store views in a way that makes it clear they are a view and
        # need to be unserialized at load time
        _store_view(var_str, var_value)
    else:
        _store_var(var_str, var_value)


def load_variable(var_str, shell=None):
    # @todo load either a variable or an unserialized view
    pass


class ZooNotebookManifest(object):
    def __init__(self, notebooks_dict):
        self.notebooks_dict = notebooks_dict

    def has_notebook(self, name):
        return name in self.notebooks_dict

    def get_notebook_kwargs(self, name):
        return self.notebooks_dict[name]["kwargs"]

    def get_notebook_path(self, name):
        return self.notebooks_dict[name]["notebook_path"]

    @classmethod
    def from_json(cls, json_path):
        return cls(etas.load_json(json_path))


@icm.magics_class
class FiftyOneMagics(icm.Magics):
    @icm.line_magic
    def load_fo_view(self, variable_name):
        obj = _load_view(variable_name, shell=self.shell)
        self.shell.user_ns[variable_name] = obj

    @icm.line_magic
    def load_fo_var(self, variable_name):
        obj = _load_var(variable_name, shell=self.shell)
        self.shell.user_ns[variable_name] = obj


# Automatically register magic when in ipython environment
ipython = IPython.get_ipython()
if ipython:
    ipython.register_magics(FiftyOneMagics)


def _store_var(arg_str, arg_val):
    locals()[arg_str] = arg_val
    shell = IPython.InteractiveShell(user_ns=locals())
    magics = ies.StoreMagics(shell)
    magics.store(arg_str)


def _store_view(arg_str, view):
    dataset_name = view._dataset.name
    view_dict = view.view()._serialize()
    dn_arg = arg_str + "_dataset_name"
    view_d_arg = arg_str + "_view_dict"
    _store_var(dn_arg, dataset_name)
    _store_var(view_d_arg, view_dict)


def _load_var(var_str, shell=None):
    if not shell:
        shell = IPython.InteractiveShell()
    db = shell.db
    var_names = {}
    for var in db.keys("autorestore/*"):
        var_name = os.path.basename(var)
        var_names[var_name] = var

    value = None

    if var_str in var_names:
        value = db.get(var_names[var_str])

    return value


def _load_view(arg_str, shell=None):
    dn_arg = arg_str + "_dataset_name"
    view_d_arg = arg_str + "_view_dict"

    dataset_name = _load_var(dn_arg, shell=shell)

    dataset = None
    view = None
    if dataset_name:
        dataset = fod.load_dataset(dataset_name)

    view_dict = _load_var(view_d_arg, shell=shell)
    if view_dict and dataset:
        view = fov.DatasetView._build(dataset, view_dict)

    return view
