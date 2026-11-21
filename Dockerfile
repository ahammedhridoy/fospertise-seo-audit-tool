# Use Debian-based Node LTS image (Playwright Chromium requires glibc / Debian, Alpine is not supported)
FROM node:22-bookworm-slim

# Set working directory
WORKDIR /app

# Set default environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Copy dependency definitions
COPY package*.json ./

# Install Node dependencies
RUN npm ci

# Install Chromium and required Linux system libraries for PDF generation & crawling
RUN npx playwright install --with-deps chromium

# Copy application code
COPY . .

# Expose server port (matches config.PORT default 3000)
EXPOSE 3000

# Start server
CMD ["npm", "start"]
