"""Permission gating and wiring of the label-schema operators."""

from types import SimpleNamespace

from plugins.label_schemas.operators import (
    CreateLabelSchemaDocOperator,
    DeleteLabelSchemaDocOperator,
    GetLabelSchemaDocOperator,
    ListLabelSchemaDocsOperator,
    UpdateLabelSchemaDocOperator,
)

from .memory import DATASET_ID


def _ctx(params=None, user="manage"):
    users = {
        None: None,
        "view": SimpleNamespace(
            id="u_view", role=None, dataset_permission="VIEW"
        ),
        "tag": SimpleNamespace(
            id="u_tag", role=None, dataset_permission="TAG"
        ),
        "manage": SimpleNamespace(
            id="u_mgr", role=None, dataset_permission="MANAGE"
        ),
        "admin": SimpleNamespace(
            id="u_adm", role="ADMIN", dataset_permission="NO_ACCESS"
        ),
    }
    dataset = SimpleNamespace(name="ds", _doc=SimpleNamespace(id=DATASET_ID))
    return SimpleNamespace(
        params=params or {}, dataset=dataset, user=users[user]
    )


def _create(name, user="manage"):
    return CreateLabelSchemaDocOperator().execute(
        _ctx({"name": name, "from_dataset": False}, user=user)
    )


def test_crud_through_operators():
    created = _create("lens")
    assert created["ok"] is True
    doc_id = created["schema"]["id"]

    listed = ListLabelSchemaDocsOperator().execute(_ctx(user="view"))
    assert [d["name"] for d in listed["schemas"]] == ["lens"]

    got = GetLabelSchemaDocOperator().execute(
        _ctx({"schema_id": doc_id, "include_resolved": True}, user="view")
    )
    assert got["ok"] is True
    assert got["schema"]["name"] == "lens"
    assert got["resolved"]["excluded_paths"] == []

    updated = UpdateLabelSchemaDocOperator().execute(
        _ctx(
            {
                "schema_id": doc_id,
                "visibility": {"fields": {"gt": {"tier": "hidden"}}},
            }
        )
    )
    assert updated["schema"]["visibility"]["fields"] == {
        "gt": {"tier": "hidden"}
    }

    assert (
        DeleteLabelSchemaDocOperator().execute(_ctx({"schema_id": doc_id}))[
            "ok"
        ]
        is True
    )
    assert (
        GetLabelSchemaDocOperator().execute(_ctx({"schema_id": doc_id}))[
            "error"
        ]
        == "not_found"
    )


def test_mutations_need_manage_reads_need_view():
    assert _create("nope", user="tag") == {"ok": False, "error": "forbidden"}
    assert _create("nope", user="view") == {"ok": False, "error": "forbidden"}
    assert _create("ok-admin", user="admin")["ok"] is True

    reads = ListLabelSchemaDocsOperator().execute(_ctx(user="view"))
    assert reads["ok"] is True
    assert [d["name"] for d in reads["schemas"]] == ["ok-admin"]


def test_no_user_is_unenforced():
    # OSS / no permission system: everything passes.
    assert _create("oss", user=None)["ok"] is True
    assert ListLabelSchemaDocsOperator().execute(_ctx(user=None))["ok"] is True


def test_duplicate_name_surfaces_as_error():
    assert _create("dup")["ok"] is True
    res = _create("dup")
    assert res["ok"] is False
    assert "already exists" in res["error"]
