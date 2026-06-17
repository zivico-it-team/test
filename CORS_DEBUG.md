# CORS Debugging Checklist for Hostinger Deployment

## Issue
Login endpoint `POST https://revoraglobal.com/api/auth/login` from `https://crm.revoraglobal.com` returns no CORS headers.

## Root Cause
The backend environment variables are not being read or applied on the Hostinger server.

---

## Verification Steps

### 1. Check Hostinger Environment Variables
- [ ] Log into Hostinger cPanel
- [ ] Navigate to **Node.js** or **Application Manager**
- [ ] Verify these variables are set:
  ```
  NODE_ENV=production
  CLIENT_URL=https://crm.revoraglobal.com
  ALLOWED_ORIGINS=https://crm.revoraglobal.com,https://revoraglobal.com
  MYSQL_HOST=<your-host>
  MYSQL_DB=<your-db>
  MYSQL_USER=<your-user>
  MYSQL_PASSWORD=<your-pass>
  JWT_SECRET=<strong-random-secret>
  ```

### 2. Check .env File Location
- [ ] Backend code is at: `/home/username/public_html/api` or similar
- [ ] `.env` file exists and contains the variables above
- [ ] File permissions allow Node.js to read it

### 3. Restart Node.js
- [ ] In Hostinger cPanel, restart the Node.js app
- [ ] Wait 30 seconds for it to fully restart

### 4. Test CORS Headers
In browser console, run:
```javascript
fetch('https://revoraglobal.com/api/health', {
  credentials: 'include',
  headers: { 'Origin': 'https://crm.revoraglobal.com' }
})
  .then(r => {
    console.log('Status:', r.status);
    console.log('CORS Header:', r.headers.get('Access-Control-Allow-Origin'));
    return r.text();
  })
  .then(console.log)
  .catch(console.error);
```

Expected response: `Access-Control-Allow-Origin: https://crm.revoraglobal.com`

---

## If Variables Are Not Set

### Option A: Use Hostinger Dashboard
1. Go to cPanel → Node.js
2. Click your app
3. Add environment variables manually
4. Restart

### Option B: Upload .env File Directly
1. Use FTP/SFTP to connect to Hostinger
2. Upload `.env` file to backend root directory
3. Restart Node.js

### Option C: Update Application Startup
If Hostinger doesn't read `.env`, hardcode in `index.js` temporarily:
```javascript
if (!process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS = "https://crm.revoraglobal.com,https://revoraglobal.com";
}
if (!process.env.CLIENT_URL) {
  process.env.CLIENT_URL = "https://crm.revoraglobal.com";
}
```

---

## Common Hostinger Issues

1. **Node.js process is using old code**
   - Solution: Force rebuild, clear cache, restart
   
2. **.env file not in correct directory**
   - Check if file is in `/home/user/public_html/` (Hostinger default)
   
3. **Reverse proxy stripping headers**
   - Hostinger sometimes uses Nginx in front of Node.js
   - May need to configure proxy headers

4. **PORT mismatch**
   - Hostinger assigns a specific port; ensure `PORT` env var matches

