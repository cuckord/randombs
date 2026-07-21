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
const roomTitle = document.getElementById('room-title');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const joinBtn = document.getElementById('join-btn');
const sendBtn = document.getElementById('send-btn');
const leaveBtn = document.getElementById('leave-btn');
const callBtn = document.getElementById('call-btn');

// Reply Preview Elements
const replyPreview = document.getElementById('reply-preview');
const replyUser = document.getElementById('reply-user');
const replyText = document.getElementById('reply-text');
const cancelReplyBtn = document.getElementById('cancel-reply');

// Join / Register & Enter Logic
joinBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim().toLowerCase();
  const userPassword = userPasswordInput.value.trim();
  const room = roomCodeInput.value.trim().toLowerCase();
  const roomPassword = roomPasswordInput.value.trim();

  if (!username || !userPassword || !room || !roomPassword) {
    alert("Please fill in all fields (Username, User Password, Room Name, and Room Password).");
    return;
  }

  joinBtn.disabled = true;
  joinBtn.textContent = "Verifying...";

  try {
    // 1. User Claim & Auth Check
    const userDocRef = doc(db, 'users', username);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      // User exists, verify password
      const userData = userDocSnap.data();
      if (userData.password !== userPassword) {
        alert("Incorrect password for this Username!");
        resetJoinBtn();
        return;
      }
    } else {
      // Register new user
      await setDoc(userDocRef, {
        username: username,
        password: userPassword,
        createdAt: serverTimestamp()
      });
    }

    // 2. Room Lock Check
    const roomDocRef = doc(db, 'rooms_auth', room);
    const roomDocSnap = await getDoc(roomDocRef);

    if (roomDocSnap.exists()) {
      // Room exists, verify room password
      const roomData = roomDocSnap.data();
      if (roomData.password !== roomPassword) {
        alert("Incorrect Room Password!");
        resetJoinBtn();
        return;
      }
    } else {
      // Create room with password
      await setDoc(roomDocRef, {
        room: room,
        password: roomPassword,
        createdAt: serverTimestamp()
      });
    }

    // Auth Successful
    currentUsername = username;
    currentRoom = room;

    roomTitle.textContent = `Room: ${currentRoom}`;
    joinScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');

    listenForMessages();

  } catch (error) {
    console.error("Authentication Error:", error);
    alert("Failed to join room. Please check your network connection.");
  } finally {
    resetJoinBtn();
  }
});

function resetJoinBtn() {
  joinBtn.disabled = false;
  joinBtn.textContent = "Join / Register & Enter";
}

// Leave Room
leaveBtn.addEventListener('click', () => {
  if (unsubscribeListener) unsubscribeListener();
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

if (cancelReplyBtn) {
  cancelReplyBtn.addEventListener('click', clearReplyState);
}

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

  let replyHTML = '';
  if (data.replyTo) {
    replyHTML = `
      <div class="reply-quote" style="background: rgba(0,0,0,0.2); border-left: 3px solid #8b5cf6; padding: 4px 8px; border-radius: 4px; margin-bottom: 4px; font-size: 0.8rem;">
        <span style="color: #a78bfa; font-weight: bold;">${escapeHTML(data.replyTo.sender)}</span>
        <div style="opacity: 0.8; font-size: 0.75rem;">${escapeHTML(data.replyTo.text)}</div>
      </div>
    `;
  }

  msgDiv.innerHTML = `
    ${replyHTML}
    <div class="meta">
      <strong>${escapeHTML(data.sender)}</strong>
      <span>${timeStr}</span>
    </div>
    <div class="content">${escapeHTML(data.text)}</div>
  `;

  // Double Tap to Reply
  msgDiv.addEventListener('dblclick', () => {
    setReplyState(data.sender, data.text);
  });

  // Attach Swipe Gesture
  attachSwipeToReply(msgDiv, data);

  messagesContainer.appendChild(msgDiv);
}

// Mobile Swipe to Reply Logic
function attachSwipeToReply(element, data) {
  let startX = 0;
  let currentX = 0;

  element.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  element.addEventListener('touchmove', (e) => {
    currentX = e.touches[0].clientX;
    const diffX = currentX - startX;
    if (diffX > 0 && diffX < 60) {
      element.style.transform = `translateX(${diffX}px)`;
    }
  }, { passive: true });

  element.addEventListener('touchend', () => {
    const diffX = currentX - startX;
    element.style.transform = 'translateX(0px)';

    if (diffX > 35) {
      setReplyState(data.sender, data.text);
    }
    startX = 0;
    currentX = 0;
  });
}

function setReplyState(sender, text) {
  activeReplyData = { sender, text };
  if (replyUser) replyUser.textContent = sender;
  if (replyText) replyText.textContent = text;
  if (replyPreview) replyPreview.classList.remove('hidden');
  messageInput.focus();
}

function clearReplyState() {
  activeReplyData = null;
  if (replyPreview) replyPreview.classList.add('hidden');
}

// Local AI Response Logic
async function handleAIReply(userPrompt) {
  const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
  const queryText = userPrompt.replace(/@ai/gi, '').trim().toLowerCase();

  let replyText = "Hey! How can I help you in this room?";
  if (queryText.includes("hi") || queryText.includes("hello") || queryText.includes("hy")) {
    replyText = "Hello there! 👋 What's up?";
  } else if (queryText) {
    replyText = `That's interesting! Tell me more about "${queryText}".`;
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
