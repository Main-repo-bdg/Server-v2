/**
 * settings.js - Handles settings and preferences for the Terminal Server
 */

class SettingsManager {
  constructor() {
    // DOM elements
    this.settingsButton = document.getElementById('terminal-settings-btn');
    this.settingsModal = document.getElementById('settings-modal');
    this.closeModalBtn = document.querySelector('.modal-close');
    this.saveSettingsBtn = document.getElementById('settings-save');
    
    // Settings form elements
    this.fontSizeSelect = document.getElementById('font-size');
    this.themeSelect = document.getElementById('theme-select');
    this.bellCheckbox = document.getElementById('setting-bell');
    this.cursorBlinkCheckbox = document.getElementById('setting-cursor-blink');
    
    // Load settings from localStorage
    this.loadSettings();
    
    // Initialize event listeners
    this.initEventListeners();
  }
  
  loadSettings() {
    // Set form values based on localStorage (or defaults)
    this.fontSizeSelect.value = localStorage.getItem('terminal_fontSize') || '14';
    this.themeSelect.value = localStorage.getItem('terminal_theme') || 'dark';
    this.bellCheckbox.checked = localStorage.getItem('terminal_bellSound') !== 'false';
    this.cursorBlinkCheckbox.checked = localStorage.getItem('terminal_cursorBlink') !== 'false';
    
    // Apply theme to document
    this.applyTheme(this.themeSelect.value);
  }
  
  initEventListeners() {
    // Open settings modal
    this.settingsButton.addEventListener('click', () => {
      this.openModal();
    });
    
    // Close settings modal (X button)
    this.closeModalBtn.addEventListener('click', () => {
      this.closeModal();
    });
    
    // Close modal when clicking outside
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) {
        this.closeModal();
      }
    });
    
    // Save settings button
    this.saveSettingsBtn.addEventListener('click', () => {
      this.saveSettings();
      this.closeModal();
    });
    
    // Preview theme when changed
    this.themeSelect.addEventListener('change', () => {
      this.applyTheme(this.themeSelect.value);
    });
  }
  
  openModal() {
    // Reset form to current settings before showing
    this.loadSettings();
    
    // Show modal
    this.settingsModal.style.display = 'flex';
  }
  
  closeModal() {
    this.settingsModal.style.display = 'none';
  }
  
  saveSettings() {
    // Get values from form
    const fontSize = this.fontSizeSelect.value;
    const theme = this.themeSelect.value;
    const bellSound = this.bellCheckbox.checked;
    const cursorBlink = this.cursorBlinkCheckbox.checked;
    
    // Save to localStorage
    localStorage.setItem('terminal_fontSize', fontSize);
    localStorage.setItem('terminal_theme', theme);
    localStorage.setItem('terminal_bellSound', bellSound);
    localStorage.setItem('terminal_cursorBlink', cursorBlink);
    
    // Apply theme
    this.applyTheme(theme);
    
    // Notify other components that settings have changed
    document.dispatchEvent(new CustomEvent('settings:changed'));
  }
  
  applyTheme(theme) {
    // Remove existing theme classes
    document.body.classList.remove('light-theme', 'dracula-theme', 'monokai-theme');
    
    // Add the selected theme class
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else if (theme === 'dracula') {
      document.body.classList.add('dracula-theme');
    } else if (theme === 'monokai') {
      document.body.classList.add('monokai-theme');
    }
    // Dark theme is the default, no class needed
  }
}

// Initialize settings manager
const settingsManager = new SettingsManager();
