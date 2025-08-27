// server.js
import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

// --- Config ---
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*"; // Prod'da domainini yaz

// --- App ---
const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// --- DB ---
let db;
async function initDb() {
  db = await open({
    filename: "./scores.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      twitterHandle TEXT,
      bitcoinAddress TEXT,
      engelScore INTEGER NOT NULL,
      bananaScore INTEGER NOT NULL,
      level INTEGER NOT NULL,
      totalScore INTEGER NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);

  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_scores_total ON scores(totalScore DESC, createdAt DESC);`
  );
}

// --- Helpers ---
function clampNumber(n, min, max) {
  n = Number(n);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// --- Routes ---

// Skor gönder
app.post("/submit-score", async (req, res) => {
  try {
    const {
      twitterHandle = "Belirtilmedi",
      bitcoinAddress = "Belirtilmedi",
      engelScore,
      bananaScore,
      level,
    } = req.body || {};

    const e = clampNumber(engelScore, 0, 1e6);
    const b = clampNumber(bananaScore, 0, 1e6);
    const lvl = clampNumber(level, 1, 999);
    const total = e + b;

    const createdAt = new Date().toISOString();

    // Yeni skor ekle (0 olsa bile)
    await db.run(
      `INSERT INTO scores (twitterHandle, bitcoinAddress, engelScore, bananaScore, level, totalScore, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(twitterHandle).slice(0, 50),
        String(bitcoinAddress).slice(0, 120),
        e,
        b,
        lvl,
        total,
        createdAt,
      ]
    );

    // En yüksek 10 dışındakileri sil
    await db.run(`
      DELETE FROM scores
      WHERE id NOT IN (
        SELECT id FROM scores
        ORDER BY totalScore DESC, createdAt ASC
        LIMIT 10
      )
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Sunucu hatası" });
  }
});

// Lider tablosu getir (ilk 10)
app.get("/leaderboard", async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT twitterHandle, bitcoinAddress, engelScore, bananaScore, level, totalScore, createdAt
       FROM scores
       ORDER BY totalScore DESC, createdAt ASC
       LIMIT 10`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Sunucu hatası" });
  }
});

// --- Başlat ---
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`✓ Score API http://localhost:${PORT}`);
  });
});
