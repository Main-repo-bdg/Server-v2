/**
 * sessions.js - Handles session management for the Terminal Server
 */

class SessionManager {
  constructor() {
    this.sessions = [];
    this.sessionsListEl = document.getElementById('sessions-list');
    this.newSessionBtn = document.getElementById('new-session-btn');
    this.welcomeNewSessionBtn = document.getElementById('welcome-new-session-btn');
    this.viewAllSessionsBtn = document.getElementById('view-all-sessions-btn');
    
    this.initEventListeners();
  }
  
  initEventListeners() {
    // Create new session
    this.newSessionBtn.addEventListener('click', () => this.createSession());
    this.welcomeNewSessionBtn.addEventListener('click', () => this.createSession());
    
    // View all sessions (admin only)
    this.viewAllSessionsBtn.addEventListener('click', () => this.loadAllSessions());
    
    // Listen for auth login event
    document.addEventListener('auth:login', () => this.loadSessions());
    
    // Listen for terminal closed event
    document.addEventListener('terminal:closed', (e) => {
      this.removeSessionFromUI(e.detail.sessionId);
    });
  }
  
  async loadSessions() {
    try {
      // Clear current sessions
      this.sessions = [];
      this.sessionsListEl.innerHTML = '';
      
      // First try to get admin sessions (if applicable)
      if (auth.isAdmin) {
        await this.loadAllSessions();
        return;
      }
      
      // Fallback to regular user sessions
      const response = await fetch('/api/sessions', {
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load sessions');
      }
      
      const sessions = await response.json();
      
      // Store and display sessions
      this.sessions = sessions;
      this.renderSessions();
      
    } catch (error) {
      console.error('Failed to load sessions:', error);
      this.sessionsListEl.innerHTML = `
        <div class="error-message text-center">
          Failed to load sessions:<br>${error.message}
        </div>
      `;
    }
  }
  
  async loadAllSessions() {
    if (!auth.isAdmin) return;
    
    try {
      const response = await fetch('/api/sessions', {
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load sessions');
      }
      
      const sessions = await response.json();
      
      // Store and display sessions
      this.sessions = sessions;
      this.renderSessions();
      
    } catch (error) {
      console.error('Failed to load admin sessions:', error);
      this.sessionsListEl.innerHTML = `
        <div class="error-message text-center">
          Failed to load sessions:<br>${error.message}
        </div>
      `;
    }
  }
  
  renderSessions() {
    this.sessionsListEl.innerHTML = '';
    
    if (this.sessions.length === 0) {
      this.sessionsListEl.innerHTML = `
        <div class="text-center text-muted mt-3 mb-3">
          No sessions available
        </div>
      `;
      return;
    }
    
    // Sort sessions by last accessed (most recent first)
    const sortedSessions = [...this.sessions].sort((a, b) => {
      return new Date(b.lastAccessed) - new Date(a.lastAccessed);
    });
    
    for (const session of sortedSessions) {
      this.addSessionToUI(session);
    }
  }
  
  addSessionToUI(session) {
    const sessionEl = document.createElement('div');
    sessionEl.className = 'session-item';
    sessionEl.dataset.id = session.id;
    
    // Calculate time difference
    const lastAccessed = new Date(session.lastAccessed);
    const timeAgo = this.getTimeAgo(lastAccessed);
    
    // Format session item
    sessionEl.innerHTML = `
      <span class="session-name">${session.userId}</span>
      <span class="session-time">
        <i class="fas fa-clock"></i> ${timeAgo}
      </span>
      <div class="session-actions">
        <button class="delete-btn" title="Terminate Session">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
    
    // Add click event to open terminal
    sessionEl.addEventListener('click', (e) => {
      // Ignore if delete button was clicked
      if (e.target.closest('.delete-btn')) return;
      
      // Select this session
      this.selectSession(session.id);
    });
    
    // Add delete event
    const deleteBtn = sessionEl.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteSession(session.id);
    });
    
    // Add to DOM
    this.sessionsListEl.appendChild(sessionEl);
  }
  
  selectSession(sessionId) {
    // Remove active class from all sessions
    const allSessions = this.sessionsListEl.querySelectorAll('.session-item');
    allSessions.forEach(el => el.classList.remove('active'));
    
    // Add active class to selected session
    const sessionEl = this.sessionsListEl.querySelector(`.session-item[data-id="${sessionId}"]`);
    if (sessionEl) {
      sessionEl.classList.add('active');
    }
    
    // Dispatch event for terminal manager
    document.dispatchEvent(new CustomEvent('session:selected', {
      detail: { sessionId }
    }));
  }
  
  removeSessionFromUI(sessionId) {
    // Remove session from internal array
    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    
    // Remove from DOM
    const sessionEl = this.sessionsListEl.querySelector(`.session-item[data-id="${sessionId}"]`);
    if (sessionEl) {
      sessionEl.remove();
    }
    
    // If no sessions left, show message
    if (this.sessions.length === 0) {
      this.sessionsListEl.innerHTML = `
        <div class="text-center text-muted mt-3 mb-3">
          No sessions available
        </div>
      `;
    }
    
    // Dispatch session closed event
    document.dispatchEvent(new CustomEvent('session:closed', {
      detail: { sessionId }
    }));
  }
  
  async createSession() {
    try {
      const response = await fetch('/api/create-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        },
        body: JSON.stringify({})
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create session');
      }
      
      const sessionData = await response.json();
      
      // Add session to the list
      const session = {
        id: sessionData.sessionId,
        userId: sessionData.userId,
        created: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        expiresIn: sessionData.expiresIn
      };
      
      this.sessions.push(session);
      this.addSessionToUI(session);
      
      // Automatically select the new session
      this.selectSession(session.id);
      
    } catch (error) {
      console.error('Failed to create session:', error);
      alert(`Failed to create session: ${error.message}`);
    }
  }
  
  async deleteSession(sessionId) {
    if (!confirm('Are you sure you want to terminate this session?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/session/${sessionId}`, {
        method: 'DELETE',
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete session');
      }
      
      // Remove session from UI
      this.removeSessionFromUI(sessionId);
      
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert(`Failed to delete session: ${error.message}`);
    }
  }
  
  getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
      return 'just now';
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
    }
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
  }
}

// Initialize session manager
const sessionManager = new SessionManager();
