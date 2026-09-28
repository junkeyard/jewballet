type ServerEnvName =
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "ADMIN_ACCESS_PASSWORD"
  | "ADMIN_SESSION_SECRET";

function requireServerEnv(name: ServerEnvName) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const serverEnv = {
  get supabaseServiceRoleKey() {
    return requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  get adminAccessPassword() {
    return requireServerEnv("ADMIN_ACCESS_PASSWORD");
  },
  get adminSessionSecret() {
    return requireServerEnv("ADMIN_SESSION_SECRET");
  },
};
