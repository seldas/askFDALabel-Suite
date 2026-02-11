#!/usr/bin/env python3
import argparse
import os
import subprocess
import sys


PROJECT_NAME = "orchestrator"


def main():
    p = argparse.ArgumentParser("askFDALabel orchestrator")
    p.add_argument("--all", action="store_true", help="Run all apps")
    p.add_argument("--search", action="store_true", help="Run search app")
    p.add_argument("--analysis", action="store_true", help="Run analysis app")
    p.add_argument("--drugtoxdb", action="store_true", help="Run drugtoxdb app")
    p.add_argument("--down", action="store_true", help="Stop everything (docker compose down)")
    p.add_argument("--build", action="store_true", help="Build images (only needed when deps/Dockerfiles change)")
    p.add_argument("-d", "--detach", action="store_true", help="Run in background (docker compose up -d)")
    args = p.parse_args()

    # Resolve selected apps
    selected = set()
    if args.all:
        selected |= {"search", "analysis", "drugtoxdb"}
    else:
        if args.search:
            selected.add("search")
        if args.analysis:
            selected.add("analysis")
        if args.drugtoxdb:
            selected.add("drugtoxdb")

    # Default: if no flags, run search (nice dev default)
    if not selected and not args.down:
        selected.add("search")

    env = os.environ.copy()

    # Gateway uses these to generate routing + homepage
    env["ENABLE_SEARCH"] = "1" if "search" in selected else "0"
    env["ENABLE_ANALYSIS"] = "1" if "analysis" in selected else "0"
    env["ENABLE_DRUGTOXDB"] = "1" if "drugtoxdb" in selected else "0"

    # Profiles only matter for "up"
    if not args.down:
        env["COMPOSE_PROFILES"] = ",".join(sorted(selected))
    else:
        env.pop("COMPOSE_PROFILES", None)

    compose_file = os.path.join(os.path.dirname(__file__), "docker-compose.yml")

    if args.down:
        cmd = ["docker", "compose", "-p", PROJECT_NAME, "-f", compose_file, "down", "--remove-orphans"]
    else:
        cmd = ["docker", "compose", "-p", PROJECT_NAME, "-f", compose_file, "up"]
        if args.build:
            cmd.append("--build")
        if args.detach:
            cmd.append("-d")

    print("Running:", " ".join(cmd))
    print("Profiles:", env.get("COMPOSE_PROFILES", ""))
    sys.exit(subprocess.call(cmd, env=env))


if __name__ == "__main__":
    main()
