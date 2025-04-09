/**
 * auto-docker.js - Client-side interface to the automatic Docker initialization
 * 
 * This file provides a UI for the automatic Docker image management features.
 */

class AutoDockerManager {
  constructor() {
    // DOM elements
    this.rebuildBtn = document.getElementById('rebuild-default-image');
    this.createVersionBtn = document.getElementById('create-version-tag');
    this.dockerStatusEl = document.getElementById('auto-docker-status');
    
    // Initialize
    this.init();
  }
  
  init() {
    if (this.rebuildBtn) {
      this.rebuildBtn.addEventListener('click', () => this.rebuildDefaultImage());
    }
    
    if (this.createVersionBtn) {
      this.createVersionBtn.addEventListener('click', () => this.createVersionTag());
    }
    
    // Create UI elements if they don't exist
    this.ensureUIExists();
    
    // Check Docker auto-initialization status
    this.checkDockerStatus();
  }
  
  ensureUIExists() {
    // Check if we need to add the auto-docker UI to admin panel
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel && !document.getElementById('auto-docker-button')) {
      // Add the button to admin panel
      const autoDockerBtn = document.createElement('button');
      autoDockerBtn.id = 'auto-docker-button';
      autoDockerBtn.className = 'sidebar-button';
      autoDockerBtn.innerHTML = '<i class="fas fa-magic"></i> Auto Docker';
      adminPanel.appendChild(autoDockerBtn);
      
      // Add click handler
      autoDockerBtn.addEventListener('click', () => this.showAutoDockerModal());
      
      // Create the modal if it doesn't exist
      this.createAutoDockerModal();
    }
  }
  
  createAutoDockerModal() {
    // Check if modal already exists
    if (document.getElementById('auto-docker-modal')) {
      return;
    }
    
    // Create modal
    const modal = document.createElement('div');
    modal.id = 'auto-docker-modal';
    modal.className = 'modal';
    
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Automatic Docker Management</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="dashboard-section">
            <h3>Docker Status</h3>
            <div id="auto-docker-status" class="docker-stats">
              <div class="docker-stat">
                <span class="docker-stat-title">Default Image:</span>
                <span class="docker-stat-value" id="default-image-status">Checking...</span>
              </div>
              <div class="docker-stat">
                <span class="docker-stat-title">Last Built:</span>
                <span class="docker-stat-value" id="last-built-status">Unknown</span>
              </div>
              <div class="docker-stat">
                <span class="docker-stat-title">Available Tags:</span>
                <span class="docker-stat-value" id="available-tags-status">Checking...</span>
              </div>
            </div>
          </div>
          
          <div class="dashboard-section">
            <h3>Auto Build Options</h3>
            <p>These actions will automatically build and push Docker images to your repository.</p>
            <div class="button-group">
              <button id="rebuild-default-image" class="btn btn-primary">
                <i class="fas fa-sync"></i> Rebuild Default Image
              </button>
              <button id="create-version-tag" class="btn">
                <i class="fas fa-tag"></i> Create Version Tag
              </button>
            </div>
          </div>
          
          <div class="dashboard-section">
            <h3>Available Images</h3>
            <div class="table-responsive">
              <table class="admin-table" id="auto-images-table">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Created</th>
                    <th>Size</th>
                    <th>Default</th>
                  </tr>
                </thead>
                <tbody id="auto-images-tbody">
                  <tr><td colspan="4" class="text-center">Loading images...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="refresh-auto-docker" class="btn">
            <i class="fas fa-sync"></i> Refresh Status
          </button>
        </div>
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(modal);
    
    // Add event listeners
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }
    
    const refreshBtn = document.getElementById('refresh-auto-docker');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.checkDockerStatus());
    }
    
    // Update references to new elements
    this.rebuildBtn = document.getElementById('rebuild-default-image');
    this.createVersionBtn = document.getElementById('create-version-tag');
    this.dockerStatusEl = document.getElementById('auto-docker-status');
    
    // Add button handlers
    if (this.rebuildBtn) {
      this.rebuildBtn.addEventListener('click', () => this.rebuildDefaultImage());
    }
    
    if (this.createVersionBtn) {
      this.createVersionBtn.addEventListener('click', () => this.createVersionTag());
    }
    
    // Close when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  }
  
  showAutoDockerModal() {
    const modal = document.getElementById('auto-docker-modal');
    if (modal) {
      modal.style.display = 'flex';
      this.checkDockerStatus();
    }
  }
  
  async checkDockerStatus() {
    try {
      // Add loading indicators
      document.getElementById('default-image-status').innerHTML = '<div class="loading-spinner"></div>';
      document.getElementById('available-tags-status').innerHTML = '<div class="loading-spinner"></div>';
      
      // Fetch Docker status
      const response = await fetch('/api/docker/auto-status', {
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch Docker status');
      }
      
      const status = await response.json();
      
      // Update status elements
      document.getElementById('default-image-status').textContent = status.defaultImageExists ? 'Available' : 'Not Available';
      document.getElementById('default-image-status').className = 'docker-stat-value ' + (status.defaultImageExists ? 'status-ok' : 'status-error');
      
      document.getElementById('last-built-status').textContent = status.lastBuilt || 'Never';
      
      document.getElementById('available-tags-status').textContent = status.availableTags?.length || '0';
      
      // Update images table
      const tbody = document.getElementById('auto-images-tbody');
      if (tbody) {
        if (!status.images || status.images.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="text-center">No images available</td></tr>';
        } else {
          let html = '';
          status.images.forEach(image => {
            html += `
              <tr>
                <td>${image.tag}</td>
                <td>${new Date(image.created).toLocaleString()}</td>
                <td>${image.size}</td>
                <td>${image.isDefault ? 'Yes' : 'No'}</td>
              </tr>
            `;
          });
          tbody.innerHTML = html;
        }
      }
      
    } catch (error) {
      console.error('Failed to check Docker status:', error);
      
      // Show error
      document.getElementById('default-image-status').textContent = 'Error';
      document.getElementById('default-image-status').className = 'docker-stat-value status-error';
      
      document.getElementById('available-tags-status').textContent = 'Error';
      
      const tbody = document.getElementById('auto-images-tbody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center text-danger">
              Error loading Docker status: ${error.message}
            </td>
          </tr>
        `;
      }
      
      // Show notification
      if (window.app) {
        window.app.showNotification('Failed to check Docker status: ' + error.message, 'error');
      }
    }
  }
  
  async rebuildDefaultImage() {
    if (!confirm('Are you sure you want to rebuild the default Docker image? This may take a few minutes.')) {
      return;
    }
    
    try {
      // Disable button and show loading
      this.rebuildBtn.disabled = true;
      this.rebuildBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building...';
      
      // Call API to rebuild
      const response = await fetch('/api/docker/rebuild-default', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        }
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to rebuild default image');
      }
      
      // Show success
      if (window.app) {
        window.app.showNotification('Default image rebuild initiated. This may take a few minutes to complete.', 'success');
      }
      
      // Periodically check status
      this.pollBuildStatus();
      
    } catch (error) {
      console.error('Failed to rebuild default image:', error);
      
      // Show error
      if (window.app) {
        window.app.showNotification('Failed to rebuild default image: ' + error.message, 'error');
      }
    } finally {
      // Reset button after a delay
      setTimeout(() => {
        this.rebuildBtn.disabled = false;
        this.rebuildBtn.innerHTML = '<i class="fas fa-sync"></i> Rebuild Default Image';
      }, 3000);
    }
  }
  
  async createVersionTag() {
    try {
      // Disable button and show loading
      this.createVersionBtn.disabled = true;
      this.createVersionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
      
      // Call API to create tag
      const response = await fetch('/api/docker/create-version-tag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        }
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create version tag');
      }
      
      const result = await response.json();
      
      // Show success
      if (window.app) {
        window.app.showNotification(`Created version tag: ${result.tag}`, 'success');
      }
      
      // Refresh status
      this.checkDockerStatus();
      
    } catch (error) {
      console.error('Failed to create version tag:', error);
      
      // Show error
      if (window.app) {
        window.app.showNotification('Failed to create version tag: ' + error.message, 'error');
      }
    } finally {
      // Reset button
      this.createVersionBtn.disabled = false;
      this.createVersionBtn.innerHTML = '<i class="fas fa-tag"></i> Create Version Tag';
    }
  }
  
  pollBuildStatus() {
    let attempts = 0;
    const maxAttempts = 60; // Check for up to 5 minutes (5s * 60)
    
    const checkStatus = () => {
      attempts++;
      
      if (attempts > maxAttempts) {
        if (window.app) {
          window.app.showNotification('Build status check timed out. The build may still be in progress.', 'warning');
        }
        return;
      }
      
      fetch('/api/docker/build-status', {
        headers: auth.getAuthHeaders()
      })
        .then(response => response.json())
        .then(status => {
          if (status.completed) {
            if (status.success) {
              if (window.app) {
                window.app.showNotification('Default image rebuilt successfully!', 'success');
              }
              this.checkDockerStatus();
            } else {
              if (window.app) {
                window.app.showNotification('Default image build failed: ' + (status.error || 'Unknown error'), 'error');
              }
            }
          } else {
            // Still building, check again in 5 seconds
            setTimeout(checkStatus, 5000);
          }
        })
        .catch(error => {
          console.error('Error checking build status:', error);
          // Try again anyway
          setTimeout(checkStatus, 5000);
        });
    };
    
    // Start polling
    setTimeout(checkStatus, 2000);
  }
}

// Initialize auto docker manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.autoDockerManager = new AutoDockerManager();
});
