FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY dados ./dados
COPY scripts ./scripts
COPY src ./src

# o CapRover roteia para a porta 80 do container por padrão; porta < 1024
# exige root, por isso a imagem não troca de usuário
ENV PORTA=80
EXPOSE 80

CMD ["node", "scripts/servidor.js"]
