import crypto from "node:crypto";
import { WebhookVerificationError } from "@agentaos/pay";

export function createAgentaProductHelpers({ premium, credits1, credits5, credits10 }) {
  const products = new Map([
    [String(premium || ""), { kind: "premium", credits: 0 }],
    [String(credits1 || ""), { kind: "credits", credits: 1 }],
    [String(credits5 || ""), { kind: "credits", credits: 5 }],
    [String(credits10 || ""), { kind: "credits", credits: 10 }]
  ]);
  products.delete("");
  return {
    productForPack(pack) {
      const count = Number(pack);
      return count === 1 ? String(credits1 || "") : count === 5 ? String(credits5 || "") : count === 10 ? String(credits10 || "") : "";
    },
    productForPlan(plan) { return plan === "premium" ? String(premium || "") : ""; },
    productDetails(id) { return products.get(String(id || "")) || null; }
  };
}

export function registerAgentaCheckoutRoutes({ app, AgentaOS, products, User, Firma, requireUserSession, requireRole, sendError, FRONTEND_BASE_URL, FRONTEND_SUCCESS_URL, errorWithTime, getPayNowFirm, CheckoutAttempt }) {
  async function startCheckout({ productId, email, name, metadata, successUrl }) {
    if (!AgentaOS) throw new Error("AgentaOS is not configured");
    if (!productId) throw new Error("AgentaOS product is not configured");
    const scope = [metadata.userId || "pay-now", metadata.firmId || "", productId].join(":");
    const now = new Date();
    let attempt;
    if (CheckoutAttempt) {
      attempt = await CheckoutAttempt.findOne({ scope }).lean();
      if (attempt?.status === "pending" && attempt.expires_at > now && attempt.checkout_url) return { checkoutUrl: attempt.checkout_url, sessionId: attempt.session_id };
      if (attempt) {
        const key = crypto.randomUUID();
        const renewed = await CheckoutAttempt.findOneAndUpdate({ scope, idempotency_key: attempt.idempotency_key, $or: [{ status: "completed" }, { expires_at: { $lte: now } }] }, { $set: { status: "creating", expires_at: new Date(now.getTime() + 30 * 60_000), idempotency_key: key }, $unset: { checkout_url: 1, session_id: 1 } }, { new: true });
        attempt = renewed || await CheckoutAttempt.findOne({ scope }).lean();
      } else {
        try { attempt = await CheckoutAttempt.create({ scope, idempotency_key: crypto.randomUUID(), status: "creating", expires_at: new Date(now.getTime() + 30 * 60_000) }); }
        catch (error) { if (!duplicateKey(error)) throw error; attempt = await CheckoutAttempt.findOne({ scope }).lean(); }
      }
    }
    let checkout;
    try {
      checkout = await AgentaOS.checkouts.create({
        linkId: productId,
        buyerEmail: email,
        ...(name ? { buyerName: name } : {}),
        metadata,
        successUrl,
        expiresIn: 1800
      }, { idempotencyKey: attempt?.idempotency_key || crypto.randomUUID() });
    } catch (error) {
      throw error;
    }
    if (CheckoutAttempt && attempt) await CheckoutAttempt.updateOne({ scope, idempotency_key: attempt.idempotency_key }, { $set: { status: "pending", checkout_url: checkout.checkoutUrl, session_id: checkout.sessionId } });
    return { checkoutUrl: checkout.checkoutUrl, sessionId: checkout.sessionId };
  }

  app.post("/agentaos/credits/buy", requireUserSession, requireRole("client"), async (req, res) => {
    try {
      const pack = Number(req.body?.pack);
      const productId = products.productForPack(pack);
      if (!productId) return sendError(res, 400, "INVALID_CREDIT_PACK");
      const user = req.authUser;
      if (!user?._id) return sendError(res, 401, "UNAUTHORIZED");
      const result = await startCheckout({
        productId,
        email: user.email,
        name: `${user.name || ""} ${user.surname || ""}`.trim(),
        metadata: { productId, productKind: "credits", userId: String(user._id) },
        successUrl: `${FRONTEND_BASE_URL}/buy-credits.html?success=1&pack=${pack}&before=${Number(user.credits || 0)}`
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      errorWithTime("AGENTAOS CREDIT CHECKOUT ERROR:", err);
      return sendError(res, 502, "CHECKOUT_CREATE_FAILED");
    }
  });

  app.post("/agentaos/pro/premium/checkout", requireUserSession, requireRole("pro"), async (req, res) => {
    try {
      const user = req.authUser;
      const firmId = String(req.body?.firmId || "").trim();
      if (!firmId || !user?._id) return sendError(res, 400, "MISSING_FIELDS");
      const firm = await Firma.findById(firmId).select("_id email name owner_user_id plan").lean();
      if (!firm) return sendError(res, 404, "FIRM_NOT_FOUND");
      if (String(firm.owner_user_id || "") !== String(user._id)) return sendError(res, 403, "FORBIDDEN");
      const productId = products.productForPlan("premium");
      if (!productId) return sendError(res, 500, "PREMIUM_PRODUCT_NOT_CONFIGURED");
      const result = await startCheckout({
        productId,
        email: firm.email || user.email,
        name: firm.name,
        metadata: { productId, productKind: "premium", firmId: String(firm._id), userId: String(user._id) },
        successUrl: `${FRONTEND_BASE_URL}/pro-dashboard.html?premium=success`
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      errorWithTime("AGENTAOS PREMIUM CHECKOUT ERROR:", err);
      return sendError(res, 502, "CHECKOUT_CREATE_FAILED");
    }
  });

  app.get("/agentaos/pay-now/checkout", async (req, res) => {
    try {
      if (String(req.query?.plan || "").trim().toLowerCase() !== "premium") return sendError(res, 400, "INVALID_PLAN");
      const firm = await getPayNowFirm(req);
      if (!firm) return sendError(res, 400, "INVALID_OR_EXPIRED_LINK");
      const productId = products.productForPlan("premium");
      if (!productId) return sendError(res, 500, "PREMIUM_PRODUCT_NOT_CONFIGURED");
      const result = await startCheckout({
        productId,
        email: firm.email,
        name: firm.name,
        metadata: { productId, productKind: "premium", firmId: String(firm._id), payNow: "true" },
        successUrl: `${FRONTEND_SUCCESS_URL}?payment=agentaos-premium&firmId=${encodeURIComponent(String(firm._id))}&email=${encodeURIComponent(firm.email || "")}`
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      errorWithTime("AGENTAOS PAY-NOW CHECKOUT ERROR:", err);
      return sendError(res, 502, "CHECKOUT_CREATE_FAILED");
    }
  });
}

function duplicateKey(error) { return error?.code === 11000; }

export async function handleAgentaOSWebhook({ rawBody, signature, secret, client, ...processing }) {
  if (!secret || !client) return { status: 503, text: "Webhook is not configured" };
  try {
    const event = client.webhooks.verify(rawBody, signature, secret);
    return await processAgentaOSWebhook({ ...processing, event });
  } catch (error) {
    if (error instanceof WebhookVerificationError) return { status: 400, text: "Invalid signature" };
    throw error;
  }
}

const MAX_WEBHOOK_ATTEMPTS = 8;
const MAX_PROJECTION_ATTEMPTS = 8;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60 * 60_000;

function retryDelay(attempt) {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.max(0, attempt - 1)));
}

function safeFailureMessage(error) {
  return String(error?.message || "AgentaOS processing failed")
    .replace(/(?:sk_(?:test|live)_|whsec_)[A-Za-z0-9_-]+/gi, "[redacted]")
    .slice(0, 500);
}

function isPermanentEventError(error) {
  return error?.permanent === true;
}

class PermanentAgentaEventError extends Error {
  constructor(message) { super(message); this.name = "PermanentAgentaEventError"; this.permanent = true; }
}

function transactionUnsupported(error) {
  const message = String(error?.message || "");
  return [20, 303, 40573].includes(Number(error?.code)) ||
    /transactions? (?:are|is) not supported|replica set|mongos|Transaction numbers are only allowed/i.test(message);
}

async function runMongoTransaction(Model, callback) {
  const connection = Model?.db;
  if (typeof connection?.startSession !== "function") return { supported: false };
  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => callback(session));
    return { supported: true };
  } catch (error) {
    if (transactionUnsupported(error)) return { supported: false };
    throw error;
  } finally {
    await session.endSession();
  }
}

async function acquireEvent({ EventReceipt, eventId, eventType, token, event }) {
  const eventKey = receiptKey(event);
  try {
    await EventReceipt.create({ event_key: eventKey, event_id: eventId, event_type: eventType, status: "processing", claim_token: token, lease_until: new Date(Date.now() + 30_000), event_payload: event, attempt_count: 1 });
    return "claimed";
  } catch (error) {
    if (!duplicateKey(error)) throw error;
  }
  const prior = await EventReceipt.findOne({ event_key: eventKey }).lean();
  if (["processed", "permanent_failed"].includes(prior?.status) && eventType !== "subscription.updated") return "processed";
  const now = new Date();
  // Receipts written by the previous AgentaOS implementation have only event_id.
  // Migrate a matching retry in place so the retained unique event_id index does
  // not turn an old delivery into an unclaimable event.
  const legacy = !prior ? await EventReceipt.findOne({ event_id: eventId, event_key: { $exists: false } }).lean() : null;
  if (legacy) {
    if (["processed", "permanent_failed"].includes(legacy.status) && eventType !== "subscription.updated") return "processed";
    const legacyClaim = await EventReceipt.findOneAndUpdate({
      event_id: eventId,
      event_key: { $exists: false },
      $or: [{ status: "failed" }, { status: "retry_wait", next_retry_at: { $lte: now } }, { status: "processing", lease_until: { $lte: now } }, ...(eventType === "subscription.updated" ? [{ status: "processed" }] : [])]
    }, { $set: { event_key: eventKey, event_type: eventType, event_payload: event, status: "processing", claim_token: token, lease_until: new Date(Date.now() + 30_000), last_error: "" }, $inc: { attempt_count: 1 } }, { new: true });
    return legacyClaim ? "claimed" : "busy";
  }
  const reclaimable = [{ status: "failed" }, { status: "retry_wait", next_retry_at: { $lte: now } }, { status: "processing", lease_until: { $lte: now } }];
  if (eventType === "subscription.updated") reclaimable.push({ status: "processed" });
  const reclaimed = await EventReceipt.findOneAndUpdate({
    event_key: eventKey,
    $or: reclaimable
  }, { $set: { event_id: eventId, event_payload: event, status: "processing", claim_token: token, lease_until: new Date(Date.now() + 30_000), last_error: "", next_retry_at: null }, $inc: { attempt_count: 1 } }, { new: true });
  return reclaimed ? "claimed" : "busy";
}

export async function recoverExpiredAgentaOSReceipts({ EventReceipt, processing, now = new Date(), limit = 25, log = () => {} }) {
  const expired = await EventReceipt.find({ event_payload: { $exists: true }, $or: [
    { status: "processing", lease_until: { $lte: now } },
    { status: "retry_wait", next_retry_at: { $lte: now } },
    { status: "failed" }
  ] }).limit(limit).lean();
  let recovered = 0;
  for (const receipt of expired) {
    try {
      const result = await processAgentaOSWebhook({ ...processing, event: receipt.event_payload });
      if (result.status === 200) recovered += 1;
    } catch (error) {
      log("AgentaOS webhook receipt recovery failed", { eventId: receipt.event_id, eventType: receipt.event_type });
    }
  }
  return recovered;
}

async function acquireSubscriptionLock({ AgentaSubscription, subscriptionId, token }) {
  const now = new Date();
  try {
    await AgentaSubscription.updateOne({ provider_subscription_id: subscriptionId }, {
      $setOnInsert: { provider_subscription_id: subscriptionId, event_ids: [], lock_fence: 0 }
    }, { upsert: true });
  } catch (error) { if (!duplicateKey(error)) throw error; }
  const lock = await AgentaSubscription.findOneAndUpdate({
    provider_subscription_id: subscriptionId,
    $or: [{ lock_until: { $exists: false } }, { lock_until: null }, { lock_until: { $lte: now } }]
  }, { $set: { lock_token: token, lock_until: new Date(now.getTime() + 20_000) }, $inc: { lock_fence: 1 } }, { new: true });
  return lock ? lock.lock_fence : null;
}

async function releaseSubscriptionLock({ AgentaSubscription, subscriptionId, token }) {
  await AgentaSubscription.updateOne({ provider_subscription_id: subscriptionId, lock_token: token }, { $unset: { lock_token: 1, lock_until: 1 } });
}

async function acquireFirmaPaymentLock({ Firma, firmId, token }) {
  const now = new Date();
  return Firma.findOneAndUpdate({ _id: firmId, $or: [{ payment_lock_until: { $exists: false } }, { payment_lock_until: null }, { payment_lock_until: { $lte: now } }] }, {
    $set: { payment_lock_token: token, payment_lock_until: new Date(now.getTime() + 20_000) }
  }, { new: true });
}

function receiptKey(event) {
  const d = event.data || {};
  if (event.type === "checkout.session.completed") return `${event.type}:${d.sessionId || ""}`;
  if (["subscription.created", "subscription.renewed", "subscription.payment_failed", "subscription.canceled"].includes(event.type)) return `${event.type}:${d.id || ""}:${d.currentPeriodEnd || ""}`;
  // AgentaOS specifies no deduplication key for subscription.updated. The event id
  // is retained only as a delivery lease identity; processed updates are reapplied.
  return `${event.type}:${event.id}`;
}

async function upsertSubscriptionSnapshot({ AgentaSubscription, data, eventType, eventId, firmId, userId, customerId, productId, livemode, lockFence, session }) {
  const currentQuery = AgentaSubscription.findOne({ provider_subscription_id: data.id });
  if (session) currentQuery.session(session);
  const current = await currentQuery.lean();
  const incomingEnd = data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null;
  const currentEnd = current?.current_period_end ? new Date(current.current_period_end) : null;
  if (currentEnd && incomingEnd && incomingEnd < currentEnd) return false;
  if (current?.provider_status === "canceled" && (!incomingEnd || !currentEnd || incomingEnd <= currentEnd)) return false;
  const update = {
    $set: {
      ...(firmId ? { firm_id: firmId } : {}), ...(userId ? { user_id: userId } : {}), ...(customerId ? { provider_customer_id: customerId } : {}),
      ...(productId ? { product_id: productId } : {}), provider_status: data.status || "unknown", link_id: data.linkId || productId || "",
      currency: data.currency || "", amount_minor: Number(data.amountMinor || 0), current_period_end: data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null,
      cancel_at_period_end: Boolean(data.cancelAtPeriodEnd), livemode: Boolean(livemode), last_event_type: eventType, last_event_id: eventId,
      ...((eventType === "subscription.renewed" || (eventType === "subscription.created" && String(data.status).toLowerCase() === "active")) ? { last_successful_payment_at: new Date() } : {})
    },
    $addToSet: { event_ids: eventId }
  };
  try {
    await AgentaSubscription.updateOne({ provider_subscription_id: data.id }, { $setOnInsert: { provider_subscription_id: data.id, event_ids: [] } }, { upsert: true, ...(session ? { session } : {}) });
  } catch (error) {
    if (!duplicateKey(error)) throw error;
  }
  const filter = { provider_subscription_id: data.id, lock_fence: lockFence };
  {
    const periodOptions = incomingEnd ? [
      { current_period_end: { $exists: false } },
      { current_period_end: null },
      { current_period_end: { $lt: incomingEnd } },
      { current_period_end: incomingEnd, provider_status: { $ne: "canceled" } }
    ] : [
      { current_period_end: { $exists: false } },
      { current_period_end: null }
    ];
    filter.$or = periodOptions;
  }
  const result = await AgentaSubscription.updateOne(filter, update, session ? { session } : {});
  return Boolean(result.matchedCount ?? result.n ?? result.upsertedCount ?? result.upserted);
}

export async function processAgentaOSWebhook({ event, EventReceipt, AgentaPayment, AgentaSubscription, CheckoutAttempt, User, Firma, products, expectedLivemode, loadLatestSubscription, log = () => {} }) {
  const eventId = String(event?.id || "");
  if (!eventId || !event?.type || !event?.data) return { status: 400, text: "Invalid event" };
  const livemode = event.data.livemode;
  if (typeof livemode !== "boolean" || livemode !== expectedLivemode) return { status: 400, text: "Wrong payment mode" };
  const token = crypto.randomUUID();
  const currentReceiptKey = receiptKey(event);
  const claimed = await acquireEvent({ EventReceipt, eventId, eventType: event.type, token, event });
  if (claimed === "processed") return { status: 200, text: "Duplicate ignored" };
  if (claimed === "busy") return { status: 503, text: "Event is being recovered; retry later" };
  try {
    const data = event.data;
    if (event.type === "checkout.session.completed") {
      const sessionId = String(data.sessionId || "");
      const metadata = data.metadata || {};
      const renewal = (metadata.subscriptionCycle === true || metadata.subscriptionCycle === "true") && metadata.subscriptionId;
      const linkedSubscription = renewal ? await AgentaSubscription.findOne({ provider_subscription_id: String(metadata.subscriptionId) }).lean() : null;
      const productId = String(metadata.productId || linkedSubscription?.product_id || (renewal ? products.productForPlan("premium") : ""));
      const product = products.productDetails(productId);
      if (!sessionId || !product) throw new PermanentAgentaEventError("Checkout event does not map to a configured product");
      if (renewal && product.kind !== "premium") throw new PermanentAgentaEventError("Subscription renewal does not map to Premium");
      const paymentFields = {
        provider: "agentaos", provider_transaction_id: sessionId, provider_session_id: sessionId,
        user_id: metadata.userId ? String(metadata.userId) : linkedSubscription?.user_id || null, firm_id: metadata.firmId ? String(metadata.firmId) : linkedSubscription?.firm_id || null,
        product_id: productId, product_kind: product.kind, credit_amount: product.credits, amount: String(data.amount || "0"),
        currency: String(data.currency || ""), status: "paid", fulfillment_status: "pending", paid_at: new Date(), livemode,
        provider_customer_id: data.customerId || null, provider_event_id: eventId,
        ...(metadata.subscriptionId ? { provider_subscription_id: String(metadata.subscriptionId) } : {})
      };
      const priorPayment = await AgentaPayment.findOne({ provider_transaction_id: sessionId }).lean();
      if (priorPayment && (String(priorPayment.product_id) !== productId || (!renewal && (String(priorPayment.user_id || "") !== String(paymentFields.user_id || "") || String(priorPayment.firm_id || "") !== String(paymentFields.firm_id || ""))))) {
        throw new PermanentAgentaEventError("Checkout transaction metadata does not match its recorded purchase");
      }
      await AgentaPayment.updateOne({ provider_transaction_id: sessionId }, {
        $setOnInsert: paymentFields,
        ...(renewal && linkedSubscription ? { $set: { user_id: linkedSubscription.user_id, firm_id: linkedSubscription.firm_id, provider_subscription_id: String(metadata.subscriptionId) } } : {})
      }, { upsert: true });
      if (product.kind === "credits" && !renewal) {
        if (!paymentFields.user_id) throw new PermanentAgentaEventError("Credit checkout is missing user metadata");
        const applied = await User.updateOne({ _id: paymentFields.user_id, agentaos_credit_transactions: { $ne: sessionId } }, {
          $inc: { credits: product.credits }, $addToSet: { agentaos_credit_transactions: sessionId }
        });
        if (!applied.matchedCount && !applied.n) {
          const existing = await User.findOne({ _id: paymentFields.user_id, agentaos_credit_transactions: sessionId }).select("_id").lean();
          if (!existing) throw new Error("Credit purchase user was not found");
        }
        await AgentaPayment.updateOne({ provider_transaction_id: sessionId }, { $set: { fulfillment_status: "fulfilled" } });
      } else {
        if (!paymentFields.firm_id) throw new PermanentAgentaEventError("Premium checkout is missing Firma metadata");
        const subscriptionId = String(metadata.subscriptionId || "");
        if (subscriptionId) {
          const lockFence = await acquireSubscriptionLock({ AgentaSubscription, subscriptionId, token });
          if (!lockFence) throw new Error("Subscription is currently being processed");
          const lockHeartbeat = setInterval(() => AgentaSubscription.updateOne({ provider_subscription_id: subscriptionId, lock_token: token }, { $set: { lock_until: new Date(Date.now() + 20_000) } }).catch(() => {}), 5_000);
          try {
            const linked = await AgentaSubscription.updateOne({ provider_subscription_id: subscriptionId, lock_token: token, lock_fence: lockFence }, { $set: { firm_id: paymentFields.firm_id, user_id: paymentFields.user_id, provider_customer_id: data.customerId || null, product_id: productId, livemode } });
            if (!linked.matchedCount && !linked.n) throw new Error("Subscription ownership link could not be persisted");
            const subscription = await AgentaSubscription.findOne({ provider_subscription_id: subscriptionId }).lean();
            if (subscription) await applySubscriptionToFirma({ Firma, subscription, now: new Date(), token, premiumProductId: products.productForPlan("premium") });
          } finally { clearInterval(lockHeartbeat); await releaseSubscriptionLock({ AgentaSubscription, subscriptionId, token }); }
        }
      }
      await CheckoutAttempt?.updateOne({ session_id: sessionId }, { $set: { status: "completed" } });
    } else if (event.type.startsWith("subscription.")) {
      const subscriptionId = String(data.id || "");
       if (!subscriptionId) throw new PermanentAgentaEventError("Subscription event is missing its id");
      const lockFence = await acquireSubscriptionLock({ AgentaSubscription, subscriptionId, token });
      if (!lockFence) throw new Error("Subscription is currently being processed");
      const lockHeartbeat = setInterval(() => AgentaSubscription.updateOne({ provider_subscription_id: subscriptionId, lock_token: token }, { $set: { lock_until: new Date(Date.now() + 20_000) } }).catch(() => {}), 5_000);
      try {
      const latest = loadLatestSubscription ? await loadLatestSubscription(subscriptionId) : null;
      if (loadLatestSubscription && !latest) throw new Error("AgentaOS subscription reconciliation returned no matching subscription");
      const snapshot = latest ? {
        ...data,
        id: latest.id,
        status: latest.status,
        linkId: latest.linkId,
        currency: latest.currency,
        amountMinor: latest.unitAmountMinor,
        currentPeriodEnd: latest.currentPeriodEnd,
        cancelAtPeriodEnd: latest.cancelAtPeriodEnd
      } : data;
      if (latest && (String(latest.id) !== subscriptionId || String(latest.linkId || "") !== products.productForPlan("premium") || typeof latest.status !== "string" || (latest.currentPeriodEnd != null && Number.isNaN(new Date(latest.currentPeriodEnd).getTime())))) throw new Error("Reconciled subscription response is invalid or does not match the Premium product");
      const existing = await AgentaSubscription.findOne({ provider_subscription_id: data.id }).lean();
       if (String(snapshot.linkId || "") !== products.productForPlan("premium")) {
         throw new PermanentAgentaEventError("Subscription event does not match the Premium product");
      }
      const productId = String(snapshot.linkId);
       const persistProjection = async (session, firmaLockHeld = false) => {
         await upsertSubscriptionSnapshot({ AgentaSubscription, data: snapshot, eventType: event.type, eventId, firmId: existing?.firm_id, userId: existing?.user_id, customerId: existing?.provider_customer_id, productId, livemode, lockFence, session });
         const subscriptionQuery = AgentaSubscription.findOne({ provider_subscription_id: data.id });
         if (session) subscriptionQuery.session(session);
         const subscription = await subscriptionQuery.lean();
         if (subscription?.firm_id) {
           await applySubscriptionToFirma({ Firma, subscription, now: new Date(), token, premiumProductId: products.productForPlan("premium"), session, lockAlreadyHeld: firmaLockHeld });
           await AgentaPayment.updateMany?.({ provider_subscription_id: String(data.id) }, { $set: { fulfillment_status: "fulfilled", user_id: subscription.user_id, firm_id: subscription.firm_id } }, session ? { session } : {});
         }
       };
       const firmaId = existing?.firm_id;
       let firmaLockHeld = false;
       let firmaHeartbeat = null;
       try {
         if (firmaId && typeof AgentaSubscription?.db?.startSession === "function") {
           const locked = await acquireFirmaPaymentLock({ Firma, firmId: firmaId, token });
           if (!locked) throw new Error("Firma payment state is currently being processed");
           firmaLockHeld = true;
           firmaHeartbeat = setInterval(() => Firma.updateOne({ _id: firmaId, payment_lock_token: token }, { $set: { payment_lock_until: new Date(Date.now() + 20_000) } }).catch(() => {}), 5_000);
         }
         const transaction = await runMongoTransaction(AgentaSubscription, (session) => persistProjection(session, firmaLockHeld));
         // Durable receipt payload is the outbox fallback when this MongoDB
         // deployment does not support transactions. A failed projection leaves
         // the receipt retryable and recovery reapplies the persisted winner.
         if (!transaction.supported) {
           if (firmaLockHeld) {
             clearInterval(firmaHeartbeat);
             await Firma.updateOne({ _id: firmaId, payment_lock_token: token }, { $unset: { payment_lock_token: 1, payment_lock_until: 1 } });
             firmaLockHeld = false;
           }
           await persistProjection(null);
         }
       } finally {
         if (firmaHeartbeat) clearInterval(firmaHeartbeat);
         if (firmaLockHeld) await Firma.updateOne({ _id: firmaId, payment_lock_token: token }, { $unset: { payment_lock_token: 1, payment_lock_until: 1 } });
       }
      } finally { clearInterval(lockHeartbeat); await releaseSubscriptionLock({ AgentaSubscription, subscriptionId, token }); }
    } else if (event.type === "dispute.created") {
      await AgentaPayment.updateOne({ provider_transaction_id: String(event.data.transactionId || "") }, {
        $set: { status: "disputed", dispute_id: String(event.data.disputeId || "") }
      });
    } else if (event.type === "dispute.closed") {
      await AgentaPayment.updateOne({ provider_transaction_id: String(event.data.transactionId || "") }, {
        $set: { dispute_status: String(event.data.status || "closed") }
      });
    }
    // AgentaOS's documented webhook catalog has no refund event. Disputes are not treated as refunds;
    // they require reconciliation and must never claw back already spent credits automatically.
    await EventReceipt.updateOne({ event_key: currentReceiptKey, claim_token: token }, { $set: { status: "processed", processed_at: new Date(), lease_until: null, next_retry_at: null }, $unset: { event_payload: 1 } });
    return { status: 200, text: "OK" };
  } catch (error) {
    const receipt = await EventReceipt.findOne({ event_key: currentReceiptKey, claim_token: token }).lean();
    const permanent = isPermanentEventError(error) || Number(receipt?.attempt_count || 1) >= MAX_WEBHOOK_ATTEMPTS;
    const retryAt = new Date(Date.now() + retryDelay(receipt?.attempt_count || 1));
    await EventReceipt.updateOne({ event_key: currentReceiptKey, claim_token: token }, { $set: {
      status: permanent ? "permanent_failed" : "retry_wait",
      last_error: safeFailureMessage(error), failure_kind: isPermanentEventError(error) ? "invalid_event" : permanent ? "attempt_limit" : "transient",
      lease_until: null, next_retry_at: permanent ? null : retryAt
    } });
    log("AgentaOS webhook fulfillment failed", { eventId, eventType: event.type });
    throw error;
  }
}

async function applySubscriptionToFirma({ Firma, subscription, now, token, premiumProductId, session, lockAlreadyHeld = false }) {
  const firmId = subscription.firm_id;
  if (!firmId) return;
  if (!premiumProductId || String(subscription.product_id || subscription.link_id || "") !== String(premiumProductId)) throw new Error("Non-Premium product cannot change Firma Premium access");
  const end = subscription.current_period_end ? new Date(subscription.current_period_end) : null;
  const entitled = end && end > now && ["active", "trialing", "past_due", "unpaid"].includes(String(subscription.provider_status || "").toLowerCase());
  const scheduledCancel = Boolean(subscription.cancel_at_period_end);
  const fields = entitled ? {
    plan: "premium", payment_status: "active", is_boosted: true, boost_expires_at: end, expires_at: end,
    paid_at: subscription.last_successful_payment_at || undefined,
    agentaos_customer_id: subscription.provider_customer_id || null, agentaos_subscription_id: subscription.provider_subscription_id,
    agentaos_product_id: subscription.product_id || subscription.link_id, agentaos_subscription_status: subscription.provider_status,
    agentaos_current_period_end: end, agentaos_cancel_at_period_end: scheduledCancel
  } : {
    plan: "free", payment_status: "active", is_boosted: false, boost_expires_at: null, expires_at: end,
    agentaos_customer_id: subscription.provider_customer_id || null, agentaos_subscription_id: subscription.provider_subscription_id,
    agentaos_product_id: subscription.product_id || subscription.link_id, agentaos_subscription_status: subscription.provider_status,
    agentaos_current_period_end: end, agentaos_cancel_at_period_end: scheduledCancel
  };
  const ownerFilter = subscription.user_id ? { owner_user_id: subscription.user_id } : {};
  if (!lockAlreadyHeld) {
    const firmLock = await acquireFirmaPaymentLock({ Firma, firmId, token });
    if (!firmLock) throw new Error("Firma payment state is currently being processed");
  }
  try {
    const updated = await Firma.updateOne({ _id: firmId, ...ownerFilter, payment_lock_token: token }, { $set: fields }, session ? { session } : {});
    if (!updated.matchedCount && !updated.n) throw new Error("Premium subscription Firma ownership could not be confirmed");
  } finally {
    if (!lockAlreadyHeld) await Firma.updateOne({ _id: firmId, payment_lock_token: token }, { $unset: { payment_lock_token: 1, payment_lock_until: 1 } });
  }
}
