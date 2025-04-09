/**
 * docker-manager.js - Manages Docker image selection and container creation in the UI
 */

class DockerManager {
  constructor() {
    // DOM elements
    this.containerImageSelectEl = document.getElementById('container-image');
    this.refreshImagesBtn = document.getElementById('refresh-images-btn');
    this.pullImageBtn = document.getElementById('pull-image-btn');
    this.customImageInput = document.getElementById('custom-image-input');
    this.imageErrorMsg = document.getElementById('image-error-msg');
    
    // Modal elements
    this.imageModal = document.getElementById('image-select-modal');
    this.imageSelectBtn = document.getElementById('image-select-btn');
    
    // State
    this.availableImages = [];
    this.selectedImage = null;
    
    // Initialize
    this.init();
  }
  
  init() {
    // Check if we have the DOM elements needed
    if (!this.containerImageSelectEl) return;
    
    // Set up event listeners
    if (this.refreshImagesBtn) {
      this.refreshImagesBtn.addEventListener('click', () => this.refreshAvailableImages());
    }
    
    if (this.pullImageBtn) {
      this.pullImageBtn.addEventListener('click', () => this.pullImage());
    }
    
    if (this.imageSelectBtn) {
      this.imageSelectBtn.addEventListener('click', () => this.confirmImageSelection());
    }
    
    // Initialize available images
    this.refreshAvailableImages();
    
    // Add event listener for the image select button in the create session modal
    const imageSettingsBtn = document.getElementById('session-image-settings');
    if (imageSettingsBtn) {
      imageSettingsBtn.addEventListener('click', () => this.openImageSelector());
    }
  }
  
  async refreshAvailableImages() {
    try {
      // Show loading state
      if (this.containerImageSelectEl) {
        this.containerImageSelectEl.innerHTML = '<option value="">Loading images...</option>';
      }
      
      // Fetch available images from server
      const response = await fetch('/api/docker/images', {
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch available images');
      }
      
      const images = await response.json();
      this.availableImages = images;
      
      // Update select element
      if (this.containerImageSelectEl) {
        this.updateImageSelect();
      }
      
      // Show success notification
      if (window.app) {
        window.app.showNotification('Refreshed available Docker images', 'success');
      }
    } catch (error) {
      console.error('Failed to refresh Docker images:', error);
      
      // Show error notification
      if (window.app) {
        window.app.showNotification('Failed to refresh Docker images: ' + error.message, 'error');
      }
      
      // Reset select element
      if (this.containerImageSelectEl) {
        this.containerImageSelectEl.innerHTML = '<option value="">Failed to load images</option>';
      }
    }
  }
  
  updateImageSelect() {
    if (!this.containerImageSelectEl) return;
    
    if (this.availableImages.length === 0) {
      this.containerImageSelectEl.innerHTML = '<option value="">No images available</option>';
      return;
    }
    
    let html = '<option value="">Select a container image</option>';
    
    // Sort images by tag
    const sortedImages = [...this.availableImages].sort((a, b) => {
      // Sort latest tag first
      if (a.includes(':latest') && !b.includes(':latest')) {
        return -1;
      }
      if (!a.includes(':latest') && b.includes(':latest')) {
        return 1;
      }
      // Otherwise sort alphabetically
      return a.localeCompare(b);
    });
    
    // Add options for each image
    sortedImages.forEach(image => {
      html += `<option value="${image}">${image}</option>`;
    });
    
    // Add option for custom image
    html += '<option value="custom">Custom Image...</option>';
    
    this.containerImageSelectEl.innerHTML = html;
    
    // Add change event listener
    this.containerImageSelectEl.addEventListener('change', () => {
      const value = this.containerImageSelectEl.value;
      
      // Show custom image input if needed
      if (value === 'custom') {
        this.customImageInput.style.display = 'block';
      } else {
        this.customImageInput.style.display = 'none';
        this.selectedImage = value;
      }
    });
  }
  
  async pullImage() {
    // Get image name from custom input
    const imageName = this.customImageInput.value.trim();
    
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
      
      // Refresh image list
      await this.refreshAvailableImages();
      
      // Set the selected image to the one we just pulled
      this.selectedImage = imageName;
      if (this.containerImageSelectEl) {
        this.containerImageSelectEl.value = imageName;
      }
    } catch (error) {
      console.error('Failed to pull Docker image:', error);
      
      if (window.app) {
        window.app.showNotification('Failed to pull image: ' + error.message, 'error');
      }
      
      this.imageErrorMsg.textContent = 'Failed to pull image: ' + error.message;
    } finally {
      // Reset button state
      this.pullImageBtn.disabled = false;
      this.pullImageBtn.innerHTML = '<i class="fas fa-download"></i> Pull Image';
    }
  }
  
  openImageSelector() {
    if (!this.imageModal) return;
    
    // Refresh available images
    this.refreshAvailableImages();
    
    // Show the modal
    this.imageModal.style.display = 'flex';
  }
  
  confirmImageSelection() {
    // Get the selected image
    let imageName = this.selectedImage;
    
    // If custom image is selected, get the value from the input
    if (this.containerImageSelectEl && this.containerImageSelectEl.value === 'custom') {
      imageName = this.customImageInput.value.trim();
      
      if (!imageName) {
        this.imageErrorMsg.textContent = 'Please enter a valid image name';
        return;
      }
    }
    
    // Hide the modal
    if (this.imageModal) {
      this.imageModal.style.display = 'none';
    }
    
    // Set the selected image in the create session modal
    const sessionImageInput = document.getElementById('session-image');
    if (sessionImageInput) {
      sessionImageInput.value = imageName;
    }
    
    // Notify the user
    if (window.app) {
      window.app.showNotification(`Selected image: ${imageName}`, 'success');
    }
  }
  
  getSelectedImage() {
    // Get the selected image from the create session modal
    const sessionImageInput = document.getElementById('session-image');
    if (sessionImageInput && sessionImageInput.value) {
      return sessionImageInput.value;
    }
    
    // If no image is selected, return the default
    return null;
  }
}

// Initialize Docker manager
const dockerManager = new DockerManager();
