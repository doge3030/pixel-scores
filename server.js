// server.js
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

// CORS: birden fazla origin virgülle eklenebilir
const allowed = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map(s => s.trim());
app.use(cors({
  origin: function (origin, cb) {
    if (!origin || allowed.includes("*") || allowed.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error("Not allowed by CORS"), false);
  }
}));

app.use(express.json());

// Postgres pool (Railway DATABASE_URL veriyor)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway'de genelde SSL gerekir
  ssl: { rejectUnauthorized: false }
});

// tabloyu açılışta oluştur
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      player_id TEXT NOT NULL,
      player_name TEXT,
      score INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_scores_score_desc ON scores (score DESC);
  `);
  console.log("✅ schema ready");
}
ensureSchema().catch(err => {
  console.error("schema error:", err);
  process.exit(1);
});

// Sağlık kontrolü
app.get("/", (_req, res) => {
  res.send("pixel-scores backend is running");
});

// Skor ekle
app.post("/api/score", async (req, res) => {
  try {
    const { player_id, player_name, score } = req.body || {};
    if (typeof score !== "number") {
      return res.status(400).json({ error: "score must be a number" });
    }
    await pool.query(
      "INSERT INTO scores (player_id, player_name, score) VALUES ($1,$2,$3)",
      [player_id || "anon", player_name || null, score]
    );

    // En yüksek 10 kalsın, geri kalanı sil
    await pool.query(`
      DELETE FROM scores
      WHERE id IN (
        SELECT id FROM scores
        ORDER BY score DESC, id ASC
        OFFSET 10
      );
    `);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

// İlk 10'u getir (0 skor olsa da listede yeri varsa görünür)
app.get("/api/leaderboard", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT player_id, player_name, score, created_at
      FROM scores
      ORDER BY score DESC, id ASC
      LIMIT 10
    `);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 listening on " + PORT);
});
