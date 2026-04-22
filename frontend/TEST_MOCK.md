# Test Mock API Guide

Run the frontend with mock API:
```bash
cd frontend-vite
npm run dev:mock
```

Then open http://localhost:3000

**Note:** Make sure port 3000 is not occupied by another process.

If you see `[MSW] Mocking enabled successfully` in the browser console, MSW is working correctly.

## Test Scenarios

### 1. View Dashboard (List Databases)
**Expected behavior:**
- Shows 4 databases: `production_db`, `staging_db`, `test_db`, `my_current_db`
- Status badges show correctly (green for active, yellow for pending)
- Click "View Details" navigates to database detail page

### 2. Create New Database
**Steps:**
1. Click "Create Database" button
2. Enter database name: `new_test_db`
3. Click "Create Database"
4. Wait for creation (simulated 1s delay)

**Expected behavior:**
- Dialog closes
- New database appears at top of list with `active` status
- Toast notification appears

### 3. View Database Details
**Steps:**
1. Click "View Details" on `my_current_db`

**Expected behavior:**
- Shows database info (name, owner, created date)
- Shows Quick Stats (3 PostgreSQL users, 3 active, 2 write access)
- Lists PostgreSQL users:
  - `readonly_user` (read)
  - `admin_user` (write)

### 4. Create New PostgreSQL User
**Steps:**
1. Click "Create User" button
2. Enter username: `new_app_user`
3. Select permission: "Read & Write"
4. Click "Create User"
5. Wait for creation (simulated 800ms delay)

**Expected behavior:**
- Dialog shows success with password
- Password copied to clipboard (toast notification)
- New user appears in the list

### 5. Regenerate Password
**Steps:**
1. Find `admin_user` row
2. Click "Regenerate Password" button
3. Wait for regeneration (simulated 600ms delay)

**Expected behavior:**
- Dialog shows new password
- Password copied to clipboard (toast notification)

### 6. Delete PostgreSQL User
**Steps:**
1. Find `readonly_user` row
2. Click "Delete" button
3. Confirm deletion

**Expected behavior:**
- User removed from list
- User count in Quick Stats decreases

### 7. Delete Database
**Steps:**
1. Click "Delete Database" button
2. Type database name to confirm: `my_current_db`
3. Click "Delete Database"

**Expected behavior:**
- Redirects to dashboard
- Database removed from list

## Manual API Testing with curl

Start the mock server first:
```bash
npm run dev:mock
```

Then in another terminal:
```bash
# List all databases
curl http://localhost:3000/api/databases

# Get single database
curl http://localhost:3000/api/databases/db-001

# Create database
curl -X POST http://localhost:3000/api/databases \
  -H "Content-Type: application/json" \
  -d '{"name":"curl_test_db"}'

# Delete database
curl -X DELETE http://localhost:3000/api/databases/db-001

# List users for a database
curl http://localhost:3000/api/databases/db-current/pgusers

# Create user
curl -X POST http://localhost:3000/api/databases/db-current/pgusers \
  -H "Content-Type: application/json" \
  -d '{"username":"curl_user","permission":"read"}'

# Regenerate password
curl -X POST http://localhost:3000/api/databases/db-current/pgusers/pu-101/regenerate-password

# Delete user
curl -X DELETE http://localhost:3000/api/databases/db-current/pgusers/pu-101
```

## Mock Data Reset

The mock data resets when you refresh the page. To reset:
1. Refresh the browser page
2. All databases and users return to initial state

## Troubleshooting

**Getting "Failed to fetch" errors?**
- Ensure you're running `npm run dev:mock` not `npm run dev`
- Check browser console for `[MSW] Mocking enabled successfully`
- If you see requests going to `localhost:8080`, the mock is not enabled

**MSW not loading?**
- Check browser console for "MSW started" message
- If you see errors about Service Worker, try:
  1. Open DevTools → Application → Service Workers
  2. Unregister any existing MSW workers
  3. Refresh the page

**Databases not showing?**
- Open browser DevTools → Network tab
- Check if `/api/databases` returns 200 with JSON data
- Check Console for errors

**Mock not intercepting requests?**
- Check if MSW worker is registered: DevTools → Application → Service Workers
- Ensure worker status shows "activated and is running"
- Check Network tab - requests should show "(from service worker)" instead of "(from proxy)"
