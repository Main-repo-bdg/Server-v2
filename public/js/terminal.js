/**
 * terminal.js - Handles terminal functionality for the Terminal Server
 */

class TerminalManager {
  constructor() {
    this.terminals = {};
    this.activeTerminal = null;
    this.activeSessionId = null;
    this.terminalContainer = document.getElementById('terminal-container');
    this.terminalWelcome = document.getElementById('terminal-welcome');
    this.clearButton = document.getElementById('terminal-clear-btn');
    this.closeButton = document.getElementById('terminal-close-btn');
    this.fullscreenButton = document.getElementById('terminal-fullscreen-btn');
    this.currentSessionIdEl = document.getElementById('current-session-id');
    this.sessionStatusEl = document.getElementById('session-status');
    this.commandHistory = {};
    this.historyPosition = -1;
    this.currentInput = '';
    this.isFullscreen = false;
    
    // Terminal settings
    this.settings = {
      fontSize: parseInt(localStorage.getItem('terminal_fontSize') || '14'),
      theme: localStorage.getItem('terminal_theme') || 'dark',
      cursorBlink: localStorage.getItem('terminal_cursorBlink') !== 'false',
      bellSound: localStorage.getItem('terminal_bellSound') !== 'false'
    };
    
    this.initEventListeners();
  }
  
  initEventListeners() {
    // Terminal controls
    this.clearButton.addEventListener('click', () => {
      if (this.activeTerminal) {
        this.activeTerminal.term.clear();
      }
    });
    
    this.closeButton.addEventListener('click', () => {
      if (this.activeSessionId) {
        if (confirm('Are you sure you want to close this terminal session?')) {
          this.closeTerminal(this.activeSessionId);
        }
      }
    });
    
    this.fullscreenButton.addEventListener('click', () => {
      this.toggleFullscreen();
    });
    
    // Listen for the session selection event
    document.addEventListener('session:selected', (e) => {
      this.activateTerminal(e.detail.sessionId);
    });
    
    // Listen for session closed event
    document.addEventListener('session:closed', (e) => {
      this.terminals[e.detail.sessionId]?.term.dispose();
      delete this.terminals[e.detail.sessionId];
      
      // If the closed session was active, show welcome screen
      if (this.activeSessionId === e.detail.sessionId) {
        this.showWelcomeScreen();
      }
    });
    
    // Apply theme when settings change
    document.addEventListener('settings:changed', () => {
      this.applySettings();
    });
  }
  
  async createTerminal(sessionId) {
    if (this.terminals[sessionId]) {
      this.activateTerminal(sessionId);
      return;
    }
    
    // Create terminal container
    const terminalDiv = document.createElement('div');
    terminalDiv.id = `terminal-${sessionId}`;
    terminalDiv.className = 'terminal-instance';
    terminalDiv.style.height = '100%';
    terminalDiv.style.display = 'none';
    this.terminalContainer.appendChild(terminalDiv);
    
    // Initialize xterm.js
    const term = new Terminal({
      cursorBlink: this.settings.cursorBlink,
      fontSize: this.settings.fontSize,
      fontFamily: 'Fira Code, monospace',
      theme: this.getThemeColors(),
      scrollback: 5000,
      bellStyle: this.settings.bellSound ? 'sound' : 'none'
    });
    
    // Add fit addon
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    
    // Add web links addon
    term.loadAddon(new WebLinksAddon.WebLinksAddon());
    
    // Open terminal
    term.open(terminalDiv);
    fitAddon.fit();
    
    // Set up command history for this session
    this.commandHistory[sessionId] = [];
    
    // Store terminal instance
    this.terminals[sessionId] = {
      term,
      fitAddon,
      div: terminalDiv,
      lineBuffer: '',
      commandHistory: [],
      historyIndex: -1,
      lastCommand: ''
    };
    
    // Set up terminal input handling
    term.onData((data) => {
      const terminal = this.terminals[sessionId];
      
      // Handle special keys
      if (data === '\r') { // Enter key
        this.handleCommand(sessionId);
      }
      else if (data === '\u007F') { // Backspace
        if (terminal.lineBuffer.length > 0) {
          // Delete last character
          terminal.lineBuffer = terminal.lineBuffer.slice(0, -1);
          term.write('\b \b');
        }
      }
      else if (data === '\u0003') { // Ctrl+C
        term.write('^C\r\n$ ');
        terminal.lineBuffer = '';
      }
      else if (data === '\u001b[A') { // Up arrow - history
        this.navigateHistory(sessionId, 'up');
      }
      else if (data === '\u001b[B') { // Down arrow - history
        this.navigateHistory(sessionId, 'down');
      }
      else if (data === '\t') { // Tab - auto-complete (basic implementation)
        // For now, we don't implement tab completion
      }
      else if (data >= ' ' && data <= '~') { // Printable characters
        terminal.lineBuffer += data;
        term.write(data);
      }
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.activeTerminal) {
        this.activeTerminal.fitAddon.fit();
      }
    });
    
    // Initial greeting
    term.write('\r\n Welcome to Terminal Server! 🚀\r\n');
    term.write(' Type commands below:\r\n\r\n');
    term.write('$ ');
    
    // Activate this terminal
    this.activateTerminal(sessionId);
    
    return term;
  }
  
  activateTerminal(sessionId) {
    if (!this.terminals[sessionId]) {
      this.createTerminal(sessionId);
      return;
    }
    
    // Hide welcome screen
    this.terminalWelcome.style.display = 'none';
    
    // Hide all terminals
    Object.values(this.terminals).forEach(terminal => {
      terminal.div.style.display = 'none';
    });
    
    // Show selected terminal
    const terminal = this.terminals[sessionId];
    terminal.div.style.display = 'block';
    
    // Update active terminal reference
    this.activeTerminal = terminal;
    this.activeSessionId = sessionId;
    
    // Update terminal header
    this.currentSessionIdEl.textContent = `Session: ${sessionId.slice(0, 8)}...`;
    this.sessionStatusEl.textContent = 'Active';
    this.sessionStatusEl.className = 'session-status active';
    
    // Focus the terminal
    setTimeout(() => {
      terminal.term.focus();
      terminal.fitAddon.fit();
    }, 10);
  }
  
  async handleCommand(sessionId) {
    const terminal = this.terminals[sessionId];
    const command = terminal.lineBuffer.trim();
    
    // Reset line buffer
    terminal.lineBuffer = '';
    
    // Add to history if not empty
    if (command) {
      terminal.commandHistory.unshift(command);
      terminal.historyIndex = -1;
      terminal.lastCommand = '';
      
      // Keep history at reasonable size
      if (terminal.commandHistory.length > 100) {
        terminal.commandHistory.pop();
      }
    }
    
    // Always write the newline
    terminal.term.write('\r\n');
    
    if (!command) {
      terminal.term.write('$ ');
      return;
    }
    
    // Handle built-in commands
    if (command === 'clear') {
      terminal.term.clear();
      terminal.term.write('$ ');
      return;
    }
    
    // Send to server
    try {
      terminal.term.write(`Executing: ${command}\r\n`);
      
      const response = await fetch('/api/execute-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth.getAuthHeaders()
        },
        body: JSON.stringify({ command, sessionId })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Command execution failed');
      }
      
      // Display output
      if (data.output) {
        terminal.term.write(data.output);
        // Add a newline if the output doesn't end with one
        if (!data.output.endsWith('\n')) {
          terminal.term.write('\r\n');
        }
      }
      
      if (data.error) {
        terminal.term.write(`\r\nError: ${data.error}\r\n`);
      }
    } catch (error) {
      terminal.term.write(`\r\nError: ${error.message}\r\n`);
    }
    
    // Show prompt
    terminal.term.write('$ ');
  }
  
  navigateHistory(sessionId, direction) {
    const terminal = this.terminals[sessionId];
    const history = terminal.commandHistory;
    
    if (history.length === 0) return;
    
    // Save current line if we're just starting to navigate
    if (terminal.historyIndex === -1) {
      terminal.lastCommand = terminal.lineBuffer;
    }
    
    // Calculate new index
    if (direction === 'up') {
      terminal.historyIndex = Math.min(terminal.historyIndex + 1, history.length - 1);
    } else {
      terminal.historyIndex = Math.max(terminal.historyIndex - 1, -1);
    }
    
    // Clear current line
    terminal.term.write('\r' + ' '.repeat(terminal.lineBuffer.length + 2));
    
    // Get command from history or restore last command
    let newCommand = '';
    if (terminal.historyIndex === -1) {
      newCommand = terminal.lastCommand;
    } else {
      newCommand = history[terminal.historyIndex];
    }
    
    // Update line buffer and display
    terminal.lineBuffer = newCommand;
    terminal.term.write('\r$ ' + newCommand);
  }
  
  async closeTerminal(sessionId) {
    try {
      // Call the API to terminate the session
      const response = await fetch(`/api/session/${sessionId}`, {
        method: 'DELETE',
        headers: auth.getAuthHeaders()
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to close session');
      }
      
      // Remove terminal from DOM and memory
      if (this.terminals[sessionId]) {
        this.terminals[sessionId].term.dispose();
        this.terminals[sessionId].div.remove();
        delete this.terminals[sessionId];
      }
      
      // If this was the active terminal, show welcome screen
      if (this.activeSessionId === sessionId) {
        this.showWelcomeScreen();
      }
      
      // Notify session manager
      document.dispatchEvent(new CustomEvent('terminal:closed', {
        detail: { sessionId }
      }));
      
    } catch (error) {
      console.error('Error closing terminal:', error);
      alert(`Error closing terminal: ${error.message}`);
    }
  }
  
  showWelcomeScreen() {
    // Hide all terminals
    Object.values(this.terminals).forEach(terminal => {
      terminal.div.style.display = 'none';
    });
    
    // Show welcome screen
    this.terminalWelcome.style.display = 'flex';
    
    // Reset header
    this.currentSessionIdEl.textContent = 'No Active Session';
    this.sessionStatusEl.textContent = '';
    this.sessionStatusEl.className = 'session-status';
    
    // Reset active terminal
    this.activeTerminal = null;
    this.activeSessionId = null;
  }
  
  toggleFullscreen() {
    const terminalEl = this.activeTerminal?.div;
    
    if (!terminalEl) return;
    
    if (this.isFullscreen) {
      // Exit fullscreen
      terminalEl.classList.remove('fullscreen-terminal');
      this.fullscreenButton.innerHTML = '<i class="fas fa-expand"></i>';
    } else {
      // Enter fullscreen
      terminalEl.classList.add('fullscreen-terminal');
      this.fullscreenButton.innerHTML = '<i class="fas fa-compress"></i>';
    }
    
    this.isFullscreen = !this.isFullscreen;
    
    // Re-fit terminal
    if (this.activeTerminal) {
      setTimeout(() => {
        this.activeTerminal.fitAddon.fit();
      }, 50);
    }
  }
  
  getThemeColors() {
    switch (this.settings.theme) {
      case 'light':
        return {
          background: '#ffffff',
          foreground: '#333333',
          cursor: '#333333',
          selection: '#d0d0d0',
          black: '#2e3436',
          brightBlack: '#555753',
          red: '#cc0000',
          brightRed: '#ef2929',
          green: '#4e9a06',
          brightGreen: '#8ae234',
          yellow: '#c4a000',
          brightYellow: '#fce94f',
          blue: '#3465a4',
          brightBlue: '#729fcf',
          magenta: '#75507b',
          brightMagenta: '#ad7fa8',
          cyan: '#06989a',
          brightCyan: '#34e2e2',
          white: '#d3d7cf',
          brightWhite: '#eeeeec'
        };
      
      case 'dracula':
        return {
          background: '#282a36',
          foreground: '#f8f8f2',
          cursor: '#bd93f9',
          selection: '#44475a',
          black: '#21222c',
          brightBlack: '#6272a4',
          red: '#ff5555',
          brightRed: '#ff6e6e',
          green: '#50fa7b',
          brightGreen: '#69ff94',
          yellow: '#f1fa8c',
          brightYellow: '#ffffa5',
          blue: '#bd93f9',
          brightBlue: '#d6acff',
          magenta: '#ff79c6',
          brightMagenta: '#ff92df',
          cyan: '#8be9fd',
          brightCyan: '#a4ffff',
          white: '#f8f8f2',
          brightWhite: '#ffffff'
        };
        
      case 'monokai':
        return {
          background: '#272822',
          foreground: '#f8f8f2',
          cursor: '#f8f8f2',
          selection: '#49483e',
          black: '#272822',
          brightBlack: '#75715e',
          red: '#f92672',
          brightRed: '#f92672',
          green: '#a6e22e',
          brightGreen: '#a6e22e',
          yellow: '#f4bf75',
          brightYellow: '#f4bf75',
          blue: '#66d9ef',
          brightBlue: '#66d9ef',
          magenta: '#ae81ff',
          brightMagenta: '#ae81ff',
          cyan: '#a1efe4',
          brightCyan: '#a1efe4',
          white: '#f8f8f2',
          brightWhite: '#f9f8f5'
        };
        
      default: // dark
        return {
          background: '#1e1e2e',
          foreground: '#cdd6f4',
          cursor: '#89b4fa',
          selection: '#313244',
          black: '#181825',
          brightBlack: '#585b70',
          red: '#f38ba8',
          brightRed: '#f38ba8',
          green: '#a6e3a1',
          brightGreen: '#a6e3a1',
          yellow: '#f9e2af',
          brightYellow: '#f9e2af',
          blue: '#89b4fa',
          brightBlue: '#89b4fa',
          magenta: '#cba6f7',
          brightMagenta: '#cba6f7',
          cyan: '#89dceb',
          brightCyan: '#89dceb',
          white: '#bac2de',
          brightWhite: '#cdd6f4'
        };
    }
  }
  
  applySettings() {
    // Update settings from localStorage
    this.settings.fontSize = parseInt(localStorage.getItem('terminal_fontSize') || '14');
    this.settings.theme = localStorage.getItem('terminal_theme') || 'dark';
    this.settings.cursorBlink = localStorage.getItem('terminal_cursorBlink') !== 'false';
    this.settings.bellSound = localStorage.getItem('terminal_bellSound') !== 'false';
    
    // Apply to each terminal
    Object.values(this.terminals).forEach(terminal => {
      terminal.term.options.fontSize = this.settings.fontSize;
      terminal.term.options.cursorBlink = this.settings.cursorBlink;
      terminal.term.options.bellStyle = this.settings.bellSound ? 'sound' : 'none';
      terminal.term.options.theme = this.getThemeColors();
      
      // Apply changes
      terminal.fitAddon.fit();
    });
  }
}

// Initialize terminal manager
const terminalManager = new TerminalManager();
