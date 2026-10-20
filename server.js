
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin === "https://solutionszz.github.io") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS"
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

function gerarToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bots (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(50) NOT NULL,
      runtime VARCHAR(20) NOT NULL DEFAULT 'nodejs',
      status VARCHAR(20) NOT NULL DEFAULT 'stopped',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS bots_user_id_idx
    ON bots(user_id)
  `);

  console.log("Tabelas users e bots prontas");
}

// Autenticação das rotas privadas
async function autenticar(req, res, next) {
  const header = req.headers.authorization || "";
  const partes = header.split(" ");

  if (partes.length !== 2 || partes[0] !== "Bearer") {
    return res.status(401).json({
      error: "Faça login para continuar."
    });
  }

  try {
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

    req.user = resultado.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({
      error: "Token inválido ou expirado."
    });
  }
}

app.get("/", (req, res) => {
  res.json({
    name: "VENIX HOST API",
    status: "online",
    version: "1.2.0"
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
    console.error("Health:", error.message);

    res.status(503).json({
      status: "error",
      message: "Banco de dados indisponível"
    });
  }
});

// CADASTRO
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
        error: "O usuário deve ter de 3 a 20 caracteres: letras, números ou _."
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

// LOGIN
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

    const resultado = await pool.query(
      `SELECT id, username, email, password_hash, created_at
       FROM users
       WHERE LOWER(username) = LOWER($1)
          OR LOWER(email) = LOWER($1)
       LIMIT 1`,
      [login.trim()]
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

    return res.json({
      message: "Login realizado com sucesso.",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      },
      token: gerarToken(user)
    });
  } catch (error) {
    console.error("Erro no login:", error.message);

    return res.status(500).json({
      error: "Não foi possível realizar o login."
    });
  }
});

// MINHA CONTA
app.get("/api/auth/me", autenticar, (req, res) => {
  res.json({ user: req.user });
});

// MEUS BOTS: LISTAR
app.get("/api/bots", autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, name, runtime, status, created_at, updated_at
       FROM bots
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      bots: resultado.rows,
      total: resultado.rowCount
    });
  } catch (error) {
    console.error("Erro ao listar bots:", error.message);

    res.status(500).json({
      error: "Não foi possível carregar seus bots."
    });
  }
});

// MEUS BOTS: CRIAR
app.post("/api/bots", autenticar, async (req, res) => {
  try {
    const { name, runtime } = req.body || {};

    if (typeof name !== "string") {
      return res.status(400).json({
        error: "Informe o nome do bot."
      });
    }

    const nome = name.trim();
    const linguagem = runtime || "nodejs";

    if (nome.length < 2 || nome.length > 50) {
      return res.status(400).json({
        error: "O nome deve ter entre 2 e 50 caracteres."
      });
    }

    if (!["nodejs"].includes(linguagem)) {
      return res.status(400).json({
        error: "Runtime não suportado."
      });
    }

    const resultado = await pool.query(
      `INSERT INTO bots (user_id, name, runtime)
       VALUES ($1, $2, $3)
       RETURNING id, name, runtime, status, created_at, updated_at`,
      [req.user.id, nome, linguagem]
    );

    res.status(201).json({
      message: "Bot cadastrado com sucesso.",
      bot: resultado.rows[0]
    });
  } catch (error) {
    console.error("Erro ao criar bot:", error.message);

    res.status(500).json({
      error: "Não foi possível cadastrar o bot."
    });
  }
});

// MEUS BOTS: RENOMEAR
app.patch("/api/bots/:id", autenticar, async (req, res) => {
  try {
    const id = req.params.id;
    const { name } = req.body || {};

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        error: "ID de bot inválido."
      });
    }

    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 50
    ) {
      return res.status(400).json({
        error: "Informe um nome entre 2 e 50 caracteres."
      });
    }

    const resultado = await pool.query(
      `UPDATE bots
       SET name = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id, name, runtime, status, created_at, updated_at`,
      [name.trim(), id, req.user.id]
    );

    if (!resultado.rows[0]) {
      return res.status(404).json({
        error: "Bot não encontrado."
      });
    }

    res.json({
      message: "Bot renomeado.",
      bot: resultado.rows[0]
    });
  } catch (error) {
    console.error("Erro ao renomear bot:", error.message);

    res.status(500).json({
      error: "Não foi possível renomear o bot."
    });
  }
});

// MEUS BOTS: EXCLUIR
app.delete("/api/bots/:id", autenticar, async (req, res) => {
  try {
    const id = req.params.id;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        error: "ID de bot inválido."
      });
    }

    const resultado = await pool.query(
      `DELETE FROM bots
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, req.user.id]
    );

    if (!resultado.rows[0]) {
      return res.status(404).json({
        error: "Bot não encontrado."
      });
    }

    res.json({
      message: "Bot excluído com sucesso."
    });
  } catch (error) {
    console.error("Erro ao excluir bot:", error.message);

    res.status(500).json({
      error: "Não foi possível excluir o bot."
    });
  }
});

// EXECUÇÃO: exige um executor real conectado.
// Não marca um bot como rodando sem iniciar um processo.
app.post(
  "/api/bots/:id/start",
  autenticar,
  async (req, res) => {
    try {
      const id = req.params.id;

      if (!/^\d+$/.test(id)) {
        return res.status(400).json({
          error: "ID de bot inválido."
        });
      }

      const resultado = await pool.query(
        `SELECT id FROM bots
         WHERE id = $1 AND user_id = $2`,
        [id, req.user.id]
      );

      if (!resultado.rows[0]) {
        return res.status(404).json({
          error: "Bot não encontrado."
        });
      }

      return res.status(503).json({
        error: "Executor ainda não configurado.",
        message: "O bot foi cadastrado, mas falta conectar o ambiente de execução."
      });
    } catch (error) {
      console.error("Erro ao iniciar bot:", error.message);

      res.status(500).json({
        error: "Não foi possível processar a solicitação."
      });
    }
  }
);

// PARAR: mesma exigência de executor real
app.post(
  "/api/bots/:id/stop",
  autenticar,
  async (req, res) => {
    try {
      const id = req.params.id;

      if (!/^\d+$/.test(id)) {
        return res.status(400).json({
          error: "ID de bot inválido."
        });
      }

      const resultado = await pool.query(
        `SELECT id FROM bots
         WHERE id = $1 AND user_id = $2`,
        [id, req.user.id]
      );

      if (!resultado.rows[0]) {
        return res.status(404).json({
          error: "Bot não encontrado."
        });
      }

      return res.status(503).json({
        error: "Executor ainda não configurado.",
        message: "Não existe um processo de bot conectado para parar."
      });
    } catch (error) {
      console.error("Erro ao parar bot:", error.message);

      res.status(500).json({
        error: "Não foi possível processar a solicitação."
      });
    }
  }
);

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
