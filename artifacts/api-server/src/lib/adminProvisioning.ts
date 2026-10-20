const approvedUsers = {
  development: "user_3KYSBjYciQwO16chJOa9n9B8niI",
  production: "user_3I0EGGbY1IHz35wh8oxfl8BQUYC",
} as const;

type TargetEnvironment = keyof typeof approvedUsers;

export function getApprovedAdminIdentity(values: {
  target: string | undefined;
  databaseEnvironment: string | undefined;
  runtimeEnvironment: string | undefined;
}): string {
  const { target, databaseEnvironment, runtimeEnvironment } = values;
  if (target !== "development" && target !== "production") {
    throw new Error("Set CLOUDPAINTER_ADMIN_TARGET_ENV to development or production.");
  }
  if (databaseEnvironment !== target || runtimeEnvironment !== target) {
    throw new Error("Admin provisioning stopped: the selected target, database environment, and NODE_ENV must all match.");
  }
  return approvedUsers[target as TargetEnvironment];
}

export function validateAdminDatabaseName(expected: string, actual: string | undefined): void {
  if (!expected.trim() || !actual || actual !== expected) {
    throw new Error("Admin provisioning stopped: the connected database name does not match CLOUDPAINTER_DATABASE_NAME.");
  }
}
