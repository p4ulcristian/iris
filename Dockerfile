FROM nginx:alpine

# Copy static files from docs to nginx html directory
COPY docs/ /usr/share/nginx/html

# Remove Dockerfile if it got copied
RUN rm -f /usr/share/nginx/html/Dockerfile

# Create nginx config that uses PORT env variable
RUN mkdir -p /etc/nginx/templates && \
    echo 'server { listen ${PORT}; location / { root /usr/share/nginx/html; index index.html; } }' > /etc/nginx/templates/default.conf.template

CMD ["nginx", "-g", "daemon off;"]
