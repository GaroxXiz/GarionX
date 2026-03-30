import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import serverless from "serverless-http";
import fetch from "node-fetch";
import path from "path";
import { pool } from "../db.js";

dotenv.config();
const app = express();

// ======================
// CONFIG
// ======================
const FRONTEND_URL = process.env.FRONTEND_URL;
const BASE_URL = process.env.BASE_URL;
const SECRET = process.env.JWT_SECRET;

if (!SECRET) throw new Error("JWT_SECRET is missing");
if (!process.env.GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID missing");
if (!process.env.GOOGLE_CLIENT_SECRET) throw new Error("GOOGLE_CLIENT_SECRET missing");
if (!BASE_URL) throw new Error("BASE_URL missing");

// ======================
// MIDDLEWARE
// ======================
app.use(cors({
  origin: FRONTEND_URL ? FRONTEND_URL : true,
  credentials: true
}));

app.use(express.json());
// app.use(express.static(path.join(process.env.LAMBDA_TASK_ROOT || process.cwd(), "public")));

app.use(passport.initialize());

// ======================
// GOOGLE STRATEGY
// ======================
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${BASE_URL}/api/auth/google/callback`
},
async (accessToken, refreshToken, profile, done) => {
  try {
    const googleRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const googleData = await googleRes.json();

    const email = googleData.email;
    if (!email) {
      return done(new Error("Google email not found"), null);
    }
    const name = googleData.name;
    const picture = googleData.picture;

    let user = await pool.query(
      "SELECT * FROM users WHERE username=$1",
      [email]
    );

    if (user.rows.length === 0) {
      user = await pool.query(
        `INSERT INTO users (username, password, name, picture)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [email, "google", name, picture]
      );
    } else {
      await pool.query(
        `UPDATE users SET name=$1, picture=$2 WHERE username=$3`,
        [name, picture, email]
      );

      user = await pool.query(
        "SELECT * FROM users WHERE username=$1",
        [email]
      );
    }

    done(null, user.rows[0]);

  } catch (err) {
    console.error("GOOGLE AUTH ERROR:", err);
    done(err, null);
  }
}));

// ======================
// OPTIONAL AUTH (JWT)
// ======================
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  if (!token) {
    req.user = { id: null, guest: true };
    return next();
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = { ...decoded, guest: false };
  } catch {
    req.user = { id: null, guest: true };
  }

  next();
}

// ======================
// ROUTES
// ======================

// HOME
// app.get("/", (req, res) => {
//   res.sendFile(path.join(process.cwd(), "public", "index.html"));
// });

// GOOGLE LOGIN
app.get("/api/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account"
  })
);

// CALLBACK
app.get("/api/auth/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/" }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user.id },
      SECRET,
      { expiresIn: "7d" }
    );

    res.redirect(`${FRONTEND_URL}/?token=${token}`);
  }
);

// GET PROFILE
app.get("/api/auth/me", optionalAuth, async (req, res) => {
  try {
    if (req.user.guest) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await pool.query(
      "SELECT id, username, name, picture FROM users WHERE id=$1",
      [req.user.id]
    );

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================
// CHAT ROUTES (SAMA)
// ======================

// CREATE CHAT
app.post("/api/chat-room", optionalAuth, async (req, res) => {
  const userId = req.user.guest ? null : req.user.id;
  try {
    const result = await pool.query(
      "INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING *",
      [userId, "New Chat"]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// LOAD CHAT
app.get("/api/chat-room", optionalAuth, async (req, res) => {
  if (req.user.guest) return res.json([]);
  try {
    const result = await pool.query(
      "SELECT * FROM chats WHERE user_id=$1 ORDER BY id DESC",
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// DELETE
app.delete("/api/chat-room/:id", optionalAuth, async (req, res) => {
  if (req.user.guest) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.params;

  await pool.query(
    "DELETE FROM chats WHERE id=$1 AND user_id=$2",
    [id, req.user.id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Chat not found" });
  }

  res.json({ success: true });
});

// MESSAGE
app.get("/api/message/:id", async (req, res) => {
  try {
      const result = await pool.query(
      "SELECT role, content FROM messages WHERE chat_id=$1 ORDER BY id",
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// ======================
// GEMINI
// ======================
function getPersonalityPrompt(type) {
  switch (type) {
    case "strict": return "You are an analytical AI.";
    case "friendly": return "You are friendly.";
    case "clingy": return "You are clingy.";
    default: return "You are helpful.";
  }
}

async function callGemini(messages, personality) {
  const text = messages[messages.length - 1].content;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 8000);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: `${getPersonalityPrompt(personality)}\nUser: ${text}` }]
        }]
      }),
      signal: controller.signal
    }
  );

    if (!res.ok) {
    throw new Error("Gemini API failed");
  }

  const data = await res.json();
  if (!data?.candidates?.length) {
  throw new Error("Invalid Gemini response");
}

  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
}

// CHAT
app.post("/api/chat", optionalAuth, async (req, res) => {
  const { messages, chatId, personality } = req.body;

  if (!messages || !messages.length || !chatId) {
    return res.status(400).json({ error: "Invalid messages" });
  }

  const userId = req.user.guest ? null : req.user.id;
  try {
    const reply = await callGemini(messages, personality);
    const last = messages[messages.length - 1];

    await pool.query(
      "INSERT INTO messages (user_id, chat_id, role, content, model) VALUES ($1,$2,$3,$4,$5)",
      [userId, chatId, "user", last.content, "gemini"]
    );

    await pool.query(
      "INSERT INTO messages (user_id, chat_id, role, content, model) VALUES ($1,$2,$3,$4,$5)",
      [userId, chatId, "assistant", reply, "gemini"]
    );

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================
// EXPORT (WAJIB)
// ======================
export default serverless(app);