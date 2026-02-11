#!/bin/sh
set -eu

SEARCH=${ENABLE_SEARCH:-0}
ANALYSIS=${ENABLE_ANALYSIS:-0}
DRUG=${ENABLE_DRUGTOXDB:-0}

ROUTES=""

if [ "$SEARCH" = "1" ]; then
  ROUTES="$ROUTES
    location /api/search/ {
      proxy_pass http://search_backend:5102/;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }"
fi

if [ "$ANALYSIS" = "1" ]; then
  ROUTES="$ROUTES
    location /api/analysis/ {
      proxy_pass http://analysis_web:5200/;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }"
fi

if [ "$DRUG" = "1" ]; then
  ROUTES="$ROUTES
    location /api/drugtoxdb/ {
      proxy_pass http://drugtoxdb_backend:5101/;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }"
fi

awk -v routes="$ROUTES" '{gsub(/# ROUTES_INSERT_HERE/, routes); print}' \
  /etc/nginx/templates/nginx.conf.template > /etc/nginx/nginx.conf

exec nginx -g "daemon off;"
