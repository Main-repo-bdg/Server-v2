/**
 * app.js - Main application file for Terminal Server Web UI
 */

class App {
  constructor() {
    // Check authentication on load
    this.init();
    
    // Welcome session button
    const welcomeNewSessionBtn = document.getElementById('welcome-new-session-btn');
    welcomeNewSessionBtn.addEventListener('click', () => {
      sessionManager.createSession();
    });
  }
  
  init() {
    // Check if user is logged in
    auth.checkAuth();
    
    // Show a loading message while the page initializes
    const welcomeMessage = document.querySelector('.terminal-welcome p');
    if (welcomeMessage) {
      const originalMessage = welcomeMessage.textContent;
      welcomeMessage.innerHTML = 'Initializing terminal server...';
      
      // Restore original message after initialization
      setTimeout(() => {
        welcomeMessage.innerHTML = originalMessage;
      }, 1000);
    }
    
    // Handle Escape key to close modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal.style.display === 'flex') {
          settingsModal.style.display = 'none';
        }
      }
    });
    
    // Handle browser close/refresh
    window.addEventListener('beforeunload', (e) => {
      // If there are active terminals, show a confirmation
      const activeTerminals = Object.keys(terminalManager.terminals).length;
      if (activeTerminals > 0) {
        const message = `You have ${activeTerminals} active terminal session${activeTerminals > 1 ? 's' : ''}. Are you sure you want to leave?`;
        e.returnValue = message;
        return message;
      }
    });
  }
  
  // Utility method to show a notification
  showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notificationContainer = document.querySelector('.notification-container');
    
    if (!notificationContainer) {
      notificationContainer = document.createElement('div');
      notificationContainer.className = 'notification-container';
      document.body.appendChild(notificationContainer);
    }
    
    // Create notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <div class="notification-content">${message}</div>
      <button class="notification-close">&times;</button>
    `;
    
    // Add to container
    notificationContainer.appendChild(notification);
    
    // Add close button functionality
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      notification.classList.add('notification-hidden');
      setTimeout(() => {
        notification.remove();
      }, 300);
    });
    
    // Auto close after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('notification-hidden');
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, 5000);
  }
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initialize app
  window.app = new App();
  
  // Add CSS for notifications (since they're created dynamically)
  const style = document.createElement('style');
  style.textContent = `
    .notification-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1100;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 320px;
    }
    
    .notification {
      background-color: var(--bg-secondary);
      color: var(--text-primary);
      border-left: 4px solid var(--primary);
      border-radius: 4px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: transform 0.3s, opacity 0.3s;
      max-width: 100%;
    }
    
    .notification-info {
      border-left-color: var(--primary);
    }
    
    .notification-success {
      border-left-color: var(--success);
    }
    
    .notification-warning {
      border-left-color: var(--warning);
    }
    
    .notification-error {
      border-left-color: var(--danger);
    }
    
    .notification-hidden {
      transform: translateX(120%);
      opacity: 0;
    }
    
    .notification-content {
      flex: 1;
      margin-right: 12px;
    }
    
    .notification-close {
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: var(--text-muted);
    }
  `;
  document.head.appendChild(style);
});
