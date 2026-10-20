
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin === "https://solutionszz.github.io") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "20kb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

const JWT_SECRET = process.env.JWT_SECRET;

async function iniciarBanco() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log("Tabela users pronta");
}

function gerarToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

app.get("/", (req, res) => {
  res.json({
    name: "VENIX HOST API",
    status: "online",
    version: "1.1.0"
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
    console.error(error.message);
    res.status(503).json({
      status: "error",
      message: "Banco de dados indisponível"
    });
  }
});

// Cadastro
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        error: "Preencha usuário, email e senha."
      });
    }

    const nome = username.trim();
    const correio = email.trim().toLowerCase();

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(nome)) {
      return res.status(400).json({
        error: "O usuário deve ter 3 a 20 caracteres: letras, números ou _."
      });
    }

    if (
      correio.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correio)
    ) {
      return res.status(400).json({
        error: "Email inválido."
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        error: "A senha deve ter entre 8 e 72 caracteres."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const resultado = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, created_at`,
      [nome, correio, passwordHash]
    );

    const user = resultado.rows[0];

    return res.status(201).json({
      message: "Conta criada com sucesso.",
      user,
      token: gerarToken(user)
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Esse usuário ou email já está cadastrado."
      });
    }

    console.error("Erro no cadastro:", error.message);
    return res.status(500).json({
      error: "Não foi possível criar a conta."
    });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { login, password } = req.body || {};

    if (
      typeof login !== "string" ||
      typeof password !== "string" ||
      login.length > 255 ||
      password.length > 72
    ) {
      return res.status(400).json({
        error: "Informe usuário ou email e senha."
      });
    }

    const identificador = login.trim();
    const resultado = await pool.query(
      `SELECT id, username, email, password_hash, created_at
       FROM users
       WHERE LOWER(username) = LOWER($1)
          OR LOWER(email) = LOWER($1)
       LIMIT 1`,
      [identificador]
    );

    const user = resultado.rows[0];

    if (
      !user ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        error: "Usuário ou senha incorretos."
      });
    }

    const token = gerarToken(user);

    return res.json({
      message: "Login realizado com sucesso.",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    console.error("Erro no login:", error.message);
    return res.status(500).json({
      error: "Não foi possível realizar o login."
    });
  }
});

// Consultar a conta autenticada
app.get("/api/auth/me", async (req, res) => {
  try {
    const header = req.headers.authorization || "";
    const partes = header.split(" ");

    if (partes.length !== 2 || partes[0] !== "Bearer") {
      return res.status(401).json({
        error: "Token não informado."
      });
    }

    const dados = jwt.verify(partes[1], JWT_SECRET);

    const resultado = await pool.query(
      `SELECT id, username, email, created_at
       FROM users WHERE id = $1`,
      [dados.id]
    );

    if (!resultado.rows[0]) {
      return res.status(401).json({
        error: "Conta não encontrada."
      });
    }

    return res.json({ user: resultado.rows[0] });
  } catch (error) {
    return res.status(401).json({
      error: "Token inválido ou expirado."
    });
  }
});

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error(
    "Configure JWT_SECRET no Render com um segredo aleatório de pelo menos 32 caracteres."
  );
  process.exit(1);
}

iniciarBanco()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`VENIX HOST API rodando na porta ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Erro ao iniciar o banco:", error.message);
    process.exit(1);
  });
