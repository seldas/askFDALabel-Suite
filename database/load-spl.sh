#!/bin/sh
# Example:
# ./load-spl.sh db/envs/local-dev.properties --batch-inserts --init-truncate --max-failures 100 --sections-data fragments

set -e
SCRIPT_DIR="$(dirname "$(realpath "$0")")"

die() { echo "$*" 1>&2 ; exit 1; }

DB_PROPS=${1:-"$SCRIPT_DIR/db/envs/local-dev.properties"}
[ -f "$DB_PROPS" ] || die "Database properties file was not found."

SPL_LOADER_OPTS=${@:2}
echo "Loader options: " $OPTS

DM_ARCHIVES_DIR="$SCRIPT_DIR"/data/dailymed/labeling
TERMS_DIR="$SCRIPT_DIR"/data/terminologies
NDC_INACTS="" # skip loading ndc inactivations
JAR="$SCRIPT_DIR"/splmonger-loaders.jar

if [[ -z "$JAVA_HOME" ]]; then JAVA=java; else JAVA="$JAVA_HOME/bin/java"; fi

"$JAVA" -cp "$JAR" splmonger.loaders.SplLoader $SPL_LOADER_OPTS "$DM_ARCHIVES_DIR" "$TERMS_DIR" "$NDC_INACTS" "$DB_PROPS" spl
