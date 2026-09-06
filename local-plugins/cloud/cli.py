"""
Standalone CLI over the cloud engine — the `fiftyone cloud …` surface
before it has a permanent package to live in.

    python cli.py login --api-url https://api.fiftyone.ai \
        --auth-url https://auth.fiftyone.ai/cas/api
    python cli.py push quickstart
    python cli.py status
    python cli.py logout
"""

import argparse
import sys

from engine import (
    CloudError,
    CloudProfile,
    NotPairedError,
    ProfileStore,
    Http,
    PushEvent,
    run_login,
    run_push,
)


def _print_pairing(pairing) -> None:
    print()
    print("To approve this device, visit:")
    print(f"    {pairing.verification_uri_complete}")
    print(f"or enter code {pairing.user_code} at {pairing.verification_uri}")
    print()
    print("Waiting for approval…", end="", flush=True)


def _login(args) -> int:
    store = ProfileStore()
    existing = store.load()
    api_url = args.api_url or (existing.api_url if existing else None)
    auth_url = args.auth_url or (existing.auth_url if existing else None)
    if not api_url or not auth_url:
        print("Both --api-url and --auth-url are required for a first login.")
        return 2

    try:
        import fiftyone.constants as foc

        client_version = foc.VERSION
    except ImportError:
        client_version = None

    profile = CloudProfile(
        api_url=api_url.rstrip("/"), auth_url=auth_url.rstrip("/")
    )
    run_login(
        profile,
        store,
        Http(),
        on_pairing=_print_pairing,
        client_version=client_version,
        on_poll=lambda: print(".", end="", flush=True),
    )
    print()
    print(f"Connected. Credentials saved to {store.path}")
    return 0


def _progress(event: PushEvent) -> None:
    label = (
        f"{event.stage.value:>10}: {event.done}/{event.total} {event.detail}"
    )
    print(f"\r{label:<79}", end="", flush=True)


def _push(args) -> int:
    profile = ProfileStore().require_paired()

    import fiftyone as fo

    dataset = fo.load_dataset(args.dataset)
    name = args.name or dataset.name

    print(f"Pushing {len(dataset)} samples to {name!r} at {profile.api_url}")
    outcome = run_push(
        profile, name, dataset, Http(), on_progress=_progress, fresh=args.fresh
    )
    print()

    print(
        f"Done: {outcome.samples} samples in cloud dataset {outcome.dataset!r}"
    )
    print(
        f"  media: {outcome.uploaded} uploaded, {outcome.skipped_uploads} resumed, "
        f"{outcome.missing_files} missing locally"
    )
    if outcome.rejected:
        print(f"  rejected: {len(outcome.rejected)}")
        for rejection in outcome.rejected[:10]:
            print(f"    [{rejection.index}] {rejection.reason}")
    if outcome.shortfall:
        print(f"  WARNING: {outcome.shortfall} manifest files never landed")
    return 1 if (outcome.rejected or outcome.shortfall) else 0


def _status(args) -> int:
    profile = ProfileStore().load()
    if profile is None:
        print("Not connected. Run `login` first.")
        return 1
    print(f"cloud:  {profile.api_url}")
    print(f"auth:   {profile.auth_url}")
    print(f"paired: {'yes' if profile.api_key else 'no'}")
    if profile.key_scope:
        print(f"scope:  {profile.key_scope}")
    if profile.key_expires_at:
        print(f"key expires: {profile.key_expires_at.isoformat()}")
    return 0


def _logout(args) -> int:
    ProfileStore().clear()
    print("Credentials removed.")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="fiftyone-cloud")
    commands = parser.add_subparsers(dest="command", required=True)

    login = commands.add_parser(
        "login", help="pair this machine with FiftyOne Cloud"
    )
    login.add_argument("--api-url", help="cloud API base URL")
    login.add_argument(
        "--auth-url", help="sign-in service base URL (incl. /cas/api)"
    )
    login.set_defaults(handler=_login)

    push = commands.add_parser(
        "push", help="push a local dataset to the cloud"
    )
    push.add_argument("dataset", help="local dataset name")
    push.add_argument("--name", help="cloud dataset name (default: same)")
    push.add_argument(
        "--fresh",
        action="store_true",
        help="ignore saved upload state and start over",
    )
    push.set_defaults(handler=_push)

    status = commands.add_parser(
        "status", help="show the stored cloud profile"
    )
    status.set_defaults(handler=_status)

    logout = commands.add_parser("logout", help="remove stored credentials")
    logout.set_defaults(handler=_logout)

    args = parser.parse_args(argv)
    try:
        return args.handler(args)
    except NotPairedError as err:
        print(str(err))
        return 2
    except CloudError as err:
        print(f"\nerror: {err}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
