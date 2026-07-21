import { db } from './firebase-config.js';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// === Persistent Session Keys ===
const STORAGE_KEY_USER = "pulse_chat_user";
const STORAGE_KEY_RECENT = "pulse_chat_recent_rooms";

// State
let currentUsername = "";
let currentRoom = "";
let unsubscribeListener = null;
let activeReplyData = null;

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username');
const userPasswordInput = document.getElementById('user-password');
const roomCodeInput = document.getElementById('room-code');
const roomPasswordInput = document.getElementById('room-password');
const rememberMeCheck = document.getElementById('remember-me');

const roomTitle = document.getElementById('room-title');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const joinBtn = document.getElementById('join-btn');
const sendBtn = document.getElementById('send-btn');
const logoutBtn = document.getElementById('logout-btn');
const callBtn = document.getElementById('call-btn');

// AI Modal Elements
const aiModalBtn = document.getElementById('ai-modal-btn');
const aiModal = document.getElementById('ai-modal');
const closeAiModal = document.getElementById('close-ai-modal');
const aiPromptInput = document.getElementById('ai-prompt-input');
const aiSubmitBtn = document.getElementById('ai-submit-btn');

// Reply Elements
const replyPreview = document.getElementById('reply-preview');
const replyUser = document.getElementById('reply-user');
const replyText = document.getElementById('reply-text');
const cancelReplyBtn = document.getElementById('cancel-reply');

// Recent Rooms Container
const recentRoomsWrapper = document.getElementById('recent-rooms-wrapper');
const recentRoomsList = document.getElementById('recent-rooms-list');

// Initialize App Session on Load
window.addEventListener('DOMContentLoaded', () => {
  renderRecentRooms();
  checkSavedSession();
});

// Auto Login check
function checkSavedSession() {
  const savedSession = localStorage.getItem(STORAGE_KEY_USER);
  if (savedSession) {
    try {
      const data = JSON.parse(savedSession);
      usernameInput.value = data.username || "";
      userPasswordInput.value = data.userPassword || "";
      if (data.lastRoom) roomCodeInput.value = data.lastRoom;
      if (data.lastRoomPassword) roomPasswordInput.value = data.lastRoomPassword;
    } catch (e) {
      console.error("Failed to parse saved session:", e);
    }
  }
}

// Join / Authenticate Room
joinBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim().toLowerCase();
  const userPassword = userPasswordInput.value.trim();
  const room = roomCodeInput.value.trim().toLowerCase();
  const roomPassword = roomPasswordInput.value.trim();

  if (!username || !userPassword || !room || !roomPassword) {
    alert("Please fill in all authentication fields.");
    return;
  }

  joinBtn.disabled = true;
  joinBtn.textContent = "Authenticating...";

  try {
    // 1. User Claim & Auth Check
    const userDocRef = doc(db, 'users', username);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      if (userDocSnap.data().password !== userPassword) {
        alert("Incorrect user password for this account.");
        resetJoinBtn();
        return;
      }
    } else {
      await setDoc(userDocRef, {
        username: username,
        password: userPassword,
        createdAt: serverTimestamp()
      });
    }

    // 2. Room Protection Check
    const roomDocRef = doc(db, 'rooms_auth', room);
    const roomDocSnap = await getDoc(roomDocRef);

    if (roomDocSnap.exists()) {
      if (roomDocSnap.data().password !== roomPassword) {
        alert("Incorrect Room Access Password.");
        resetJoinBtn();
        return;
      }
    } else {
      await setDoc(roomDocRef, {
        room: room,
        password: roomPassword,
        createdAt: serverTimestamp()
      });
    }

    // Save Session if Remember Me Checked
    if (rememberMeCheck.checked) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify({
        username,
        userPassword,
        lastRoom: room,
        lastRoomPassword: roomPassword
      }));
    }

    saveRecentRoom(room);

    // Set Active State
    currentUsername = username;
    currentRoom = room;

    roomTitle.textContent = `# ${currentRoom}`;
    joinScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');

    listenForMessages();

  } catch (error) {
    console.error("Auth error:", error);
    alert("Authentication failed. Please check network.");
  } finally {
    resetJoinBtn();
  }
});

function resetJoinBtn() {
  joinBtn.disabled = false;
  joinBtn.textContent = "Continue to Chat";
}

// Recent Rooms Local Management
function saveRecentRoom(roomName) {
  let recent = JSON.parse(localStorage.getItem(STORAGE_KEY_RECENT) || "[]");
  if (!recent.includes(roomName)) {
    recent.unshift(roomName);
    if (recent.length > 5) recent.pop();
    localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(recent));
  }
}

function renderRecentRooms() {
  const recent = JSON.parse(localStorage.getItem(STORAGE_KEY_RECENT) || "[]");
  if (recent.length === 0) return;

  recentRoomsWrapper.classList.remove('hidden');
  recentRoomsList.innerHTML = '';

  recent.forEach(room => {
    const chip = document.createElement('span');
    chip.classList.add('room-chip');
    chip.textContent = `# ${room}`;
    chip.addEventListener('click', () => {
      roomCodeInput.value = room;
    });
    recentRoomsList.appendChild(chip);
  });
}

// Logout
logoutBtn.addEventListener('click', () => {
  if (unsubscribeListener) unsubscribeListener();
  localStorage.removeItem(STORAGE_KEY_USER);
  messagesContainer.innerHTML = '';
  chatScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');
  clearReplyState();
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
    
    const messagePayload = {
      sender: currentUsername,
      text: text,
      timestamp: serverTimestamp()
    };

    if (activeReplyData) {
      messagePayload.replyTo = {
        sender: activeReplyData.sender,
        text: activeReplyData.text
      };
    }

    clearReplyState();
    await addDoc(messagesRef, messagePayload);

    if (text.toLowerCase().includes('@ai')) {
      handleAIReply(text.replace(/@ai/gi, '').trim());
    }
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// Real-time Firebase Listener
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

// Render Individual Message with Avatar
function renderMessage(data) {
  const groupDiv = document.createElement('div');
  groupDiv.classList.add('msg-group');

  const isAI = data.sender === 'AI Assistant' || data.sender === 'ChatGPT';
  const isSelf = data.sender === currentUsername;

  if (isAI) groupDiv.classList.add('ai');
  else if (isSelf) groupDiv.classList.add('self');
  else groupDiv.classList.add('other');

  // Avatar Initial
  const avatarDiv = document.createElement('div');
  avatarDiv.classList.add('msg-avatar');
  avatarDiv.textContent = isAI ? '✨' : data.sender.charAt(0).toUpperCase();

  const bubbleDiv = document.createElement('div');
  bubbleDiv.classList.add('msg-bubble');

  const timeStr = data.timestamp 
    ? new Date(data.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  let replyHTML = '';
  if (data.replyTo) {
    replyHTML = `
      <div class="quote-box">
        <span class="quote-author">${escapeHTML(data.replyTo.sender)}</span>
        <div>${escapeHTML(data.replyTo.text)}</div>
      </div>
    `;
  }

  bubbleDiv.innerHTML = `
    ${replyHTML}
    <div class="msg-header">
      <span class="msg-sender">${escapeHTML(data.sender)}</span>
      <span class="msg-time">${timeStr}</span>
    </div>
    <div class="msg-content">${escapeHTML(data.text)}</div>
  `;

  // Double tap to reply
  bubbleDiv.addEventListener('dblclick', () => {
    setReplyState(data.sender, data.text);
  });

  groupDiv.appendChild(avatarDiv);
  groupDiv.appendChild(bubbleDiv);
  messagesContainer.appendChild(groupDiv);
}

// Reply Helpers
cancelReplyBtn.addEventListener('click', clearReplyState);

function setReplyState(sender, text) {
  activeReplyData = { sender, text };
  replyUser.textContent = sender;
  replyText.textContent = text;
  replyPreview.classList.remove('hidden');
  messageInput.focus();
}

function clearReplyState() {
  activeReplyData = null;
  replyPreview.classList.add('hidden');
}

// AI Modal Handling
aiModalBtn.addEventListener('click', () => aiModal.classList.remove('hidden'));
closeAiModal.addEventListener('click', () => aiModal.classList.add('hidden'));

aiSubmitBtn.addEventListener('click', async () => {
  const prompt = aiPromptInput.value.trim();
  if (!prompt) return;

  aiModal.classList.add('hidden');
  aiPromptInput.value = '';

  await handleAIReply(prompt);
});

// Local AI Engine Logic
async function handleAIReply(userPrompt) {
  const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
  const queryText = userPrompt.toLowerCase();

  let replyText = "I'm your assistant in this room. How can I help?";
  if (queryText.includes("hi") || queryText.includes("hello")) {
    replyText = "Hello! 👋 How is everyone doing today?";
  } else if (queryText) {
    replyText = `Regarding "${userPrompt}": That's an insightful topic worth discussing here!`;
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

// Call Integration
callBtn.addEventListener('click', () => {
  if (!currentRoom) return;
  const callUrl = `https://meet.jit.si/PulseApp_${currentRoom}`;
  window.open(callUrl, '_blank');
});

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
