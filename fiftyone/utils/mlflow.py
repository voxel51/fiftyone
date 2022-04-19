""" Utiliies for working with MLFlow.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import json_util
import codecs
from nbconvert.preprocessors import ExecutePreprocessor
from nbconvert import HTMLExporter
import os
import webbrowser

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.dataset as fod
import fiftyone.core.utils as fou
import fiftyone.core.view as fov


mlflow = fou.lazy_import(
    "mlflow", callback=lambda: fou.ensure_import("mlflow")
)
nbf = fou.lazy_import(
    "nbformat", callback=lambda: fou.ensure_import("nbformat")
)


class MLFlowModelRun(etas.Serializable):
    def __init__(
        self,
        run_key,
        tracking_uri,
        run_id,
        experiment_id,
        gt_field,
        pred_field,
        pred_view=None,
        train_view=None,
        dataset_name=None,
        _pred_view_stages=None,
        _train_view_stages=None,
    ):
        self.run_key = run_key
        self.tracking_uri = tracking_uri
        self.run_id = run_id
        self.experiment_id = experiment_id
        self.gt_field = gt_field
        self.pred_field = pred_field
        self.dataset_name = dataset_name
        self.pred_view_stages = self._parse_view_stages(
            _pred_view_stages, pred_view,
        )

        self.train_view_stages = self._parse_view_stages(
            _train_view_stages, train_view,
        )

    def _parse_view_stages(self, view_stages, samples):
        if view_stages:
            return view_stages

        elif samples:
            return [json_util.dumps(s) for s in samples.view()._serialize()]

    @property
    def url(self):
        return "http://localhost:5000/#/experiments/%s/runs/%s" % (
            self.experiment_id,
            self.run_id,
        )

    @property
    def _dataset(self):
        return fod.load_dataset(self.dataset_name)

    def _view(self, view_stages):
        if view_stages:
            stage_dicts = [json_util.loads(s) for s in view_stages]
            view = fov.DatasetView._build(self._dataset, stage_dicts)
        else:
            view = None
        return view

    @property
    def pred_view(self):
        return self._view(self.pred_view_stages)

    @property
    def train_view(self):
        return self._view(self.train_view_stages)

    @classmethod
    def from_dict(cls, d):
        if "_pred_view_stages" not in d:
            d["_pred_view_stages"] = d.pop("pred_view_stages", None)
        if "_train_view_stages" not in d:
            d["_train_view_stages"] = d.pop("train_view_stages", None)
        return cls(**d)


def add_model_run(
    run_key,
    sample_collection,
    tracking_uri,
    run_id,
    experiment_id,
    gt_field,
    pred_field,
    pred_view=None,
    train_view=None,
):

    if run_key in sample_collection.info:
        raise ValueError("Run key '%s' already exists" % run_key)
    run = MLFlowModelRun(
        run_key,
        tracking_uri,
        run_id,
        experiment_id,
        gt_field,
        pred_field,
        pred_view=pred_view,
        train_view=train_view,
        dataset_name=sample_collection._dataset.name,
    )
    sample_collection.info[run_key] = run.serialize()

    connect_to_mlflow(
        sample_collection,
        run.run_key,
        experiment_id,
        run_id,
        run.gt_field,
        run.pred_field,
        tracking_uri,
    )

    return run


def get_model_run(
    sample_collection, run_key,
):
    run_dict = sample_collection._dataset.info.get(run_key, None)
    if run_dict is None:
        return None

    return MLFlowModelRun.from_dict(run_dict)


def delete_model_run(
    sample_collection, run_key,
):
    sample_collection.info.pop(run_key)


def update_model_run(
    sample_collection, run_key, run,
):
    sample_collection.info[run_key] = run.serialize()


def add_flash_mlflogger(
    sample_collection, run_key, mlf_logger, gt_field, pred_field, tracking_uri,
):
    experiment_id = mlf_logger._experiment_id
    run_id = mlf_logger._run_id
    run = add_model_run(
        sample_collection,
        run_key,
        tracking_uri,
        run_id,
        experiment_id,
        gt_field,
        pred_field,
    )


def connect_to_mlflow(
    sample_collection,
    run_key,
    experiment_id,
    run_id,
    gt_field,
    pred_field,
    tracking_uri,
):
    mlflow.set_tracking_uri(tracking_uri)
    mlflow.start_run(run_id=run_id)
    _add_tags_to_run(sample_collection.name, gt_field, pred_field)
    _add_nb_to_run(sample_collection, run_key)


def launch_mlflow(sample_collection, run_key):
    run = get_model_run(sample_collection, run_key)
    url = run.url
    webbrowser.open(url, new=2)


def _add_tags_to_run(name, gt_field, pred_field):
    tags = {
        "FiftyOne Dataset Name": name,
        "FiftyOne Ground Truth Label Field": gt_field,
        "FiftyOne Predictions Label Field": pred_field,
    }
    mlflow.log_params(tags)


def _add_nb_to_run(sample_collection, run_key):
    nb_path, html_path = _create_nb(sample_collection, run_key)
    mlflow.log_artifact(nb_path)
    mlflow.log_artifact(html_path)

    fiftyone_link_path = _create_fo_connection_snippet(
        sample_collection, run_key
    )
    mlflow.log_artifact(fiftyone_link_path)

    etau.delete_file(html_path)
    etau.delete_file(nb_path)
    etau.delete_file(fiftyone_link_path)


def _create_fo_connection_snippet(sample_collection, run_key):
    content = """# Connect to FiftyOne:

# Open up IPython on a machine connected to FiftyOne
# and paste and run the following:

import fiftyone as fo
import fiftyone.utils.mlflow as foum

dataset = fo.load_dataset("%s")

run_key = "%s"
run = foum.get_model_run(dataset, run_key)

predict_view = run.predict_view

session = fo.launch_app(predict_view)
""" % (
        sample_collection.name,
        run_key,
    )

    fiftyone_link_path = "/tmp/connect_to_fiftyone.txt"
    with open(fiftyone_link_path, "w") as f:
        f.write(content)

    return fiftyone_link_path


def _create_nb(sample_collection, run_key):
    run = get_model_run(sample_collection, run_key)
    run_id = run.run_id
    experiment_id = run.experiment_id
    gt_field = run.gt_field
    pred_field = run.pred_field

    # https://gist.github.com/fperez/9716279
    nb = nbf.v4.new_notebook()
    nb["cells"] = []
    text = """\
# FiftyOne Summary
This notebook was automatically generated for experiment %s, run %s.""" % (
        experiment_id,
        run_id,
    )
    nb["cells"].append(nbf.v4.new_markdown_cell(text))

    code = (
        """\
import fiftyone as fo
import time

dataset = fo.load_dataset("%s")"""
        % sample_collection.name
    )
    nb["cells"].append(nbf.v4.new_code_cell(code))

    code = """\
import fiftyone.core.context as foc

print(foc._get_context())
foc._context = foc._IPYTHON"""
    nb["cells"].append(nbf.v4.new_code_cell(code))

    code = """\
view = dataset.select_fields(["%s", "%s"])

print(foc._get_context())
session = fo.launch_app(view)
#time.sleep(5)""" % (
        gt_field,
        pred_field,
    )
    nb["cells"].append(nbf.v4.new_code_cell(code))

    code = """\
session.freeze()
#time.sleep(5)"""
    nb["cells"].append(nbf.v4.new_code_cell(code))

    code = """\
#results = dataset.evaluate_classifications(
#    "%s",
#    gt_field="%s",
#    eval_key="mlflow_eval",
#)""" % (
        pred_field,
        gt_field,
    )
    nb["cells"].append(nbf.v4.new_code_cell(code))

    code = """\
#plot = results.plot_confusion_matrix()
#plot.show()"""
    nb["cells"].append(nbf.v4.new_code_cell(code))

    code = """\
#plot.freeze()"""
    nb["cells"].append(nbf.v4.new_code_cell(code))

    ep = ExecutePreprocessor(timeout=600, kernel_name="mlf")
    ep.preprocess(nb, {"metadata": {"path": "/tmp"}})

    nb_path = "/tmp/fiftyone_report.ipynb"
    html_path = "/tmp/fiftyone_report.html"

    # Write ipython
    with open(nb_path, "w", encoding="utf-8") as f:
        nbf.write(nb, nb_path)

    # Write HTML to view in MLFlow UI
    exporter = HTMLExporter()
    output, resources = exporter.from_notebook_node(nb)
    codecs.open(html_path, "w", encoding="utf-8").write(output)

    return nb_path, html_path
