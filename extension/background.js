const runtime = globalThis.browser ?? globalThis.chrome;

runtime.runtime.onInstalled.addListener(() => {
  console.info("Uncommon Hacks extension installed");
});

runtime.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "peerpod.googleAuth") {
    return false;
  }

  completeGoogleAuth(message).then(
    () => {
      sendResponse({ ok: true });
    },
    (error) => {
      sendResponse({
        error: error instanceof Error ? error.message : "Google sign-in failed.",
        ok: false,
      });
    },
  );

  return true;
});

async function completeGoogleAuth(message) {
  const { authUrl, storageKey, supabaseKey, supabaseUrl } = message;

  if (!authUrl || !storageKey || !supabaseKey || !supabaseUrl) {
    throw new Error("The extension is missing Google sign-in configuration.");
  }

  const responseUrl = await launchIdentityFlow(authUrl);
  if (!responseUrl) {
    throw new Error("Google sign-in was cancelled.");
  }

  const session = await createSupabaseSession(responseUrl, {
    storageKey,
    supabaseKey,
    supabaseUrl,
  });

  await storageSet({ [storageKey]: JSON.stringify(session) });
}

async function createSupabaseSession(
  responseUrl,
  { storageKey, supabaseKey, supabaseUrl },
) {
  const url = new URL(responseUrl);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (accessToken && refreshToken) {
    const expiresIn = Number(hashParams.get("expires_in") ?? 3600);
    const user = await fetchSupabaseUser({
      accessToken,
      supabaseKey,
      supabaseUrl,
    });

    return {
      access_token: accessToken,
      expires_at: Math.round(Date.now() / 1000) + expiresIn,
      expires_in: expiresIn,
      provider_refresh_token: hashParams.get("provider_refresh_token") ?? null,
      provider_token: hashParams.get("provider_token") ?? null,
      refresh_token: refreshToken,
      token_type: hashParams.get("token_type") ?? "bearer",
      user,
    };
  }

  const code = url.searchParams.get("code");
  if (code) {
    return await exchangeCodeForSession({
      code,
      storageKey,
      supabaseKey,
      supabaseUrl,
    });
  }

  throw new Error("The identity provider did not return a Supabase session.");
}

async function exchangeCodeForSession({
  code,
  storageKey,
  supabaseKey,
  supabaseUrl,
}) {
  const verifierKey = `${storageKey}-code-verifier`;
  const codeVerifier = await storageGet(verifierKey);

  if (typeof codeVerifier !== "string") {
    throw new Error("The extension could not find the Google sign-in verifier.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
    body: JSON.stringify({
      auth_code: code,
      code_verifier: codeVerifier,
    }),
    headers: {
      apikey: supabaseKey,
      "content-type": "application/json",
    },
    method: "POST",
  });

  const session = await readSupabaseJson(response);
  await storageRemove(verifierKey);

  const expiresIn = Number(session.expires_in ?? 3600);
  return {
    ...session,
    expires_at: session.expires_at ?? Math.round(Date.now() / 1000) + expiresIn,
    expires_in: expiresIn,
  };
}

async function fetchSupabaseUser({ accessToken, supabaseKey, supabaseUrl }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${accessToken}`,
    },
  });

  return await readSupabaseJson(response);
}

async function readSupabaseJson(response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error_description ??
        data?.msg ??
        data?.message ??
        "Supabase could not complete Google sign-in.",
    );
  }

  return data;
}

async function launchIdentityFlow(url) {
  return await new Promise((resolve, reject) => {
    const maybePromise = runtime.identity.launchWebAuthFlow(
      { interactive: true, url },
      (responseUrl) => {
        const message = runtime.runtime.lastError?.message;
        if (message) {
          reject(new Error(message));
          return;
        }

        resolve(responseUrl);
      },
    );

    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then(resolve, reject);
    }
  });
}

async function storageGet(key) {
  const items = await new Promise((resolve, reject) => {
    const maybePromise = runtime.storage.local.get(key, (value) => {
      const message = runtime.runtime.lastError?.message;
      if (message) {
        reject(new Error(message));
        return;
      }

      resolve(value);
    });

    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then(resolve, reject);
    }
  });

  return items?.[key] ?? null;
}

async function storageRemove(key) {
  await new Promise((resolve, reject) => {
    const maybePromise = runtime.storage.local.remove(key, () => {
      const message = runtime.runtime.lastError?.message;
      if (message) {
        reject(new Error(message));
        return;
      }

      resolve();
    });

    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then(resolve, reject);
    }
  });
}

async function storageSet(items) {
  await new Promise((resolve, reject) => {
    const maybePromise = runtime.storage.local.set(items, () => {
      const message = runtime.runtime.lastError?.message;
      if (message) {
        reject(new Error(message));
        return;
      }

      resolve();
    });

    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then(resolve, reject);
    }
  });
}
