# Terminal Server Web UI Deployment Guide

This guide provides detailed instructions for deploying the Terminal Server with Web UI to Render.com. Follow these steps to ensure a successful deployment.

## Pre-Deployment Steps

### 1. Prepare the User Container Image

Since Render.com doesn't support Docker-in-Docker natively, you need to build and push the user container image to Docker Hub or another container registry:

```bash
# Build the user container image
docker build -t yourusername/terminal-user-image:latest -f Dockerfile.user .

# Login to Docker Hub
docker login

# Push the image to Docker Hub
docker push yourusername/terminal-user-image:latest
```

Replace `yourusername` with your actual Docker Hub username.

### 2. Update render.yaml

The render.yaml file has already been configured, but you should update the `USER_CONTAINER_IMAGE` value to point to your Docker Hub image:

```yaml
- key: USER_CONTAINER_IMAGE
  value: yourusername/terminal-user-image:latest
```

## Deployment Process

### 1. Set Up the Render.com Service

1. Sign up for an account on Render.com if you don't already have one
2. Create a new Web Service and connect your GitHub repository
3. Select "Docker" as the environment
4. Render will automatically detect the render.yaml file and use its configuration

### 2. Configure Environment Variables

Make sure the following environment variables are set correctly:

- `API_KEY`: A long, random string (generate with `openssl rand -hex 32`)
- `SESSION_TIMEOUT`: 3600000 (1 hour in milliseconds)
- `MAX_CONTAINERS`: 100 (adjust based on your needs)
- `CONTAINER_MEMORY`: 256m (memory limit per container)
- `CONTAINER_CPU`: 0.1 (CPU limit per container)
- `USER_CONTAINER_IMAGE`: Your public Docker Hub image (e.g., yourusername/terminal-user-image:latest)
- `PORT`: 3000 (default port)

### 3. Set Up the Persistent Disk

The render.yaml file includes disk configuration, but verify that it's set up correctly:

1. Name: terminal-logs
2. Mount path: /app/logs
3. Size: 1GB

## Post-Deployment Steps

### 1. Verify Web UI Access

After deployment is complete, navigate to your Render.com service URL. You should see the login page for the Terminal Server.

### 2. Set Up Admin Account

The first time you access the application, use the default admin credentials:

- Username: admin
- Password: admin123

**Important**: Change these credentials immediately by logging in and creating a new admin account.

### 3. Create a New Admin Account

1. Log in with the default admin credentials
2. Click the "Register" link
3. Fill in your desired username and password
4. In the "Admin Key" field, enter the API_KEY value you configured
5. Complete the registration

### 4. Test Terminal Functionality

1. Create a new terminal session
2. Try executing basic commands like `ls`, `pwd`, etc.
3. Test session management (creating multiple sessions, switching between them)

## Troubleshooting

### Container Image Issues

If you see errors related to the container image, verify:

1. The image is public on Docker Hub
2. The image name in the environment variables matches exactly
3. The image builds successfully locally

### API Connection Issues

If API requests are failing:

1. Check that `API_KEY` is set correctly
2. Verify that the container image has the necessary tools installed
3. Look at the logs in the Render dashboard for any error messages

### Web UI Not Loading

If the web interface doesn't load:

1. Check the browser console for JavaScript errors
2. Verify that all static files are being served correctly
3. Ensure the PORT environment variable is set to 3000

## Securing Your Deployment

For production use, consider these additional security measures:

1. **HTTPS**: Render.com provides HTTPS by default
2. **API Key**: Use a strong, randomly generated API key
3. **Rate Limiting**: The application includes rate limiting, but you may want to adjust the settings
4. **User Access**: Create a proper user management strategy for your deployment

## Updating Your Deployment

When you push changes to your GitHub repository, Render.com will automatically rebuild and redeploy your application.

If you update the user container image:

1. Build and push the new image to Docker Hub
2. Update the `USER_CONTAINER_IMAGE` environment variable if the tag changed
3. Trigger a manual deploy in the Render dashboard

## Monitoring and Maintenance

1. Use the `/health` endpoint to check the status of your server
2. Monitor disk usage, as terminal logs can grow over time
3. Set up regular backups of your data if needed

## Support

If you encounter issues with your deployment, check:

1. Render.com's documentation
2. The logs in your Render dashboard
3. Open an issue in the GitHub repository if needed
