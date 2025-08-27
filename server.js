// server.js
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

// CORS
const allowed = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map(s => s.trim());
app.use(cors({
  origin: function (origin, cb) {
    if (!origin || allowed.includes("*") || allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"), false);
  }
}));
app.use(express.json());

// Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---- Schema / Migration ----
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      -- toplam skor (engelScore + bananaScore)
      score INTEGER NOT NULL,
      -- alt alanlar
      engel_score INTEGER NOT NULL DEFAULT 0,
      banana_score INTEGER NOT NULL DEFAULT 0,
      level INTEGER,
      bitcoin_address TEXT,
      twitter_handle TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_scores_score_desc ON scores (score DESC);`);
  console.log("✅ schema ready");
}
ensureSchema().catch(err => {
  console.error("schema error:", err);
  process.exit(1);
});

// Sağlık
app.get("/", (_req, res) => res.send("pixel-scores backend is running"));

/**
 * Frontend'in istediği: POST /submit-score
 * Body: { engelScore, bananaScore, level, bitcoinAddress, twitterHandle }
 * Cevap: { ok: true }
 */
app.post("/submit-score", async (req, res) => {
  try {
    const {
      engelScore,
      bananaScore,
      level,
      bitcoinAddress,
      twitterHandle
    } = req.body || {};

    const engel = Number(engelScore ?? 0);
    const muz = Number(bananaScore ?? 0);
    if (!Number.isFinite(engel) || !Number.isFinite(muz)) {
      return res.status(400).json({ ok: false, error: "engelScore/bananaScore must be numbers" });
    }
    const total = engel + muz;
    const lvl = (level === undefined || level === null) ? null : Number(level);
    if (lvl !== null && !Number.isFinite(lvl)) {
      return res.status(400).json({ ok: false, error: "level must be a number if provided" });
    }

    await pool.query(
      `
      INSERT INTO scores (score, engel_score, banana_score, level, bitcoin_address, twitter_handle)
      VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [total, engel, muz, lvl, bitcoinAddress || null, twitterHandle || null]
    );

    // En yüksek 10 kalsın, 11. ve sonrası silinsin
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
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

/**
 * Frontend'in istediği: GET /leaderboard?limit=10
 * Cevap: { ok:true, data:[{ totalScore, engelScore, bananaScore, level, bitcoinAddress, twitterHandle, createdAt }] }
 */
app.get("/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 50);
    const { rows } = await pool.query(
      `
      SELECT score, engel_score, banana_score, level, bitcoin_address, twitter_handle, created_at
      FROM scores
      ORDER BY score DESC, id ASC
      LIMIT $1
      `,
      [limit]
    );

    const data = rows.map(r => ({
      totalScore: r.score,
      engelScore: r.engel_score,
      bananaScore: r.banana_score,
      level: r.level,
      bitcoinAddress: r.bitcoin_address,
      twitterHandle: r.twitter_handle,
      createdAt: r.created_at
    }));

    res.json({ ok: true, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 listening on " + PORT));
