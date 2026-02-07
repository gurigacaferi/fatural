# Redeploy Worker with Fix

Run these commands in your Cloud Shell:

```bash
cd ~/app
git pull origin main
bash scripts/deploy_worker.sh
```

This will:
1. Pull the pgvector embedding fix
2. Rebuild and redeploy the worker to Cloud Run

After deployment completes, test by uploading a bill through the frontend.
