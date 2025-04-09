/**
 * Docker authentication and image management module
 * This file provides utilities for authenticating with Docker Hub and managing Docker images
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const Docker = require('dockerode');

// Environment variables for Docker Hub authentication
// These should be set in the environment, not hardcoded
const DOCKER_USERNAME = process.env.DOCKER_USERNAME || 'bdgtest';
const DOCKER_PASSWORD = process.env.DOCKER_PASSWORD || '';

// Default image to use if not specified
const DEFAULT_IMAGE = 'bdgtest/terminal:latest';

// Set up Docker client
let docker;
try {
  docker = new Docker();
  console.log('Docker client initialized successfully');
} catch (error) {
  console.error('Failed to initialize Docker client:', error.message);
  docker = null;
}

/**
 * Authenticate with Docker Hub
 * @returns {Promise<boolean>} Whether authentication was successful
 */
async function authenticateWithDockerHub() {
  if (!DOCKER_USERNAME || !DOCKER_PASSWORD) {
    console.error('Docker Hub credentials not provided');
    return false;
  }

  try {
    // Create auth config
    const authConfig = {
      username: DOCKER_USERNAME,
      password: DOCKER_PASSWORD
    };

    // Save auth config to file for Docker CLI
    const dockerConfigDir = path.join(process.env.HOME || process.env.USERPROFILE, '.docker');
    if (!fs.existsSync(dockerConfigDir)) {
      fs.mkdirSync(dockerConfigDir, { recursive: true });
    }

    const configPath = path.join(dockerConfigDir, 'config.json');
    const config = {
      auths: {
        'https://index.docker.io/v1/': {
          auth: Buffer.from(`${DOCKER_USERNAME}:${DOCKER_PASSWORD}`).toString('base64')
        }
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });

    console.log('Docker Hub authentication configured');
    return true;
  } catch (error) {
    console.error('Failed to authenticate with Docker Hub:', error);
    return false;
  }
}

/**
 * Pull a Docker image
 * @param {string} imageName - Image to pull (e.g., "bdgtest/terminal:latest")
 * @returns {Promise<boolean>} Whether the pull was successful
 */
async function pullDockerImage(imageName = DEFAULT_IMAGE) {
  if (!docker) {
    console.error('Docker client not available');
    return false;
  }

  try {
    console.log(`Pulling Docker image: ${imageName}`);
    
    // Authenticate first
    await authenticateWithDockerHub();
    
    // Pull the image
    const stream = await docker.pull(imageName, {
      authconfig: {
        username: DOCKER_USERNAME,
        password: DOCKER_PASSWORD
      }
    });

    // Wait for the pull to complete
    return new Promise((resolve) => {
      docker.modem.followProgress(stream, (err) => {
        if (err) {
          console.error('Error pulling image:', err);
          resolve(false);
        } else {
          console.log(`Successfully pulled image: ${imageName}`);
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.error(`Failed to pull Docker image ${imageName}:`, error);
    return false;
  }
}

/**
 * List available Docker images
 * @returns {Promise<Array>} List of images
 */
async function listDockerImages() {
  if (!docker) {
    console.error('Docker client not available');
    return [];
  }

  try {
    const images = await docker.listImages();
    return images.filter(image => {
      // Filter to only include images from the bdgtest repository
      return image.RepoTags && image.RepoTags.some(tag => tag.startsWith('bdgtest/'));
    }).map(image => {
      return {
        id: image.Id.substr(7, 12), // Short ID
        tags: image.RepoTags,
        size: (image.Size / (1024 * 1024)).toFixed(2) + ' MB',
        created: new Date(image.Created * 1000).toISOString()
      };
    });
  } catch (error) {
    console.error('Failed to list Docker images:', error);
    return [];
  }
}

/**
 * Get detailed info about a Docker image
 * @param {string} imageName - Image to inspect
 * @returns {Promise<Object>} Image details
 */
async function inspectDockerImage(imageName = DEFAULT_IMAGE) {
  if (!docker) {
    console.error('Docker client not available');
    return null;
  }

  try {
    const image = docker.getImage(imageName);
    const info = await image.inspect();
    return info;
  } catch (error) {
    console.error(`Failed to inspect Docker image ${imageName}:`, error);
    return null;
  }
}

/**
 * Check if a Docker image exists locally
 * @param {string} imageName - Image to check
 * @returns {Promise<boolean>} Whether the image exists
 */
async function imageExists(imageName = DEFAULT_IMAGE) {
  if (!docker) {
    console.error('Docker client not available');
    return false;
  }

  try {
    const images = await docker.listImages();
    return images.some(image => {
      return image.RepoTags && image.RepoTags.includes(imageName);
    });
  } catch (error) {
    console.error(`Failed to check if image ${imageName} exists:`, error);
    return false;
  }
}

/**
 * Ensure a Docker image is available, pulling it if necessary
 * @param {string} imageName - Image to ensure
 * @returns {Promise<boolean>} Whether the image is available
 */
async function ensureImageAvailable(imageName = DEFAULT_IMAGE) {
  // First check if image exists locally
  const exists = await imageExists(imageName);
  if (exists) {
    console.log(`Image ${imageName} already exists locally`);
    return true;
  }

  // If not, pull it
  console.log(`Image ${imageName} not found locally, pulling...`);
  return await pullDockerImage(imageName);
}

module.exports = {
  authenticateWithDockerHub,
  pullDockerImage,
  listDockerImages,
  inspectDockerImage,
  imageExists,
  ensureImageAvailable,
  DEFAULT_IMAGE
};
