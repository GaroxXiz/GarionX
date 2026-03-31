# 🚀 GarionX Chat App

GarionX adalah aplikasi chatbot berbasis web yang menggunakan teknologi modern seperti Node.js, Express, PostgreSQL, Google OAuth, dan Gemini AI.

---

## ✨ Features

- 🔐 Login dengan Google
- 💬 Multi Chat Room
- 🧠 AI Response (Gemini API)
- 🎭 Personality Mode (Default, Strict, Friendly, Clingy)
- 🗂️ Chat History
- 🗑️ Delete Chat
- 📱 Responsive Design (Mobile & Desktop)

---

## 📁 Project Structure
project-root/
│
├── api/
│ └── index.js
│
├── public/
│ ├── index.html
│ ├── style.css
│ ├── script.js
│ └── img/
│   └── GarionX_logo.png
│
├── db.js
├── package.json
└── .env

---

## ⚙️ Installation

### 1. Clone Repository
```bash
git clone https://github.com/your-username/garionx.git
cd garionx
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables

Buat file .env di root project:

PORT=3000

# JWT
JWT_SECRET=your_secret_key

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Gemini API
GEMINI_API_KEY=your_gemini_api_key

# Database
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=chatbot
DB_PORT=5432

### 4. Database Setup (PostgreSQL)

1. Buat Database
CREATE DATABASE chatbot;

2. Buat Tables
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  password TEXT,
  name TEXT,
  picture TEXT
);

CREATE TABLE chats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  title TEXT
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  chat_id INTEGER,
  role TEXT,
  content TEXT,
  model TEXT
);

### 5. Running Application
```bash
node server.js
```

buka di browser : http://localhost:3000

### 🔑 Google OAuth Setup
1. Buka Google Cloud Console
2. Buat OAuth Client ID
3. Tambahkan Authorized Redirect URI: http://localhost:3000/auth/google/callback
4. Masukkan credentials ke .env

### Gemini API Setup

1. Ambil API Key dari Google AI Studio
2. Masukkan ke .env: GEMINI_API_KEY=your_api_key

### API Endpoints
1. Auth
    - GET /auth/google
    - GET /auth/google/callback
    - GET /auth/me
2. Chat Room
    - POST /chat-room
    - GET /chat-room
    - DELETE /chat-room/:id
3. Message
    - GET /message/:id
    - POST /chat

### Cara Menggunakan
1. Klik Login With Google
2. Buat chat baru
3. Ketik pesan
4. Pilih personality AI
5. Kirim pesan (Enter / tombol kirim)

### ⚠️ Notes
1. Pastikan PostgreSQL sudah berjalan
2. Jangan upload file .env ke GitHub
3. Token disimpan di localStorage
4. Guest user tidak menyimpan chat

### 💡 Future Improvements
1. Streaming AI response
2. Upload file / image
3. Voice input
4. Dark mode
5. Chat search

### 👨‍💻 Author

Made with ❤️ by GarionX