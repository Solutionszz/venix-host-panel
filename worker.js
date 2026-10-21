
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

async function iniciarWorker() {
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

  console.log("[VENIX HOST] Executor iniciado.");
  console.log("[VENIX HOST] Banco de dados conectado.");
  console.log("[VENIX HOST] Tabela de logs preparada.");
  console.log(
    "[VENIX HOST] Aguardando integração do ambiente isolado."
  );
}

iniciarWorker()
  .catch((erro) => {
    console.error("[VENIX HOST] Erro:", erro.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
