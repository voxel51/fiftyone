"""
VQA evaluation.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import inspect
import itertools
import re

import numpy as np

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.validation as fov

from .base import (
    BaseEvaluationMethod,
    BaseEvaluationMethodConfig,
    BaseClassificationResults,
)


#
# The normalization pipeline below replicates the official VQAv2 evaluation
# code (https://github.com/GT-Vision-Lab/VQA, vqaEval.py) so that accuracies
# computed here match published VQAv2-family numbers, quirks included:
#
# -   `_PERIOD_STRIP` contains a malformed lookbehind `(?!<=\d)` (the authors
#     intended `(?<!\d)`); the trailing `(?!\d)` lookahead does the real work
# -   `re.UNICODE` is passed as the `count` argument to `sub()`
# -   the contractions map includes dead capitalized keys (input is
#     lowercased before lookup) and the reversed entry
#     `"somebody'd": "somebodyd"`
# -   punctuation removal conditions check the *original* input string on
#     every iteration, and a digit,digit match anywhere in the input causes
#     bare removal (no space) for *all* punctuation characters
#

# fmt: off
_CONTRACTIONS = {
    "aint": "ain't", "arent": "aren't", "cant": "can't",
    "couldve": "could've", "couldnt": "couldn't",
    "couldn'tve": "couldn't've", "couldnt've": "couldn't've",
    "didnt": "didn't", "doesnt": "doesn't", "dont": "don't",
    "hadnt": "hadn't", "hadnt've": "hadn't've", "hadn'tve": "hadn't've",
    "hasnt": "hasn't", "havent": "haven't", "hed": "he'd",
    "hed've": "he'd've", "he'dve": "he'd've", "hes": "he's",
    "howd": "how'd", "howll": "how'll", "hows": "how's",
    "Id've": "I'd've", "I'dve": "I'd've", "Im": "I'm", "Ive": "I've",
    "isnt": "isn't", "itd": "it'd", "itd've": "it'd've",
    "it'dve": "it'd've", "itll": "it'll", "let's": "let's",
    "maam": "ma'am", "mightnt": "mightn't", "mightnt've": "mightn't've",
    "mightn'tve": "mightn't've", "mightve": "might've",
    "mustnt": "mustn't", "mustve": "must've", "neednt": "needn't",
    "notve": "not've", "oclock": "o'clock", "oughtnt": "oughtn't",
    "ow's'at": "'ow's'at", "'ows'at": "'ow's'at", "'ow'sat": "'ow's'at",
    "shant": "shan't", "shed've": "she'd've", "she'dve": "she'd've",
    "she's": "she's", "shouldve": "should've", "shouldnt": "shouldn't",
    "shouldnt've": "shouldn't've", "shouldn'tve": "shouldn't've",
    "somebody'd": "somebodyd", "somebodyd've": "somebody'd've",
    "somebody'dve": "somebody'd've", "somebodyll": "somebody'll",
    "somebodys": "somebody's", "someoned": "someone'd",
    "someoned've": "someone'd've", "someone'dve": "someone'd've",
    "someonell": "someone'll", "someones": "someone's",
    "somethingd": "something'd", "somethingd've": "something'd've",
    "something'dve": "something'd've", "somethingll": "something'll",
    "thats": "that's", "thered": "there'd", "thered've": "there'd've",
    "there'dve": "there'd've", "therere": "there're", "theres": "there's",
    "theyd": "they'd", "theyd've": "they'd've", "they'dve": "they'd've",
    "theyll": "they'll", "theyre": "they're", "theyve": "they've",
    "twas": "'twas", "wasnt": "wasn't", "wed've": "we'd've",
    "we'dve": "we'd've", "weve": "we've", "werent": "weren't",
    "whatll": "what'll", "whatre": "what're", "whats": "what's",
    "whatve": "what've", "whens": "when's", "whered": "where'd",
    "wheres": "where's", "whereve": "where've", "whod": "who'd",
    "whod've": "who'd've", "who'dve": "who'd've", "wholl": "who'll",
    "whos": "who's", "whove": "who've", "whyll": "why'll",
    "whyre": "why're", "whys": "why's", "wont": "won't",
    "wouldve": "would've", "wouldnt": "wouldn't",
    "wouldnt've": "wouldn't've", "wouldn'tve": "wouldn't've",
    "yall": "y'all", "yall'll": "y'all'll", "y'allll": "y'all'll",
    "yall'd've": "y'all'd've", "y'alld've": "y'all'd've",
    "y'all'dve": "y'all'd've", "youd": "you'd", "youd've": "you'd've",
    "you'dve": "you'd've", "youll": "you'll", "youre": "you're",
    "youve": "you've",
}
_MANUAL_MAP = {
    "none": "0", "zero": "0", "one": "1", "two": "2", "three": "3",
    "four": "4", "five": "5", "six": "6", "seven": "7", "eight": "8",
    "nine": "9", "ten": "10",
}
_PUNCT = [
    ";", r"/", "[", "]", '"', "{", "}", "(", ")", "=", "+", "\\", "_",
    "-", ">", "<", "@", "`", ",", "?", "!",
]
# fmt: on

_ARTICLES = ["a", "an", "the"]
_PERIOD_STRIP = re.compile(r"(?!<=\d)(\.)(?!\d)")
_COMMA_STRIP = re.compile(r"(\d)(\,)(\d)")


def _process_punctuation(in_text):
    out_text = in_text
    for p in _PUNCT:
        if (p + " " in in_text or " " + p in in_text) or (
            re.search(_COMMA_STRIP, in_text) != None
        ):
            out_text = out_text.replace(p, "")
        else:
            out_text = out_text.replace(p, " ")

    out_text = _PERIOD_STRIP.sub("", out_text, re.UNICODE)
    return out_text


def _process_digit_article(in_text):
    out_text = []
    for word in in_text.lower().split():
        word = _MANUAL_MAP.get(word, word)
        if word not in _ARTICLES:
            out_text.append(word)

    for i, word in enumerate(out_text):
        if word in _CONTRACTIONS:
            out_text[i] = _CONTRACTIONS[word]

    return " ".join(out_text)


def _strip_answer(answer):
    return answer.replace("\n", " ").replace("\t", " ").strip()


def _normalize_answer(answer):
    return _process_digit_article(_process_punctuation(_strip_answer(answer)))


def evaluate_vqa(
    samples,
    pred_field,
    gt_field="ground_truth",
    eval_key=None,
    method=None,
    custom_metrics=None,
    progress=None,
    **kwargs,
):
    """Evaluates the VQA predictions in the given collection with respect to
    the specified ground truth labels.

    Predicted and ground truth labels may be either single
    :class:`fiftyone.core.labels.VQA` or :class:`fiftyone.core.labels.VQAs`
    fields (both fields must have the same type). Within ``VQAs`` fields,
    predictions are matched to ground truth by ``question_id``; labels
    without a ``question_id`` are matched positionally.

    The natively provided ``method`` values and their associated configs are:

    -   ``"exact"``: :class:`ExactMatchEvaluationConfig`
    -   ``"vqa"``: :class:`VQAAccuracyEvaluationConfig`

    If an ``eval_key`` is specified, this method will record:

    -   the per-sample mean question score in an ``eval_key`` sample field
    -   the per-question score in an ``eval_key`` attribute of each ground
        truth and predicted label (boolean for ``"exact"``, float for
        ``"vqa"``)
    -   the ID of the matched counterpart label in an ``eval_key + "_id"``
        attribute of each matched label

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.VQA` or
            :class:`fiftyone.core.labels.VQAs` instances
        gt_field ("ground_truth"): the name of the field containing the
            ground truth :class:`fiftyone.core.labels.VQA` or
            :class:`fiftyone.core.labels.VQAs` instances
        eval_key (None): an evaluation key to use to refer to this evaluation
        method (None): a string specifying the evaluation method to use. The
            supported values are ``fo.evaluation_config.vqa_backends.keys()``
            and the default is ``fo.evaluation_config.default_vqa_backend``
        custom_metrics (None): an optional list of custom metrics to compute
            or dict mapping metric names to kwargs dicts
        progress (None): whether to render a progress bar (True/False), use
            the default value ``fiftyone.config.show_progress_bars`` (None),
            or a progress callback function to invoke instead
        **kwargs: optional keyword arguments for the constructor of the
            :class:`VQAEvaluationConfig` being used

    Returns:
        a :class:`VQAResults`
    """
    fov.validate_non_grouped_collection(samples)
    fov.validate_collection_label_fields(
        samples, (pred_field, gt_field), (fol.VQA, fol.VQAs), same_type=True
    )

    if samples._is_frame_field(gt_field) or samples._is_frame_field(
        pred_field
    ):
        raise ValueError("Frame-level VQA evaluation is not yet supported")

    config = _parse_config(
        pred_field,
        gt_field,
        method,
        custom_metrics=custom_metrics,
        **kwargs,
    )
    eval_method = config.build()
    eval_method.ensure_requirements()

    eval_method.register_run(samples, eval_key)
    eval_method.register_samples(samples, eval_key)

    results = eval_method.evaluate_samples(
        samples, eval_key=eval_key, progress=progress
    )
    eval_method.compute_custom_metrics(samples, eval_key, results)

    if eval_key is not None:
        eval_method.save_run_results(samples, eval_key, results)
        eval_method.add_fields_to_sidebar_group(
            samples, eval_key, omit_fields=(pred_field, gt_field)
        )

    return results


class VQAEvaluationConfig(BaseEvaluationMethodConfig):
    """Base class for configuring :class:`VQAEvaluation` instances.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.VQA` or
            :class:`fiftyone.core.labels.VQAs` instances
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.VQA` or
            :class:`fiftyone.core.labels.VQAs` instances
        custom_metrics (None): an optional list of custom metrics to compute
            or dict mapping metric names to kwargs dicts
    """

    def __init__(self, pred_field, gt_field, custom_metrics=None, **kwargs):
        super().__init__(**kwargs)
        self.pred_field = pred_field
        self.gt_field = gt_field
        self.custom_metrics = custom_metrics

    @property
    def type(self):
        return "vqa"


class VQAEvaluation(BaseEvaluationMethod):
    """Base class for VQA evaluation methods.

    Args:
        config: a :class:`VQAEvaluationConfig`
    """

    _LABEL_SCORE_FIELD = fof.FloatField

    def _score_pair(self, gt, pred):
        """Returns a score in ``[0, 1]`` for the given ``(gt, pred)`` pair.

        Both labels are guaranteed to be non-``None`` and ``pred.answer`` is
        guaranteed to be set; the ``None`` cases are handled by the caller.
        """
        raise NotImplementedError("subclass must implement _score_pair()")

    def register_samples(self, samples, eval_key):
        if eval_key is None:
            return

        dataset = samples._dataset

        dataset.add_sample_field(eval_key, fof.FloatField)

        for field in (self.config.gt_field, self.config.pred_field):
            _, prefix = samples._get_label_field_path(field)
            dataset.add_sample_field(
                prefix + "." + eval_key, self._LABEL_SCORE_FIELD
            )
            dataset.add_sample_field(
                prefix + "." + eval_key + "_id", fof.StringField
            )

    def evaluate_samples(self, samples, eval_key=None, progress=None):
        gt_field = self.config.gt_field
        pred_field = self.config.pred_field
        is_list = issubclass(
            samples._get_label_field_type(gt_field), fol._HasLabelList
        )

        gts, preds = samples.values([gt_field, pred_field])

        ytrue, ypred, ytrue_ids, ypred_ids = [], [], [], []
        scores, confs, question_types, answer_types = [], [], [], []
        sample_accs = []
        gt_values, pred_values = [], []

        for gt, pred in zip(gts, preds):
            gt_labels = _to_label_list(gt)
            pred_labels = _to_label_list(pred)

            pairs = _match_vqas(gt_labels, pred_labels)

            score_map = {}
            match_map = {}
            pair_scores = []

            for _gt, _pred in pairs:
                if _gt is None or _pred is None or _pred.answer is None:
                    score = 0.0
                else:
                    score = self._score_pair(_gt, _pred)

                pair_scores.append(score)

                scores.append(score)
                ytrue.append(
                    _normalize_answer(_gt.answer)
                    if _gt is not None and _gt.answer is not None
                    else None
                )
                ypred.append(
                    _normalize_answer(_pred.answer)
                    if _pred is not None and _pred.answer is not None
                    else None
                )
                ytrue_ids.append(_gt.id if _gt is not None else None)
                ypred_ids.append(_pred.id if _pred is not None else None)
                confs.append(_pred.confidence if _pred is not None else None)

                ref = _gt if _gt is not None else _pred
                question_types.append(ref.question_type)
                answer_types.append(ref.answer_type)

                for a, b in ((_gt, _pred), (_pred, _gt)):
                    if a is not None:
                        score_map[a.id] = score
                        if b is not None:
                            match_map[a.id] = b.id

            sample_accs.append(
                sum(pair_scores) / len(pair_scores) if pair_scores else None
            )
            gt_values.append((gt_labels, score_map, match_map))
            pred_values.append((pred_labels, score_map, match_map))

        results = VQAResults(
            samples,
            self.config,
            eval_key,
            ytrue,
            ypred,
            scores=scores,
            question_types=question_types,
            answer_types=answer_types,
            confs=confs,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            backend=self,
        )

        if eval_key is None:
            return results

        if self._LABEL_SCORE_FIELD is fof.BooleanField:
            _cast = lambda s: bool(s >= 1)
        else:
            _cast = float

        samples.set_values(eval_key, sample_accs)

        for field, values in (
            (gt_field, gt_values),
            (pred_field, pred_values),
        ):
            _, prefix = samples._get_label_field_path(field)

            label_scores = []
            label_match_ids = []
            for labels, score_map, match_map in values:
                _scores = [
                    _cast(score_map[l.id]) if l.id in score_map else None
                    for l in labels
                ]
                _ids = [match_map.get(l.id, None) for l in labels]
                if not is_list:
                    _scores = _scores[0] if _scores else None
                    _ids = _ids[0] if _ids else None

                label_scores.append(_scores)
                label_match_ids.append(_ids)

            samples.set_values(prefix + "." + eval_key, label_scores)
            samples.set_values(
                prefix + "." + eval_key + "_id", label_match_ids
            )

        return results

    def get_fields(self, samples, eval_key, include_custom_metrics=True):
        fields = [eval_key]

        for field in (self.config.pred_field, self.config.gt_field):
            _, prefix = samples._get_label_field_path(field)
            fields.append(prefix + "." + eval_key)
            fields.append(prefix + "." + eval_key + "_id")

        if include_custom_metrics:
            fields.extend(self.get_custom_metric_fields(samples, eval_key))

        return fields

    def rename(self, samples, eval_key, new_eval_key):
        dataset = samples._dataset

        in_fields = self.get_fields(
            dataset, eval_key, include_custom_metrics=False
        )
        out_fields = self.get_fields(
            dataset, new_eval_key, include_custom_metrics=False
        )

        fields = dict(zip(in_fields, out_fields))
        dataset.rename_sample_fields(fields)

        self.rename_custom_metrics(samples, eval_key, new_eval_key)

        samples._rename_sidebar_group(eval_key, new_eval_key)

    def cleanup(self, samples, eval_key):
        dataset = samples._dataset

        fields = [eval_key]
        for field in (self.config.pred_field, self.config.gt_field):
            try:
                _, prefix = dataset._get_label_field_path(field)
            except ValueError:
                # field no longer exists, nothing to cleanup
                continue

            fields.append(prefix + "." + eval_key)
            fields.append(prefix + "." + eval_key + "_id")

        dataset.delete_sample_fields(fields, error_level=1)

        self.cleanup_custom_metrics(samples, eval_key)

        samples._delete_empty_sidebar_group(eval_key)

    def _validate_run(self, samples, eval_key, existing_info):
        self._validate_fields_match(eval_key, "pred_field", existing_info)
        self._validate_fields_match(eval_key, "gt_field", existing_info)


class ExactMatchEvaluationConfig(VQAEvaluationConfig):
    """Exact-match VQA evaluation config.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.VQA` or
            :class:`fiftyone.core.labels.VQAs` instances
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.VQA` or
            :class:`fiftyone.core.labels.VQAs` instances
        normalize (True): whether to apply the official VQAv2 answer
            normalization to predictions and references before matching
        custom_metrics (None): an optional list of custom metrics to compute
            or dict mapping metric names to kwargs dicts
    """

    def __init__(
        self,
        pred_field,
        gt_field,
        normalize=True,
        custom_metrics=None,
        **kwargs,
    ):
        super().__init__(
            pred_field, gt_field, custom_metrics=custom_metrics, **kwargs
        )
        self.normalize = normalize

    @property
    def method(self):
        return "exact"


class ExactMatchEvaluation(VQAEvaluation):
    """Exact-match VQA evaluation.

    A prediction is correct if its answer exactly matches the ground truth
    ``answer`` (or, if unset, any entry of the ground truth ``answers``),
    after normalization if so configured.

    Args:
        config: an :class:`ExactMatchEvaluationConfig`
    """

    _LABEL_SCORE_FIELD = fof.BooleanField

    def _score_pair(self, gt, pred):
        if gt.answer is not None:
            refs = [gt.answer]
        else:
            refs = list(gt.answers or [])

        if self.config.normalize:
            pred_answer = _normalize_answer(pred.answer)
            refs = [_normalize_answer(r) for r in refs]
        else:
            pred_answer = _strip_answer(pred.answer)
            refs = [_strip_answer(r) for r in refs]

        return 1.0 if refs and pred_answer in refs else 0.0


class VQAAccuracyEvaluationConfig(VQAEvaluationConfig):
    """Official VQAv2 soft-accuracy evaluation config.

    Args:
        pred_field: the name of the field containing the predicted
            :class:`fiftyone.core.labels.VQA` or
            :class:`fiftyone.core.labels.VQAs` instances
        gt_field: the name of the field containing the ground truth
            :class:`fiftyone.core.labels.VQA` or
            :class:`fiftyone.core.labels.VQAs` instances
        custom_metrics (None): an optional list of custom metrics to compute
            or dict mapping metric names to kwargs dicts
    """

    @property
    def method(self):
        return "vqa"


class VQAAccuracyEvaluation(VQAEvaluation):
    """Official VQAv2 soft-accuracy evaluation.

    Each prediction is scored against the ground truth ``answers`` list
    (falling back to ``[answer]``) via the official VQAv2 protocol: hold out
    each reference in turn, count matches among the remaining references,
    apply ``min(1, matches / 3)``, and average over all holdouts. Following
    the official implementation, answers are normalized only when the
    references disagree. With a single reference, the score reduces to exact
    match.

    Args:
        config: a :class:`VQAAccuracyEvaluationConfig`
    """

    def _score_pair(self, gt, pred):
        if gt.answers:
            refs = list(gt.answers)
        elif gt.answer is not None:
            refs = [gt.answer]
        else:
            return 0.0

        pred_answer = _strip_answer(pred.answer)
        refs = [_strip_answer(r) for r in refs]

        if len(set(refs)) > 1:
            pred_answer = _process_digit_article(
                _process_punctuation(pred_answer)
            )
            refs = [
                _process_digit_article(_process_punctuation(r)) for r in refs
            ]

        if len(refs) == 1:
            return 1.0 if pred_answer == refs[0] else 0.0

        # the official implementation excludes the held-out annotation dict
        # by identity; with plain strings, index-based exclusion is the
        # faithful equivalent (string `!=` would also drop duplicates)
        accs = []
        for i in range(len(refs)):
            others = refs[:i] + refs[i + 1 :]
            matches = [r for r in others if r == pred_answer]
            accs.append(min(1.0, len(matches) / 3.0))

        return sum(accs) / len(accs)


class VQAResults(BaseClassificationResults):
    """Class that stores the results of a VQA evaluation.

    Args:
        samples: the :class:`fiftyone.core.collections.SampleCollection` used
        config: the :class:`VQAEvaluationConfig` used
        eval_key: the evaluation key
        ytrue: a list of normalized ground truth answers
        ypred: a list of normalized predicted answers
        scores (None): a list of per-question scores in ``[0, 1]``
        question_types (None): a list of question types
        answer_types (None): a list of answer types
        confs (None): an optional list of confidences for the predictions
        ytrue_ids (None): a list of IDs for the ground truth labels
        ypred_ids (None): a list of IDs for the predicted labels
        classes (None): the list of possible classes. If not provided, the
            observed ground truth/predicted answers are used
        missing (None): a missing label string. Any None-valued answers are
            given this label for evaluation purposes
        custom_metrics (None): an optional dict of custom metrics
        backend (None): a :class:`VQAEvaluation` backend
    """

    def __init__(
        self,
        samples,
        config,
        eval_key,
        ytrue,
        ypred,
        scores=None,
        question_types=None,
        answer_types=None,
        confs=None,
        ytrue_ids=None,
        ypred_ids=None,
        classes=None,
        missing=None,
        custom_metrics=None,
        backend=None,
    ):
        super().__init__(
            samples,
            config,
            eval_key,
            ytrue,
            ypred,
            confs=confs,
            ytrue_ids=ytrue_ids,
            ypred_ids=ypred_ids,
            classes=classes,
            missing=missing,
            custom_metrics=custom_metrics,
            backend=backend,
        )
        self.scores = np.asarray(scores) if scores is not None else np.zeros(0)
        self.question_types = (
            np.asarray(question_types) if question_types is not None else None
        )
        self.answer_types = (
            np.asarray(answer_types) if answer_types is not None else None
        )

    @property
    def accuracy(self):
        """The mean per-question score of the evaluation."""
        if self.scores.size == 0:
            return 0.0

        return float(np.mean(self.scores))

    def breakdown(self, by="question_type"):
        """Returns the mean per-question score for each observed question or
        answer type.

        Args:
            by ("question_type"): whether to group scores by
                ``"question_type"`` or ``"answer_type"``

        Returns:
            a dict mapping types to mean scores
        """
        if by == "question_type":
            values = self.question_types
        elif by == "answer_type":
            values = self.answer_types
        else:
            raise ValueError(
                "Unsupported by='%s'; supported values are "
                "('question_type', 'answer_type')" % by
            )

        if values is None:
            return {}

        d = {}
        for value, score in zip(values, self.scores):
            key = str(value) if value is not None else self.missing
            d.setdefault(key, []).append(score)

        return {k: float(np.mean(v)) for k, v in sorted(d.items())}

    @classmethod
    def _from_dict(cls, d, samples, config, eval_key, **kwargs):
        return super()._from_dict(
            d,
            samples,
            config,
            eval_key,
            scores=d.get("scores", None),
            question_types=d.get("question_types", None),
            answer_types=d.get("answer_types", None),
            **kwargs,
        )


def _to_label_list(label):
    if label is None:
        return []

    if isinstance(label, fol.VQAs):
        return list(label.vqas)

    return [label]


def _match_vqas(gt_labels, pred_labels):
    """Matches ground truth and predicted VQA labels, returning a list of
    ``(gt, pred)`` pairs in which either entry may be ``None``.

    Labels are matched by ``question_id``, which is assumed to be unique
    within each list; labels without a ``question_id`` are matched
    positionally.
    """
    pred_by_id = {}
    id_less_preds = []
    for pred in pred_labels:
        if pred.question_id is not None:
            pred_by_id[pred.question_id] = pred
        else:
            id_less_preds.append(pred)

    pairs = []
    matched_ids = set()
    id_less_gts = []
    for gt in gt_labels:
        if gt.question_id is not None:
            pred = pred_by_id.get(gt.question_id, None)
            if pred is not None:
                matched_ids.add(gt.question_id)

            pairs.append((gt, pred))
        else:
            id_less_gts.append(gt)

    for gt, pred in itertools.zip_longest(id_less_gts, id_less_preds):
        pairs.append((gt, pred))

    for qid, pred in pred_by_id.items():
        if qid not in matched_ids:
            pairs.append((None, pred))

    return pairs


def _parse_config(pred_field, gt_field, method, **kwargs):
    if method is None:
        method = fo.evaluation_config.default_vqa_backend

    custom_metrics = kwargs.get("custom_metrics", None)
    if etau.is_str(custom_metrics):
        kwargs["custom_metrics"] = [custom_metrics]

    if inspect.isclass(method):
        return method(pred_field, gt_field, **kwargs)

    backends = fo.evaluation_config.vqa_backends

    if method not in backends:
        raise ValueError(
            "Unsupported VQA evaluation method '%s'. The available methods "
            "are %s" % (method, sorted(backends.keys()))
        )

    params = deepcopy(backends[method])

    config_cls = kwargs.pop("config_cls", None)

    if config_cls is None:
        config_cls = params.pop("config_cls", None)

    if config_cls is None:
        raise ValueError(
            "VQA evaluation method '%s' has no `config_cls`" % method
        )

    if etau.is_str(config_cls):
        config_cls = etau.get_class(config_cls)

    params.update(**kwargs)
    return config_cls(pred_field, gt_field, **params)
