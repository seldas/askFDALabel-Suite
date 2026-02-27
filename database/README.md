# Data loading

## Loading the SPL schema from the distribution package

This section shows how to create and load a database with SPL data based
on the spl-monger distribution package, which is usually named
`splmonger-loaders-dist.tgz`.

The distribution package can be produced from the top of the source code
repository in either a Posix shell or Powershell via:

```sh
mvn -f loaders/pom.xml clean package
```

Note: Building the package as above requires Maven 3.8+ and Java jdk 17+
exectutables on your path. You can skip this step if the distribution
package `splmonger-loaders-dist.tgz` has been provided to you already.

Expand the dist package and cd into the extracted directory:

```sh
tar xzvf splmonger-loaders-dist.tgz
cd spl-data-loading
```

Place the DailyMed archive (`.zip`) files containing the SPLs to be loaded
into directory `data/dailymed/labeling`. The spl files can be downloaded
from the [DailyMed FULL RELEASES](https://dailymed.nlm.nih.gov/dailymed/spl-resources-all-drug-labels.cfm)
(at bottom of page).

You are free to include only whatever subset of these files that you want
to load into the database, for example you might want to only load human
prescription and remainder labels.

Next build the database container image and run it:

```sh
docker build -t splmonger-pg db
docker run -d --name splmonger-pg -p 127.0.0.1:5432:5432 -v splmonger-pg-data:/var/lib/postgresql/data splmonger-pg
```

If a `java` exectuble from a jdk 17 or greater is on you path, then you can run
the loader from the provided `load-spl.sh` script:

```sh
./load-spl.sh db/envs/local-dev.properties --batch-inserts --init-truncate --max-failures 100 --sections-data fragments
```

Else the loader can be run via Docker as follows:

```sh
docker run --network=host -v $(pwd):/app eclipse-temurin:21 \
  java -cp /app/splmonger-loaders.jar splmonger.loaders.SplLoader \
    --batch-inserts --init-truncate --max-failures 100 --sections-data fragments \
    /app/data/dailymed/labeling /app/data/terminologies "" /app/db/envs/local-dev.properties spl
```

## Loading SPL schema from source

Requirements:
- Git, Docker and Java 17+ executables should be on your path.
- Labeling zip files in data/dailymed/labeling
- Terminology files in data/dailymed/labeling
- fda_initiated_inactive_ndcs_indexing_spl_files.zip file in data/dailymed

Clone the repository:
```sh
git clone git@ncsvmgitlab.fda.gov:stephenharris/spl-monger.git
cd spl-monger
```

Build the database image:

```sh
docker build -t splmonger-pg db
```

Start the database container:
```sh
docker run -d --name splmonger-pg -p 127.0.0.1:5432:5432 -v splmonger-pg-data:/var/lib/postgresql/data splmonger-pg
```

Run the loader:
```sh
loaders/load-spl.sh loaders/target/splmonger-loaders.jar data db/envs/local-dev.properties --rx-rem-only
```

(Remove --rx-rem-only to load all SPLs like OTC, animal, etc)

## Loading all data (multiple schemas)

Load all data via the `load-all.sh` script:
```sh
load-all.sh <data-root-dir> <db-props-file> [<spl-loaders-jar>]
```

The `load-all.sh` script expects data files to be found in the following directory layout:

```
data
│   Core_MEDRT_XML.xml
│   UNII_Records.txt
├───dailymed
│   └───labeling
│         dm_spl_release_*.zip
│   fda_initiated_inactive_ndcs_indexing_spl_files.zip
│   pharmacologic_class_indexing_spl_files.zip
├───meddra
│   └───MedAscii
│         *.asc
├───rxnorm
│   └───rrf
│         *.RRF
└───terminologies
      *.xml
```