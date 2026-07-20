import { db } from './firebase-config.js';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Your OpenRouter API Key
const OPENROUTER_API_KEY = "Sk-or-v1-497e24a3d5310cd9ad34f7de727cdf943ca1d0c57a2ca19af8ffacaebe5034f7";

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

// Send Message on Button Click or Enter Key
sendBtn.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSendMessage();
});

// Send Message Handler
async function handleSendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = '';

  try {
    // 1. Save user message to Firestore
    const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
    await addDoc(messagesRef, {
      sender: currentUsername,
      text: text,
      timestamp: serverTimestamp()
    });

    // 2. Trigger AI reply if `@ai` is mentioned
    if (text.toLowerCase().includes('@ai')) {
      await handleAIReply();
    }
  } catch (error) {
    console.error("Error sending message:", error);
    renderErrorMessage("Failed to send message. Please check your Firebase config.");
  }
}

// Real-Time Firebase Listener
function listenForMessages() {
  const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'asc'));

  unsubscribeListener = onSnapshot(q, (snapshot) => {
    messagesContainer.innerHTML = '';
    snapshot.forEach((doc) => {
      const data = doc.data();
      renderMessage(data);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, (error) => {
    console.error("Firestore Error:", error);
    renderErrorMessage("Error fetching real-time updates.");
  });
}

// Render Individual Message
function renderMessage(data) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');

  if (data.sender === 'ChatGPT') {
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

// AI Integration (OpenRouter)
async function handleAIReply() {
  try {
    // Fetch last 10 messages for conversation context
    const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    const snapshot = await getDocs(q);

    const history = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.text) {
        history.push({
          role: data.sender === 'ChatGPT' ? 'assistant' : 'user',
          content: `${data.sender}: ${data.text}`
        });
      }
    });

    const conversationContext = history.slice(-10);

    // Call OpenRouter API
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [
          { role: "system", content: "You are ChatGPT, a helpful AI participant in a group chat room." },
          ...conversationContext
        ]
      })
    });

    if (!response.ok) throw new Error(`API status ${response.status}`);

    const data = await response.json();
    const aiText = data.choices[0]?.message?.content || "I couldn't process that response.";

    // Save AI reply to Firestore
    await addDoc(messagesRef, {
      sender: "ChatGPT",
      text: aiText,
      timestamp: serverTimestamp()
    });

  } catch (err) {
    console.error("OpenRouter API Error:", err);
    renderErrorMessage("🤖 ChatGPT is currently unavailable or the API limit was reached.");
  }
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

