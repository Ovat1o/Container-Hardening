# Hardening de containers

Projeto acadêmico com uma aplicação Node.js e um banco MySQL. A configuração foi ajustada para reduzir a imagem, retirar senhas dos arquivos versionados, executar a aplicação sem usuário root e limitar o acesso à rede e aos recursos da máquina.

## Como executar

1. Copie `.env.example` para `.env`.
2. Preencha todas as variáveis do arquivo `.env`.
3. Execute:

```powershell
docker compose up --build -d
docker compose ps
Invoke-WebRequest http://localhost:3000/health | Select-Object -ExpandProperty Content
```

O resultado esperado contém `"status":"ok"` e `"banco":"conectado"`.

Para encerrar:

```powershell
docker compose down
```

Use `docker compose down -v` somente se também quiser apagar os dados locais do MySQL.

As decisões e evidências da atividade estão em [HARDENING.md](HARDENING.md).
