let token = localStorage.getItem("token");
let currentChatId = null;

let isSending = false;
let isCreatingChat = false;

let personalitySelect;
let sidebar, overlay, toggleBtn, mobileToggle;

// INIT
window.addEventListener("DOMContentLoaded", () => {
  personalitySelect = document.getElementById("personality");

  sidebar = document.querySelector(".sidebar");
  overlay = document.getElementById("overlay");
  toggleBtn = document.getElementById("toggleSidebar");
  mobileToggle = document.getElementById("toggleSidebarMobile");

  // DESKTOP TOGGLE (collapse)
  toggleBtn?.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });

  // MOBILE OPEN SIDEBAR
  mobileToggle?.addEventListener("click", () => {
    sidebar.classList.add("active");
    overlay.classList.add("active");
  });

  // CLOSE SIDEBAR (overlay)
  overlay?.addEventListener("click", () => {
    closeSidebarMobile();
  });

  lucide.createIcons();
  renderUser();
});

function closeSidebarMobile() {
  if (window.innerWidth <= 768) {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
  }
}

// GOOGLE LOGIN
function loginGoogle() {
  window.location.href = "/api/auth/google";
}

// LOGOUT
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  
  token = null;

  renderUser();

  document.getElementById("chat").innerHTML = "";
  document.getElementById("chat-list").innerHTML = "";
}

// TOKEN FROM URL
const params = new URLSearchParams(window.location.search);
const t = params.get("token");

if (t) {
  localStorage.setItem("token", t);
  token = t;
  window.history.replaceState({}, document.title, "/");
}

// GET USER PROFILE
async function getUserProfile() {
  if (!token) return null;

  try {
    const res = await fetch("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error("Unauthorized");

    return await res.json(); // { name, picture }
  } catch (err) {
    console.error("GET USER ERROR:", err);
    return null;
  }
}

// RENDER USER UI
async function renderUser() {
  const section = document.getElementById("user-section");

  if (!token) {
    section.innerHTML = `
      <button onclick="loginGoogle()">Login With Google</button>
    `;
    return;
  }

  const user = await getUserProfile();

  if (!user) {
    section.innerHTML = `
      <button onclick="loginGoogle()">Login With Google</button>
    `;
    return;
  }

  section.innerHTML = `
    <div class="user-profile">
      <div class="user-row">
        <img src="${user.picture}" class="avatar"/>
        <span class="username">${user.name}</span>
      </div>

      <button class="logout-btn" onclick="logout()">Logout</button>
    </div>
  `;

  lucide.createIcons();
  refreshUserData();
  loadChats();
}

async function refreshUserData() {
  try {
    const freshUser = await getUserProfile();

    if (freshUser) {
      localStorage.setItem("user", JSON.stringify(freshUser));
    }
  } catch (err) {
    console.error("REFRESH USER ERROR:", err);
  }
}

// CREATE CHAT
async function createChat() {
  if (isCreatingChat) return;
  isCreatingChat = true;

  try {
    const res = await fetch("/api/chat-room", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (!res.ok) throw new Error("Create chat failed");

    const data = await res.json();

    currentChatId = data.id;

    document.getElementById("chat").innerHTML = "";
    loadChats();

  } catch (err) {
    console.error("CREATE CHAT ERROR:", err);
  }

  isCreatingChat = false;
}

// LOAD CHAT LIST
async function loadChats() {
  try {
    const res = await fetch("/api/chat-room", {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    const chats = await res.json();
    const list = document.getElementById("chat-list");

    list.innerHTML = "";

    chats.forEach((chat) => {
      const div = document.createElement("div");
      div.className = "chat-item";
      div.onclick = () => {
        loadChat(chat.id);
        closeSidebarMobile();
      };

      const title = document.createElement("span");
      title.innerText = chat.title;

      const delBtn = document.createElement("button");
      delBtn.className = "delete-btn";
      delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteChat(chat.id);
      };

      div.appendChild(title);
      div.appendChild(delBtn);

      list.appendChild(div);
    });

    lucide.createIcons();

  } catch (err) {
    console.error("LOAD CHATS ERROR:", err);
  }
}

// LOAD CHAT
async function loadChat(id) {
  try {
    currentChatId = id;

    const res = await fetch(`/api/message/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    const data = await res.json();

    const chatBox = document.getElementById("chat");
    chatBox.innerHTML = "";

    data.forEach(msg => {
      addMessage(msg.content, msg.role === "user" ? "user" : "bot");
    });

  } catch (err) {
    console.error("LOAD CHAT ERROR:", err);
  }
}

// DELETE CHAT
async function deleteChat(id) {
  if (!confirm("Delete this chat?")) return;

  try {
    const res = await fetch(`/api/chat-room/${id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (!res.ok) throw new Error("Delete failed");

    if (currentChatId === id) {
      currentChatId = null;
      document.getElementById("chat").innerHTML = "";
    }

    loadChats();

  } catch (err) {
    console.error("DELETE ERROR:", err);
  }
}

// SEND MESSAGE
async function send() {
  const model = "gemini";

  if (isSending) return;
  isSending = true;

  const personality = personalitySelect ? personalitySelect.value : "default";

  const input = document.getElementById("input");
  const text = input.value.trim();

  if (!text) {
    isSending = false;
    return;
  }

  try {
    if (!currentChatId) {
      await createChat();

      if (!currentChatId) {
        throw new Error("Chat gagal dibuat");
      }
    }

    addMessage(text, "user");
    input.value = "";

    const typing = addTyping();

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: text }],
        model,
        chatId: currentChatId,
        personality
      })
    });

    if (!res.ok) throw new Error("Server error");

    const data = await res.json();

    removeTyping(typing);
    addTypingMessage(data.reply, model);

  } catch (err) {
    console.error("SEND ERROR:", err);
    addMessage("Error: gagal mengambil response", "bot");
  }

  isSending = false;
}

// UI
function addMessage(text, sender) {
  const chat = document.getElementById("chat");

  const div = document.createElement("div");
  div.className = `message ${sender}`;

  const label = document.createElement("small");
  label.innerText = sender === "user" ? "You" : "Assistant";

  div.appendChild(label);

  const content = document.createElement("div");

  if (sender === "user") {
    content.innerText = text;
  } else {
    content.innerHTML = marked.parse(text);
  }

  div.appendChild(content);

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function addTypingMessage(text) {
  const chat = document.getElementById("chat");

  const div = document.createElement("div");
  div.className = "message bot";

  const label = document.createElement("small");
  label.innerText = "Assistant";
  div.appendChild(label);

  const content = document.createElement("div");
  content.style.marginLeft = "20px";
  div.appendChild(content);
  chat.appendChild(div);

  let i = 0;
  let temp = "";

  function typing() {
    if (i < text.length) {
      temp += text[i];
      content.innerHTML = marked.parse(temp);
      i++;
      chat.scrollTop = chat.scrollHeight;
      setTimeout(typing, 15);
    }
  }

  typing();
}

function addTyping() {
  const chat = document.getElementById("chat");

  const div = document.createElement("div");
  div.className = "message bot";
  div.innerText = "Typing...";

  chat.appendChild(div);
  return div;
}

function removeTyping(el) {
  if (el) el.remove();
}

// ENTER KEY
document.getElementById("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    send();
  }
});