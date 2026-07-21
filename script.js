import { db } from './firebase-config.js';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
    
    // 1. Send user message to Firestore
    await addDoc(messagesRef, {
      sender: currentUsername,
      text: text,
      timestamp: serverTimestamp()
    });

    // 2. Trigger AI response if '@ai' is mentioned
    if (text.toLowerCase().includes('@ai')) {
      setTimeout(() => {
        handleAIReply(text);
      }, 600);
    }
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// Real-Time Firebase Listener
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

// Render Individual Message
function renderMessage(data) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');

  if (data.sender === 'ChatGPT' || data.sender === 'AI Assistant') {
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

// Smart Local AI Response Logic (Zero API dependence)
async function handleAIReply(userPrompt) {
  const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
  const queryText = userPrompt.replace(/@ai/gi, '').trim().toLowerCase();

  let replyText = "";

  if (!queryText || queryText === "hi" || queryText === "hello" || queryText === "hy" || queryText === "hyyy") {
    const greetings = [
      "Hey there! How's it going?",
      "Hello! What's on your mind today?",
      "Hey! Ready to chat.",
      "Yo! What are we talking about today?"
    ];
    replyText = greetings[Math.floor(Math.random() * greetings.length)];
  } else if (queryText.includes("who are you") || queryText.includes("your name")) {
    replyText = "I'm your AI chat assistant running live in this room!";
  } else if (queryText.includes("how are you")) {
    replyText = "I'm doing great! How are you doing?";
  } else if (queryText.includes("help")) {
    replyText = "Just mention @ai in your message, and I'll reply to you and everyone in this room!";
  } else {
    const defaultReplies = [
      `That's interesting! Tell me more about "${queryText}".`,
      `Got it! Regarding "${queryText}", I think that's worth discussing.`,
      `Interesting point! What does everyone else in room think?`,
      `Thanks for sharing! What's next?`
    ];
    replyText = defaultReplies[Math.floor(Math.random() * defaultReplies.length)];
  }

  try {
    await addDoc(messagesRef, {
      sender: "AI Assistant",
      text: replyText,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("AI write error:", err);
  }
}
// Call Button Logic
const callBtn = document.getElementById('call-btn');
if (callBtn) {
  callBtn.addEventListener('click', () => {
    if (!currentRoom) return;
    const callUrl = `https://meet.jit.si/RealtimeChatApp_${currentRoom}`;
    window.open(callUrl, '_blank');
  });
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
