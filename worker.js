
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
  max: 3
});

let encerrando = false;

async function prepararBanco() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_logs (
      id BIGSERIAL PRIMARY KEY,
      bot_id BIGINT NOT NULL
        REFERENCES bots(id) ON DELETE CASCADE,
      level VARCHAR(20) NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  console.log("[VENIX] Banco conectado.");
  console.log("[VENIX] Sistema de logs preparado.");
}

async function verificarBanco() {
  const resultado = await pool.query(
    "SELECT NOW() AS horario"
  );

  console.log(
    "[VENIX] Executor ativo:",
    resultado.rows[0].horario
  );
}

async function iniciar() {
  await prepararBanco();

  while (!encerrando) {
    try {
      await verificarBanco();
    } catch (erro) {
      console.error(
        "[VENIX] Erro de conexão:",
        erro.message
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 30000)
    );
  }
}

async function encerrar() {
  encerrando = true;
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", encerrar);
process.on("SIGINT", encerrar);

iniciar().catch((erro) => {
  console.error("[VENIX] Falha ao iniciar:", erro);
  process.exit(1);
});
