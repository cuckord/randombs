import { supabase } from './supabase-config.js';

// Session Keys
const STORAGE_KEY_USER = "yappatron_user";
const STORAGE_KEY_RECENT = "yappatron_recent_yaps";

// State
let currentUsername = "";
let currentRoom = "";
let realtimeChannel = null;
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

// Returning User Card Elements
const returningUserCard = document.getElementById('returning-user-card');
const returningAvatar = document.getElementById('returning-avatar');
const returningUsernameDisplay = document.getElementById('returning-username-display');
const quickContinueBtn = document.getElementById('quick-continue-btn');
const switchAccountBtn = document.getElementById('switch-account-btn');

const roomTitle = document.getElementById('room-title');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const joinBtn = document.getElementById('join-btn');
const sendBtn = document.getElementById('send-btn');
const logoutBtn = document.getElementById('logout-btn');
const callBtn = document.getElementById('call-btn');

// Sidebar
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
  checkSavedSession();
});

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Session Check
function checkSavedSession() {
  const savedSession = localStorage.getItem(STORAGE_KEY_USER);
  if (savedSession) {
    try {
      const data = JSON.parse(savedSession);
      if (data.username && data.userPassword && data.lastRoom && data.lastRoomPassword) {
        usernameInput.value = data.username;
        userPasswordInput.value = data.userPassword;
        roomCodeInput.value = data.lastRoom;
        roomPasswordInput.value = data.lastRoomPassword;

        authForm.classList.add('hidden');
        returningUserCard.classList.remove('hidden');

        returningAvatar.textContent = data.username.charAt(0).toUpperCase();
        returningUsernameDisplay.textContent = `@${data.username}`;

        refreshIcons();
      }
    } catch (e) {
      console.error("Session parse error:", e);
    }
  }
}

// Quick Continue Event
quickContinueBtn.addEventListener('click', async () => {
  const savedSession = localStorage.getItem(STORAGE_KEY_USER);
  if (savedSession) {
    const data = JSON.parse(savedSession);
    await performAuthentication(data.username, data.userPassword, data.lastRoom, data.lastRoomPassword);
  }
});

// Switch Account Event
switchAccountBtn.addEventListener('click', () => {
  returningUserCard.classList.add('hidden');
  authForm.classList.remove('hidden');
});

// Form Submission Event
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
    // 1. User Verification
    const { data: userData, error: userErr } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (userErr) throw userErr;

    if (userData) {
      if (userData.password !== userPassword) {
        alert("Incorrect user password!");
        resetJoinBtn();
        return;
      }
    } else {
      const { error: createUserErr } = await supabase
        .from('users')
        .insert({ username: username, password: userPassword });
      if (createUserErr) throw createUserErr;
    }

    // 2. Room Verification
    const { data: roomData, error: roomErr } = await supabase
      .from('rooms_auth')
      .select('*')
      .eq('room', room)
      .maybeSingle();

    if (roomErr) throw roomErr;

    if (roomData) {
      if (roomData.password !== roomPassword) {
        alert("Incorrect Yap Key!");
        resetJoinBtn();
        return;
      }
    } else {
      const { error: createRoomErr } = await supabase
        .from('rooms_auth')
        .insert({ room: room, password: roomPassword });
      if (createRoomErr) throw createRoomErr;
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
    alert("Connection failed: " + (error.message || "Unknown error"));
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
  authForm.classList.remove('hidden');
  returningUserCard.classList.add('hidden');
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
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  localStorage.removeItem(STORAGE_KEY_USER);
  messagesContainer.innerHTML = '';
  chatScreen.classList.add('hidden');
  joinScreen.classList.remove('hidden');
  returningUserCard.classList.add('hidden');
  authForm.classList.remove('hidden');
  clearReplyState();
  refreshIcons();
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
    const messagePayload = {
      room: currentRoom,
      sender: currentUsername,
      text: text,
      reply_to: activeReplyData ? { sender: activeReplyData.sender, text: activeReplyData.text } : null
    };

    clearReplyState();

    const { error } = await supabase.from('messages').insert(messagePayload);
    if (error) console.error("Error sending message:", error);

    if (text.toLowerCase().includes('@ai')) {
      handleAIReply(text.replace(/@ai/gi, '').trim());
    }
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// Realtime Supabase Listener & Initial Load
async function listenForMessages() {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }

  // 1. Fetch initial message history
  const { data: initialMessages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room', currentRoom)
    .order('created_at', { ascending: true });

  messagesContainer.innerHTML = '';

  if (error) {
    console.error("Error loading history:", error);
  } else if (!initialMessages || initialMessages.length === 0) {
    renderEmptyNotice();
  } else {
    initialMessages.forEach(msg => renderMessage(msg));
    scrollToBottom();
  }

  // 2. Listen to incoming messages and updates in Realtime
  realtimeChannel = supabase
    .channel(`room:${currentRoom}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room=eq.${currentRoom}` },
      (payload) => {
        const emptyNotice = messagesContainer.querySelector('.empty-chat-notice');
        if (emptyNotice) emptyNotice.remove();

        renderMessage(payload.new);
        scrollToBottom();
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room=eq.${currentRoom}` },
      (payload) => {
        // Live update message text when AI finishes thinking
        const existingMsgText = document.querySelector(`[data-msg-id="${payload.new.id}"] .msg-text`);
        if (existingMsgText) {
          existingMsgText.textContent = payload.new.text;
        }
      }
    )
    .subscribe();
}

function renderEmptyNotice() {
  messagesContainer.innerHTML = `
    <div class="empty-chat-notice">
      <i data-lucide="message-square" style="width: 32px; height: 32px; opacity: 0.4;"></i>
      <p>No one's yapping yet.<br>Be the first to start.</p>
    </div>
  `;
  refreshIcons();
}

function scrollToBottom() {
  const scrollContainer = document.querySelector('.messages-viewport-wrapper');
  if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
}

// Render Messages
function renderMessage(data) {
  const rowDiv = document.createElement('div');
  rowDiv.classList.add('msg-row');
  if (data.id) rowDiv.setAttribute('data-msg-id', data.id);

  const isAI = data.sender === 'YapBot' || data.sender === 'AI Assistant' || data.sender === 'ChatGPT';
  const isSelf = data.sender === currentUsername;

  if (isAI) rowDiv.classList.add('ai');
  else if (isSelf) rowDiv.classList.add('self');
  else rowDiv.classList.add('other');

  const avatarDiv = document.createElement('div');
  avatarDiv.classList.add('msg-avatar');
  avatarDiv.textContent = isAI ? '⛷️' : data.sender.charAt(0).toUpperCase();

  const bodyDiv = document.createElement('div');
  bodyDiv.classList.add('msg-body');

  const timeStr = data.created_at 
    ? new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  let replyHTML = '';
  if (data.reply_to) {
    replyHTML = `
      <div class="quote-preview">
        <span class="quote-sender">${escapeHTML(data.reply_to.sender)}</span>
        <div>${escapeHTML(data.reply_to.text)}</div>
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

// AI Modal Mechanics
aiModalBtn.addEventListener('click', () => aiModal.classList.remove('hidden'));
closeAiModal.addEventListener('click', () => aiModal.classList.add('hidden'));

aiSubmitBtn.addEventListener('click', async () => {
  const prompt = aiPromptInput.value.trim();
  if (!prompt) return;

  aiModal.classList.add('hidden');
  aiPromptInput.value = '';

  await handleAIReply(prompt);
});

// Secure Direct Fetch Call to Edge Function
async function handleAIReply(userPrompt) {
  if (!currentRoom || !userPrompt) return;

  // 1. Post temporary "thinking" message
  const { data: tempMsg, error: tempErr } = await supabase
    .from('messages')
    .insert({
      room: currentRoom,
      sender: 'YapBot',
      text: '⛷️ YapBot is thinking...'
    })
    .select()
    .single();

  if (tempErr) return;

  try {
    // 2. Direct fetch call to Supabase Edge Function (NO API KEY EXPOSED)
    const functionUrl = "https://fclkjwqdcihjvvwhgvlm.supabase.co/functions/v1/rapid-action";

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: userPrompt })
    });

    const data = await response.json();
    const aiText = data?.response || "Response format issue.";

    // 3. Update thinking message with AI response
    await supabase
      .from('messages')
      .update({ text: aiText })
      .eq('id', tempMsg.id);

  } catch (err) {
    console.error("AI Error:", err);
    await supabase
      .from('messages')
      .update({ text: `Direct Fetch Error: ${err.message}` })
      .eq('id', tempMsg.id);
  }
}

