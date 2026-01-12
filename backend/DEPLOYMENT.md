# GitHub Actions CI/CD Setup Guide

## Prerequisites

### 1. GitHub Secrets Configuration

Go to your repository: `Settings > Secrets and variables > Actions > New repository secret`

Add the following secrets:

#### Render API
```
RENDER_API_KEY
```
- Get from: Render Dashboard > Account Settings > API Keys

```
RENDER_SERVICE_ID_STAGING
RENDER_SERVICE_ID_PROD
```
- Get from: Render Dashboard > Service > Settings > Service Details > Service ID

#### Database (Supabase)
```
DATABASE_URL_STAGING
DATABASE_URL_PROD
```
Example:
```
postgresql://postgres.xosbwrrpqxvvrifbwive:[PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
```

#### Redis (Upstash)
```
REDIS_URL_STAGING
REDIS_URL_PROD
```
Example:
```
rediss://default:[PASSWORD]@coherent-lemming-36797.upstash.io:6379
```

#### Authentication
```
JWT_SECRET_STAGING
JWT_SECRET_PROD
```
Generate with:
```bash
openssl rand -base64 32
```

#### OAuth
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

#### Frontend URLs
```
FRONTEND_URL_STAGING=https://payeazie-staging.vercel.app
FRONTEND_URL_PROD=https://payeazie.vercel.app
```

#### Notifications (Optional)
```
SLACK_WEBHOOK_URL
```

---

## Render Configuration

### Service Settings

1. **Auto-Deploy**: Disable (we use GitHub Actions)
   - Go to: Service > Settings > Build & Deploy
   - Set "Auto-Deploy" to **No**

2. **Health Check Path**: `/health`
   - Go to: Service > Settings > Health & Alerts
   - Set "Health Check Path" to `/health`

3. **Environment Variables**: Set in Render Dashboard
   - `NODE_ENV=production`
   - `PORT=3467` (or Render's default 10000)
   - Add all secrets from GitHub (they should match)

### Build Command
```bash
npm install --production=false
```

### Start Command
```bash
node server.js
```

---

## Workflow Triggers

### Automatic Deployments

**Staging**: Push to `staging` branch
```bash
git checkout staging
git merge develop
git push origin staging
```

**Production**: Push to `master` branch
```bash
git checkout master
git merge staging
git push origin master
```

### Manual Deployment

Trigger via GitHub Actions UI:
- Go to: Actions > Backend CI/CD Pipeline > Run workflow

---

## Deployment Process

### 1. CI Phase (All branches)
- ✅ Code checkout
- ✅ Node.js setup with cache
- ✅ Install dependencies
- ✅ Run linting
- ✅ Run tests
- ✅ Upload coverage

### 2. CD Phase (Staging/Production only)

#### Pre-Deploy
- ✅ Run database migrations
- ✅ Stop if migrations fail

#### Deploy
- ✅ Trigger Render deployment via API
- ✅ Monitor deployment status
- ✅ Wait for "live" status (max 10 min)

#### Post-Deploy
- ✅ Health check (retry up to 10 times)
- ✅ Send Slack notification
- ✅ Create audit log

---

## Rollback Instructions

### If Deployment Fails

1. **Immediate Rollback** (via Render Dashboard)
   ```
   1. Go to Render Dashboard > Your Service
   2. Click "Deploys" tab
   3. Find the last successful deploy
   4. Click "Redeploy"
   ```

2. **Rollback via GitHub** (revert commit)
   ```bash
   # Find the commit to revert
   git log --oneline
   
   # Revert the bad commit
   git revert <commit-hash>
   git push origin master
   
   # This will trigger a new deployment
   ```

3. **Emergency Rollback** (manual)
   ```bash
   # Reset to previous commit
   git reset --hard <previous-commit-hash>
   git push origin master --force
   ```

### If Migration Fails

The workflow automatically stops deployment if migrations fail.

**Fix and redeploy:**
```bash
# Fix the migration locally
# Test it
npm run db:migrate

# Commit and push
git add migrations/
git commit -m "fix: correct migration error"
git push origin staging  # test in staging first
```

---

## Monitoring

### Check Deployment Status

1. **GitHub Actions**
   - Go to: Actions > Backend CI/CD Pipeline
   - View logs for each step

2. **Render Logs**
   - Go to: Service > Logs
   - Real-time logs during deployment

3. **Health Endpoint**
   ```bash
   curl https://payeazie.onrender.com/health
   ```

### Verify Services

```bash
# Check API health
curl https://payeazie.onrender.com/health

# Check database connection
curl https://payeazie.onrender.com/health | jq .database

# Check Redis connection
curl https://payeazie.onrender.com/health | jq .redis
```

---

## Troubleshooting

### Common Issues

**Issue**: Migration fails with "already exists" error
**Fix**: This is normal if tables exist. The workflow continues.

**Issue**: Health check fails
**Fix**: 
1. Check Render logs for startup errors
2. Verify environment variables are set
3. Check DATABASE_URL and REDIS_URL are correct

**Issue**: Render API timeout
**Fix**: Increase `MAX_WAIT` in workflow (default: 10 min)

**Issue**: Rate limit exceeded on Render API
**Fix**: Add delay between deployments (handled automatically)

---

## Best Practices

1. **Always deploy to staging first**
   ```bash
   git push origin staging  # test here first
   # After testing
   git push origin master   # deploy to production
   ```

2. **Test migrations locally before deploying**
   ```bash
   # Set staging DATABASE_URL
   export DATABASE_URL="postgresql://..."
   node scripts/migrate.js
   ```

3. **Monitor deployments**
   - Watch GitHub Actions logs
   - Check Slack notifications
   - Verify health endpoint

4. **Keep secrets secure**
   - Never commit `.env` files
   - Rotate secrets regularly
   - Use different secrets for staging/production

5. **Document changes**
   - Add clear commit messages
   - Update CHANGELOG.md
   - Tag production releases

---

## Commands Reference

### Generate JWT Secret
```bash
openssl rand -base64 32
```

### Test Render API
```bash
curl -X GET "https://api.render.com/v1/services/YOUR_SERVICE_ID" \
  -H "Authorization: Bearer YOUR_RENDER_API_KEY"
```

### Manual Migration
```bash
cd backend
export DATABASE_URL="your-database-url"
node scripts/migrate.js
```

### Local Testing
```bash
cd backend
npm ci
npm test
npm run lint
```

---

## Support

- Render Status: https://status.render.com
- Supabase Status: https://status.supabase.com
- Upstash Status: https://status.upstash.com
- GitHub Status: https://www.githubstatus.com
