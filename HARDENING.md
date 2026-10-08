# Relatório de hardening do container

## 1. Situação inicial

Antes das alterações, foi feita uma tentativa de build com `docker compose -p hardening-before up --build -d`. A própria saída mostrou o excesso da configuração original: o comando `apt-get install -y nodejs npm` tentou instalar 697 pacotes e informou cerca de 1.127 MB adicionais. A tentativa foi interrompida depois de aproximadamente dez minutos, pois já havia evidência suficiente do desperdício e a imagem ainda estava instalando pacotes.

Também foram encontrados estes problemas:

- `ubuntu:latest` e `mysql:latest` não fixavam uma linha de versão;
- a imagem Ubuntu não era necessária para uma aplicação Node.js;
- `COPY . .` enviava todo o projeto para a imagem;
- `apt-get update` e `apt-get install` criavam camadas grandes e instalavam ferramentas desnecessárias;
- o `package.json` estava vazio e o `npm install` era executado no diretório errado;
- `DB_PASSWORD=123456` estava gravada no Dockerfile;
- a aplicação era executada como `root`;
- as portas da aplicação e do banco eram publicadas em todas as interfaces do host;
- o banco ficava acessível diretamente pela porta 3306, embora apenas a aplicação precisasse acessá-lo;
- não existiam limites de CPU, memória ou processos;
- não existiam restrições de capacidades, escrita no sistema de arquivos ou elevação de privilégios;
- `server.js` apenas imprimia uma mensagem e encerrava, portanto a porta 3000 não atendia requisições.

## 2. Alterações realizadas

### Imagem e dependências

A aplicação passou a usar `node:22-alpine3.22`, uma imagem específica e menor, que já contém Node.js e npm. Assim, não é necessário instalar centenas de pacotes do Ubuntu. O Dockerfile copia primeiro `package.json` e `package-lock.json`, usa `npm ci --omit=dev` e depois copia somente `server.js`. O `.dockerignore` impede o envio de arquivos locais e documentação ao contexto do build.

O banco usa `mysql:8.4`, linha LTS definida no lugar de `latest`.

### Usuário e privilégios

A aplicação é executada pelo usuário `node`, já fornecido pela imagem oficial. No Compose, foram removidas todas as capacidades Linux da aplicação, bloqueada a aquisição de novos privilégios e marcado o sistema de arquivos como somente leitura. Um `tmpfs` pequeno foi mantido em `/tmp` para arquivos temporários.

### Segredos

As senhas foram removidas do Dockerfile e do Compose. Os valores ficam apenas no arquivo local `.env`, ignorado pelo Git. O arquivo `.env.example` contém somente os nomes das variáveis, sem valores reais. Em produção, seria preferível usar um gerenciador de segredos ou Docker Secrets.

### Rede e portas

Somente a porta da aplicação é publicada, ligada a `127.0.0.1`. O MySQL não publica portas no host. A imagem declara 3306 e 33060 internamente, mas a aplicação usa somente 3306 na rede privada. O banco participa apenas da rede interna `backend`; a aplicação participa dela e também da rede `frontend`, necessária para receber as requisições publicadas pelo host. Não há montagem de diretórios do host; o banco usa apenas um volume nomeado.

### Recursos e disponibilidade

A aplicação recebeu limite de 0,50 CPU, 128 MB de memória e 100 processos. O banco recebeu 0,75 CPU, 512 MB e 200 processos. O `healthcheck` do MySQL evita que a aplicação inicie antes de o banco estar pronto. A política `unless-stopped` permite reinício após falhas sem criar um ciclo quando o usuário interrompe os serviços.

## 3. Respostas às perguntas da atividade

1. **Qual imagem está sendo utilizada?** Antes era `ubuntu:latest`; agora a aplicação usa `node:22-alpine3.22` e o banco usa `mysql:8.4`.
2. **Ela é realmente necessária?** O Ubuntu genérico não era necessário. A imagem oficial do Node já possui o runtime exigido pela aplicação.
3. **Existe uma versão menor ou mais específica?** Sim. A variante Alpine é menor e as tags escolhidas definem a versão principal e a distribuição base.
4. **Existem pacotes desnecessários?** Sim. A instalação original adicionaria 697 pacotes, inclusive compiladores, ferramentas gráficas e utilitários que a aplicação não usa. Eles foram eliminados.
5. **O container roda como root?** A aplicação rodava como root. Agora usa o usuário `node`. O container oficial do MySQL faz sua inicialização própria e reduz para o usuário `mysql` durante a execução do servidor.
6. **Quais riscos isso pode gerar?** Um processo root comprometido tem maior capacidade de alterar o container e explorar falhas para atingir outros recursos. O impacto é reduzido com usuário não-root e menos privilégios.
7. **Quais portas estão abertas?** Somente `127.0.0.1:3000` é publicada no host. A imagem MySQL declara 3306 e 33060 internamente, sem mapeamento para o host.
8. **Todas são realmente necessárias?** A aplicação precisa de 3000 no host e de 3306 para acessar o banco. A porta 33060, herdada da imagem MySQL, não é usada, mas também não é publicada; sua exposição fica limitada à rede que contém apenas a aplicação e o banco.
9. **Existem variáveis sensíveis?** Sim: `DB_PASSWORD` e `MYSQL_ROOT_PASSWORD`.
10. **Existem senhas diretamente no Dockerfile ou no Compose?** Existiam no Dockerfile e no Compose. Agora aparecem apenas como referências a variáveis do `.env` local.
11. **O container se comunica com outros serviços?** Sim. A aplicação se comunica com o MySQL pelo nome `banco` e porta 3306.
12. **Essa comunicação está restrita ao necessário?** Sim. O banco está somente na rede interna `backend` e não publica porta no host. A aplicação usa essa rede para falar com o banco e a rede `frontend` para atender o host.
13. **Existem limites de CPU e memória?** Não existiam. Agora ambos os serviços têm limites de CPU, memória e quantidade de processos.
14. **O container possui acesso ao sistema de arquivos do host?** Não. Não há bind mount. A aplicação usa sistema de arquivos somente leitura e o banco grava em volume nomeado gerenciado pelo Docker.
15. **Existem diretórios montados desnecessariamente?** Não. Somente o volume persistente de dados do MySQL é mantido.
16. **Há risco de escalada de privilégio?** A configuração inicial tinha risco maior por executar como root e sem restrições. Na aplicação, o risco foi reduzido com usuário `node`, `cap_drop: ALL`, `no-new-privileges` e sistema de arquivos somente leitura.

## 4. Validação

Comandos usados para validar a versão final:

```powershell
docker compose config --quiet
docker compose up --build -d
docker compose ps
Invoke-WebRequest http://localhost:3000/health | Select-Object -ExpandProperty Content
docker compose exec app id
docker compose exec app sh -c "touch /teste.txt"
docker inspect hardening-container-main-app-1 --format '{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.HostConfig.ReadonlyRootfs}}'
docker compose exec banco mysql -uapp_user -p -e "SELECT 1" sistema
```

Resultados obtidos em 08/10/2026:

- os dois serviços ficaram ativos e o banco apareceu como `healthy`;
- `/health` devolveu HTTP 200 com `status: ok` e `banco: conectado`;
- `id` exibiu `uid=1000(node)`, portanto a aplicação não executa como root;
- a tentativa de criar `/teste.txt` falhou com `Read-only file system`;
- o `inspect` confirmou 134.217.728 bytes, 500.000.000 NanoCPUs, leitura somente, `cap_drop: ALL` e `no-new-privileges`;
- a consulta `SELECT 1 AS teste` retornou `1` pela rede interna;
- somente `127.0.0.1:3000` apareceu publicada e o banco não apresentou porta publicada;
- a imagem final da aplicação mediu 58.890.954 bytes;
- `npm audit --omit=dev` informou zero vulnerabilidades conhecidas.

Os resultados reais da execução ficam em `docs/evidencias/depois.txt`.

## 5. Análise final

O projeto permanece simples, mas agora entrega um serviço HTTP que verifica a conexão com o MySQL. A superfície de ataque foi reduzida pela imagem menor, menor quantidade de arquivos, usuário não-root, rede interna, ausência de porta pública do banco e restrições de execução. O uso de `.env` atende ao exercício local, mas não deve ser tratado como cofre de segredos em produção.
