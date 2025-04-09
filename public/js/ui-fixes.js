/**
 * ui-fixes.js - UI improvements and fixes for Terminal Server
 */

class UIManager {
  constructor() {
    // Sidebar elements
    this.sidebar = document.getElementById('sidebar');
    this.sidebarToggle = document.getElementById('sidebar-toggle');
    this.mainContent = document.querySelector('.main-content');
    
    // UI state
    this.sidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    
    // Initialize
    this.init();
  }
  
  init() {
    this.initSidebarToggle();
    this.initModalEscapeHandling();
    this.initClickOutsideModalClose();
    
    // Initialize Docker image selection modal if it exists
    this.initDockerImageModal();
    
    // Apply any saved UI state
    this.applySavedState();
  }
  
  initSidebarToggle() {
    if (this.sidebarToggle) {
      this.sidebarToggle.addEventListener('click', () => {
        this.toggleSidebar();
      });
    }
  }
  
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    
    // Update DOM
    if (this.sidebarCollapsed) {
      this.sidebar.classList.add('sidebar-collapsed');
      this.sidebarToggle.classList.add('collapsed');
      this.mainContent.classList.add('main-content-expanded');
    } else {
      this.sidebar.classList.remove('sidebar-collapsed');
      this.sidebarToggle.classList.remove('collapsed');
      this.mainContent.classList.remove('main-content-expanded');
    }
    
    // Save state
    localStorage.setItem('sidebar-collapsed', this.sidebarCollapsed);
    
    // Trigger resize for terminal if active
    setTimeout(() => {
      if (window.terminalManager) {
        window.terminalManager.fitActiveTerminal();
      }
    }, 300); // After transition completes
  }
  
  applySavedState() {
    // Apply sidebar state
    if (this.sidebarCollapsed) {
      this.sidebar.classList.add('sidebar-collapsed');
      this.sidebarToggle.classList.add('collapsed');
      this.mainContent.classList.add('main-content-expanded');
    }
  }
  
  initModalEscapeHandling() {
    // Close any modal when Escape is pressed
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(modal => {
          if (modal.style.display === 'flex') {
            modal.style.display = 'none';
          }
        });
      }
    });
  }
  
  initClickOutsideModalClose() {
    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
    });
  }
  
  initDockerImageModal() {
    // Create Docker image selection modal if it doesn't exist
    if (!document.getElementById('image-select-modal')) {
      this.createDockerImageModal();
    }
  }
  
  createDockerImageModal() {
    const modal = document.createElement('div');
    modal.id = 'image-select-modal';
    modal.className = 'modal';
    
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Select Docker Image</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="image-select-container">
            <label for="container-image" class="image-select-label">Container Image:</label>
            <select id="container-image" class="select-input">
              <option value="">Loading images...</option>
            </select>
            
            <div id="custom-image-input" style="display: none; margin-top: 10px;">
              <label for="custom-image" class="image-select-label">Custom Image:</label>
              <input type="text" id="custom-image" placeholder="e.g., bdgtest/terminal:latest" class="text-input">
            </div>
            
            <div id="image-error-msg" class="error-message"></div>
          </div>
          
          <div class="docker-container">
            <div class="docker-header">
              <h3>Available Images</h3>
              <div class="docker-actions">
                <button id="refresh-images-btn" class="btn btn-sm">
                  <i class="fas fa-sync"></i> Refresh
                </button>
              </div>
            </div>
            
            <div id="docker-tags-container" class="docker-tag-list">
              <div class="no-data-message">No images available</div>
            </div>
          </div>
          
          <div class="pull-form">
            <div class="pull-form-title">Pull New Image</div>
            <div class="pull-form-input">
              <input type="text" id="pull-image-name" placeholder="e.g., bdgtest/terminal:latest" class="text-input">
              <button id="pull-image-btn" class="btn btn-primary">
                <i class="fas fa-download"></i> Pull
              </button>
            </div>
            <div id="pull-progress" class="pull-progress" style="display: none;">
              <div id="pull-progress-bar" class="pull-progress-bar"></div>
              <div id="pull-progress-text" class="pull-progress-text">0%</div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="image-select-btn" class="btn btn-primary">Select Image</button>
        </div>
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    
    // Close when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }
  
  // Create a loading overlay for any element
  createLoadingOverlay(targetElement, message = 'Loading...') {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="loading-message">
        <div class="loading-spinner"></div>
        <span>${message}</span>
      </div>
    `;
    
    targetElement.style.position = 'relative';
    targetElement.appendChild(overlay);
    
    return {
      remove: () => {
        overlay.remove();
      },
      updateMessage: (newMessage) => {
        overlay.querySelector('.loading-message span').textContent = newMessage;
      }
    };
  }
  
  // Show a modal by ID
  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'flex';
    }
  }
  
  // Hide a modal by ID
  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'none';
    }
  }
  
  // Create admin Docker tab if it doesn't exist
  createAdminDockerTab() {
    if (document.getElementById('admin-docker-tab')) return;
    
    // Create the tab button
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel) {
      const dockerBtn = document.createElement('button');
      dockerBtn.id = 'admin-docker-tab';
      dockerBtn.className = 'sidebar-button';
      dockerBtn.innerHTML = '<i class="fab fa-docker"></i> Docker Images';
      adminPanel.appendChild(dockerBtn);
    }
    
    // Create the Docker tab content in the dashboard modal
    const dashboardModal = document.getElementById('admin-dashboard-modal');
    if (dashboardModal) {
      const modalBody = dashboardModal.querySelector('.modal-body');
      
      // Create tabs if they don't exist
      if (!modalBody.querySelector('.admin-tabs')) {
        const tabsDiv = document.createElement('div');
        tabsDiv.className = 'admin-tabs';
        tabsDiv.innerHTML = `
          <button class="admin-tab-button active" data-tab="overview">Overview</button>
          <button class="admin-tab-button" data-tab="sessions">Sessions</button>
          <button class="admin-tab-button" data-tab="docker">Docker</button>
          <button class="admin-tab-button" data-tab="system">System</button>
        `;
        
        // Insert at the beginning of the modal body
        modalBody.insertBefore(tabsDiv, modalBody.firstChild);
        
        // Add click handlers for tabs
        tabsDiv.querySelectorAll('.admin-tab-button').forEach(btn => {
          btn.addEventListener('click', () => {
            // Remove active class from all tabs
            tabsDiv.querySelectorAll('.admin-tab-button').forEach(b => {
              b.classList.remove('active');
            });
            
            // Add active class to clicked tab
            btn.classList.add('active');
            
            // Hide all tab contents
            modalBody.querySelectorAll('.tab-content').forEach(content => {
              content.style.display = 'none';
            });
            
            // Show selected tab content
            const tabContent = modalBody.querySelector(`.tab-content[data-tab="${btn.dataset.tab}"]`);
            if (tabContent) {
              tabContent.style.display = 'block';
            }
          });
        });
        
        // Wrap existing content in tab content divs
        const overviewContent = document.createElement('div');
        overviewContent.className = 'tab-content';
        overviewContent.dataset.tab = 'overview';
        overviewContent.style.display = 'block';
        
        // Move dashboard stats to overview tab
        const stats = modalBody.querySelector('.dashboard-stats');
        if (stats) {
          overviewContent.appendChild(stats.cloneNode(true));
          stats.remove();
        }
        
        // Create sessions tab content
        const sessionsContent = document.createElement('div');
        sessionsContent.className = 'tab-content';
        sessionsContent.dataset.tab = 'sessions';
        sessionsContent.style.display = 'none';
        
        // Move active sessions to sessions tab
        const activeSessions = modalBody.querySelector('.dashboard-section:nth-of-type(1)');
        if (activeSessions) {
          sessionsContent.appendChild(activeSessions.cloneNode(true));
          activeSessions.remove();
        }
        
        // Create system tab content
        const systemContent = document.createElement('div');
        systemContent.className = 'tab-content';
        systemContent.dataset.tab = 'system';
        systemContent.style.display = 'none';
        
        // Move system status to system tab
        const systemStatus = modalBody.querySelector('.dashboard-section:nth-of-type(2)');
        if (systemStatus) {
          systemContent.appendChild(systemStatus.cloneNode(true));
          systemStatus.remove();
        }
        
        // Create Docker tab content
        const dockerContent = document.createElement('div');
        dockerContent.className = 'tab-content';
        dockerContent.dataset.tab = 'docker';
        dockerContent.style.display = 'none';
        dockerContent.innerHTML = `
          <div class="dashboard-section">
            <h3>Docker Images</h3>
            <div class="action-bar">
              <button id="admin-pull-image-btn" class="btn btn-sm btn-primary">
                <i class="fas fa-download"></i> Pull New Image
              </button>
              <button id="refresh-docker-btn" class="btn btn-sm">
                <i class="fas fa-sync"></i> Refresh
              </button>
            </div>
            <div class="table-responsive">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tags</th>
                    <th>Size</th>
                    <th>Default</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="docker-images-tbody">
                  <tr><td colspan="5" class="text-center">Loading images...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div class="dashboard-section">
            <h3>Docker Status</h3>
            <div id="docker-stats" class="docker-stats">
              <div class="docker-stat">
                <span class="docker-stat-title">Status:</span>
                <span class="docker-stat-value" id="docker-status">Checking...</span>
              </div>
            </div>
          </div>
          
          <div class="dashboard-section">
            <h3>Set Default Image</h3>
            <div class="input-group">
              <input type="text" id="default-image-input" placeholder="e.g., bdgtest/terminal:latest">
              <button id="set-default-image-btn" class="btn btn-primary">Set Default</button>
            </div>
          </div>
        `;
        
        // Add all tab contents to modal body
        modalBody.appendChild(overviewContent);
        modalBody.appendChild(sessionsContent);
        modalBody.appendChild(dockerContent);
        modalBody.appendChild(systemContent);
      }
    }
  }
}

// Initialize UI manager
document.addEventListener('DOMContentLoaded', () => {
  window.uiManager = new UIManager();
});
