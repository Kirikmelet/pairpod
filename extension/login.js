// ── Supabase Config ──
      const SUPABASE_URL = 'https://xgfgqzveuyeceupfaebh.supabase.co';
      const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnZmdxenZldXllY2V1cGZhZWJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NDQ1OTAsImV4cCI6MjA5NDUyMDU5MH0.FLAZt7GXlRorlOBt-n0uYVAP4Ls_bTWQ8aD4w_hDzYE';

      // ── Helpers ──
      function supabaseHeaders(accessToken) {
        const h = {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
        };
        if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;
        return h;
      }

      function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3200);
      }

      // ── DOM refs ──
      const windowBody = document.getElementById('windowBody');
      const signInTab = document.getElementById('tabIn');
      const registerTab = document.getElementById('tabUp');
      const submitButton = document.getElementById('submitBtn');
      const authForm = document.getElementById('authForm');
      const emailInput = document.getElementById('emailInput');
      const passwordInput = document.getElementById('passwordInput');
      const usernameInput = document.getElementById('usernameInput');
      const loggedInView = document.getElementById('loggedInView');
      const welcomeMsg = document.getElementById('welcomeMsg');
      const userEmailEl = document.getElementById('userEmail');
      const logoutBtn = document.getElementById('logoutBtn');
      const googleBtn = document.getElementById('googleBtn');

      let currentMode = 'signin';

      // ── Tab switching ──
      function setMode(mode) {
        currentMode = mode;
        const isRegistering = mode === 'register';
        windowBody.classList.toggle('signup-mode', isRegistering);
        signInTab.classList.toggle('active', !isRegistering);
        registerTab.classList.toggle('active', isRegistering);
        signInTab.setAttribute('aria-selected', String(!isRegistering));
        registerTab.setAttribute('aria-selected', String(isRegistering));
        submitButton.textContent = isRegistering ? 'Create Account' : 'Sign In';
      }
      signInTab?.addEventListener('click', () => setMode('signin'));
      registerTab?.addEventListener('click', () => setMode('register'));

      // ── Session persistence ──
      function saveSession(session) {
        if (session) localStorage.setItem('uh_session', JSON.stringify(session));
      }
      function loadSession() {
        try { return JSON.parse(localStorage.getItem('uh_session')); } catch { return null; }
      }
      function clearSession() {
        localStorage.removeItem('uh_session');
      }

      // ── UI state ──
      function showLoggedIn(email, username) {
        document.body.classList.add('is-logged-in');
        loggedInView.classList.add('visible');
        welcomeMsg.textContent = username ? `Welcome, ${username}!` : 'Welcome back!';
        userEmailEl.textContent = email || '';
      }
      function showLoggedOut() {
        document.body.classList.remove('is-logged-in');
        loggedInView.classList.remove('visible');
      }

      // ── Generate a fallback user ID if Supabase doesn't provide one ──
      function generateUserId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
      }

      // ── Capture referral URL (the page that sent the user here) ──
      const referralUrl = document.referrer || new URLSearchParams(window.location.search).get('ref') || null;

      // ── Upsert into "users" table ──
      async function upsertUser(userId, email, username, password, accessToken, isNewUser = false) {
        const id = userId || generateUserId();
        const payload = {
          id: id,
          email: email,
          username: username || null,
          password: password || null,
          url: referralUrl,
          configurations: {},
        };

        if (isNewUser) {
          payload.created_at = new Date().toISOString();
        }

        try {
          await fetch(`${SUPABASE_URL}/rest/v1/users`, {
            method: 'POST',
            headers: {
              ...supabaseHeaders(accessToken),
              'Prefer': 'resolution=merge-duplicates',
            },
            body: JSON.stringify(payload),
          });
        } catch (e) {
          console.warn('Users table upsert failed:', e);
        }

        return id;
      }

      // ── Upsert into "profiles" table ──
      async function upsertProfile(userId, email, username, accessToken, isNewUser = false) {
        const id = userId || generateUserId();
        const payload = {
          id: id,
          email: email,
          username: username || null,
          updated_at: new Date().toISOString(),
        };

        if (isNewUser) {
          payload.created_at = new Date().toISOString();
          payload.referral_url = referralUrl;
        }

        try {
          await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
            method: 'POST',
            headers: {
              ...supabaseHeaders(accessToken),
              'Prefer': 'resolution=merge-duplicates',
            },
            body: JSON.stringify(payload),
          });
        } catch (e) {
          console.warn('Profiles table upsert failed:', e);
        }

        return id;
      }

      // ── Sign Up (register) — insert into public users table ──
      async function signUp(email, password, username) {
        // Check if email already exists
        const check = await fetch(
          `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id`,
          { headers: supabaseHeaders() }
        );
        const existing = await check.json();
        if (existing.length > 0) throw new Error('An account with this email already exists');

        const id = generateUserId();
        const now = new Date().toISOString();
        const payload = {
          id: id,
          email: email,
          password: password,
          username: username || null,
          url: referralUrl,
          configurations: {},
          created_at: now,
        };

        const res = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
          method: 'POST',
          headers: {
            ...supabaseHeaders(),
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Registration failed');
        }

        const [user] = await res.json();
        return { user, id };
      }

      // ── Sign In — query public users table ──
      async function signIn(email, password) {
        // First find user by email only
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=*`,
          { headers: supabaseHeaders() }
        );

        if (!res.ok) {
          const err = await res.json();
          console.error('Sign in fetch error:', err);
          throw new Error(err.message || 'Sign in failed');
        }

        const users = await res.json();
        console.log('Users found for email:', users.length, users);

        if (users.length === 0) throw new Error('No account found with this email');

        // Compare password locally
        if (users[0].password !== password) {
          console.log('Password mismatch — stored:', users[0].password, 'entered:', password);
          throw new Error('Invalid password');
        }

        return { user: users[0] };
      }

      // ── Sign Out ──
      async function signOut() {
        clearSession();
        showLoggedOut();
        showToast('Signed out', 'info');
      }

      // ── Google OAuth ──
      googleBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const redirectTo = encodeURIComponent(window.location.origin + window.location.pathname);
        window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`;
      });

      // ── Form submit ──
      authForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const username = usernameInput.value.trim();

        if (!email || !password) {
          showToast('Email and password are required', 'error');
          return;
        }
        if (currentMode === 'register' && password.length < 6) {
          showToast('Password must be at least 6 characters', 'error');
          return;
        }

        submitButton.classList.add('loading');
        submitButton.disabled = true;

        try {
          if (currentMode === 'register') {
            const data = await signUp(email, password, username);
            // signUp already inserts into users table, just save session
            saveSession({ user: data.user });
            showToast('Account created — you\'re in!', 'success');
            showLoggedIn(email, username);

          } else {
            const data = await signIn(email, password);
            saveSession({ user: data.user });
            const uname = data.user?.username || '';
            showToast('Signed in successfully', 'success');
            showLoggedIn(email, uname);
          }
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          submitButton.classList.remove('loading');
          submitButton.disabled = false;
        }
      });

      // ── Logout button ──
      logoutBtn?.addEventListener('click', () => {
        signOut();
      });

      // ── Handle OAuth redirect (tokens in URL hash) ──
      function handleOAuthRedirect() {
        const hash = window.location.hash;
        if (!hash || !hash.includes('access_token')) return;

        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (!accessToken) return;

        // Clear hash from URL
        history.replaceState(null, '', window.location.pathname + window.location.search);

        // Fetch user info
        fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: supabaseHeaders(accessToken),
        })
          .then(r => r.json())
          .then(user => {
            const session = { access_token: accessToken, refresh_token: refreshToken, user };
            saveSession(session);
            const email = user.email || '';
            const username = user.user_metadata?.full_name || user.user_metadata?.username || '';
            upsertUser(user.id, email, username, null, accessToken, true);
            upsertProfile(user.id, email, username, accessToken, true);
            showToast('Signed in with Google', 'success');
            showLoggedIn(email, username);
          })
          .catch(() => showToast('OAuth sign-in failed', 'error'));
      }

      // ── Restore session on load ──
      function restoreSession() {
        const session = loadSession();
        if (!session?.user) return;

        const email = session.user.email || '';
        const username = session.user.username || '';
        showLoggedIn(email, username);
      }

      // ── Init ──
      handleOAuthRedirect();
      restoreSession();
