FROM nginx:alpine

# Copy static files to nginx html directory
COPY . /usr/share/nginx/html

# Remove Dockerfile from served content
RUN rm -f /usr/share/nginx/html/Dockerfile

# Create nginx config that uses PORT env variable
RUN mkdir -p /etc/nginx/templates && \
    echo 'server { listen ${PORT}; location / { root /usr/share/nginx/html; index index.html; } }' > /etc/nginx/templates/default.conf.template

CMD ["nginx", "-g", "daemon off;"]
