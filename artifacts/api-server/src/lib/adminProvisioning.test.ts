import assert from "node:assert/strict";
import test from "node:test";
import { getApprovedAdminIdentity, validateAdminDatabaseName } from "./adminProvisioning";

test("general-admin provisioning selects only the approved identity for a matching environment", () => {
  assert.equal(getApprovedAdminIdentity({
    target: "development",
    databaseEnvironment: "development",
    runtimeEnvironment: "development",
  }), "user_3KYSBjYciQwO16chJOa9n9B8niI");
  assert.equal(getApprovedAdminIdentity({
    target: "production",
    databaseEnvironment: "production",
    runtimeEnvironment: "production",
  }), "user_3I0EGGbY1IHz35wh8oxfl8BQUYC");
  for (const values of [
    { target: undefined, databaseEnvironment: "development", runtimeEnvironment: "development" },
    { target: "production", databaseEnvironment: "development", runtimeEnvironment: "production" },
    { target: "development", databaseEnvironment: "development", runtimeEnvironment: "production" },
    { target: "other", databaseEnvironment: "other", runtimeEnvironment: "other" },
  ]) {
    assert.throws(() => getApprovedAdminIdentity(values));
  }
  assert.throws(() => validateAdminDatabaseName("cloudpainter_dev", "cloudpainter_prod"));
  assert.throws(() => validateAdminDatabaseName("cloudpainter_dev", undefined));
  assert.doesNotThrow(() => validateAdminDatabaseName("cloudpainter_dev", "cloudpainter_dev"));
});
