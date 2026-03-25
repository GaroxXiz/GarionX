import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "." });
});

app.use(session({
  secret: "secret",
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

const SECRET = process.env.JWT_SECRET;

// GOOGLE LOGIN STRATEGY
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/auth/google/callback"
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
      // update info user (biar selalu up to date)
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

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id=$1", [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

// OPTIONAL AUTH (JWT)
function optionalAuth(req, res, next) {
  const token = req.headers.authorization;

  if (!token || token === "null") {
    req.user = { id: null, guest: true };
    return next();
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    req.user.guest = false;
  } catch {
    req.user = { id: null, guest: true };
  }

  next();
}

// AUTH ROUTES
app.get("/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account"
  })
);

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user.id },
      SECRET,
      { expiresIn: "7d" }
    );

    res.redirect(`/?token=${token}`);
  }
);

// GET USER PROFILE (🔥 PENTING)
app.get("/auth/me", optionalAuth, async (req, res) => {
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
    console.error("AUTH ME ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// CHAT ROOM
app.post("/chat-room", optionalAuth, async (req, res) => {
  try {
    const userId = req.user.guest ? null : req.user.id;

    const result = await pool.query(
      "INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING *",
      [userId, "New Chat"]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error("CHAT ROOM ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// LOAD CHAT LIST
app.get("/chat-room", optionalAuth, async (req, res) => {
  try {
    if (req.user.guest) return res.json([]);

    const result = await pool.query(
      "SELECT * FROM chats WHERE user_id=$1 ORDER BY id DESC",
      [req.user.id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("LOAD CHAT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE CHAT
app.delete("/chat-room/:id", optionalAuth, async (req, res) => {
  try {
    if (req.user.guest) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    await pool.query(
      "DELETE FROM chats WHERE id=$1 AND user_id=$2",
      [id, req.user.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("DELETE CHAT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET MESSAGE
app.get("/message/:id", optionalAuth, async (req, res) => {
  try {
    const chatId = req.params.id;

    const result = await pool.query(
      "SELECT role, content FROM messages WHERE chat_id=$1 ORDER BY id",
      [chatId]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("GET MESSAGE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// GEMINI
function getPersonalityPrompt(type) {
  switch (type) {
    case "strict":
      return "You are an analytical AI. Answer logically and concisely.";
    case "friendly":
      return "You are a friendly AI. Use warm tone.";
    case "clingy":
      return "You are a very clingy AI.";
    default:
      return "You are a helpful assistant.";
  }
}

async function callGemini(messages, personality) {
  const text = messages[messages.length - 1].content;
  const systemPrompt = getPersonalityPrompt(personality);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: systemPrompt + "\n\nUser: " + text }]
          }
        ]
      })
    }
  );

  const data = await res.json();

  if (data.error) return "Error: " + data.error.message;

  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
}

// CHAT
app.post("/chat", optionalAuth, async (req, res) => {
  try {
    const { messages, chatId, personality } = req.body;

    const userId = req.user.guest ? null : req.user.id;

    const reply = await callGemini(messages, personality);
    const last = messages[messages.length - 1];

    const check = await pool.query(
      "SELECT COUNT(*) FROM messages WHERE chat_id=$1",
      [chatId]
    );

    if (parseInt(check.rows[0].count) === 0) {
      const title = last.content.substring(0, 40);

      await pool.query(
        "UPDATE chats SET title=$1 WHERE id=$2",
        [title, chatId]
      );
    }

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
    console.error("CHAT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 http://localhost:${PORT}`);
});