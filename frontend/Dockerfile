# ─── Stage 1: deps ───────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev


# ─── Stage 2: builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build


# ─── Stage 3: final (lean runtime) ───────────────────────────────────────────
FROM node:20-alpine AS final

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only prod node_modules from deps stage
COPY --from=deps    /app/node_modules ./node_modules

# Copy built output from builder stage
COPY --from=builder /app/.next        ./.next
COPY --from=builder /app/public       ./public
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production

USER appuser

EXPOSE 3000

CMD ["npm", "run", "start"]