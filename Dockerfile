FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm install
COPY . .
RUN npm run build -w shared && npm run build -w frontend && npm run build -w backend

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend/dist ./frontend/dist
ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh", "-c", "npm run migrate -w backend && npm run seed -w backend && npm run start -w backend"]
