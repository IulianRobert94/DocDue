/**
 * DocDue — In-App Purchase Service (RevenueCat)
 *
 * Manages one-time PRO purchase (non-consumable) via RevenueCat.
 * Call initializeIAP() on app launch.
 *
 * Setup:
 * 1. Create a RevenueCat account at https://app.revenuecat.com
 * 2. Add your iOS/Android app and create a non-consumable product (lifetime)
 * 3. Set real API keys in .env file
 * 4. Configure a single offering with the lifetime product in RevenueCat dashboard
 */

import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";
import { Platform } from "react-native";

// ─── Configuration ───────────────────────────────────────
// Set real keys in .env file (never commit .env to git)

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "YOUR_REVENUECAT_IOS_API_KEY";
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "YOUR_REVENUECAT_ANDROID_API_KEY";

// Entitlement ID configured in RevenueCat dashboard
const PRO_ENTITLEMENT = "pro";

// ─── Initialization ─────────────────────────────────────

let _initialized = false;

export async function initializeIAP(): Promise<void> {
  if (_initialized) return;
  try {
    const apiKey = Platform.OS === "ios" ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;

    // Skip initialization if API keys aren't set yet
    if (apiKey.startsWith("YOUR_")) {
      if (__DEV__) console.log("DocDue: RevenueCat not configured — using early access mode");
      return;
    }

    Purchases.configure({ apiKey });
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
    _initialized = true;
  } catch (e) {
    if (__DEV__) console.warn("DocDue: IAP init error", e);
  }
}

// ─── Check Premium Status ────────────────────────────────

export async function checkPremiumStatus(): Promise<boolean> {
  if (!_initialized) return false;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
  } catch {
    return false;
  }
}

// ─── Get Offerings (Packages) ────────────────────────────

export interface IAPPackage {
  id: string;
  type: "monthly" | "annual" | "lifetime";
  price: string;
  pricePerMonth?: string;
  package: PurchasesPackage;
}

export async function getOfferings(): Promise<IAPPackage[]> {
  if (!_initialized) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return [];

    const packages: IAPPackage[] = [];
    for (const pkg of current.availablePackages) {
      const product = pkg.product;
      const id = pkg.identifier;

      let type: IAPPackage["type"] = "monthly";
      if (id.includes("annual") || id.includes("yearly")) type = "annual";
      else if (id.includes("lifetime")) type = "lifetime";

      packages.push({
        id,
        type,
        price: product.priceString,
        pricePerMonth: type === "annual"
          ? `${(product.price / 12).toFixed(2)} ${product.currencyCode}`
          : undefined,
        package: pkg,
      });
    }

    // Sort: annual first, then monthly, then lifetime
    const order = { annual: 0, monthly: 1, lifetime: 2 };
    return packages.sort((a, b) => order[a.type] - order[b.type]);
  } catch {
    return [];
  }
}

// ─── Purchase ────────────────────────────────────────────

export type PurchaseResult =
  | { success: true; customerInfo: CustomerInfo }
  | { success: false; cancelled: boolean; error?: string };

export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPro = customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
    if (isPro) {
      return { success: true, customerInfo };
    }
    return { success: false, cancelled: false, error: "Entitlement not granted" };
  } catch (e: unknown) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err.userCancelled) {
      return { success: false, cancelled: true };
    }
    return { success: false, cancelled: false, error: err.message || "Purchase failed" };
  }
}

// ─── Restore Purchases ──────────────────────────────────

export async function restorePurchases(): Promise<boolean> {
  if (!_initialized) return false;
  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
  } catch {
    return false;
  }
}

// ─── Check if RevenueCat is configured ──────────────────

export function isIAPConfigured(): boolean {
  return _initialized;
}
