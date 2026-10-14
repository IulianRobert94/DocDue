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
type PurchaseError = import("react-native-iap").PurchaseError;

// ─── Configuration ───────────────────────────────────────

const PRODUCT_ID = "com.docdueapp.pro.lifetime";

// ─── State ──────────────────────────────────────────────

let _initialized = false;
type Sub = { remove: () => void };
let _purchaseUpdateSub: Sub | null = null;
let _purchaseErrorSub: Sub | null = null;
// One-shot resolver for an in-flight purchasePackage() call.
let _pendingPurchase: ((result: PurchaseResult) => void) | null = null;
// Invoked whenever a purchase is confirmed — including async/deferred delivery
// that arrives after purchasePackage() already returned — so the app persists PRO.
let _onPremiumGranted: (() => void) | null = null;

/** Register an app-level callback that grants PRO when any purchase is confirmed. */
export function setPremiumGrantedCallback(cb: (() => void) | null): void {
  _onPremiumGranted = cb;
}

/**
 * A purchase grants PRO only if it's our product and the store confirmed it.
 * "pending" (Ask-to-Buy / slow payment) and "unknown" (unspecified Play state)
 * are not payments yet — iOS reports restored purchases as "purchased" too.
 */
function isOwnedPro(p: Purchase): boolean {
  return p.productId === PRODUCT_ID && p.purchaseState === "purchased";
}

/** Robust cancel detection across lib versions (v14 uses "user-cancelled"; legacy used "E_USER_CANCELLED"). */
function isCancelled(code?: string, message?: string): boolean {
  const c = String(code || "").toLowerCase();
  return c.includes("cancel") || !!message?.toLowerCase().includes("cancel");
}

// ─── Initialization ─────────────────────────────────────
// Connects to Apple/Google billing servers.
// In Expo Go this will fail (no native module) — that's expected.

/**
 * Register Apple/Google purchase event listeners. Modern react-native-iap
 * (StoreKit 2 / Play Billing) delivers purchases asynchronously here, so this is
 * where we finish the transaction and grant PRO. Defensive: a no-op if the module
 * doesn't expose the listeners (older native module / Expo Go / tests) — the
 * fallback path in purchasePackage() handles those cases.
 */
function registerPurchaseListeners(iap: NonNullable<typeof _iap>): void {
  if (_purchaseUpdateSub) return; // already registered
  if (typeof iap.purchaseUpdatedListener !== "function") return;
  _purchaseUpdateSub = iap.purchaseUpdatedListener((purchase: Purchase) => {
    if (purchase.productId !== PRODUCT_ID) return;
    if (purchase.purchaseState !== "purchased") {
      // Payment not confirmed yet (Android Ask-to-Buy / slow payment method,
      // or an unspecified store state).
      // Don't grant PRO and don't finish the transaction — the store fires
      // this listener again (or getAvailablePurchases returns the purchase)
      // once the payment is actually confirmed.
      const resolve = _pendingPurchase;
      _pendingPurchase = null;
      resolve?.({ success: false, cancelled: false, pending: true });
      return;
    }
    // Must finish the transaction or Apple/Google will auto-refund it.
    iap.finishTransaction({ purchase, isConsumable: false })
      .catch(() => iap.finishTransaction({ purchase, isConsumable: false }).catch(() => { /* store will retry */ }));
    _onPremiumGranted?.();
    const resolve = _pendingPurchase;
    _pendingPurchase = null;
    resolve?.({ success: true });
  });
  if (typeof iap.purchaseErrorListener === "function") {
    _purchaseErrorSub = iap.purchaseErrorListener((error: PurchaseError) => {
      const resolve = _pendingPurchase;
      _pendingPurchase = null;
      if (!resolve) return;
      resolve(
        isCancelled(String(error?.code), error?.message)
          ? { success: false, cancelled: true }
          : { success: false, cancelled: false, error: error?.message || "Purchase failed" }
      );
    });
  }
}

export async function initializeIAP(): Promise<void> {
  if (_initialized) return;
  try {
    const iap = await getIAP();
    if (!iap) { if (__DEV__) console.log("DocDue: IAP not available — IAP module not available (Expo Go or store unavailable)"); return; }
    await iap.initConnection();
    registerPurchaseListeners(iap);
    _initialized = true;
    if (__DEV__) console.log("DocDue: IAP connected to store");
  } catch {
    // Expected in Expo Go or when store is unavailable
    if (__DEV__) console.log("DocDue: IAP not available — IAP module not available (Expo Go or store unavailable)");
  }
}

// ─── Check Premium Status ────────────────────────────────
// Checks if user has previously purchased the PRO product.

export async function checkPremiumStatus(): Promise<boolean | null> {
  if (!_initialized) return null;
  try {
    const iap = await getIAP();
    if (!iap) return null;
    const purchases = await iap.getAvailablePurchases();
    return purchases.some(isOwnedPro);
  } catch {
    // Query failed (offline / throttled / store outage). Return null so the
    // caller can tell "failed" from "confirmed not owned" and NOT downgrade.
    return null;
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
  | { success: false; cancelled: boolean; pending?: boolean; error?: string };

export async function purchasePackage(productId: string): Promise<PurchaseResult> {
  const iap = await getIAP();
  if (!iap) return { success: false, cancelled: false, error: "IAP not available" };

  // Modern flow: the purchase is delivered asynchronously to the listeners
  // registered at init. requestPurchase() often resolves with NO object, so we
  // must not treat that as failure — wait for purchaseUpdated / purchaseError.
  if (_purchaseUpdateSub) {
    return new Promise<PurchaseResult>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const handler = (result: PurchaseResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (_pendingPurchase === handler) _pendingPurchase = null;
        resolve(result);
      };
      _pendingPurchase = handler;
      // Safety net so the UI spinner never hangs if no event ever arrives.
      timer = setTimeout(() => handler({ success: false, cancelled: false, error: "Purchase timed out" }), 90000);
      Promise.resolve(
        iap.requestPurchase({
          request: {
            apple: { sku: productId, andDangerouslyFinishTransactionAutomatically: false },
            google: { skus: [productId] },
          },
          type: "in-app",
        })
      ).catch((e: unknown) => {
        const err = e as { code?: string; message?: string };
        handler(
          isCancelled(err.code, err.message)
            ? { success: false, cancelled: true }
            : { success: false, cancelled: false, error: err.message || "Purchase failed" }
        );
      });
    });
  }

  // Fallback (older native module / tests without listeners): trust the return.
  try {
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
      if (p.purchaseState === "pending" || p.purchaseState === "unknown") {
        // Same rule as the listener path: no PRO for an unconfirmed payment.
        return { success: false, cancelled: false, pending: true };
      }
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
      _onPremiumGranted?.();
      return { success: true };
    }
    return { success: false, cancelled: false, error: "No purchase returned" };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (isCancelled(err.code, err.message)) {
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
    return purchases.some(isOwnedPro);
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
    _purchaseUpdateSub?.remove();
    _purchaseErrorSub?.remove();
    _purchaseUpdateSub = null;
    _purchaseErrorSub = null;
    const iap = await getIAP();
    if (iap) await iap.endConnection();
    _initialized = false;
  } catch {
    // Ignore cleanup errors
  }
}
