/**
 * Docker API routes for the Terminal Server
 * This file provides API endpoints for Docker image management
 */

const express = require('express');
const router = express.Router();
const dockerAuth = require('./docker-auth');
const startupDocker = require('./startup-docker');
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
    
    // Get default image from startup-docker module
    const defaultImage = startupDocker.DEFAULT_IMAGE;
    
    // Add isDefault flag for UI
    const formattedImages = images.map(image => {
      return {
        ...image,
        isDefault: image.tags && Array.isArray(image.tags) 
          ? image.tags.includes(defaultImage) 
          : image.tags === defaultImage
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

// Auto-Docker routes for automated image management

// Get Docker auto-initialization status
router.get('/auto-status', validateWebSession, requireAdmin, async (req, res) => {
  try {
    // Check if default image exists
    const defaultImageExists = await dockerAuth.imageExists(startupDocker.DEFAULT_IMAGE);
    
    // Get all images
    const images = await dockerAuth.listDockerImages();
    
    // Get available tags
    const availableTags = images.reduce((tags, image) => {
      if (image.tags && Array.isArray(image.tags)) {
        return [...tags, ...image.tags.filter(tag => tag.startsWith('bdgtest/terminal:'))];
      } else if (typeof image.tags === 'string' && image.tags.startsWith('bdgtest/terminal:')) {
        return [...tags, image.tags];
      }
      return tags;
    }, []);
    
    // Format images for the UI
    const formattedImages = images
      .filter(image => {
        // Filter to only include images from our repository
        if (Array.isArray(image.tags)) {
          return image.tags.some(tag => tag.startsWith('bdgtest/terminal:'));
        } else if (typeof image.tags === 'string') {
          return image.tags.startsWith('bdgtest/terminal:');
        }
        return false;
      })
      .map(image => {
        // Extract tag from full image name
        let tag = '';
        if (Array.isArray(image.tags) && image.tags.length > 0) {
          tag = image.tags[0].replace('bdgtest/terminal:', '');
        } else if (typeof image.tags === 'string') {
          tag = image.tags.replace('bdgtest/terminal:', '');
        }
        
        return {
          id: image.id,
          tag,
          created: image.created,
          size: image.size,
          isDefault: image.tags && (
            (Array.isArray(image.tags) && image.tags.includes(startupDocker.DEFAULT_IMAGE)) ||
            image.tags === startupDocker.DEFAULT_IMAGE
          )
        };
      });
    
    // Return status
    res.json({
      defaultImageExists,
      lastBuilt: defaultImageExists ? new Date().toISOString() : null, // We don't have real build date info yet
      availableTags,
      images: formattedImages
    });
  } catch (error) {
    console.error('Error getting Docker auto-status:', error);
    res.status(500).json({ error: 'Failed to get Docker auto-status: ' + error.message });
  }
});

// Rebuild default image
router.post('/rebuild-default', validateWebSession, requireAdmin, async (req, res) => {
  try {
    // Start build process in the background
    const buildProcess = startupDocker.buildAndPushDefaultImage()
      .then(result => {
        console.log(`Build process completed with result: ${result}`);
        // Store build result for status checks
        req.app.locals.lastBuild = {
          completed: true,
          success: result,
          timestamp: new Date().toISOString()
        };
      })
      .catch(error => {
        console.error('Build process failed:', error);
        // Store error for status checks
        req.app.locals.lastBuild = {
          completed: true,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      });
    
    // Store build status for status checks
    req.app.locals.lastBuild = {
      completed: false,
      timestamp: new Date().toISOString()
    };
    
    // Return immediate response
    res.json({ 
      message: 'Default image rebuild initiated',
      buildId: Date.now().toString()
    });
  } catch (error) {
    console.error('Error rebuilding default image:', error);
    res.status(500).json({ error: 'Failed to rebuild default image: ' + error.message });
  }
});

// Create version tag
router.post('/create-version-tag', validateWebSession, requireAdmin, async (req, res) => {
  try {
    // Create version tag
    const versionTag = startupDocker.getVersionInfo();
    const result = await startupDocker.createImageTag('latest', versionTag);
    
    if (!result) {
      throw new Error('Failed to create version tag');
    }
    
    res.json({ 
      message: 'Version tag created successfully',
      tag: versionTag
    });
  } catch (error) {
    console.error('Error creating version tag:', error);
    res.status(500).json({ error: 'Failed to create version tag: ' + error.message });
  }
});

// Check build status
router.get('/build-status', validateWebSession, requireAdmin, (req, res) => {
  // Return current build status
  const buildStatus = req.app.locals.lastBuild || {
    completed: true,
    success: false,
    error: 'No build information available'
  };
  
  res.json(buildStatus);
});

module.exports = router;
