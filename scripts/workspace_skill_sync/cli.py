"""Strict, non-sensitive CLI; version/argument handling precedes state access."""
import sys

VERSION = "workspace-skill/v1"


def main(args):
    # Imports involving the filesystem/host happen only after the version probe.
    command = args[0] if args else None
    arguments = args[1:]
    if arguments[:1] == ["--"]:
        arguments = arguments[1:]
    if command in ("refresh", "status") and arguments == ["--contract-version"]:
        print(VERSION)
        return 0
    from protocol import Failure, encode, skill_id
    valid = (command in ("refresh", "status") and len(arguments) == 2
             and arguments[0] == "--skill" and skill_id(arguments[1]))
    requested = arguments[1] if valid else None
    outcome, reason = "unavailable-helper", "invalid-arguments"
    if valid:
        try:
            from pathlib import Path
            from engine import Helper
            helper = Helper(str(Path(__file__).resolve().parents[2]))
            getattr(helper, command)(requested)
            outcome, reason = "pass", None
        except ImportError:
            outcome, reason = "unavailable-helper", "helper-unavailable"
        except Failure as error:
            outcome, reason = error.outcome, error.reason
        except Exception:
            outcome, reason = ("refresh-failed" if command == "refresh" else "unavailable-helper"), "operation-failed"
    sys.stdout.buffer.write(encode({"outcome": outcome, "skillId": requested}))
    if reason:
        sys.stderr.write(reason + "\n")
    codes = ({"pass": 0, "invalid-contract": 1, "unavailable-source": 2, "missing-skill": 3,
              "unavailable-helper": 4, "busy": 5, "refresh-failed": 6} if command == "refresh" else
             {"pass": 0, "mismatch": 1, "unavailable-source": 2, "missing-mirror": 3, "unavailable-helper": 4})
    return codes.get(outcome, 4)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
