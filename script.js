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
let activeReplyData = null; // Stores currently selected reply message

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
const callBtn = document.getElementById('call-btn');

// Reply Preview Elements
const replyPreview = document.getElementById('reply-preview');
const replyUser = document.getElementById('reply-user');
const replyText = document.getElementById('reply-text');
const cancelReplyBtn = document.getElementById('cancel-reply');

// Join Room
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
  clearReplyState();
});

// Send Message
sendBtn.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSendMessage();
});

cancelReplyBtn.addEventListener('click', clearReplyState);

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

    // Attach quoted reply if active
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

  // Check if message is a reply to another message
  let replyHTML = '';
  if (data.replyTo) {
    replyHTML = `
      <div class="reply-quote">
        <span class="reply-author">${escapeHTML(data.replyTo.sender)}</span>
        <div>${escapeHTML(data.replyTo.text)}</div>
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

  // Attach Swipe Gesture Detection
  attachSwipeToReply(msgDiv, data);

  messagesContainer.appendChild(msgDiv);
}

// Swipe Gesture Handler
function attachSwipeToReply(element, data) {
  let startX = 0;
  let currentX = 0;
  let isSwiping = false;

  element.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isSwiping = true;
    element.style.transition = 'none';
  });

  element.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;
    currentX = e.touches[0].clientX;
    const diffX = currentX - startX;

    // Only allow rightward swipe
    if (diffX > 0 && diffX < 80) {
      element.style.transform = `translateX(${diffX}px)`;
    }
  });

  element.addEventListener('touchend', () => {
    if (!isSwiping) return;
    isSwiping = false;
    const diffX = currentX - startX;

    element.style.transition = 'transform 0.2s ease-out';
    element.style.transform = 'translateX(0px)';

    // Trigger reply if swiped right more than 40px
    if (diffX > 40) {
      setReplyState(data.sender, data.text);
    }

    startX = 0;
    currentX = 0;
  });
}

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

// AI Bot Reply
async function handleAIReply(userPrompt) {
  const messagesRef = collection(db, 'rooms', currentRoom, 'messages');
  const queryText = userPrompt.replace(/@ai/gi, '').trim().toLowerCase();

  let replyText = "Hey! Ready to chat.";
  if (!queryText || queryText.includes("hi") || queryText.includes("hello") || queryText.includes("hy")) {
    replyText = "Hey there! How can I help you today?";
  } else {
    replyText = `That's interesting! What do you think about "${queryText}"?`;
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
