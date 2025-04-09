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
    
    // Get display name (use sessionName if available, fallback to userId)
    const displayName = session.sessionName || session.userId;
    
    // Format session item
    sessionEl.innerHTML = `
      <span class="session-name">${displayName}</span>
      <span class="session-time">
        <i class="fas fa-clock"></i> ${timeAgo}
        ${session.isMock ? '<span class="mock-mode-badge">Mock</span>' : ''}
      </span>
      <div class="session-actions">
        <button class="info-btn" title="Session Details">
          <i class="fas fa-info-circle"></i>
        </button>
        <button class="delete-btn" title="Terminate Session">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
    
    // Add click event to open terminal
    sessionEl.addEventListener('click', (e) => {
      // Ignore if action buttons were clicked
      if (e.target.closest('.delete-btn') || e.target.closest('.info-btn')) return;
      
      // Select this session
      this.selectSession(session.id);
    });
    
    // Add delete event
    const deleteBtn = sessionEl.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteSession(session.id);
    });
    
    // Add info event if the details modal exists
    const infoBtn = sessionEl.querySelector('.info-btn');
    if (infoBtn && document.getElementById('session-details-modal')) {
      infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showSessionDetails(session.id);
      });
    } else if (infoBtn) {
      // Hide the button if the modal doesn't exist
      infoBtn.style.display = 'none';
    }
    
    // Add to DOM
    this.sessionsListEl.appendChild(sessionEl);
  }
  
  // Show session details in the modal
  async showSessionDetails(sessionId) {
    try {
      const modal = document.getElementById('session-details-modal');
      if (!modal) return;
      
      // Show the modal
      modal.style.display = 'flex';
      
      // Fetch session details
      let session = this.sessions.find(s => s.id === sessionId);
      
      // If we don't have full details, fetch them
      if (!session || !session.containerId) {
        const response = await fetch(`/api/session/${sessionId}`, {
          headers: auth.getAuthHeaders()
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch session details');
        }
        
        session = await response.json();
      }
      
      // Update the modal with session details
      document.getElementById('detail-session-id').textContent = session.id;
      document.getElementById('detail-user').textContent = session.userId;
      document.getElementById('detail-created').textContent = new Date(session.created).toLocaleString();
      document.getElementById('detail-last-activity').textContent = `${this.getTimeAgo(new Date(session.lastAccessed))} ago`;
      document.getElementById('detail-status').textContent = session.isMock ? 'Mock Mode' : 'Active';
      document.getElementById('detail-container-id').textContent = session.containerId || 'N/A';
      document.getElementById('detail-client-ip').textContent = session.clientIp || 'N/A';
      
      // Set up action buttons
      const openTerminalBtn = document.getElementById('session-open-terminal');
      const terminateBtn = document.getElementById('session-terminate');
      
      // Open terminal button
      openTerminalBtn.onclick = () => {
        modal.style.display = 'none';
        this.selectSession(sessionId);
      };
      
      // Terminate button
      terminateBtn.onclick = () => {
        if (confirm('Are you sure you want to terminate this session?')) {
          modal.style.display = 'none';
          this.deleteSession(sessionId);
        }
      };
      
      // Show commands if available
      const commandsBody = document.getElementById('commands-tbody');
      if (session.logs && session.logs.length > 0) {
        let html = '';
        for (const log of session.logs) {
          const exitCodeClass = log.exitCode === 0 ? 'command-success' : 'command-error';
          html += `<tr class="command-row">
            <td>${new Date(log.timestamp).toLocaleTimeString()}</td>
            <td>${log.command}</td>
            <td class="${exitCodeClass}">${log.exitCode !== undefined ? log.exitCode : 'N/A'}</td>
          </tr>`;
        }
        commandsBody.innerHTML = html;
      } else {
        commandsBody.innerHTML = '<tr><td colspan="3" class="text-center">No commands executed yet</td></tr>';
      }
      
      // Set up close button
      const closeBtn = modal.querySelector('.modal-close');
      closeBtn.onclick = () => {
        modal.style.display = 'none';
      };
      
    } catch (error) {
      console.error('Error showing session details:', error);
      if (window.app) {
        window.app.showNotification(`Failed to load session details: ${error.message}`, 'error');
      }
    }
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
  
  async createSession(sessionName = '') {
    try {
      // Show loading notification
      if (window.app) {
        window.app.showNotification('Creating new terminal session...', 'info');
      }
      
      // Open the session creation modal if it exists and no name was provided
      if (!sessionName && document.getElementById('new-session-modal')) {
        // Show modal
        const modal = document.getElementById('new-session-modal');
        modal.style.display = 'flex';
        
        // Set up event listeners for the modal
        const createBtn = document.getElementById('create-session-btn');
        const closeBtn = modal.querySelector('.modal-close');
        const errorEl = document.getElementById('new-session-error');
        
        // Clear previous errors
        errorEl.textContent = '';
        
        // Focus the input
        document.getElementById('session-name').focus();
        
        // Return a promise that resolves when the session is created
        return new Promise((resolve, reject) => {
          // Create button handler
          const handleCreate = async () => {
            const nameInput = document.getElementById('session-name');
            const sessionName = nameInput.value.trim();
            
            // Remove event listeners
            createBtn.removeEventListener('click', handleCreate);
            closeBtn.removeEventListener('click', handleClose);
            
            // Hide modal
            modal.style.display = 'none';
            
            try {
              // Create the session
              await this.createSessionWithName(sessionName);
              resolve();
            } catch (error) {
              reject(error);
            }
          };
          
          // Close button handler
          const handleClose = () => {
            // Remove event listeners
            createBtn.removeEventListener('click', handleCreate);
            closeBtn.removeEventListener('click', handleClose);
            
            // Hide modal
            modal.style.display = 'none';
            
            // Reject the promise
            reject(new Error('Session creation cancelled'));
          };
          
          // Add event listeners
          createBtn.addEventListener('click', handleCreate);
          closeBtn.addEventListener('click', handleClose);
        });
      } else {
        // Create session directly if name was provided or no modal exists
        return this.createSessionWithName(sessionName);
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      
      // Show error notification instead of alert
      if (window.app) {
        window.app.showNotification(`Failed to create session: ${error.message}`, 'error');
      } else {
        alert(`Failed to create session: ${error.message}`);
      }
    }
  }
  
  async createSessionWithName(sessionName = '') {
    try {
      const response = await fetch('/api/create-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        },
        body: JSON.stringify({ sessionName })
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
        sessionName: sessionData.sessionName || sessionData.userId,
        created: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        expiresIn: sessionData.expiresIn,
        isMock: sessionData.isMock || false
      };
      
      this.sessions.push(session);
      this.addSessionToUI(session);
      
      // Automatically select the new session
      this.selectSession(session.id);
      
      // Show success notification
      if (window.app) {
        if (session.isMock) {
          window.app.showNotification('Created session in mock mode (Docker unavailable). You can still use the terminal with simulated outputs.', 'warning');
        } else {
          window.app.showNotification('Terminal session created successfully!', 'success');
        }
      }
      
      return session;
    } catch (error) {
      console.error('Failed to create session:', error);
      
      // Special handling for Docker socket errors
      if (error.message && error.message.includes('connect ENOENT /var/run/docker.sock')) {
        error.message = 'Could not connect to Docker. Using mock mode instead.';
      }
      
      // Show error notification
      if (window.app) {
        window.app.showNotification(`Failed to create session: ${error.message}`, 'error');
      } else {
        alert(`Failed to create session: ${error.message}`);
      }
      
      throw error;
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
