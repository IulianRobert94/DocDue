/**
 * DocDue — In-App Purchase Service (react-native-iap)
 *
 * Manages one-time PRO purchase (non-consumable).
 * Connects directly to Apple StoreKit / Google Play Billing.
 * No external service needed — all communication is direct.
 *
 * Setup:
 * 1. Create the product in App Store Connect (Non-Consumable)
 * 2. Create the product in Google Play Console (In-app product)
 * 3. Both with Product ID: com.docdueapp.pro.lifetime
 */

// Lazy-load react-native-iap to avoid crash in Expo Go (NitroModules not supported)
let _iap: typeof import("react-native-iap") | null = null;
async function getIAP() {
  if (!_iap) {
    try {
      _iap = await import("react-native-iap");
    } catch {
      _iap = null;
    }
  }
  return _iap;
}

type Product = import("react-native-iap").Product;
type Purchase = import("react-native-iap").Purchase;

// ─── Configuration ───────────────────────────────────────

const PRODUCT_ID = "com.docdueapp.pro.lifetime";

// ─── State ──────────────────────────────────────────────

let _initialized = false;

// ─── Initialization ─────────────────────────────────────
// Connects to Apple/Google billing servers.
// In Expo Go this will fail (no native module) — that's expected.

export async function initializeIAP(): Promise<void> {
  if (_initialized) return;
  try {
    const iap = await getIAP();
    if (!iap) { if (__DEV__) console.log("DocDue: IAP not available — IAP module not available (Expo Go or store unavailable)"); return; }
    await iap.initConnection();
    _initialized = true;
    if (__DEV__) console.log("DocDue: IAP connected to store");
  } catch (e) {
    // Expected in Expo Go or when store is unavailable
    if (__DEV__) console.log("DocDue: IAP not available — IAP module not available (Expo Go or store unavailable)");
  }
}

// ─── Check Premium Status ────────────────────────────────
// Checks if user has previously purchased the PRO product.

export async function checkPremiumStatus(): Promise<boolean> {
  if (!_initialized) return false;
  try {
    const iap = await getIAP();
    if (!iap) return false;
    const purchases = await iap.getAvailablePurchases();
    return purchases.some((p) => p.productId === PRODUCT_ID);
  } catch {
    return false;
  }
}

// ─── Get Products ───────────────────────────────────────
// Fetches product info (price, title) from the store.

export interface IAPPackage {
  id: string;
  type: "monthly" | "annual" | "lifetime";
  price: string;
  pricePerMonth?: string;
  productId: string;
}

export async function getOfferings(): Promise<IAPPackage[]> {
  if (!_initialized) return [];
  try {
    const iap = await getIAP();
    if (!iap) return [];
    const products = (await iap.fetchProducts({ skus: [PRODUCT_ID], type: "in-app" })) as Product[] | null;
    if (!products) return [];
    return products.map((product) => ({
      id: product.id,
      type: "lifetime" as const,
      price: product.displayPrice,
      productId: product.id,
    }));
  } catch {
    return [];
  }
}

// ─── Purchase ────────────────────────────────────────────
// Initiates purchase flow. Apple/Google shows their native payment sheet.
// CRITICAL: finishTransaction() must be called or the purchase gets refunded.

export type PurchaseResult =
  | { success: true }
  | { success: false; cancelled: boolean; error?: string };

export async function purchasePackage(productId: string): Promise<PurchaseResult> {
  try {
    const iap = await getIAP();
    if (!iap) return { success: false, cancelled: false, error: "IAP not available" };
    const purchase = await iap.requestPurchase({
      request: {
        apple: { sku: productId, andDangerouslyFinishTransactionAutomatically: false },
        google: { skus: [productId] },
      },
      type: "in-app",
    }) as Purchase | Purchase[] | null;

    // Android returns array, iOS returns single object
    const p = Array.isArray(purchase) ? purchase[0] : purchase;
    if (p) {
      try {
        await iap.finishTransaction({ purchase: p, isConsumable: false });
      } catch (finishError) {
        if (__DEV__) console.warn("DocDue: finishTransaction failed, retrying", finishError);
        try {
          await iap.finishTransaction({ purchase: p, isConsumable: false });
        } catch {
          if (__DEV__) console.warn("DocDue: finishTransaction retry failed — store will auto-retry");
        }
      }
      return { success: true };
    }
    return { success: false, cancelled: false, error: "No purchase returned" };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "E_USER_CANCELLED" || err.message?.includes("cancel")) {
      return { success: false, cancelled: true };
    }
    return { success: false, cancelled: false, error: err.message || "Purchase failed" };
  }
}

// ─── Restore Purchases ──────────────────────────────────
// Checks Apple/Google for previous purchases on this account.
// Required by Apple App Store guidelines.

export async function restorePurchases(): Promise<boolean> {
  if (!_initialized) return false;
  try {
    const iap = await getIAP();
    if (!iap) return false;
    const purchases = await iap.getAvailablePurchases();
    return purchases.some((p) => p.productId === PRODUCT_ID);
  } catch {
    return false;
  }
}

// ─── Check if IAP is available ──────────────────────────

export function isIAPConfigured(): boolean {
  return _initialized;
}

// ─── Cleanup (optional, called on app unmount) ──────────

export async function endIAP(): Promise<void> {
  if (!_initialized) return;
  try {
    const iap = await getIAP();
    if (iap) await iap.endConnection();
    _initialized = false;
  } catch {
    // Ignore cleanup errors
  }
}
