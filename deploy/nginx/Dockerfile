FROM nginx:stable-alpine

RUN apk add --no-cache curl

RUN mkdir -p /etc/nginx/certs
COPY default.conf /etc/nginx/conf.d/default.conf
COPY cert.pem /etc/nginx/certs/askfdalabel.crt
COPY key.pem /etc/nginx/certs/askfdalabel.key

NEXT_PUBLIC_API_BASE=/askfdalabel_api
NEXT_PUBLIC_DASHBOARD_BASE=/askfdalabel