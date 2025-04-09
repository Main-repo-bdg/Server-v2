const express = require('express');
const { exec, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const Docker = require('dockerode');
const morgan = require('morgan');
const helmet = require('helmet');

const app = express();
const port = process.env.PORT || 3000;

// Docker connection with better error handling
let docker;
try {
  // Try to connect to Docker socket
  docker = new Docker();
  console.log('Successfully connected to Docker socket');
} catch (error) {
  console.error('Failed to connect to Docker socket:', error.message);
  console.log('Initializing with mock Docker for testing/development');
  // Create a mock Docker interface for environments without Docker socket
  docker = {
    createContainer: async () => {
      const containerId = `mock-container-${uuidv4()}`;
      console.log(`Mock container created with ID: ${containerId}`);
      return {
        id: containerId,
        start: async () => console.log(`Mock container ${containerId} started`),
        exec: async () => {
          return {
            start: () => {
              const eventEmitter = new (require('events').EventEmitter)();
              setTimeout(() => {
                eventEmitter.emit('data', Buffer.from('Mock command execution output\n'));
                eventEmitter.emit('end');
              }, 100);
              return eventEmitter;
            },
            inspect: async () => ({ ExitCode: 0 })
          };
        },
        stop: async () => console.log(`Mock container ${containerId} stopped`),
        remove: async () => console.log(`Mock container ${containerId} removed`)
      };
    },
    getContainer: (id) => {
      return {
        id,
        exec: async () => {
          return {
            start: () => {
              const eventEmitter = new (require('events').EventEmitter)();
              setTimeout(() => {
                eventEmitter.emit('data', Buffer.from('Mock command execution output\n'));
                eventEmitter.emit('end');
              }, 100);
              return eventEmitter;
            },
            inspect: async () => ({ ExitCode: 0 })
          };
        },
        stop: async () => console.log(`Mock container ${id} stopped`),
        remove: async () => console.log(`Mock container ${id} removed`)
      };
    }
  };
}

// Security configuration
const API_KEY = process.env.API_KEY || 'change-this-in-production';
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT || '3600000'); // 1 hour by default
const MAX_CONTAINERS = parseInt(process.env.MAX_CONTAINERS || '100');
const CONTAINER_MEMORY = process.env.CONTAINER_MEMORY || '256m';
const CONTAINER_CPU = process.env.CONTAINER_CPU || '0.5';
const USER_CONTAINER_IMAGE = process.env.USER_CONTAINER_IMAGE || 'terminal-user-image:latest';

// User storage (for web UI authentication)
const users = {
  // Default admin user (should be changed in production)
  admin: {
    username: 'admin',
    // Hashed password 'admin123'
    passwordHash: 'f865b53623b121fd34ee5426c792e5c33af8c227',
    isAdmin: true
  }
};

// Session storage
const sessions = {};
const webSessions = {}; // For web UI sessions
let containerCount = 0;

// Create logs directory
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// Create public directory if it doesn't exist
if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
  fs.mkdirSync('public/css');
  fs.mkdirSync('public/js');
  fs.mkdirSync('public/img');
}

// Setup secure HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  }
}));

// Serve static files from the public directory
app.use(express.static('public'));

// Setup request logging
const accessLogStream = fs.createWriteStream(path.join(__dirname, 'logs', 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));

// Add security logging
const securityLogger = (req, res, next) => {
  // Skip logging for static files
  if (req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path.startsWith('/img/')) {
    return next();
  }
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    method: req.method,
    path: req.path,
    headers: req.headers
  };
  
  // Don't log passwords
  if (req.path !== '/api/login' && req.path !== '/api/register') {
    logEntry.body = req.body;
  }
  
  fs.appendFileSync(
    path.join(__dirname, 'logs', 'security.log'), 
    JSON.stringify(logEntry) + '\n'
  );
  
  next();
};

app.use(securityLogger);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later' }
});

app.use('/api/', limiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper function to hash passwords
const hashPassword = (password) => {
  return crypto.createHash('sha1').update(password).digest('hex');
};

// Web UI authentication
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  // Check if user exists and password is correct
  const user = users[username];
  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  
  // Create a web session
  const sessionToken = uuidv4();
  webSessions[sessionToken] = {
    username,
    isAdmin: user.isAdmin,
    created: Date.now(),
    lastAccessed: Date.now()
  };
  
  // Return session token
  res.json({
    token: sessionToken,
    username,
    isAdmin: user.isAdmin
  });
});

// Register a new user (for web UI)
app.post('/api/register', (req, res) => {
  const { username, password, adminKey } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  // Check if username already exists
  if (users[username]) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  
  // Determine if user should be admin
  const isAdmin = adminKey === API_KEY;
  
  // Create new user
  users[username] = {
    username,
    passwordHash: hashPassword(password),
    isAdmin
  };
  
  res.status(201).json({ 
    message: 'User registered successfully',
    isAdmin
  });
});

// Check web session validity
const validateWebSession = (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token || !webSessions[token]) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const session = webSessions[token];
  
  // Check session expiry (24 hours)
  if (Date.now() - session.created > 24 * 60 * 60 * 1000) {
    delete webSessions[token];
    return res.status(401).json({ error: 'Session expired' });
  }
  
  // Update last accessed time
  session.lastAccessed = Date.now();
  req.webSession = session;
  
  next();
};

// List all terminal sessions for web UI
app.get('/api/sessions', validateWebSession, (req, res) => {
  let sessionList;
  
  if (req.webSession.isAdmin) {
    // Admins see all sessions with detailed information
    sessionList = Object.entries(sessions).map(([id, session]) => ({
      id,
      userId: session.userId,
      webUser: session.webUser || 'API User',
      created: new Date(session.created).toISOString(),
      lastAccessed: new Date(session.lastAccessed).toISOString(),
      expiresIn: SESSION_TIMEOUT - (Date.now() - session.lastAccessed),
      clientIp: session.clientIp,
      containerId: session.containerId,
      isActive: true,
      idleTime: Math.floor((Date.now() - session.lastAccessed) / 1000) // Idle time in seconds
    }));
  } else {
    // Regular users only see their own sessions
    sessionList = Object.entries(sessions)
      .filter(([_, session]) => session.webUser === req.webSession.username)
      .map(([id, session]) => ({
        id,
        userId: session.userId,
        created: new Date(session.created).toISOString(),
        lastAccessed: new Date(session.lastAccessed).toISOString(),
        expiresIn: SESSION_TIMEOUT - (Date.now() - session.lastAccessed)
      }));
  }
  
  res.json(sessionList);
});

// Authentication middleware for API
const authenticate = (req, res, next) => {
  const providedApiKey = req.headers['x-api-key'];
  
  if (!providedApiKey) {
    return res.status(401).json({ error: 'API key is required' });
  }
  
  // Constant-time comparison to prevent timing attacks
  try {
    if (!crypto.timingSafeEqual(
      Buffer.from(providedApiKey, 'utf8'), 
      Buffer.from(API_KEY, 'utf8')
    )) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
  } catch (error) {
    return res.status(401).json({ error: 'Invalid API key format' });
  }
  
  next();
};

// Session validation middleware
const validateSession = (req, res, next) => {
  const sessionId = req.headers['x-session-id'];
  
  if (!sessionId || !sessions[sessionId]) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  
  const session = sessions[sessionId];
  
  // Check if session has expired
  if (Date.now() - session.lastAccessed > SESSION_TIMEOUT) {
    // Cleanup container
    cleanupSession(sessionId);
    return res.status(401).json({ error: 'Session expired' });
  }
  
  // Update last accessed time
  session.lastAccessed = Date.now();
  req.session = session;
  
  next();
};

// Session cleanup function
const cleanupSession = async (sessionId) => {
  const session = sessions[sessionId];
  if (!session) return;
  
  try {
    // Remove Docker container
    const container = docker.getContainer(session.containerId);
    await container.stop();
    await container.remove();
    containerCount--;
    
    console.log(`Cleaned up container for session ${sessionId}`);
    
    // Remove session
    delete sessions[sessionId];
  } catch (error) {
    console.error(`Error cleaning up session ${sessionId}:`, error);
  }
};

// Periodic cleanup of expired sessions
setInterval(() => {
  const now = Date.now();
  
  // Clean up terminal sessions
  Object.keys(sessions).forEach(sessionId => {
    const session = sessions[sessionId];
    if (now - session.lastAccessed > SESSION_TIMEOUT) {
      cleanupSession(sessionId);
    }
  });
  
  // Clean up web sessions (24 hour expiry)
  Object.keys(webSessions).forEach(token => {
    const session = webSessions[token];
    if (now - session.created > 24 * 60 * 60 * 1000) {
      delete webSessions[token];
    }
  });
}, 60000); // Check every minute

// Create new session (and Docker container)
app.post('/api/create-session', validateWebSession, async (req, res) => {
  try {
    // Check container limits
    if (containerCount >= MAX_CONTAINERS) {
      return res.status(503).json({ 
        error: 'Maximum number of active sessions reached. Please try again later.' 
      });
    }
    
    // Generate unique IDs
    const sessionId = uuidv4();
    const userId = req.webSession.username || uuidv4();
    const clientIp = req.ip || '0.0.0.0';
    
    // Add custom session name if provided
    const sessionName = req.body.sessionName || `Session-${sessionId.substring(0, 8)}`;
    
    try {
      // Create Docker container with error handling
      const container = await docker.createContainer({
        Image: USER_CONTAINER_IMAGE,
        Cmd: ['/bin/bash'],
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        HostConfig: {
          Memory: CONTAINER_MEMORY,
          CpuShares: Math.floor(parseFloat(CONTAINER_CPU) * 1024),
          NetworkMode: 'bridge',
          AutoRemove: true,
          SecurityOpt: ['no-new-privileges'],
          CapDrop: ['ALL'], // Drop all capabilities for security
          ReadonlyRootfs: false, // Allow package installation
        },
        Labels: {
          'app': 'terminal-server',
          'userId': userId,
          'sessionId': sessionId,
          'clientIp': clientIp,
          'webUser': req.webSession.username,
          'sessionName': sessionName
        }
      });
      
      await container.start();
      containerCount++;
      
      // Store session information
      sessions[sessionId] = {
        userId,
        clientIp,
        containerId: container.id,
        created: Date.now(),
        lastAccessed: Date.now(),
        webUser: req.webSession.username,
        sessionName: sessionName,
        commandCount: 0, // Track number of commands executed
        logs: [] // Store recent command logs
      };
      
      console.log(`Created new container for web user ${userId} from IP ${clientIp}`);
      
      // Return session information to client
      res.json({
        sessionId,
        userId,
        sessionName,
        message: 'Session created successfully',
        expiresIn: SESSION_TIMEOUT,
      });
    } catch (dockerError) {
      console.error('Docker container creation error:', dockerError);
      
      // Handle Docker socket error gracefully
      if (dockerError.message.includes('connect ENOENT /var/run/docker.sock')) {
        // Create a mock session when Docker is unavailable
        const mockContainerId = `mock-container-${uuidv4()}`;
        
        // Store mock session information
        sessions[sessionId] = {
          userId,
          clientIp,
          containerId: mockContainerId,
          created: Date.now(),
          lastAccessed: Date.now(),
          webUser: req.webSession.username,
          sessionName: sessionName,
          isMock: true,
          commandCount: 0,
          logs: []
        };
        
        containerCount++;
        
        console.log(`Created mock session for web user ${userId} (Docker unavailable)`);
        
        // Return session information to client
        res.json({
          sessionId,
          userId,
          sessionName,
          message: 'Session created in mock mode (Docker unavailable)',
          expiresIn: SESSION_TIMEOUT,
          isMock: true
        });
      } else {
        // Re-throw other errors
        throw dockerError;
      }
    }
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session: ' + error.message });
  }
});

// Create new session (and Docker container) - original API
app.post('/create-session', authenticate, async (req, res) => {
  try {
    // Check container limits
    if (containerCount >= MAX_CONTAINERS) {
      return res.status(503).json({ 
        error: 'Maximum number of active sessions reached. Please try again later.' 
      });
    }
    
    // Generate unique IDs
    const sessionId = uuidv4();
    const userId = req.body.userId || uuidv4();
    const clientIp = req.ip || '0.0.0.0';
    
    // Create Docker container
    const container = await docker.createContainer({
      Image: USER_CONTAINER_IMAGE,
      Cmd: ['/bin/bash'],
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        Memory: CONTAINER_MEMORY,
        CpuShares: Math.floor(parseFloat(CONTAINER_CPU) * 1024),
        NetworkMode: 'bridge',
        AutoRemove: true,
        SecurityOpt: ['no-new-privileges'],
        CapDrop: ['ALL'], // Drop all capabilities for security
        ReadonlyRootfs: false, // Allow package installation
      },
      Labels: {
        'app': 'terminal-server',
        'userId': userId,
        'sessionId': sessionId,
        'clientIp': clientIp
      }
    });
    
    await container.start();
    containerCount++;
    
    // Store session information
    sessions[sessionId] = {
      userId,
      clientIp,
      containerId: container.id,
      created: Date.now(),
      lastAccessed: Date.now()
    };
    
    console.log(`Created new container for user ${userId} from IP ${clientIp}`);
    
    // Return session information to client
    res.json({
      sessionId,
      userId,
      message: 'Session created successfully',
      expiresIn: SESSION_TIMEOUT,
    });
    
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session: ' + error.message });
  }
});

// Execute command in user's container (Web UI version)
app.post('/api/execute-command', validateWebSession, async (req, res) => {
  const { command, sessionId } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }
  
  if (!sessionId || !sessions[sessionId]) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  
  const session = sessions[sessionId];
  
  // Check if session has expired
  if (Date.now() - session.lastAccessed > SESSION_TIMEOUT) {
    // Cleanup container
    cleanupSession(sessionId);
    return res.status(401).json({ error: 'Session expired' });
  }
  
  // Security check - only allow session owner or admin to execute commands
  if (session.webUser !== req.webSession.username && !req.webSession.isAdmin) {
    return res.status(403).json({ error: 'You can only execute commands in your own sessions' });
  }
  
  // Update last accessed time
  session.lastAccessed = Date.now();
  
  // Increment command count for metrics
  session.commandCount = (session.commandCount || 0) + 1;
  
  // Create command log entry
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId: session.userId,
    sessionId: sessionId,
    clientIp: session.clientIp,
    command: command,
    webUser: req.webSession.username
  };
  
  try {
    // Log command for audit
    fs.appendFileSync(
      path.join(__dirname, 'logs', 'commands.log'), 
      JSON.stringify(logEntry) + '\n'
    );
    
    // Store recent command in session history (keep last 10)
    if (!session.logs) session.logs = [];
    session.logs.unshift(logEntry);
    if (session.logs.length > 10) session.logs.pop();
    
    // Handle mock sessions differently (when Docker is unavailable)
    if (session.isMock) {
      // Simulate command execution for mock sessions
      setTimeout(() => {
        const mockOutput = `Executing in mock environment: ${command}\n` +
          `Mock output for demonstration purposes\n` +
          `Current time: ${new Date().toISOString()}\n` +
          `Session ID: ${sessionId}\n` +
          `User: ${session.userId}\n`;
        
        // Add command and response to log
        logEntry.output = mockOutput;
        logEntry.exitCode = 0;
        
        res.json({ 
          output: mockOutput, 
          exitCode: 0,
          isMock: true
        });
      }, 200); // Add small delay to simulate processing
      
      return;
    }
    
    // For real Docker sessions, execute command in container
    const container = docker.getContainer(session.containerId);
    
    // Execute command in container
    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true
    });
    
    const stream = await exec.start();
    
    // Collect output
    let output = '';
    
    // Handle the stream data
    stream.on('data', (chunk) => {
      output += chunk.toString('utf8');
    });
    
    // Handle stream errors
    stream.on('error', (err) => {
      logEntry.error = err.message;
      res.status(500).json({ error: err.message });
    });
    
    // Wait for command to complete
    stream.on('end', async () => {
      try {
        // Get exit code
        const inspect = await exec.inspect();
        const exitCode = inspect.ExitCode;
        
        // Add results to log entry
        logEntry.output = output;
        logEntry.exitCode = exitCode;
        
        if (exitCode !== 0) {
          return res.json({ 
            output: output,
            exitCode,
            error: true
          });
        }
        
        res.json({ output, exitCode: 0 });
      } catch (inspectError) {
        logEntry.error = 'Failed to get command status';
        res.status(500).json({ error: 'Failed to get command status' });
      }
    });
    
  } catch (error) {
    console.error('Error executing command:', error);
    logEntry.error = error.message;
    
    // If Docker socket error, handle gracefully
    if (error.message && error.message.includes('connect ENOENT /var/run/docker.sock')) {
      // Switch session to mock mode if Docker becomes unavailable
      session.isMock = true;
      
      // Return mock response
      const mockOutput = `Switched to mock mode (Docker unavailable).\n` +
                         `Mock output for: ${command}\n`;
      res.json({ 
        output: mockOutput, 
        exitCode: 0,
        isMock: true,
        switched: true
      });
    } else {
      res.status(500).json({ error: 'Failed to execute command: ' + error.message });
    }
  }
});

// Execute command in user's container - original API
app.post('/execute-command', authenticate, validateSession, async (req, res) => {
  const { command } = req.body;
  const session = req.session;
  
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }
  
  try {
    // Get container
    const container = docker.getContainer(session.containerId);
    
    // Log command for audit
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: session.userId,
      sessionId: req.headers['x-session-id'],
      clientIp: session.clientIp,
      command: command
    };
    
    fs.appendFileSync(
      path.join(__dirname, 'logs', 'commands.log'), 
      JSON.stringify(logEntry) + '\n'
    );
    
    // Execute command in container
    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true
    });
    
    const stream = await exec.start();
    
    // Collect output
    let output = '';
    
    // Handle the stream data
    stream.on('data', (chunk) => {
      output += chunk.toString('utf8');
    });
    
    // Handle stream errors
    stream.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
    
    // Wait for command to complete
    stream.on('end', async () => {
      try {
        // Get exit code
        const inspect = await exec.inspect();
        const exitCode = inspect.ExitCode;
        
        if (exitCode !== 0) {
          return res.status(400).json({ 
            error: output || 'Command failed', 
            exitCode 
          });
        }
        
        res.json({ output });
      } catch (inspectError) {
        res.status(500).json({ error: 'Failed to get command status' });
      }
    });
    
  } catch (error) {
    console.error('Error executing command:', error);
    res.status(500).json({ error: 'Failed to execute command: ' + error.message });
  }
});

// Get specific session details - Web UI
app.get('/api/session/:id', validateWebSession, (req, res) => {
  const sessionId = req.params.id;
  const session = sessions[sessionId];
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Security check - only allow session owner or admin to view details
  if (session.webUser !== req.webSession.username && !req.webSession.isAdmin) {
    return res.status(403).json({ error: 'You can only view your own sessions' });
  }
  
  res.json({
    id: sessionId,
    userId: session.userId,
    created: new Date(session.created).toISOString(),
    lastAccessed: new Date(session.lastAccessed).toISOString(),
    expiresIn: SESSION_TIMEOUT - (Date.now() - session.lastAccessed)
  });
});

// Fallback for compatibility with original API
app.post('/execute-command-legacy', authenticate, async (req, res) => {
  const { command } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }
  
  // Extract device ID from request if available
  const deviceId = req.headers['x-device-id'] || req.ip || uuidv4();
  
  // Find existing session for this device or create new one
  let sessionId = null;
  for (const [id, session] of Object.entries(sessions)) {
    if (session.userId === deviceId) {
      sessionId = id;
      break;
    }
  }
  
  // If no session exists, create one
  if (!sessionId) {
    try {
      // Call create-session endpoint
      req.body.userId = deviceId;
      
      // Check container limits
      if (containerCount >= MAX_CONTAINERS) {
        return res.status(503).json({ 
          error: 'Maximum number of active sessions reached. Please try again later.' 
        });
      }
      
      // Generate unique IDs
      sessionId = uuidv4();
      const userId = deviceId;
      const clientIp = req.ip || '0.0.0.0';
      
      // Create Docker container
      const container = await docker.createContainer({
        Image: USER_CONTAINER_IMAGE,
        Cmd: ['/bin/bash'],
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        HostConfig: {
          Memory: CONTAINER_MEMORY,
          CpuShares: Math.floor(parseFloat(CONTAINER_CPU) * 1024),
          NetworkMode: 'bridge',
          AutoRemove: true,
          SecurityOpt: ['no-new-privileges'],
          CapDrop: ['ALL'],
          ReadonlyRootfs: false,
        },
        Labels: {
          'app': 'terminal-server',
          'userId': userId,
          'sessionId': sessionId,
          'clientIp': clientIp
        }
      });
      
      await container.start();
      containerCount++;
      
      // Store session information
      sessions[sessionId] = {
        userId,
        clientIp,
        containerId: container.id,
        created: Date.now(),
        lastAccessed: Date.now()
      };
      
      console.log(`Created new container for legacy device ${userId} from IP ${clientIp}`);
    } catch (error) {
      console.error('Error creating legacy session:', error);
      return res.status(500).json({ error: 'Failed to create session' });
    }
  }
  
  // Now execute the command using the session
  try {
    const session = sessions[sessionId];
    session.lastAccessed = Date.now();
    
    // Get container
    const container = docker.getContainer(session.containerId);
    
    // Log command for audit
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: session.userId,
      sessionId: sessionId,
      clientIp: session.clientIp,
      command: command,
      isLegacy: true
    };
    
    fs.appendFileSync(
      path.join(__dirname, 'logs', 'commands.log'), 
      JSON.stringify(logEntry) + '\n'
    );
    
    // Execute command in container
    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true
    });
    
    const stream = await exec.start();
    
    // Collect output
    let output = '';
    
    // Handle the stream data
    stream.on('data', (chunk) => {
      output += chunk.toString('utf8');
    });
    
    // Handle stream errors
    stream.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
    
    // Wait for command to complete
    stream.on('end', async () => {
      try {
        // Get exit code
        const inspect = await exec.inspect();
        const exitCode = inspect.ExitCode;
        
        if (exitCode !== 0) {
          return res.status(400).json({ 
            error: output || 'Command failed', 
            exitCode 
          });
        }
        
        res.json({ output });
      } catch (inspectError) {
        res.status(500).json({ error: 'Failed to get command status' });
      }
    });
  } catch (error) {
    console.error('Error executing legacy command:', error);
    res.status(500).json({ error: 'Failed to execute command: ' + error.message });
  }
});

// Get session information - original API
app.get('/session', authenticate, validateSession, (req, res) => {
  const session = req.session;
  
  res.json({
    userId: session.userId,
    created: new Date(session.created).toISOString(),
    lastAccessed: new Date(session.lastAccessed).toISOString(),
    expiresIn: SESSION_TIMEOUT - (Date.now() - session.lastAccessed)
  });
});

// End session (cleanup container) - Web UI
app.delete('/api/session/:id', validateWebSession, async (req, res) => {
  const sessionId = req.params.id;
  const session = sessions[sessionId];
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Security check - only allow session owner or admin to delete
  if (session.webUser !== req.webSession.username && !req.webSession.isAdmin) {
    return res.status(403).json({ error: 'You can only terminate your own sessions' });
  }
  
  try {
    await cleanupSession(sessionId);
    res.json({ message: 'Session terminated successfully' });
  } catch (error) {
    console.error('Error terminating session:', error);
    res.status(500).json({ error: 'Failed to terminate session' });
  }
});

// End session (cleanup container) - original API
app.delete('/session', authenticate, validateSession, async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  
  try {
    await cleanupSession(sessionId);
    res.json({ message: 'Session terminated successfully' });
  } catch (error) {
    console.error('Error terminating session:', error);
    res.status(500).json({ error: 'Failed to terminate session' });
  }
});

// Logout from web UI
app.post('/api/logout', validateWebSession, (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  if (token && webSessions[token]) {
    delete webSessions[token];
  }
  
  res.json({ message: 'Logged out successfully' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    activeSessions: Object.keys(sessions).length,
    containerCount,
    maxContainers: MAX_CONTAINERS
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down server...');
  
  // Cleanup all containers
  for (const sessionId of Object.keys(sessions)) {
    await cleanupSession(sessionId);
  }
  
  process.exit(0);
});

// Serve the main index.html for all routes that don't match API or static files
// This supports client-side routing
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/') || 
      req.path === '/create-session' || 
      req.path === '/execute-command' ||
      req.path === '/session' ||
      req.path === '/execute-command-legacy' ||
      req.path === '/health') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Terminal server running on port ${port}`);
});