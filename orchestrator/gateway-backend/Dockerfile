FROM nginx:alpine
COPY entrypoint.sh /entrypoint.sh
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
RUN chmod +x /entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
