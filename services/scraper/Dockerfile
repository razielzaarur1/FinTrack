FROM node:22-slim

# Set environment variables for Puppeteer and Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

# Install Chromium, fonts, jq, curl, and necessary runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    jq \
    curl \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user 'scraper'
RUN groupadd -r scraper && useradd -r -g scraper -m -s /bin/bash scraper

WORKDIR /app

# Copy package definition and install production dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy application source code and scripts
COPY src/ ./src/
COPY scripts/ ./scripts/

# Ensure proper permissions and make run script executable
RUN chmod +x ./scripts/run-scrape-all.sh && \
    chown -R scraper:scraper /app

# Switch to non-root user
USER scraper

EXPOSE 3002

CMD ["node", "src/server.js"]
