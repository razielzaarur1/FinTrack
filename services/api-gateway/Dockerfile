FROM node:22-alpine

# Set working directory
WORKDIR /app

# Create non-root user and group
RUN addgroup -S app && adduser -S app -G app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source code
COPY --chown=app:app . .

# Use non-root user
USER app

# Expose service port
EXPOSE 3000

# Start API Gateway service
CMD ["node", "src/index.js"]
