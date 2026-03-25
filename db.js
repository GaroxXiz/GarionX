import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  host: "localhost", 
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "Garox784",
  database: process.env.DB_NAME || "chatbot",
  port: Number(process.env.DB_PORT) || 5432
});