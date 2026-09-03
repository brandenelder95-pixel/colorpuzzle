import { getUncachableRevenueCatClient } from "./revenueCatClient";

import {
  listProjects,
  createProject,
  listApps,
  createApp,
  deleteApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const PROJECT_NAME = "Color Sort Puzzle";

// ── Products ────────────────────────────────────────────────────────────────
const REMOVE_ADS_ID         = "remove_ads";
const HINTS_10_ID           = "hints_10";
const PLAY_STORE_REMOVE_ADS = "remove_ads";
const PLAY_STORE_HINTS_10   = "hints_10";

// ── Entitlements ─────────────────────────────────────────────────────────────
const ENTITLEMENT_REMOVE_ADS_KEY  = "remove_ads";
const ENTITLEMENT_REMOVE_ADS_NAME = "Remove Ads";

// ── Offering & packages ───────────────────────────────────────────────────────
const OFFERING_KEY  = "default";
const OFFERING_NAME = "Default Offering";

const PKG_REMOVE_ADS_KEY  = "$rc_lifetime";   // standard RC key for non-consumable lifetime
const PKG_REMOVE_ADS_NAME = "Remove Ads";
const PKG_HINTS_KEY       = "hints_10";
const PKG_HINTS_NAME      = "10 Hints Pack";

// ── Prices (micros = dollars × 1 000 000) ────────────────────────────────────
const REMOVE_ADS_PRICES = [
  { amount_micros: 2990000, currency: "USD" },
  { amount_micros: 2790000, currency: "EUR" },
];
const HINTS_10_PRICES = [
  { amount_micros: 990000, currency: "USD" },
  { amount_micros: 990000, currency: "EUR" },
];

// ── App store identifiers — must match app.config.ts exactly ─────────────────
const APP_STORE_APP_NAME  = "Color Sort Puzzle iOS";
const APP_STORE_BUNDLE_ID = "com.colorsort.puzzle";   // matches ios.bundleIdentifier
const PLAY_STORE_APP_NAME = "Color Sort Puzzle Android";
const PLAY_STORE_PACKAGE  = "com.colorsort.puzzle";   // matches android.package

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

type RCClient = Awaited<ReturnType<typeof getUncachableRevenueCatClient>>;

async function ensureProduct(
  client: RCClient,
  projectId: string,
  targetApp: App,
  label: string,
  identifier: string,
  displayName: string,
  isTestStore: boolean,
  prices?: { amount_micros: number; currency: string }[],
): Promise<Product> {
  const { data: existing, error: listErr } = await listProducts({
    client,
    path: { project_id: projectId },
    query: { limit: 100 },
  });
  if (listErr) throw new Error("Failed to list products");

  const found = existing.items?.find(
    (p) => p.store_identifier === identifier && p.app_id === targetApp.id,
  );
  if (found) {
    console.log(`${label} product already exists: ${found.id}`);
    return found;
  }

  const productType = (identifier === REMOVE_ADS_ID || identifier === PLAY_STORE_REMOVE_ADS)
    ? "non_consumable"
    : "consumable";

  const body: CreateProductData["body"] = {
    store_identifier: identifier,
    app_id: targetApp.id,
    type: productType,
    display_name: displayName,
    ...(isTestStore ? { title: displayName } : {}),
  };

  const { data: created, error } = await createProduct({
    client,
    path: { project_id: projectId },
    body,
  });
  if (error) throw new Error(`Failed to create ${label} product: ${JSON.stringify(error)}`);
  console.log(`Created ${label} product: ${created.id}`);

  if (isTestStore && prices) {
    const { error: priceErr } = await client.post<TestStorePricesResponse>({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: projectId, product_id: created.id },
      body: { prices },
    });
    if (priceErr) {
      if (
        priceErr &&
        typeof priceErr === "object" &&
        "type" in priceErr &&
        priceErr["type"] === "resource_already_exists"
      ) {
        console.log(`Prices already set for ${label}`);
      } else {
        throw new Error(`Failed to add prices for ${label}: ${JSON.stringify(priceErr)}`);
      }
    } else {
      console.log(`Added test store prices for ${label}`);
    }
  }

  return created;
}

async function ensurePackage(
  client: RCClient,
  projectId: string,
  offeringId: string,
  lookupKey: string,
  displayName: string,
): Promise<Package> {
  const { data: existing, error: listErr } = await listPackages({
    client,
    path: { project_id: projectId, offering_id: offeringId },
    query: { limit: 50 },
  });
  if (listErr) throw new Error("Failed to list packages");

  const found = existing.items?.find((p) => p.lookup_key === lookupKey);
  if (found) {
    console.log(`Package ${lookupKey} already exists: ${found.id}`);
    return found;
  }

  const { data: created, error } = await createPackages({
    client,
    path: { project_id: projectId, offering_id: offeringId },
    body: { lookup_key: lookupKey, display_name: displayName },
  });
  if (error) throw new Error(`Failed to create package ${lookupKey}: ${JSON.stringify(error)}`);
  console.log(`Created package ${lookupKey}: ${created.id}`);
  return created;
}

/**
 * Ensure an App Store or Play Store app exists with the correct identifiers.
 * If an app with the given type exists but with the wrong bundle/package ID,
 * it is deleted and recreated so that production keys align with the Expo config.
 */
async function ensureStoreApp(
  client: RCClient,
  projectId: string,
  existingApps: App[],
  type: "app_store" | "play_store",
  appName: string,
  expectedId: string,   // bundle_id or package_name
): Promise<App> {
  const existing = existingApps.find((a) => a.type === type);

  // Check whether the existing app has the correct identifier
  const getStoreId = (a: App): string | undefined => {
    if (a.type === "app_store") return (a as any).app_store?.bundle_id;
    if (a.type === "play_store") return (a as any).play_store?.package_name;
    return undefined;
  };

  if (existing) {
    const currentId = getStoreId(existing);
    if (currentId === expectedId) {
      console.log(`${type} app OK (${expectedId}): ${existing.id}`);
      return existing;
    }
    // Wrong identifier — delete and recreate
    console.log(`${type} app has wrong ID "${currentId}", expected "${expectedId}". Deleting…`);
    const { error: delErr } = await deleteApp({
      client,
      path: { project_id: projectId, app_id: existing.id },
    });
    if (delErr) {
      console.warn(`Could not delete ${type} app (${delErr}), proceeding anyway`);
    }
  }

  const body =
    type === "app_store"
      ? { name: appName, type: "app_store" as const, app_store: { bundle_id: expectedId } }
      : { name: appName, type: "play_store" as const, play_store: { package_name: expectedId } };

  const { data: newApp, error } = await createApp({
    client,
    path: { project_id: projectId },
    body,
  });
  if (error) throw new Error(`Failed to create ${type} app: ${JSON.stringify(error)}`);
  console.log(`Created ${type} app (${expectedId}): ${newApp.id}`);
  return newApp;
}

async function seedColorSort() {
  const client = await getUncachableRevenueCatClient();

  // ── Project ──────────────────────────────────────────────────────────────
  let project: Project;
  const { data: projects, error: listProjErr } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (listProjErr) throw new Error("Failed to list projects");

  const existingProject = projects.items?.find((p) => p.name === PROJECT_NAME);
  if (existingProject) {
    console.log("Project already exists:", existingProject.id);
    project = existingProject;
  } else {
    const { data: newProject, error } = await createProject({
      client,
      body: { name: PROJECT_NAME },
    });
    if (error) throw new Error("Failed to create project");
    console.log("Created project:", newProject.id);
    project = newProject;
  }

  // ── Apps ─────────────────────────────────────────────────────────────────
  const { data: appsData, error: listAppsErr } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsErr || !appsData?.items.length) throw new Error("No apps found");

  const testApp = appsData.items.find((a) => a.type === "test_store");
  if (!testApp) throw new Error("No test store app found");
  console.log("Test store app:", testApp.id);

  // Ensure App Store and Play Store apps have the correct bundle/package identifiers
  const appStoreApp: App = await ensureStoreApp(
    client, project.id, appsData.items,
    "app_store", APP_STORE_APP_NAME, APP_STORE_BUNDLE_ID,
  );
  const playStoreApp: App = await ensureStoreApp(
    client, project.id, appsData.items,
    "play_store", PLAY_STORE_APP_NAME, PLAY_STORE_PACKAGE,
  );

  // ── Products ─────────────────────────────────────────────────────────────
  const [
    testRemoveAds, appStoreRemoveAds, playStoreRemoveAds,
    testHints10,   appStoreHints10,   playStoreHints10,
  ] = await Promise.all([
    ensureProduct(client, project.id, testApp,       "Test Remove Ads",      REMOVE_ADS_ID,        "Remove Ads",    true,  REMOVE_ADS_PRICES),
    ensureProduct(client, project.id, appStoreApp,   "AppStore Remove Ads",  REMOVE_ADS_ID,        "Remove Ads",    false),
    ensureProduct(client, project.id, playStoreApp,  "PlayStore Remove Ads", PLAY_STORE_REMOVE_ADS,"Remove Ads",    false),
    ensureProduct(client, project.id, testApp,       "Test Hints 10",        HINTS_10_ID,          "10 Hints Pack", true,  HINTS_10_PRICES),
    ensureProduct(client, project.id, appStoreApp,   "AppStore Hints 10",    HINTS_10_ID,          "10 Hints Pack", false),
    ensureProduct(client, project.id, playStoreApp,  "PlayStore Hints 10",   PLAY_STORE_HINTS_10,  "10 Hints Pack", false),
  ]);

  // ── Entitlement: remove_ads ───────────────────────────────────────────────
  const { data: entitlements, error: listEntErr } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listEntErr) throw new Error("Failed to list entitlements");

  let removeAdsEnt: Entitlement | undefined = entitlements.items?.find(
    (e) => e.lookup_key === ENTITLEMENT_REMOVE_ADS_KEY,
  );

  if (!removeAdsEnt) {
    const { data, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: {
        lookup_key: ENTITLEMENT_REMOVE_ADS_KEY,
        display_name: ENTITLEMENT_REMOVE_ADS_NAME,
      },
    });
    if (error) throw new Error("Failed to create remove_ads entitlement");
    console.log("Created remove_ads entitlement:", data.id);
    removeAdsEnt = data;
  } else {
    console.log("remove_ads entitlement exists:", removeAdsEnt.id);
  }

  const { error: attachEntErr } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: removeAdsEnt.id },
    body: {
      product_ids: [testRemoveAds.id, appStoreRemoveAds.id, playStoreRemoveAds.id],
    },
  });
  if (attachEntErr) {
    if (attachEntErr.type === "unprocessable_entity_error") {
      console.log("Products already attached to entitlement");
    } else {
      throw new Error("Failed to attach products to entitlement");
    }
  } else {
    console.log("Attached remove_ads products to entitlement");
  }

  // ── Offering ──────────────────────────────────────────────────────────────
  const { data: offerings, error: listOffErr } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOffErr) throw new Error("Failed to list offerings");

  let offering: Offering | undefined = offerings.items?.find(
    (o) => o.lookup_key === OFFERING_KEY,
  );
  if (!offering) {
    const { data, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_KEY, display_name: OFFERING_NAME },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("Created offering:", data.id);
    offering = data;
  } else {
    console.log("Offering exists:", offering.id);
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set offering as current");
  }

  // ── Packages (sequential to avoid RevenueCat resource-lock errors) ────────
  const removeAdsPkg = await ensurePackage(
    client, project.id, offering.id, PKG_REMOVE_ADS_KEY, PKG_REMOVE_ADS_NAME,
  );
  const hintsPkg = await ensurePackage(
    client, project.id, offering.id, PKG_HINTS_KEY, PKG_HINTS_NAME,
  );

  const attachPkg = async (pkg: Package, label: string, products: Product[]) => {
    const { error } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: {
        products: products.map((p) => ({ product_id: p.id, eligibility_criteria: "all" })),
      },
    });
    if (error) {
      if (
        error.type === "unprocessable_entity_error" &&
        error.message?.includes("Cannot attach product")
      ) {
        console.log(`${label}: package already has products`);
      } else {
        throw new Error(`Failed to attach products to ${label}: ${JSON.stringify(error)}`);
      }
    } else {
      console.log(`Attached products to ${label} package`);
    }
  };

  await Promise.all([
    attachPkg(removeAdsPkg, "remove_ads", [testRemoveAds, appStoreRemoveAds, playStoreRemoveAds]),
    attachPkg(hintsPkg,     "hints_10",   [testHints10,   appStoreHints10,   playStoreHints10]),
  ]);

  // ── Public API keys ───────────────────────────────────────────────────────
  const [{ data: testKeys }, { data: iosKeys }, { data: androidKeys }] = await Promise.all([
    listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: testApp.id } }),
    listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: appStoreApp.id } }),
    listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: playStoreApp.id } }),
  ]);

  console.log("\n====================");
  console.log("Color Sort RevenueCat setup complete!");
  console.log("Project ID:              ", project.id);
  console.log("Test Store App ID:       ", testApp.id);
  console.log("App Store App ID:        ", appStoreApp.id);
  console.log("Play Store App ID:       ", playStoreApp.id);
  console.log("remove_ads entitlement:  ", ENTITLEMENT_REMOVE_ADS_KEY);
  console.log("Test Store API Key:      ", testKeys?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("App Store API Key:       ", iosKeys?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("Play Store API Key:      ", androidKeys?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("\nSet these environment variables:");
  console.log("REVENUECAT_PROJECT_ID=                  ", project.id);
  console.log("REVENUECAT_TEST_STORE_APP_ID=           ", testApp.id);
  console.log("REVENUECAT_APPLE_APP_STORE_APP_ID=      ", appStoreApp.id);
  console.log("REVENUECAT_GOOGLE_PLAY_STORE_APP_ID=    ", playStoreApp.id);
  console.log("EXPO_PUBLIC_REVENUECAT_TEST_API_KEY=    ", testKeys?.items[0]?.key ?? "N/A");
  console.log("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=     ", iosKeys?.items[0]?.key ?? "N/A");
  console.log("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY= ", androidKeys?.items[0]?.key ?? "N/A");
  console.log("====================\n");
}

seedColorSort().catch(console.error);
