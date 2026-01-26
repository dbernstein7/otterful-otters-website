# Vercel Web Analytics Setup Guide

This document describes the Vercel Web Analytics integration for the Otterful Otters Dashboard.

## Overview

Vercel Web Analytics is enabled for this project to track visitor activity and page views. This helps understand user engagement with the Otterful Otters NFT collection dashboard.

## How It Works

Vercel Web Analytics is implemented using a simple HTML script that runs on all pages of the site. The analytics data is sent to Vercel's servers at `/_vercel/insights/view` and can be viewed in the Vercel dashboard.

## Implementation Details

### Static HTML Sites

For static HTML sites like this project, Vercel Web Analytics is implemented by adding two scripts to the `<head>` section of each HTML file:

```html
<!-- Vercel Web Analytics -->
<script>
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/_vercel/insights/script.js"></script>
```

The first script initializes the `window.va` function, which queues analytics calls. The second script loads the actual analytics tracking code from Vercel's servers.

### Files Updated

The following HTML files have been updated with Vercel Web Analytics:

- `index.html` - Main dashboard page
- `AvatarBuilder/index.html` - 3D Avatar Builder page
- `test.html` - Test/health check page

## Enabling Analytics in Vercel

To enable Web Analytics for this project on Vercel:

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select the **Otterful Otters Dashboard** project
3. Click the **Analytics** tab
4. Click **Enable** in the dialog that appears

**Note:** Enabling Web Analytics will add new routes (scoped at `/_vercel/insights/*`) after your next deployment.

## Deployment

The analytics will start collecting data once the site is deployed to Vercel. To deploy:

```bash
# Using Vercel CLI
vercel deploy

# For production deployment
vercel --prod
```

Or connect your Git repository to Vercel for automatic deployments on every push to main.

## Viewing Analytics Data

Once the site is deployed and has received visitor traffic:

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select the **Otterful Otters Dashboard** project
3. Click the **Analytics** tab
4. You'll see data about:
   - Visitor count
   - Page views
   - Popular pages
   - Geographic distribution
   - Device types
   - And more

After a few days of visitor activity, you'll be able to explore and filter the analytics data.

## Security Notes

- Analytics requests are sent to `/_vercel/insights/view`
- No sensitive user data is collected
- The Content Security Policy (CSP) in the HTML allows these requests
- The script is deferred, so it doesn't block page rendering

## Troubleshooting

If you're not seeing analytics data:

1. **Check deployment:** Make sure the changes have been deployed to Vercel
2. **Check browser:** Open your browser's Network tab and look for requests to `/_vercel/insights/view`
3. **Wait for data:** Initial data may take a few minutes to appear
4. **Verify CSP:** The Content-Security-Policy meta tag allows `https:` for `connect-src`, which is required for analytics

## Further Reading

For more information about Vercel Web Analytics, see:

- [Vercel Web Analytics Documentation](https://vercel.com/docs/analytics)
- [Getting Started with Vercel Web Analytics](https://vercel.com/docs/analytics/getting-started)
- [Privacy and Compliance](https://vercel.com/docs/analytics/privacy-policy)
