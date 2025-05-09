import userModel from '../models/User.js';
import { requireAuth } from '../utils/authUtils.js';
import Sidebar from '../SideBar/Sidebar.js';
import { showLoading, hideLoading } from '../utils/loadingUtils.js';

const API_URL = 'http://localhost:3000';
const token = localStorage.getItem('Token');
let user;
let currentConversationUser = null;
let conversations = [];
let currentMessages = [];
let pollingInterval;

async function initialize() {
  // loading spinner
  const linkElement = document.createElement("link");
  linkElement.rel = "stylesheet";
  linkElement.href = "../utils/loadingUtils.css";
  document.head.appendChild(linkElement);

  user = requireAuth();
  if (!user) return;
  
  // Render sidebar
  document.getElementById('sidebar-container').innerHTML = Sidebar.render('messages');
  new Sidebar('messages');
  
  // Set up event listeners
  document.getElementById('send-message-form').addEventListener('submit', handleSendMessage);
  
  // Set up polling for new messages (every 5 seconds)
  pollingInterval = setInterval(async () => {
    if (currentConversationUser) {
      await loadConversation(currentConversationUser.userId);
    }
    await loadConversations();
  }, 5000);
  
  await loadConversations();
  
  window.addEventListener('beforeunload', () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
  });
}

async function loadConversations() {
  try {
    showLoading('Loading conversations...');
    
    const response = await fetch(`${API_URL}/messages/conversations`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load conversations');
    }
    
    conversations = await response.json();
    displayConversations(conversations);
  } catch (error) {
    console.error('Error loading conversations:', error);
    document.getElementById('conversation-list').innerHTML = 
      '<div class="error-message">Failed to load conversations</div>';
  } finally {
    hideLoading();
  }
}

function displayConversations(conversations) {
  const container = document.getElementById('conversation-list');
  
  if (conversations.length === 0) {
    container.innerHTML = `<div class="empty-state">No conversations yet</div>`;
    return;
  }
  
  container.innerHTML = conversations.map(conv => `
    <div class="conversation-item ${conv.unreadCount > 0 ? 'unread' : ''} ${currentConversationUser && currentConversationUser.userId === conv.OTHERUSERID ? 'selected' : ''}" data-user-id="${conv.OTHERUSERID}">
      <div class="conversation-avatar">${getInitials(conv.OTHERUSERNAME)}</div>
      <div class="conversation-info">
        <div class="conversation-name">${conv.OTHERUSERNAME}</div>
        <div class="conversation-preview">
          <span class="last-message-preview">${conv.LASTMESSAGECONTENT ? truncateMessage(conv.LASTMESSAGECONTENT) : ''}</span>
          <span class="last-message-time">${formatTimestamp(conv.LASTMESSAGETIME)}</span>
        </div>
      </div>
      ${conv.unreadCount > 0 ? `<div class="unread-badge">${conv.unreadCount}</div>` : ''}
    </div>
  `).join('');
  
  // Add event listeners to conversation items
  document.querySelectorAll('.conversation-item').forEach(item => {
    item.addEventListener('click', () => {
      const userId = parseInt(item.dataset.userId);
      loadConversation(userId);
      
      // Update sidebar unread count after opening a conversation
      if (window.sidebarInstance) {
        setTimeout(() => {
          window.sidebarInstance.fetchUnreadMessageCount();
        }, 500);
      }
    });
  });
}

// Add this helper function to truncate long messages in the preview
function truncateMessage(message) {
  return message.length > 30 ? message.substring(0, 27) + '...' : message;
}

async function loadConversation(otherUserId) {
  try {
    showLoading('Loading messages...');
    
    // Mark messages as read when opening conversation
    await fetch(`${API_URL}/messages/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ otherUserId })
    });
    
    // Fetch conversation
    const response = await fetch(`${API_URL}/messages/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ otherUserId })
    });
    
    if (!response.ok) {
      throw new Error('Failed to load conversation');
    }
    
    currentMessages = await response.json();
    
    // Find user details from the messages
    if (currentMessages.length > 0) {
      const message = currentMessages[0];
      if (message.SENDERID === otherUserId) {
        currentConversationUser = {
          userId: otherUserId,
          name: `${message.SENDERFIRSTNAME} ${message.SENDERLASTNAME}`
        };
      } else {
        currentConversationUser = {
          userId: otherUserId,
          name: `${message.RECEIVERFIRSTNAME} ${message.RECEIVERLASTNAME}`
        };
      }
    }
    
    displayMessages(currentMessages, otherUserId);
    
    // Update conversation UI
    document.getElementById('conversation-header').innerHTML = currentConversationUser ? 
      `<h2>${currentConversationUser.name}</h2>` : '';
    document.getElementById('messages-container').classList.add('active');
    
    // Mark the selected conversation in the list
    document.querySelectorAll('.conversation-item').forEach(item => {
      item.classList.toggle('selected', parseInt(item.dataset.userId) === otherUserId);
    });
    
    // Scroll to bottom of messages
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  } catch (error) {
    console.error('Error loading conversation:', error);
    document.getElementById('messages').innerHTML = 
      '<div class="error-message">Failed to load messages</div>';
  } finally {
    hideLoading();
  }
}

function displayMessages(messages, otherUserId) {
  const container = document.getElementById('messages');
  
  if (messages.length === 0) {
    container.innerHTML = `<div class="empty-state">No messages yet. Start the conversation!</div>`;
    return;
  }
  
  container.innerHTML = messages.map(msg => {
    const isSentByMe = msg.SENDERID === user.id;
    
    const readStatus = isSentByMe ? `
      <span class="read-status ${msg.ISREAD ? 'read' : 'delivered'}">
        <span class="checkmark">✓</span><span class="checkmark">✓</span>
      </span>
    ` : '';
    
    return `
      <div class="message ${isSentByMe ? 'sent' : 'received'}">
        <div class="message-content">
          ${msg.CONTENT}
          <span class="message-time">
            ${formatTimestamp(msg.TIMESTAMP)} ${readStatus}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

async function handleSendMessage(event) {
  event.preventDefault();
  
  if (!currentConversationUser) {
    alert('Please select a conversation first');
    return;
  }
  
  const messageInput = document.getElementById('message-input');
  const content = messageInput.value.trim();
  
  if (!content) {
    return;
  }
  
  try {
    await sendMessage(currentConversationUser.userId, content);
    
    // Clear input
    messageInput.value = '';
    
    // Reload conversation to show new message
    await loadConversation(currentConversationUser.userId);
    
    await loadConversations();
  } catch (error) {
    console.error('Error sending message:', error);
    alert('Failed to send message. Please try again.');
  }
}

async function sendMessage(receiverId, content) {
  try {
    const token = localStorage.getItem('Token');
    
    if (!token) {
      console.error('No authentication token found');
      return false;
    }
    
    const response = await fetch(`${API_URL}/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        receiverId,
        content
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send message');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

// "Contact Owner" button 
export function setupContactButton(ownerId, ownerName) {
  const contactButton = document.querySelector('.contact-button');
  if (contactButton) {
    contactButton.addEventListener('click', () => {
      window.location.href = `../Messages/Messages.html?userId=${ownerId}&name=${encodeURIComponent(ownerName)}`;
    });
  }
}

// Helper functions
function getInitials(name) {
  return name
    .split(' ')
    .map(part => part.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    // Today - show time
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    // Yesterday
    return 'Yesterday';
  } else if (diffDays < 7) {
    // This week - show day name
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    // Older - show date
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

// Check URL for direct conversation opening
function checkUrlForDirectMessage() {
  const urlParams = new URLSearchParams(window.location.search);
  const userId = urlParams.get('userId');
  const name = urlParams.get('name');
  
  if (userId) {
    currentConversationUser = {
      userId: parseInt(userId),
      name: name || 'User'
    };
    loadConversation(parseInt(userId));
  }
}


document.addEventListener('DOMContentLoaded', () => {
  initialize();
  
  // Check for direct message parameter in URL
  setTimeout(checkUrlForDirectMessage, 500); 
});