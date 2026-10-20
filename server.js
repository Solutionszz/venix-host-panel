
const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

app.get("/", (req, res) => {
  res.json({
    name: "VENIX HOST API",
    status: "online",
    version: "1.0.0"
  });
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      message: "API e banco funcionando"
    });
  } catch (error) {
    console.error("Falha ao verificar o banco:", error.message);
    res.status(503).json({
      status: "error",
      message: "Banco de dados indisponível"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`VENIX HOST API rodando na porta ${PORT}`);
});
