FROM nginx:alpine
COPY entrypoint.sh /entrypoint.sh
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY landing.html.template /landing.html.template
RUN chmod +x /entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
