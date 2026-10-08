const http = require('http');
const mysql = require('mysql2/promise');

const port = Number(process.env.PORT || 3000);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 4,
  connectTimeout: 5000
});

const server = http.createServer(async (request, response) => {
  if (request.url !== '/' && request.url !== '/health') {
    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    return response.end(JSON.stringify({ erro: 'Rota não encontrada' }));
  }

  try {
    await pool.query('SELECT 1');

    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    });
    return response.end(JSON.stringify({
      status: 'ok',
      mensagem: 'Aplicação protegida em execução',
      banco: 'conectado'
    }));
  } catch (error) {
    console.error('Falha ao consultar o banco:', error.code || error.message);
    response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    return response.end(JSON.stringify({ status: 'erro', banco: 'indisponível' }));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Aplicação iniciada na porta ${port}`);
});

async function encerrar() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
