from flask import Flask, request, jsonify
from google import genai
import os
from dotenv import load_dotenv

# =====================
# LOAD ENV
# =====================
load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")

print("GEMINI KEY:", API_KEY)

app = Flask(__name__)

# =====================
# INIT CLIENT
# =====================
if not API_KEY:
    print("❌ GEMINI API KEY NOT FOUND")
    client = None
else:
    client = genai.Client(api_key=API_KEY)

# =====================
# HEALTH CHECK
# =====================
@app.route("/")
def home():
    return "Flask Gemini Running"

# =====================
# CHAT
# =====================
@app.route("/chat", methods=["POST"])
def chat():
    try:
        if not client:
            return jsonify({"error": "API key not set"}), 500

        data = request.json

        if not data:
            return jsonify({"error": "No JSON"}), 400

        messages = data.get("messages", [])

        if not messages:
            return jsonify({"error": "No messages"}), 400

        # 🔥 ambil pesan terakhir
        text = messages[-1].get("content", "")

        print("➡️ GEMINI INPUT:", text)

        # =====================
        # MODEL PRIMARY
        # =====================
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=text
            )
            reply = response.text

        # =====================
        # FALLBACK MODEL
        # =====================
        except Exception as model_error:
            print("⚠️ PRIMARY MODEL FAILED:", str(model_error))

            response = client.models.generate_content(
                model="gemini-1.5-flash",
                contents=text
            )
            reply = response.text

        print("✅ GEMINI REPLY:", reply)

        return jsonify({"reply": reply})

    except Exception as e:
        print("❌ ERROR:", str(e))
        return jsonify({"error": str(e)}), 500


# =====================
# DEBUG: LIST MODELS
# =====================
@app.route("/models")
def list_models():
    try:
        models = client.models.list()
        result = [m.name for m in models]
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =====================
# RUN
# =====================
if __name__ == "__main__":
    app.run(port=5000)