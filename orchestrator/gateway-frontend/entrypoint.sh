#!/bin/sh
set -eu

SEARCH=${ENABLE_SEARCH:-0}
ANALYSIS=${ENABLE_ANALYSIS:-0}
DRUG=${ENABLE_DRUGTOXDB:-0}

# Homepage: redirect to /search/ if enabled; else keep landing page
if [ "$SEARCH" = "1" ]; then
  cat > /usr/share/nginx/html/index.html <<'EOF'
<!doctype html><html><head>
<meta http-equiv="refresh" content="0; url=/search/">
</head><body></body></html>
EOF
else
  sed \
    -e "s/{{ENABLE_SEARCH}}/${SEARCH}/g" \
    -e "s/{{ENABLE_ANALYSIS}}/${ANALYSIS}/g" \
    -e "s/{{ENABLE_DRUGTOXDB}}/${DRUG}/g" \
    /landing.html.template > /usr/share/nginx/html/index.html
fi

ROUTES=""

if [ "$SEARCH" = "1" ]; then
  ROUTES="$ROUTES
    location /search/ {
      proxy_pass http://search_frontend:4102/;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }"
fi

if [ "$ANALYSIS" = "1" ]; then
  ROUTES="$ROUTES
    location /analysis/ {
      proxy_pass http://analysis_web:5200/;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }"
fi

if [ "$DRUG" = "1" ]; then
  ROUTES="$ROUTES
    location /drugtoxdb/ {
      proxy_pass http://drugtoxdb_frontend:4101/;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-Proto \$scheme;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }"
fi

# Render nginx.conf from template
awk -v routes="$ROUTES" '{gsub(/# ROUTES_INSERT_HERE/, routes); print}' \
  /etc/nginx/templates/nginx.conf.template > /etc/nginx/nginx.conf

exec nginx -g "daemon off;"
