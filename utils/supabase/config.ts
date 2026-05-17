type SupabasePublicConfig = {
  key: string;
  keySource: "NEXT_PUBLIC_SUPABASE_ANON_KEY" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
  url: string;
  urlSource: "NEXT_PUBLIC_SUPABASE_URL";
};

  key: string;
  url: string;
};

function getSupabaseUrl():
  | { value: string; source: "SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_URL" }
  | null {
  const serverUrl = process.env.SUPABASE_URL?.trim();
  if (serverUrl) {
    return { value: serverUrl, source: "SUPABASE_URL" };
  }

  const nextPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (nextPublicUrl) {
    return { value: nextPublicUrl, source: "NEXT_PUBLIC_SUPABASE_URL" };
  }

  return null;
}

function getSupabasePublicKey():
  | {
      value: string;
      source:
        | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
    }
  | null {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (anonKey) {
    return { value: anonKey, source: "NEXT_PUBLIC_SUPABASE_ANON_KEY" };
  }

  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (publishableKey) {
    return {
      value: publishableKey,
      source: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    };
  }

  return null;
}

function getSupabaseSecretKey():
  | {
      value: string;
      source: "SUPABASE_SECRET_KEY" | "SUPABASE_SERVICE_ROLE_KEY";
    }
  | null {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (secretKey) {
    return { value: secretKey, source: "SUPABASE_SECRET_KEY" };
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRoleKey) {
    return { value: serviceRoleKey, source: "SUPABASE_SERVICE_ROLE_KEY" };
  }

  return null;
}

function buildMissingConfigMessage(context: string): string {
  return [
    `${context} requires Supabase runtime environment variables.`,
    "Expected URL: NEXT_PUBLIC_SUPABASE_URL.",
    "Expected public key: NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  ].join(" ");
}

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRoleKey) {
    "Expected URL: NEXT_PUBLIC_SUPABASE_URL.",
  }

  return null;
}

export function getSupabasePublicConfig(context: string): SupabasePublicConfig {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();

  if (!url || !key) {
    throw new Error(buildMissingConfigMessage(context));
  }

  return {
    key: key.value,
    keySource: key.source,
    url: url.value,
  };
}

  context: string,
): SupabaseServiceRoleConfig {
  const url = getSupabaseUrl();

  if (!url || !key) {
      [
        `${context} requires Supabase server environment variables.`,
        "Expected URL: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.",
        "Expected service role key: SUPABASE_SERVICE_ROLE_KEY.",
      ].join(" "),
    );
  }

  return {
    key: key.value,
    keySource: key.source,
    url: url.value,
    urlSource: url.source,
  };
}

export function getSupabasePublicConfigOrNull(
  context: string,
): SupabasePublicConfig | null {
  try {
    return getSupabasePublicConfig(context);
  } catch (error) {
    console.error(error);
    return null;
  }
}
