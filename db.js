import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5,                // 🔥 BATASI koneksi
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});