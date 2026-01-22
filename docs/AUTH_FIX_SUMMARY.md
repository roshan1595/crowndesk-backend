# Clerk Authentication Fix - Complete Solution

## Problem
After OAuth login, users were redirected to Clerk's "default-redirect" page showing "Already logged in. Now, it's time to connect Clerk to your application" instead of the dashboard.

## Root Causes

### 1. **Outdated Clerk API Usage**
- Using deprecated `authMiddleware` from Clerk v4
- Should use `clerkMiddleware` + `createRouteMatcher` (v5)

### 2. **Missing Redirect Logic**
- No logic to redirect logged-in users away from auth pages
- Caused OAuth callback to complete but user stuck on sign-in page

### 3. **Incorrect Props on SignIn/SignUp**
- Using deprecated `path`, `routing`, `afterSignInUrl`
- Should use `fallbackRedirectUrl` + `forceRedirectUrl`

### 4. **Non-Awaited auth() in Server Components**
- Dashboard layout used `auth()` instead of `await auth()`
- Clerk v5 server API requires await

## Solutions Applied

### 1. Updated Middleware (`middleware.ts`)
```typescript
// ❌ OLD (v4)
import { authMiddleware } from "@clerk/nextjs";
export default authMiddleware({
  publicRoutes: ["/", "/sign-in(.*)", ...],
  debug: true,
});

// ✅ NEW (v5)
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
]);

const isAuthRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  const { userId, orgId } = await auth();
  
  // KEY FIX: Redirect logged-in users away from auth pages
  if (userId && isAuthRoute(request)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!userId) {
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
    if (!orgId && request.nextUrl.pathname !== '/select-org') {
      return NextResponse.redirect(new URL('/select-org', request.url));
    }
  }
  
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});
```

### 2. Updated SignIn Component
```typescript
// ❌ OLD
<SignIn
  path="/sign-in"
  routing="path"
  signUpUrl="/sign-up"
  afterSignInUrl="/dashboard"
/>

// ✅ NEW
<SignIn
  fallbackRedirectUrl="/dashboard"
  forceRedirectUrl="/dashboard"
  appearance={{...}}
/>
```

### 3. Updated Dashboard Layout
```typescript
// ❌ OLD
const { userId, orgId } = auth();  // Missing await!

// ✅ NEW
const { userId, orgId } = await auth();  // Properly awaited
```

## Key Learnings from NeuraNote

### What NeuraNote Does Right

1. **Simple Middleware**
   - Uses `createRouteMatcher` for clean route definitions
   - Protects routes with `await auth.protect()`
   - No complex afterAuth callbacks

2. **Direct Redirects**
   - Uses `fallbackRedirectUrl` and `forceRedirectUrl` together
   - Ensures OAuth callbacks always redirect to dashboard

3. **Server-Side Protection**
   - Every dashboard page checks `await auth()`
   - Redirects to `/sign-in` if no userId

4. **No Path/Routing Props**
   - Relies on file-based routing
   - Lets Clerk handle navigation automatically

### Example from NeuraNote
```typescript
// middleware.ts
export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

// dashboard/layout.tsx
const { userId } = await auth()
if (!userId) redirect('/sign-in')

// dashboard pages
const { userId } = await auth()
if (!userId) redirect('/sign-in')
```

## Testing the Fix

### Expected Flow After Fix

1. **User Not Logged In**
   - Visit `/dashboard` → Redirect to `/sign-in`
   - Complete OAuth → Redirect to `/dashboard` ✅

2. **User Already Logged In**
   - Visit `/sign-in` → Auto-redirect to `/dashboard` ✅
   - Visit `/dashboard` → Show dashboard ✅

3. **OAuth Callback**
   - Clerk processes callback → Redirect to `/dashboard` ✅
   - **No more "default-redirect" page!** ✅

### How to Test

1. **Clear cookies/cache** for both:
   - `portal.crowndesk.xaltrax.com`
   - `just-mallard-20.accounts.dev`

2. **Test Sign In:**
   ```
   1. Go to https://portal.crowndesk.xaltrax.com/sign-in
   2. Click "Sign in with Google"
   3. Complete OAuth
   4. Should redirect to /dashboard
   ```

3. **Test Already Logged In:**
   ```
   1. While logged in, go to /sign-in
   2. Should auto-redirect to /dashboard
   3. No "Already logged in" message!
   ```

4. **Test Dashboard Direct:**
   ```
   1. Go to /dashboard
   2. If not logged in → redirects to /sign-in
   3. If logged in → shows dashboard
   ```

## Environment Variables Still Needed

**Backend Vercel** (CRITICAL):
```
CLERK_SECRET_KEY=sk_test_PcBAIzwDirnUisKKKB4ocBxrImGZOGelfGegjPjIWk
DATABASE_URL=postgresql://neondb_owner:npg_gkQ20xVFATpL@...
CORS_ORIGINS=https://portal.crowndesk.xaltrax.com,...
FRONTEND_URL=https://portal.crowndesk.xaltrax.com
NODE_ENV=production
CLERK_PUBLISHABLE_KEY=pk_test_anVzdC1tYWxsYXJkLTIwLmNsZXJrLmFjY291bnRzLmRldiQ
```

Add at: https://vercel.com/crowndesk/crowndesk-backend-aaal/settings/environment-variables

## Files Changed

1. `apps/web/src/middleware.ts` - Updated to Clerk v5 API
2. `apps/web/src/app/dashboard/layout.tsx` - Added await auth()
3. `apps/web/src/app/sign-in/[[...sign-in]]/page.tsx` - Updated redirect props
4. `apps/web/src/app/sign-up/[[...sign-up]]/page.tsx` - Updated redirect props

## References

- **NeuraNote Repo**: https://github.com/roshan1595/NeuraNote
- **Clerk v5 Migration Guide**: https://clerk.com/docs/upgrade-guides/core-2/nextjs
- **Clerk Middleware Docs**: https://clerk.com/docs/references/nextjs/clerk-middleware

## Next Steps

1. ✅ Wait for Vercel frontend deployment to complete
2. ⏳ Add backend environment variables to Vercel
3. ⏳ Test complete OAuth flow
4. ⏳ Verify dashboard loads with data

---

**Created:** January 15, 2026  
**Status:** Fixed - Awaiting Deployment
