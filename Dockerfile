FROM node:20-slim

# Instala Python 3, FFmpeg, Curl, Unzip e certificados SSL no ambiente Debian do Railway
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Instala o Deno e a versão mais recente do binário oficial do yt-dlp
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Instala a versão oficial mais recente do yt-dlp diretamente do GitHub
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copia arquivos de dependencias do Node.js
COPY package*.json ./

# Instala as dependencias do projeto
RUN npm install

# Copia o codigo do projeto para a imagem
COPY . .

# Copia o entrypoint que configura symlinks para dados persistentes
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expõe a porta 8080 para health check do Fly.io
EXPOSE 8080

# Comando de inicializacao do bot (entrypoint linka volume /data para arquivos persistentes)
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "start"]

