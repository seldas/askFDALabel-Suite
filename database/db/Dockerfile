FROM postgres:16

COPY pg-config.sql /docker-entrypoint-initdb.d/000-pg-config.sql
COPY schemas.sql /docker-entrypoint-initdb.d/010-schemas.sql
COPY meddra-tables.sql /docker-entrypoint-initdb.d/020-meddra-tables.sql
COPY ginas-tables.sql /docker-entrypoint-initdb.d/030-ginas-tables.sql
COPY medrt-tables.sql /docker-entrypoint-initdb.d/040-medrt-tables.sql
COPY rxnorig-tables.sql /docker-entrypoint-initdb.d/050-rxnorig-tables.sql
COPY rxnrel-tables.sql /docker-entrypoint-initdb.d/060-rxn-derived-tables.sql
COPY rxnrel-views.sql /docker-entrypoint-initdb.d/070-rxn-views.sql
COPY spl-tables.sql /docker-entrypoint-initdb.d/090-spl-tables.sql
COPY spl-functions.sql /docker-entrypoint-initdb.d/095-spl-functions.sql
COPY spl-views.sql /docker-entrypoint-initdb.d/100-spl-views.sql

RUN chmod a+r /docker-entrypoint-initdb.d/*

ENV POSTGRES_USER=splmonger
ENV POSTGRES_PASSWORD=splmonger
ENV POSTGRES_DB=splmonger
