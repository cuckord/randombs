import { db } from './firebase-config.js';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// === GEMINI API KEY ===
const GEMINI_API_KEY = "AQ.Ab8RN6IU1nSJenIXujz41CZ5dgLgV9OdoOr1_LQryreQAf5vTg";

// State
let currentUsername = "";
let currentRoom = "";
let unsubscribeListener = null;

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username');
const roomCodeInput = document.getElementById('room-code');
const roomTitle = document.getElementById('room-title');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const joinBtn = document.getElementById('join-btn');
const sendBtn = document.getElementById('send-btn');
const leaveBtn = document.getElementById('leave-btn');

// Join Chat Room
joinBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  const room = roomCodeInput.value.trim().toLowerCase();

  if (!username || !room) {
    alert("Please enter both a username and room code.");
    return;
  }

  currentUsername = username;
  currentRoom = room;

  roomTitle.textContent = `Room: ${currentRoom}`;
  joinScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');

  listenForMessages();
});

// Leave Room
leaveBtn.addEventListener('click', () => {
  if (unsubscribeListener) unsubscribeListener();
  messagesContainer.innerHTML = '';
  chatScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');
});

// Send Message
sendBtn.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSendMessage();
});

async function handleSendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = '';

  try {
    const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
    await addDoc(messagesRef, {
      sender: currentUsername,
      text: text,
      timestamp: serverTimestamp()
    });

    if (text.toLowerCase().includes('@ai')) {
      await handleAIReply(text);
    }
  } catch (error) {
    console.error("Error sending message:", error);
    renderErrorMessage("Firebase message failed.");
  }
}

// Real-Time Listener
function listenForMessages() {
  const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'asc'));

  unsubscribeListener = onSnapshot(q, (snapshot) => {
    messagesContainer.innerHTML = '';
    snapshot.forEach((doc) => {
      renderMessage(doc.data());
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

function renderMessage(data) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');

  if (data.sender === 'ChatGPT' || data.sender === 'Gemini AI') {
    msgDiv.classList.add('ai');
  } else if (data.sender === currentUsername) {
    msgDiv.classList.add('self');
  } else {
    msgDiv.classList.add('other');
  }

  const timeStr = data.timestamp 
    ? new Date(data.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  msgDiv.innerHTML = `
    <div class="meta">
      <strong>${escapeHTML(data.sender)}</strong>
      <span>${timeStr}</span>
    </div>
    <div class="content">${escapeHTML(data.text)}</div>
  `;

  messagesContainer.appendChild(msgDiv);
}

function renderErrorMessage(text) {
  const errDiv = document.createElement('div');
  errDiv.classList.add('message', 'error');
  errDiv.textContent = text;
  messagesContainer.appendChild(errDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Fixed Gemini Fetch API Call
async function handleAIReply(userPrompt) {
  const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
  const cleanPrompt = userPrompt.replace(/@ai/gi, '').trim() || "Hello!";

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `You are Gemini AI in a group chat room. Give a short, helpful answer in 1-2 sentences. Prompt: ${cleanPrompt}` }]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.error?.message || `HTTP ${response.status}`;
      throw new Error(errMsg);
    }

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response text found.";

    await addDoc(messagesRef, {
      sender: "Gemini AI",
      text: aiText,
      timestamp: serverTimestamp()
    });

  } catch (err) {
    console.error("Gemini Error Details:", err);
    await addDoc(messagesRef, {
      sender: "Gemini AI",
      text: `🤖 Error: ${err.message}`,
      timestamp: serverTimestamp()
    });
  }
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
