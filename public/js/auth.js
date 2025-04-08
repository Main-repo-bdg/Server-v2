/**
 * auth.js - Handles authentication functionality for the Terminal Server
 */

class Auth {
  constructor() {
    this.token = localStorage.getItem('token');
    this.username = localStorage.getItem('username');
    this.isAdmin = localStorage.getItem('isAdmin') === 'true';
    
    // DOM elements
    this.authContainer = document.getElementById('auth-container');
    this.mainContainer = document.getElementById('main-container');
    this.loginForm = document.getElementById('login-form');
    this.registerForm = document.getElementById('register-form');
    this.showLoginBtn = document.getElementById('show-login');
    this.showRegisterBtn = document.getElementById('show-register');
    this.loginButton = document.getElementById('login-button');
    this.registerButton = document.getElementById('register-button');
    this.loginError = document.getElementById('login-error');
    this.registerError = document.getElementById('register-error');
    this.usernameDisplay = document.getElementById('username-display');
    this.adminPanel = document.getElementById('admin-panel');
    this.logoutBtn = document.getElementById('logout-btn');
    
    this.initEventListeners();
  }
  
  initEventListeners() {
    // Show login/register forms
    this.showLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.loginForm.style.display = 'block';
      this.registerForm.style.display = 'none';
    });
    
    this.showRegisterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.loginForm.style.display = 'none';
      this.registerForm.style.display = 'block';
    });
    
    // Form submissions
    this.loginButton.addEventListener('click', () => this.login());
    this.registerButton.addEventListener('click', () => this.register());
    
    // Login on Enter key
    document.getElementById('login-username').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.login();
    });
    
    document.getElementById('login-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.login();
    });
    
    // Register on Enter key
    document.getElementById('register-confirm-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.register();
    });
    
    // Logout
    this.logoutBtn.addEventListener('click', () => this.logout());
  }
  
  async login() {
    try {
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      
      if (!username || !password) {
        this.loginError.textContent = 'Username and password are required';
        return;
      }
      
      this.loginButton.disabled = true;
      this.loginButton.textContent = 'Logging in...';
      
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }
      
      // Save authentication data
      this.token = data.token;
      this.username = data.username;
      this.isAdmin = data.isAdmin;
      
      localStorage.setItem('token', this.token);
      localStorage.setItem('username', this.username);
      localStorage.setItem('isAdmin', this.isAdmin);
      
      this.loginSuccess();
    } catch (error) {
      this.loginError.textContent = error.message;
    } finally {
      this.loginButton.disabled = false;
      this.loginButton.textContent = 'Login';
    }
  }
  
  async register() {
    try {
      const username = document.getElementById('register-username').value.trim();
      const password = document.getElementById('register-password').value;
      const confirmPassword = document.getElementById('register-confirm-password').value;
      const adminKey = document.getElementById('admin-key').value;
      
      if (!username || !password) {
        this.registerError.textContent = 'Username and password are required';
        return;
      }
      
      if (password !== confirmPassword) {
        this.registerError.textContent = 'Passwords do not match';
        return;
      }
      
      this.registerButton.disabled = true;
      this.registerButton.textContent = 'Registering...';
      
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, adminKey })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      
      // Show success and switch to login form
      this.registerError.textContent = 'Registration successful! You can now login.';
      this.registerError.style.color = 'var(--success)';
      
      // Clear the registration form
      document.getElementById('register-username').value = '';
      document.getElementById('register-password').value = '';
      document.getElementById('register-confirm-password').value = '';
      document.getElementById('admin-key').value = '';
      
      // Switch to login after a delay
      setTimeout(() => {
        this.loginForm.style.display = 'block';
        this.registerForm.style.display = 'none';
        this.registerError.textContent = '';
        this.registerError.style.color = 'var(--danger)';
      }, 2000);
      
    } catch (error) {
      this.registerError.textContent = error.message;
    } finally {
      this.registerButton.disabled = false;
      this.registerButton.textContent = 'Register';
    }
  }
  
  logout() {
    // Call the logout API
    if (this.token) {
      fetch('/api/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      }).catch(err => console.error('Logout error:', err));
    }
    
    // Clear local data
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('isAdmin');
    
    this.token = null;
    this.username = null;
    this.isAdmin = false;
    
    // Show login screen
    this.authContainer.style.display = 'flex';
    this.mainContainer.style.display = 'none';
    
    // Clear login form
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    this.loginError.textContent = '';
  }
  
  loginSuccess() {
    // Update UI for logged in user
    this.authContainer.style.display = 'none';
    this.mainContainer.style.display = 'flex';
    this.usernameDisplay.textContent = this.username;
    
    // Show admin panel if user is admin
    if (this.isAdmin) {
      this.adminPanel.style.display = 'block';
    } else {
      this.adminPanel.style.display = 'none';
    }
    
    // Notify the app that login was successful
    document.dispatchEvent(new CustomEvent('auth:login'));
  }
  
  checkAuth() {
    if (this.token) {
      // Verify token is still valid with a backend call
      fetch('/api/sessions', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      })
        .then(response => {
          if (response.ok) {
            this.loginSuccess();
          } else {
            this.logout();
          }
        })
        .catch(() => {
          this.logout();
        });
    }
  }
  
  // Helper method to get auth headers for API calls
  getAuthHeaders() {
    return { 'Authorization': `Bearer ${this.token}` };
  }
}

// Initialize auth module
const auth = new Auth();
