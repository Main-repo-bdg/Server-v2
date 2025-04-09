/**
 * Docker API routes for the Terminal Server
 * This file provides API endpoints for Docker image management
 */

const express = require('express');
const router = express.Router();
const dockerAuth = require('./docker-auth');
const fs = require('fs');
const path = require('path');

// Authentication middleware (reused from server.js)
const validateWebSession = (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token || !req.app.locals.webSessions[token]) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const session = req.app.locals.webSessions[token];
  
  // Check session expiry (24 hours)
  if (Date.now() - session.created > 24 * 60 * 60 * 1000) {
    delete req.app.locals.webSessions[token];
    return res.status(401).json({ error: 'Session expired' });
  }
  
  // Update last accessed time
  session.lastAccessed = Date.now();
  req.webSession = session;
  
  next();
};

// Admin authorization middleware
const requireAdmin = (req, res, next) => {
  if (!req.webSession || !req.webSession.isAdmin) {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  next();
};

// Image management - list available images
router.get('/images', validateWebSession, async (req, res) => {
  try {
    const images = await dockerAuth.listDockerImages();
    
    // Get default image from environment
    const defaultImage = process.env.USER_CONTAINER_IMAGE || dockerAuth.DEFAULT_IMAGE;
    
    // Add isDefault flag for UI
    const formattedImages = images.map(image => {
      return {
        ...image,
        isDefault: image.tags.includes(defaultImage)
      };
    });
    
    res.json(formattedImages);
  } catch (error) {
    console.error('Error listing Docker images:', error);
    res.status(500).json({ error: 'Failed to list Docker images: ' + error.message });
  }
});

// Pull a Docker image (admin only)
router.post('/pull', validateWebSession, requireAdmin, async (req, res) => {
  const { image } = req.body;
  
  if (!image) {
    return res.status(400).json({ error: 'Image name is required' });
  }
  
  try {
    // Authenticate with Docker Hub
    const authenticated = await dockerAuth.authenticateWithDockerHub();
    if (!authenticated) {
      return res.status(500).json({ error: 'Failed to authenticate with Docker Hub' });
    }
    
    // Pull the image
    const success = await dockerAuth.pullDockerImage(image);
    if (!success) {
      return res.status(500).json({ error: 'Failed to pull image' });
    }
    
    // Log the pull
    const logEntry = {
      timestamp: new Date().toISOString(),
      user: req.webSession.username,
      action: 'pull',
      image: image
    };
    
    fs.appendFileSync(
      path.join(__dirname, 'logs', 'docker.log'),
      JSON.stringify(logEntry) + '\n'
    );
    
    res.json({ message: 'Image pulled successfully' });
  } catch (error) {
    console.error('Error pulling Docker image:', error);
    res.status(500).json({ error: 'Failed to pull Docker image: ' + error.message });
  }
});

// Get Docker image details
router.get('/images/:id', validateWebSession, requireAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get Docker instance from app locals
    const docker = req.app.locals.docker;
    if (!docker) {
      return res.status(500).json({ error: 'Docker client not available' });
    }
    
    // Get the image
    const image = docker.getImage(id);
    const info = await image.inspect();
    
    res.json(info);
  } catch (error) {
    console.error('Error getting Docker image details:', error);
    res.status(500).json({ error: 'Failed to get Docker image details: ' + error.message });
  }
});

// Set default image (admin only)
router.post('/default-image', validateWebSession, requireAdmin, async (req, res) => {
  const { image } = req.body;
  
  if (!image) {
    return res.status(400).json({ error: 'Image name is required' });
  }
  
  try {
    // Check if image exists
    const exists = await dockerAuth.imageExists(image);
    if (!exists) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Set as default (in this case, just update the environment variable)
    // In a real implementation, you'd update a database or config file
    process.env.USER_CONTAINER_IMAGE = image;
    
    // Log the change
    const logEntry = {
      timestamp: new Date().toISOString(),
      user: req.webSession.username,
      action: 'set_default',
      image: image
    };
    
    fs.appendFileSync(
      path.join(__dirname, 'logs', 'docker.log'),
      JSON.stringify(logEntry) + '\n'
    );
    
    res.json({ message: 'Default image updated successfully' });
  } catch (error) {
    console.error('Error setting default Docker image:', error);
    res.status(500).json({ error: 'Failed to set default image: ' + error.message });
  }
});

// Get Docker stats
router.get('/stats', validateWebSession, requireAdmin, async (req, res) => {
  try {
    // Get Docker instance from app locals
    const docker = req.app.locals.docker;
    if (!docker) {
      return res.status(500).json({ error: 'Docker client not available' });
    }
    
    // Get Docker info
    let dockerInfo = { dockerRunning: false };
    try {
      dockerInfo = await docker.info();
      dockerInfo.dockerRunning = true;
    } catch (error) {
      console.error('Error getting Docker info:', error);
    }
    
    // Get images
    const images = await dockerAuth.listDockerImages();
    
    // Get containers
    let containers = [];
    try {
      containers = await docker.listContainers();
    } catch (error) {
      console.error('Error listing containers:', error);
    }
    
    // Get default image (hardcoded as requested)
    const defaultImage = 'bdgtest/terminal:latest';
    
    // Compile stats
    const stats = {
      defaultImage,
      totalImages: images.length,
      activeContainers: containers.length,
      dockerRunning: dockerInfo.dockerRunning,
      containersTotal: dockerInfo.Containers || 0,
      containersRunning: dockerInfo.ContainersRunning || 0
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting Docker stats:', error);
    res.status(500).json({ error: 'Failed to get Docker stats: ' + error.message });
  }
});

// Remove Docker image (admin only)
router.delete('/images/:id', validateWebSession, requireAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get Docker instance from app locals
    const docker = req.app.locals.docker;
    if (!docker) {
      return res.status(500).json({ error: 'Docker client not available' });
    }
    
    // Get the image
    const image = docker.getImage(id);
    
    // Check if the image is the default image (hardcoded as requested)
    const defaultImage = 'bdgtest/terminal:latest';
    const info = await image.inspect();
    
    if (info.RepoTags && info.RepoTags.includes(defaultImage)) {
      return res.status(400).json({
        error: 'Cannot remove the default image. Set a different default image first.'
      });
    }
    
    // Remove the image
    await image.remove();
    
    // Log the removal
    const logEntry = {
      timestamp: new Date().toISOString(),
      user: req.webSession.username,
      action: 'remove',
      image: id
    };
    
    fs.appendFileSync(
      path.join(__dirname, 'logs', 'docker.log'),
      JSON.stringify(logEntry) + '\n'
    );
    
    res.json({ message: 'Image removed successfully' });
  } catch (error) {
    console.error('Error removing Docker image:', error);
    
    // Handle image in use error
    if (error.statusCode === 409) {
      return res.status(409).json({
        error: 'Cannot remove image because it is in use by running containers'
      });
    }
    
    res.status(500).json({ error: 'Failed to remove Docker image: ' + error.message });
  }
});

module.exports = router;
