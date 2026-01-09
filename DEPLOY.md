# Deploying to Vercel

## Quick Start

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy your site**:
   ```bash
   vercel
   ```
   - Follow the prompts
   - Choose your project name
   - Confirm deployment settings

4. **For production deployment**:
   ```bash
   vercel --prod
   ```

## Adding Your Custom Domain (otterfulotters.xyz)

1. **Go to Vercel Dashboard**:
   - Visit https://vercel.com/dashboard
   - Select your project

2. **Add Domain**:
   - Go to **Settings** → **Domains**
   - Click **Add Domain**
   - Enter: `otterfulotters.xyz`
   - Click **Add**

3. **Configure DNS**:
   - Vercel will show you DNS records to add
   - Go to your domain registrar (where you bought otterfulotters.xyz)
   - Add the DNS records Vercel provides:
     - Usually an A record or CNAME record
   - Wait for DNS propagation (can take a few minutes to 48 hours)

4. **SSL Certificate**:
   - Vercel automatically provides free SSL certificates
   - Your site will be available at https://otterfulotters.xyz

## Alternative: Deploy via GitHub

1. **Create a GitHub repository**
2. **Push your code**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

3. **Connect to Vercel**:
   - Go to https://vercel.com
   - Click **Add New Project**
   - Import your GitHub repository
   - Vercel will auto-detect settings and deploy

## Notes

- All files in `.vercelignore` won't be uploaded
- Static files (images, CSS, JS) are automatically optimized
- Vercel provides free SSL certificates
- Automatic deployments on every git push (if connected to GitHub)

