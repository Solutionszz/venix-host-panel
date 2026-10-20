
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    name: "VENIX HOST API",
    status: "online",
    version: "1.0.0"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "API funcionando"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`VENIX HOST API rodando na porta ${PORT}`);
});
