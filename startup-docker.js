/**
 * startup-docker.js - Automated Docker Hub initialization
 * 
 * This script handles automatic setup of Docker Hub images on startup.
 * It ensures that the required images exist and are properly tagged,
 * creating them if needed without any manual intervention.
 */

const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const Docker = require('dockerode');
const dockerAuth = require('./docker-auth');

// Default image settings
const DEFAULT_REPO = 'bdgtest/terminal';
const DEFAULT_TAG = 'latest';
const DEFAULT_IMAGE = `${DEFAULT_REPO}:${DEFAULT_TAG}`;

// Dockerfile content for the default image if we need to create it
const DEFAULT_DOCKERFILE_CONTENT = `FROM ubuntu:22.04

# Install base tools
RUN apt-get update && apt-get install -y \\
    bash \\
    curl \\
    wget \\
    git \\
    zip \\
    unzip \\
    vim \\
    nano \\
    htop \\
    python3 \\
    python3-pip \\
    nodejs \\
    npm \\
    gcc \\
    g++ \\
    make \\
    openssh-client \\
    tmux \\
    build-essential \\
    man-db \\
    locales \\
    && apt-get clean \\
    && rm -rf /var/lib/apt/lists/*

# Set up locales
RUN locale-gen en_US.UTF-8
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8

# Create a non-root user
RUN useradd -m -s /bin/bash terminal-user
USER terminal-user
WORKDIR /home/terminal-user

# Set a friendly prompt
RUN echo 'export PS1="\\[\\033[01;32m\\]\\u@container\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ "' >> /home/terminal-user/.bashrc

# Create some handy directories
RUN mkdir -p /home/terminal-user/projects /home/terminal-user/downloads

# Keep container running
CMD ["tail", "-f", "/dev/null"]
`;

/**
 * Initialize Docker and ensure the default image exists
 */
async function initializeDocker() {
  console.log('Starting Docker initialization...');
  
  try {
    // 1. Authenticate with Docker Hub
    console.log('Authenticating with Docker Hub...');
    const authenticated = await dockerAuth.authenticateWithDockerHub();
    
    if (!authenticated) {
      console.warn('Docker Hub authentication failed. Will continue with limited functionality.');
    } else {
      console.log('Docker Hub authentication successful.');
      
      // 2. Check if our image already exists
      const imageExists = await checkImageExists();
      
      if (imageExists) {
        console.log(`Default image ${DEFAULT_IMAGE} already exists in Docker Hub.`);
      } else {
        console.log(`Default image ${DEFAULT_IMAGE} not found. Building and pushing...`);
        
        // 3. Build and push the default image
        await buildAndPushDefaultImage();
      }
    }
    
    console.log('Docker initialization completed.');
    return true;
  } catch (error) {
    console.error('Docker initialization failed:', error);
    console.log('Continuing with limited Docker functionality...');
    return false;
  }
}

/**
 * Check if our default image exists on Docker Hub
 */
async function checkImageExists() {
  try {
    // First try to pull the image - if it exists, this will succeed
    console.log(`Checking if image ${DEFAULT_IMAGE} exists by pulling...`);
    
    try {
      const pullResult = await dockerAuth.pullDockerImage(DEFAULT_IMAGE);
      if (pullResult) {
        console.log(`Successfully pulled ${DEFAULT_IMAGE} - image exists.`);
        return true;
      }
    } catch (pullError) {
      console.log(`Pull check failed: ${pullError.message}`);
    }
    
    // If pull failed, check Docker Hub API directly (requires additional setup)
    console.log('Pull failed or returned false. Image may not exist in Docker Hub.');
    return false;
  } catch (error) {
    console.error(`Error checking if image exists: ${error.message}`);
    return false;
  }
}

/**
 * Build and push the default image to Docker Hub
 */
async function buildAndPushDefaultImage() {
  try {
    // Create a temporary directory for building
    const tempDir = path.join(__dirname, 'temp-docker-build');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Create Dockerfile
    console.log('Creating Dockerfile for default image...');
    const dockerfilePath = path.join(tempDir, 'Dockerfile');
    fs.writeFileSync(dockerfilePath, DEFAULT_DOCKERFILE_CONTENT);
    
    // Build the image
    console.log(`Building default image ${DEFAULT_IMAGE}...`);
    await new Promise((resolve, reject) => {
      exec(`docker build -t ${DEFAULT_IMAGE} ${tempDir}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Docker build error: ${error.message}`);
          console.error(`Build stderr: ${stderr}`);
          return reject(error);
        }
        console.log('Docker build successful');
        console.log(stdout);
        resolve();
      });
    });
    
    // Re-authenticate before pushing (to ensure credentials are fresh)
    await dockerAuth.authenticateWithDockerHub();
    
    // Push the image
    console.log(`Pushing image ${DEFAULT_IMAGE} to Docker Hub...`);
    await new Promise((resolve, reject) => {
      exec(`docker push ${DEFAULT_IMAGE}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Docker push error: ${error.message}`);
          console.error(`Push stderr: ${stderr}`);
          return reject(error);
        }
        console.log('Docker push successful');
        console.log(stdout);
        resolve();
      });
    });
    
    // Clean up
    try {
      fs.rmdirSync(tempDir, { recursive: true });
    } catch (cleanupError) {
      console.warn(`Warning: Could not clean up temp directory: ${cleanupError.message}`);
    }
    
    console.log('Default image successfully built and pushed to Docker Hub');
    return true;
  } catch (error) {
    console.error(`Failed to build and push default image: ${error.message}`);
    return false;
  }
}

/**
 * Create additional tags for the image
 */
async function createImageTag(sourceTag, newTag) {
  try {
    const sourceImage = `${DEFAULT_REPO}:${sourceTag}`;
    const newImage = `${DEFAULT_REPO}:${newTag}`;
    
    console.log(`Creating new tag ${newImage} from ${sourceImage}...`);
    
    await new Promise((resolve, reject) => {
      exec(`docker tag ${sourceImage} ${newImage}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Docker tag error: ${error.message}`);
          return reject(error);
        }
        console.log(`Tagged ${newImage}`);
        resolve();
      });
    });
    
    console.log(`Pushing new tag ${newImage} to Docker Hub...`);
    await new Promise((resolve, reject) => {
      exec(`docker push ${newImage}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Docker push error for tag: ${error.message}`);
          return reject(error);
        }
        console.log(`Pushed ${newImage}`);
        resolve();
      });
    });
    
    return true;
  } catch (error) {
    console.error(`Failed to create and push tag: ${error.message}`);
    return false;
  }
}

/**
 * Get version info to use for tagging
 */
function getVersionInfo() {
  const date = new Date();
  const versionTag = `v${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
  return versionTag;
}

/**
 * Tag the default image with a dated version
 */
async function createVersionTag() {
  const versionTag = getVersionInfo();
  return await createImageTag('latest', versionTag);
}

// Export functions
module.exports = {
  initializeDocker,
  checkImageExists,
  buildAndPushDefaultImage,
  createImageTag,
  createVersionTag,
  DEFAULT_IMAGE
};
