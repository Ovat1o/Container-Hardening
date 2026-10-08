FROM node:22-alpine3.22

# A imagem oficial do Node já possui o usuário sem privilégios "node".
ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Copiar primeiro os arquivos de dependências melhora o uso do cache do build.
COPY --chown=node:node app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Apenas o código necessário entra na imagem.
COPY --chown=node:node app/server.js ./server.js

# A aplicação não precisa executar como root.
USER node

EXPOSE 3000

CMD ["node", "server.js"]
