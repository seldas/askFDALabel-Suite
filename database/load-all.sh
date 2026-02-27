#!/bin/sh
set -e

die() { echo "$*" 1>&2 ; exit 1; }

if [ $# -ne 2 -a $# -ne 3 ];
  then die "Expected arguments: <data-root-dir> <db-props-file> [<spl-loaders-jar>]"
fi

SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")

DATA_DIR="$1"
[ -d "$DATA_DIR" ] || die "Data directory was not found."

DB_PROPS="$2"
[ -f "$DB_PROPS" ] || die "Database properties file was not found."

JAR=${3:-"$SCRIPT_DIR"/splmonger-loaders.jar}
[ -f "$JAR" ] || die "Loaders jar file was not found."

export JAVA=${JAVA:-"java"}

"$JAVA" -cp "$JAR" splmonger.loaders.SplTerminologiesDownloader "$DATA_DIR"/terminologies
"$JAVA" -cp "$JAR" splmonger.loaders.GinasLoader "$DATA_DIR"/UNII_Records.txt "$DB_PROPS" ginas
"$JAVA" -cp "$JAR" splmonger.loaders.MeddraReleaseLoader "$DATA_DIR"/meddra/MedAscii "$DB_PROPS" meddra
"$JAVA" -cp "$JAR" splmonger.loaders.MedRTLoader "$DATA_DIR"/Core_MEDRT_XML.xml "$DB_PROPS" medrt
"$JAVA" -cp "$JAR" splmonger.loaders.SplLoader --init-truncate --batch-inserts --sections-data fragments --max-failures 100 "$DATA_DIR"/dailymed/labeling "$DATA_DIR"/terminologies "$DATA_DIR"/dailymed/fda_initiated_inactive_ndcs_indexing_spl_files.zip "$DB_PROPS" spl
"$JAVA" -cp "$JAR" splmonger.loaders.SplSectionMeddraTermOccurrenceLoader --max-failures 50 "$DATA_DIR"/dailymed/labeling "$DB_PROPS" meddra spl
"$JAVA" -cp "$JAR" splmonger.loaders.SubstanceMedRTClassLoader "$DATA_DIR"/dailymed/pharmacologic_class_indexing_spl_files.zip "$DB_PROPS" spl
"$JAVA" -cp "$JAR" splmonger.loaders.RxNormReleaseLoader "$DATA_DIR"/rxnorm/rrf "$DB_PROPS" rxnorig
"$JAVA" -cp "$JAR" splmonger.loaders.RxNormRelationalLoader "$DB_PROPS" rxnrel
