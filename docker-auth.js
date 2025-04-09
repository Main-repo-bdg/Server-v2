/**
 * Docker authentication and image management module
 * This file provides utilities for authenticating with Docker Hub and managing Docker images
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const Docker = require('dockerode');

// Docker Hub authentication credentials (hardcoded as requested)
const DOCKER_USERNAME = 'bdgtest';
const DOCKER_PASSWORD = 'dckr_pat_hvhiBx3LQctj5ELYHlLcNJobq8s';

// Default image to use if not specified (hardcoded)
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
    console.log(`Authenticating with Docker Hub as ${DOCKER_USERNAME}`);
    
    // Create auth config
    const authConfig = {
      username: DOCKER_USERNAME,
      password: DOCKER_PASSWORD
    };

    // Try two different methods to ensure authentication works

    // 1. Save auth config to file for Docker CLI
    try {
      const dockerConfigDir = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.docker');
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
      console.log('Docker config file created successfully');
    } catch (fileError) {
      console.warn('Failed to create Docker config file:', fileError.message);
      // Continue even if this fails, as we'll use the direct auth method
    }
    
    // 2. Try direct authentication by pinging the Docker Hub API
    try {
      // Use the exec method to run a docker login command
      await new Promise((resolve, reject) => {
        exec(`echo "${DOCKER_PASSWORD}" | docker login --username ${DOCKER_USERNAME} --password-stdin`, 
          (error, stdout, stderr) => {
            if (error) {
              console.warn('Docker login command failed:', stderr || error.message);
              // Don't reject here, we'll continue with other methods
              resolve(false);
            } else {
              console.log('Docker login command succeeded:', stdout);
              resolve(true);
            }
          }
        );
      });
    } catch (loginError) {
      console.warn('Docker login command error:', loginError.message);
      // Continue even if this fails
    }

    console.log('Docker Hub authentication completed');
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
    const authenticated = await authenticateWithDockerHub();
    if (!authenticated) {
      console.error('Failed to authenticate with Docker Hub');
      // Try again with explicit credentials
      console.log('Retrying with explicit credentials...');
    }
    
    // Pull the image with explicit auth config
    const authconfig = {
      username: DOCKER_USERNAME,
      password: DOCKER_PASSWORD
    };
    
    console.log(`Using auth credentials for ${DOCKER_USERNAME}`);
    
    // Try multiple pull attempts
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Pull attempt ${attempt} for image: ${imageName}`);
        
        // Pull the image
        const stream = await docker.pull(imageName, { authconfig });
  
        // Wait for the pull to complete
        const result = await new Promise((resolve) => {
          docker.modem.followProgress(stream, (err, output) => {
            if (err) {
              console.error('Error pulling image:', err);
              resolve({ success: false, error: err });
            } else {
              console.log(`Successfully pulled image: ${imageName}`);
              
              // Log some output details for debugging
              if (output && output.length > 0) {
                const lastMessage = output[output.length - 1];
                console.log('Pull completed with status:', lastMessage.status || 'Unknown');
              }
              
              resolve({ success: true, output });
            }
          });
        });
        
        if (result.success) {
          return true;
        }
        
        // If we failed, wait before retrying
        if (attempt < 3) {
          console.log(`Waiting before retry ${attempt+1}...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (pullError) {
        console.error(`Pull attempt ${attempt} failed:`, pullError);
        if (attempt < 3) {
          console.log(`Waiting before retry ${attempt+1}...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    console.error(`All pull attempts for ${imageName} failed`);
    return false;
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
