FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# "ng build" já usa a configuração de produção por padrão.
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist/wyvern-front/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
