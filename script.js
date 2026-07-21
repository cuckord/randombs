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

// Persistent Keys
const STORAGE_KEY_USER = "yappatron_user";
const STORAGE_KEY_RECENT = "yappatron_recent_yaps";

// Application State
let currentUsername = "";
let currentRoom = "";
let unsubscribeListener = null;
let activeReplyData = null;

// DOM Elements
const authForm = document.getElementById('auth-form');
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

// Sidebar Controls
const sidebar = document.getElementById('sidebar');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const sidebarRoomsList = document.getElementById('sidebar-rooms-list');
const currentUserDisplay = document.getElementById('current-user-display');
const currentUserAvatar = document.getElementById('current-user-avatar');
const quickAddRoomBtn = document.getElementById('quick-add-room-btn');
const searchRoomsInput = document.getElementById('search-rooms-input');

// Recent Rooms
const recentRoomsWrapper = document.getElementById('recent-rooms-wrapper');
const recentRoomsList = document.getElementById('recent-rooms-list');

// AI Modal
const aiModalBtn = document.getElementById('ai-modal-btn');
const aiModal = document.getElementById('ai-modal');
const closeAiModal = document.getElementById('close-ai-modal');
const aiPromptInput = document.getElementById('ai-prompt-input');
const aiSubmitBtn = document.getElementById('ai-submit-btn');

// Reply Banner
const replyPreview = document.getElementById('reply-preview');
const replyUser = document.getElementById('reply-user');
const replyText = document.getElementById('reply-text');
const cancelReplyBtn = document.getElementById('cancel-reply');

// Initialize on Load
window.addEventListener('DOMContentLoaded', () => {
  refreshIcons();
  renderRecentRooms();
  checkSavedSessionAndAutoLogin();
});

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Auto Login Handler
async function checkSavedSessionAndAutoLogin() {
  const savedSession = localStorage.getItem(STORAGE_KEY_USER);
  if (savedSession) {
    try {
      const data = JSON.parse(savedSession);
      if (data.username && data.userPassword && data.lastRoom && data.lastRoomPassword) {
        usernameInput.value = data.username;
        userPasswordInput.value = data.userPassword;
        roomCodeInput.value = data.lastRoom;
        roomPasswordInput.value = data.lastRoomPassword;

        await performAuthentication(data.username, data.userPassword, data.lastRoom, data.lastRoomPassword);
      }
    } catch (e) {
      console.error("Session parse error:", e);
    }
  }
}

// Authentication Event
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim().toLowerCase();
  const userPassword = userPasswordInput.value.trim();
  const room = roomCodeInput.value.trim().toLowerCase();
  const roomPassword = roomPasswordInput.value.trim();

  if (!username || !userPassword || !room || !roomPassword) return;

  await performAuthentication(username, userPassword, room, roomPassword);
});

async function performAuthentication(username, userPassword, room, roomPassword) {
  joinBtn.disabled = true;
  joinBtn.textContent = "Connecting...";

  try {
    // User Verification
    const userDocRef = doc(db, 'users', username);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      if (userDocSnap.data().password !== userPassword) {
        alert("Incorrect user password!");
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

    // Room Verification
    const roomDocRef = doc(db, 'rooms_auth', room);
    const roomDocSnap = await getDoc(roomDocRef);

    if (roomDocSnap.exists()) {
      if (roomDocSnap.data().password !== roomPassword) {
        alert("Incorrect Yap Key!");
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

    if (rememberMeCheck.checked) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify({
        username,
        userPassword,
        lastRoom: room,
        lastRoomPassword: roomPassword
      }));
    }

    saveRecentRoom(room);

    currentUsername = username;
    currentRoom = room;

    currentUserDisplay.textContent = currentUsername;
    currentUserAvatar.textContent = currentUsername.charAt(0).toUpperCase();
    roomTitle.textContent = currentRoom;

    renderSidebarRooms();

    joinScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');

    listenForMessages();
    refreshIcons();

  } catch (error) {
    console.error("Auth error:", error);
    alert("Connection failed.");
  } finally {
    resetJoinBtn();
  }
}

function resetJoinBtn() {
  joinBtn.disabled = false;
  joinBtn.innerHTML = `<i data-lucide="zap"></i><span>Start Yapping</span>`;
  refreshIcons();
}

// Sidebar Controls
if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => sidebar.classList.add('open'));
if (toggleSidebarBtn) toggleSidebarBtn.addEventListener('click', () => sidebar.classList.remove('open'));

quickAddRoomBtn.addEventListener('click', () => {
  chatScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');
});

searchRoomsInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  renderSidebarRooms(query);
});

// Recent Rooms Storage
function saveRecentRoom(roomName) {
  let recent = JSON.parse(localStorage.getItem(STORAGE_KEY_RECENT) || "[]");
  if (!recent.includes(roomName)) {
    recent.unshift(roomName);
    if (recent.length > 6) recent.pop();
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

function renderSidebarRooms(filter = "") {
  const recent = JSON.parse(localStorage.getItem(STORAGE_KEY_RECENT) || "[]");
  sidebarRoomsList.innerHTML = '';

  const filtered = recent.filter(r => r.toLowerCase().includes(filter));

  filtered.forEach(room => {
    const item = document.createElement('div');
    item.classList.add('room-nav-item');
    if (room === currentRoom) item.classList.add('active');

    item.innerHTML = `<i data-lucide="hash" class="nav-item-icon"></i><span>${escapeHTML(room)}</span>`;
    
    item.addEventListener('click', () => {
      if (room === currentRoom) return;
      roomCodeInput.value = room;
      chatScreen.classList.add('hidden');
      joinScreen.classList.remove('hidden');
      sidebar.classList.remove('open');
    });

    sidebarRoomsList.appendChild(item);
  });

  refreshIcons();
}

// Logout Action
logoutBtn.addEventListener('click', () => {
  if (unsubscribeListener) unsubscribeListener();
  localStorage.removeItem(STORAGE_KEY_USER);
  messagesContainer.innerHTML = '';
  chatScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');
  clearReplyState();
});

// Messaging Handling
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

// Realtime Firestore Listener
function listenForMessages() {
  const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'asc'));

  unsubscribeListener = onSnapshot(q, (snapshot) => {
    messagesContainer.innerHTML = '';

    if (snapshot.empty) {
      messagesContainer.innerHTML = `
        <div class="empty-chat-notice">
          <i data-lucide="message-square" style="width: 32px; height: 32px; opacity: 0.5;"></i>
          <p>No one's yapping yet.<br>Be the first to start.</p>
        </div>
      `;
      refreshIcons();
      return;
    }

    snapshot.forEach((doc) => {
      renderMessage(doc.data());
    });
    
    const scrollContainer = document.querySelector('.messages-viewport-wrapper');
    if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
  });
}

// Render Individual Messages
function renderMessage(data) {
  const rowDiv = document.createElement('div');
  rowDiv.classList.add('msg-row');

  const isAI = data.sender === 'YapBot' || data.sender === 'AI Assistant' || data.sender === 'ChatGPT';
  const isSelf = data.sender === currentUsername;

  if (isAI) rowDiv.classList.add('ai');
  else if (isSelf) rowDiv.classList.add('self');
  else rowDiv.classList.add('other');

  const avatarDiv = document.createElement('div');
  avatarDiv.classList.add('msg-avatar');
  avatarDiv.textContent = isAI ? '🤖' : data.sender.charAt(0).toUpperCase();

  const bodyDiv = document.createElement('div');
  bodyDiv.classList.add('msg-body');

  const timeStr = data.timestamp 
    ? new Date(data.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  let replyHTML = '';
  if (data.replyTo) {
    replyHTML = `
      <div class="quote-preview">
        <span class="quote-sender">${escapeHTML(data.replyTo.sender)}</span>
        <div>${escapeHTML(data.replyTo.text)}</div>
      </div>
    `;
  }

  let aiBadge = isAI ? '<span class="badge-ai"><i data-lucide="bot" style="width:12px;height:12px;"></i> YapBot</span>' : '';

  bodyDiv.innerHTML = `
    <div class="msg-header">
      <span class="msg-sender">${escapeHTML(data.sender)}</span>
      ${aiBadge}
      <span class="msg-timestamp">${timeStr}</span>
    </div>
    <div class="msg-bubble">
      ${replyHTML}
      <div class="msg-text">${escapeHTML(data.text)}</div>
    </div>
  `;

  bodyDiv.addEventListener('dblclick', () => {
    setReplyState(data.sender, data.text);
  });

  rowDiv.appendChild(avatarDiv);
  rowDiv.appendChild(bodyDiv);
  messagesContainer.appendChild(rowDiv);
  refreshIcons();
}

// Reply Helper Actions
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

// AI Modal Mechanics (YapBot)
aiModalBtn.addEventListener('click', () => aiModal.classList.remove('hidden'));
closeAiModal.addEventListener('click', () => aiModal.classList.add('hidden'));

aiSubmitBtn.addEventListener('click', async () => {
  const prompt = aiPromptInput.value.trim();
  if (!prompt) return;

  aiModal.classList.add('hidden');
  aiPromptInput.value = '';

  await handleAIReply(prompt);
});

async function handleAIReply(userPrompt) {
  const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
  const queryText = userPrompt.toLowerCase();

  let replyText = "I'm YapBot! How can I assist the Yap Room right now?";
  if (queryText.includes("hi") || queryText.includes("hello") || queryText.includes("hy")) {
    replyText = "Hello yappers! 👋 What are we discussing today?";
  } else if (queryText) {
    replyText = `Regarding "${userPrompt}": That's a great point for this Yap Room!`;
  }

  try {
    await addDoc(messagesRef, {
      sender: "YapBot",
      text: replyText,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("AI write error:", err);
  }
}

// Jitsi Call Launcher
callBtn.addEventListener('click', () => {
  if (!currentRoom) return;
  const callUrl = `https://meet.jit.si/YAPPATRON_${currentRoom}`;
  window.open(callUrl, '_blank');
});

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
