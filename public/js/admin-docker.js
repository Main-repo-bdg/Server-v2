/**
 * admin-docker.js - Extends admin functionality with Docker image management
 */

class DockerAdminManager {
  constructor() {
    // DOM elements
    this.dockerTabBtn = document.getElementById('admin-docker-tab');
    this.dockerImagesTable = document.getElementById('docker-images-tbody');
    this.dockerStatsEl = document.getElementById('docker-stats');
    this.pullImageBtn = document.getElementById('admin-pull-image-btn');
    this.pullImageInput = document.getElementById('admin-pull-image-input');
    this.imageErrorMsg = document.getElementById('admin-image-error-msg');
    
    // Initialize if elements exist
    if (this.dockerTabBtn) {
      this.init();
    }
  }
  
  init() {
    // Add tab click event
    this.dockerTabBtn.addEventListener('click', () => this.loadDockerTab());
    
    // Pull image button
    if (this.pullImageBtn) {
      this.pullImageBtn.addEventListener('click', () => this.pullImage());
    }
    
    // Refresh button
    const refreshImagesBtn = document.getElementById('refresh-docker-btn');
    if (refreshImagesBtn) {
      refreshImagesBtn.addEventListener('click', () => this.refreshDockerImages());
    }
    
    // Default image button
    const defaultImageBtn = document.getElementById('set-default-image-btn');
    if (defaultImageBtn) {
      defaultImageBtn.addEventListener('click', () => this.setDefaultImage());
    }
  }
  
  async loadDockerTab() {
    // Show Docker tab
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(tab => tab.style.display = 'none');
    
    const dockerTab = document.getElementById('docker-tab');
    if (dockerTab) {
      dockerTab.style.display = 'block';
    }
    
    // Load Docker images
    await this.refreshDockerImages();
    
    // Load Docker stats
    await this.loadDockerStats();
  }
  
  async refreshDockerImages() {
    if (!this.dockerImagesTable) return;
    
    try {
      // Show loading state
      this.dockerImagesTable.innerHTML = `
        <tr>
          <td colspan="5" class="text-center">
            <div class="loading-spinner"></div>
            <p>Loading Docker images...</p>
          </td>
        </tr>
      `;
      
      // Fetch Docker images
      const response = await fetch('/api/docker/images', {
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch Docker images');
      }
      
      const images = await response.json();
      
      if (images.length === 0) {
        this.dockerImagesTable.innerHTML = `
          <tr>
            <td colspan="5" class="text-center">
              No Docker images found. Pull an image to get started.
            </td>
          </tr>
        `;
        return;
      }
      
      // Generate table rows
      let html = '';
      for (const image of images) {
        const tags = Array.isArray(image.tags) ? image.tags.join(', ') : image.tags;
        const isDefault = image.isDefault ? 'Yes' : 'No';
        
        html += `
          <tr>
            <td>${image.id}</td>
            <td>${tags}</td>
            <td>${image.size}</td>
            <td>${isDefault}</td>
            <td>
              <button class="action-icon info-btn" title="Image Details" onclick="dockerAdminManager.viewImageDetails('${image.id}')">
                <i class="fas fa-info-circle"></i>
              </button>
              <button class="action-icon edit-btn" title="Set as Default" onclick="dockerAdminManager.setAsDefault('${tags.split(',')[0]}')">
                <i class="fas fa-check-circle"></i>
              </button>
              <button class="action-icon delete-btn" title="Remove Image" onclick="dockerAdminManager.removeImage('${image.id}')">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        `;
      }
      
      this.dockerImagesTable.innerHTML = html;
      
    } catch (error) {
      console.error('Failed to refresh Docker images:', error);
      
      this.dockerImagesTable.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-danger">
            Error loading Docker images: ${error.message}
          </td>
        </tr>
      `;
      
      if (window.app) {
        window.app.showNotification('Failed to load Docker images: ' + error.message, 'error');
      }
    }
  }
  
  async loadDockerStats() {
    if (!this.dockerStatsEl) return;
    
    try {
      // Show loading state
      this.dockerStatsEl.innerHTML = '<div class="loading-spinner"></div><p>Loading Docker stats...</p>';
      
      // Fetch Docker stats
      const response = await fetch('/api/docker/stats', {
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch Docker stats');
      }
      
      const stats = await response.json();
      
      // Display stats
      this.dockerStatsEl.innerHTML = `
        <div class="docker-stat">
          <span class="docker-stat-title">Default Image:</span>
          <span class="docker-stat-value">${stats.defaultImage || 'Not set'}</span>
        </div>
        <div class="docker-stat">
          <span class="docker-stat-title">Total Images:</span>
          <span class="docker-stat-value">${stats.totalImages || 0}</span>
        </div>
        <div class="docker-stat">
          <span class="docker-stat-title">Active Containers:</span>
          <span class="docker-stat-value">${stats.activeContainers || 0}</span>
        </div>
        <div class="docker-stat">
          <span class="docker-stat-title">Status:</span>
          <span class="docker-stat-value ${stats.dockerRunning ? 'status-ok' : 'status-error'}">
            ${stats.dockerRunning ? 'Running' : 'Not Running'}
          </span>
        </div>
      `;
    } catch (error) {
      console.error('Failed to load Docker stats:', error);
      
      this.dockerStatsEl.innerHTML = `
        <div class="docker-error">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Error loading Docker stats: ${error.message}</p>
        </div>
      `;
    }
  }
  
  async pullImage() {
    const imageName = this.pullImageInput.value.trim();
    
    if (!imageName) {
      this.imageErrorMsg.textContent = 'Please enter a valid image name';
      return;
    }
    
    this.imageErrorMsg.textContent = '';
    
    try {
      // Show loading state
      this.pullImageBtn.disabled = true;
      this.pullImageBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Pulling...';
      
      // Send request to pull image
      const response = await fetch('/api/docker/pull', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        },
        body: JSON.stringify({ image: imageName })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to pull image');
      }
      
      // Show success notification
      if (window.app) {
        window.app.showNotification(`Successfully pulled image: ${imageName}`, 'success');
      }
      
      // Reset input
      this.pullImageInput.value = '';
      
      // Refresh images
      await this.refreshDockerImages();
      await this.loadDockerStats();
      
    } catch (error) {
      console.error('Failed to pull Docker image:', error);
      
      this.imageErrorMsg.textContent = 'Failed to pull image: ' + error.message;
      
      if (window.app) {
        window.app.showNotification('Failed to pull image: ' + error.message, 'error');
      }
    } finally {
      // Reset button state
      this.pullImageBtn.disabled = false;
      this.pullImageBtn.innerHTML = '<i class="fas fa-download"></i> Pull Image';
    }
  }
  
  async viewImageDetails(imageId) {
    try {
      // Fetch image details
      const response = await fetch(`/api/docker/images/${imageId}`, {
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch image details');
      }
      
      const image = await response.json();
      
      // Create modal to display details
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.style.display = 'flex';
      
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h2>Docker Image Details</h2>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="info-row">
              <div class="info-label">ID:</div>
              <div class="info-value">${image.Id}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Tags:</div>
              <div class="info-value">${Array.isArray(image.RepoTags) ? image.RepoTags.join(', ') : image.RepoTags}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Created:</div>
              <div class="info-value">${new Date(image.Created * 1000).toLocaleString()}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Size:</div>
              <div class="info-value">${(image.Size / (1024 * 1024)).toFixed(2)} MB</div>
            </div>
            
            <div class="dashboard-section">
              <h3>Image Configuration</h3>
              <pre>${JSON.stringify(image.Config, null, 2)}</pre>
            </div>
          </div>
        </div>
      `;
      
      // Add modal to DOM
      document.body.appendChild(modal);
      
      // Add close button event
      const closeBtn = modal.querySelector('.modal-close');
      closeBtn.addEventListener('click', () => {
        modal.remove();
      });
      
      // Close modal when clicking outside
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });
      
    } catch (error) {
      console.error('Failed to fetch image details:', error);
      
      if (window.app) {
        window.app.showNotification('Failed to fetch image details: ' + error.message, 'error');
      }
    }
  }
  
  async setAsDefault(imageName) {
    try {
      // Confirm with user
      if (!confirm(`Set ${imageName} as the default container image?`)) {
        return;
      }
      
      // Send request to set default image
      const response = await fetch('/api/docker/default-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        },
        body: JSON.stringify({ image: imageName })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to set default image');
      }
      
      // Show success notification
      if (window.app) {
        window.app.showNotification(`Set ${imageName} as the default container image`, 'success');
      }
      
      // Refresh images
      await this.refreshDockerImages();
      await this.loadDockerStats();
      
    } catch (error) {
      console.error('Failed to set default image:', error);
      
      if (window.app) {
        window.app.showNotification('Failed to set default image: ' + error.message, 'error');
      }
    }
  }
  
  async removeImage(imageId) {
    try {
      // Confirm with user
      if (!confirm('Are you sure you want to remove this image?')) {
        return;
      }
      
      // Send request to remove image
      const response = await fetch(`/api/docker/images/${imageId}`, {
        method: 'DELETE',
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove image');
      }
      
      // Show success notification
      if (window.app) {
        window.app.showNotification('Image removed successfully', 'success');
      }
      
      // Refresh images
      await this.refreshDockerImages();
      await this.loadDockerStats();
      
    } catch (error) {
      console.error('Failed to remove image:', error);
      
      if (window.app) {
        window.app.showNotification('Failed to remove image: ' + error.message, 'error');
      }
    }
  }
  
  setDefaultImage() {
    // Get the image from the input field
    const defaultImageInput = document.getElementById('default-image-input');
    if (!defaultImageInput) return;
    
    const imageName = defaultImageInput.value.trim();
    if (!imageName) return;
    
    this.setAsDefault(imageName);
  }
}

// Initialize Docker admin manager
const dockerAdminManager = new DockerAdminManager();
