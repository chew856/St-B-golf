/* Club.cartDispatch: the client's beverage-cart dispatch logic (cartDispatch.ts), ported to a classic script.
   Faithful port: every rule, constant, function and comment is kept; only the TypeScript types were removed
   (the type shapes are kept as comments). Pure functions: the app stores the fleet as one record
   (Club.store.setObj('cartFleet')) and every change is read, pure call, write.
   How the app keys orders (no rule below changes): golfers in the same tee-time group share ONE dispatch Order, the
   "group stop", by passing `phone: 'group:' + teeTimeId` to addOrder, so the dispatch's own merge returns the
   group's existing entry instead of giving the second golfer a line position of their own (nobody is bumped by
   their own group and the cart stops once). Each golfer's items and bill live in their own cartOrders doc, linked
   to the entry by groupId (js/modules/cart.js). The newest order, "I've moved" or "Still on hole N?" from anyone in
   the group calls updateGolferHole on that entry. nearestNodeFromGps maps golfers' phone positions (TEE_GPS below,
   from OpenStreetMap) to the nearest hole for the group's location; whether a golfer is at the club at all is
   Club.premises (js/core/premises.js), not this file. */
(function () {
  'use strict';
  window.Club = window.Club || {};

/**
 * St. Boniface Golf Club — cart-path distances, order lines and cart status (1–3 carts).
 *
 * HOW DISTANCES WERE BUILT
 * - Each hole is placed at its tee marker on the club's course map; "CH" is the clubhouse.
 * - Positions were converted to yards using the map's 100 YD scale bar.
 * - EDGES are the places a cart can drive directly between two holes. Connections that
 *   would cross the Seine River or the pond between 10 and 14/15 are left out.
 * - Edge length = straight-line distance x 1.25, because cart paths wind.
 * These are estimates: edit EDGES to match reality and everything else recomputes.
 *
 * HOW THE LINES WORK
 * - Each cart on shift has its own line. Works with 1, 2 or 3 carts (any number, really).
 * - A new order goes to whichever cart can reach that group soonest.
 * - Golfers are told their place in their cart's line ("You're 3rd in line for Sarah's cart").
 * - Within a line, new orders go to the back, UNLESS the cart drives right past them anyway
 *   (ON_THE_WAY_MIN of extra driving or less) — then they slot in there.
 * - The order a cart is currently driving to is locked in first place.
 * - Nobody can be pushed back more than MAX_BUMPS times.
 * - Orders waiting MAX_WAIT_MIN or more can only be passed by tiny detours (SMALL_DETOUR_MIN).
 * - When a cart goes to restock, waiting orders move to another cart if that gets them served
 *   at least REBALANCE_MIN sooner. When it comes back, it picks up orders the same way.
 * - When a cart ends its shift, its orders move to the other carts.
 *
 * HOW THE APP USES IT (all functions are pure: store the `fleet` in your database)
 *   startShift(fleet, cartId, name) / endShift(fleet, cartId, now)
 *   addOrder(fleet, order, now)               golfer places an order
 *   startDriving(fleet, cartId, now)          cart girl taps "Go" → text the golfer `golferText`
 *   markDelivered(fleet, cartId, orderId)     cart girl taps "Delivered"
 *   startRestock(fleet, cartId, now, min) / finishRestock(fleet, cartId, now)
 *   golferMessage(fleet, orderId, now) / cartBanner(fleet, now)   text shown to golfers
 *   placeChanges(before, after)               who to send an updated "you're Nth" text to
 *
 * IMPORTANT: run every change on the server, one at a time (e.g. a Supabase database
 * function with a row lock on the fleet). If two phones update it at the same instant,
 * one change can overwrite the other.
 */

/* type NodeId = "CH" | "1" | "2" | ... | "18" */

/** Map position in yards (x → east, y → south), origin top-left. Useful for drawing/debugging. */
const NODES = {
  CH: { x: 996, y: 34 },
  "1": { x: 1040, y: 211 },  "18": { x: 1022, y: 269 }, "10": { x: 916, y: 398 },
  "2": { x: 1000, y: 482 },  "14": { x: 790, y: 547 },  "15": { x: 583, y: 514 },
  "17": { x: 452, y: 489 },  "16": { x: 194, y: 546 },  "11": { x: 557, y: 711 },
  "9": { x: 554, y: 789 },   "13": { x: 194, y: 784 },  "12": { x: 70, y: 846 },
  "8": { x: 200, y: 872 },   "7": { x: 576, y: 894 },   "4": { x: 465, y: 942 },
  "6": { x: 877, y: 755 },   "5": { x: 881, y: 877 },   "3": { x: 937, y: 848 },
};

/** Direct cart connections: [from, to, yards]. Two-way. Edit these to match reality. */
const EDGES = [
  ["CH", "1", 230], ["CH", "18", 295], ["1", "18", 75], ["1", "2", 340],
  ["18", "10", 210], ["10", "2", 150], ["2", "14", 275], ["2", "6", 375],
  ["14", "15", 260], ["14", "11", 355], ["15", "17", 165], ["15", "11", 250],
  ["17", "16", 330], ["16", "13", 300], ["13", "12", 175], ["13", "8", 110],
  ["12", "8", 165], ["13", "9", 450], ["9", "11", 100], ["9", "7", 135],
  ["8", "7", 470], ["8", "4", 345], ["7", "4", 150], ["4", "5", 525],
  ["5", "3", 80], ["5", "6", 155], ["3", "6", 140], ["6", "9", 405],
];

/**
 * Real GPS position of each tee (fill in from Google Maps: right-click a tee → copy coordinates).
 * Until filled in, nearestNodeFromGps() returns null and the app falls back to her last stop.
 */
/* Tee positions: start of each hole line in OpenStreetMap (relation 7194105), © OpenStreetMap contributors, ODbL.
   Checked against the scorecard yardages. Have the grounds crew confirm on the course. (No clubhouse "CH" entry yet.) */
const TEE_GPS = {
  "1": { lat: 49.8754676, lon: -97.10344 },
  "2": { lat: 49.8750791, lon: -97.1001492 },
  "3": { lat: 49.8741551, lon: -97.095626 },
  "4": { lat: 49.8710205, lon: -97.0948601 },
  "5": { lat: 49.8741874, lon: -97.0959128 },
  "6": { lat: 49.873846, lon: -97.0969442 },
  "7": { lat: 49.8712951, lon: -97.0954164 },
  "8": { lat: 49.8687625, lon: -97.095867 },
  "9": { lat: 49.8717834, lon: -97.0970566 },
  "10": { lat: 49.8742768, lon: -97.1012215 },
  "11": { lat: 49.8711058, lon: -97.0975956 },
  "12": { lat: 49.867624, lon: -97.0964905 },
  "13": { lat: 49.8687028, lon: -97.0971396 },
  "14": { lat: 49.8730799, lon: -97.0997038 },
  "15": { lat: 49.8714143, lon: -97.1001182 },
  "16": { lat: 49.8687167, lon: -97.1002014 },
  "17": { lat: 49.8708292, lon: -97.1006493 },
  "18": { lat: 49.8753582, lon: -97.1037499 }
};

/** Average cart speed on paths, including slowing for golfers (~8 mph). */
const CART_YARDS_PER_MIN = 235;
/** Typical time a group spends on one hole. */
const MINUTES_PER_HOLE = 14;
/** A new order may cut in ahead of others only if it adds this many minutes of driving or less. */
const ON_THE_WAY_MIN = 2;
/** Orders waiting this long can't be passed, except by tiny detours. */
const MAX_WAIT_MIN = 15;
/** Detour small enough to allow even past someone who has waited MAX_WAIT_MIN. */
const SMALL_DETOUR_MIN = 0.5;
/** Most times any one order can be pushed back. */
const MAX_BUMPS = 2;
/** Minutes a cart spends at each delivery (handing over, payment, ID check). */
const STOP_MIN = 2;
/** Assumed restock length when the cart girl doesn't say how long she'll be. */
const DEFAULT_RESTOCK_MIN = 10;
/** Move an order to another cart only if it gets served at least this many minutes sooner. */
const REBALANCE_MIN = 5;

/* ------------------------------------------------------------------ distances */

const IDS = Object.keys(NODES);

// All-pairs shortest cart-path distances (Floyd–Warshall; 19 nodes, instant).
const DIST = {};
for (const a of IDS) {
  DIST[a] = {};
  for (const b of IDS) DIST[a][b] = a === b ? 0 : Infinity;
}
for (const [a, b, yd] of EDGES) {
  DIST[a][b] = Math.min(DIST[a][b], yd);
  DIST[b][a] = Math.min(DIST[b][a], yd);
}
for (const k of IDS) for (const i of IDS) for (const j of IDS) {
  const via = DIST[i][k] + DIST[k][j];
  if (via < DIST[i][j]) DIST[i][j] = via;
}

/** Cart-path yards between two holes (or the clubhouse). */
function travelYards(from, to) {
  return DIST[from][to];
}

/** Driving minutes between two holes (or the clubhouse). */
function travelMinutes(from, to) {
  return DIST[from][to] / CART_YARDS_PER_MIN;
}

/* ------------------------------------------------------------------ holes */

/** True for whole numbers 1–18. Check this before creating an order. */
function isValidHole(hole) {
  return typeof hole === "number" && Number.isInteger(hole) && hole >= 1 && hole <= 18;
}

/** Hole number -> NodeId. Throws on anything that isn't a whole number 1–18. */
function holeNode(hole) {
  if (!isValidHole(hole)) throw new Error(`Invalid hole number: ${hole}`);
  return String(hole);
}

/**
 * Where a group probably is now. Assumes they were halfway through the hole when they ordered
 * and play one hole every MINUTES_PER_HOLE. Groups that started on 10 play 10–18 then 1–9.
 * After their last hole they're at the clubhouse.
 */
function predictedNode(hole, minutesSinceOrder, startHole = 1) {
  holeNode(hole); // validates
  const played = Math.floor((Math.max(0, minutesSinceOrder) + MINUTES_PER_HOLE / 2) / MINUTES_PER_HOLE);
  const startIdx = startHole === 10 ? (hole >= 10 ? hole - 10 : hole + 8) : hole - 1;
  const idx = startIdx + played;
  if (idx > 17) return "CH";
  return holeNode(startHole === 10 ? (idx <= 8 ? idx + 10 : idx - 8) : idx + 1);
}

/** Nearest tee/clubhouse to a GPS point, or null if TEE_GPS hasn't been filled in. */
function nearestNodeFromGps(lat, lon) {
  let best = null;
  let bestD = Infinity;
  for (const [id, p] of Object.entries(TEE_GPS)) {
    const dx = (lon - p.lon) * Math.cos((lat * Math.PI) / 180);
    const dy = lat - p.lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ------------------------------------------------------------------ carts and orders */

/* type CartState =
 *   | { status: "serving"; at: NodeId; headingTo?: { orderId: string; node: NodeId } }
 *   | { status: "restocking"; since: number; backAt?: number };
 *
 * interface Order {
 *   id: string;
 *   hole: number;        // hole the golfer picked when ordering (1–18)
 *   placedAt: number;    // epoch ms — use the SERVER's clock, not the phone's
 *   holeAt?: number;     // when `hole` was last reported (set by updateGolferHole; defaults to placedAt)
 *   startHole?: 1 | 10;  // which hole the group started on (ask on the order page; default 1)
 *   phone?: string;      // used to merge a second order from the same group
 *   bumps?: number;      // times this order has been pushed back (managed for you)
 * }
 *
 * One cart on shift: who's driving it, what it's doing, and its own line of orders.
 * interface Cart {
 *   id: string;
 *   name?: string;   // cart girl's first name, used in texts ("Sarah is heading your way")
 *   state: CartState;
 *   line: Order[];   // this cart's orders, in serving order
 * }
 *
 * Every cart on shift right now. Store this as one record.
 * interface Fleet {
 *   carts: Cart[];
 * }
 */

const emptyFleet = () => ({ carts: [] });

const minutesWaiting = (o, now) => (now - o.placedAt) / 60000;

/** Where to find this group right now. */
function whereIs(o, now) {
  return predictedNode(o.hole, (now - (o.holeAt ?? o.placedAt)) / 60000, o.startHole ?? 1);
}

function getCart(fleet, cartId) {
  const cart = fleet.carts.find((c) => c.id === cartId);
  if (!cart) throw new Error(`No cart on shift with id ${cartId}`);
  return cart;
}

function withCart(fleet, cart) {
  return { carts: fleet.carts.map((c) => (c.id === cart.id ? cart : c)) };
}

function findOrder(fleet, orderId) {
  for (const cart of fleet.carts) {
    const index = cart.line.findIndex((o) => o.id === orderId);
    if (index !== -1) return { cart, index };
  }
  return null;
}

/** Where a cart's route starts, and minutes before it can start (restocking). */
function routeStart(cart, now) {
  const s = cart.state;
  if (s.status === "restocking") {
    const back = s.backAt ?? s.since + DEFAULT_RESTOCK_MIN * 60000;
    return { node: "CH", delay: Math.max(0, (back - now) / 60000) };
  }
  return { node: s.at, delay: 0 };
}

/** Internal estimate of minutes until a cart reaches line[index]. Not shown to golfers. */
function minutesUntilReached(cart, line, index, now) {
  const { node, delay } = routeStart(cart, now);
  let pos = node;
  let t = delay;
  const s = cart.state;
  for (let i = 0; i <= index; i++) {
    const locked = i === 0 && s.status === "serving" && s.headingTo?.orderId === line[0].id;
    const stop = locked && s.status === "serving" ? s.headingTo.node : whereIs(line[i], now);
    t += travelMinutes(pos, stop);
    if (i < index) t += STOP_MIN;
    pos = stop;
  }
  return t;
}

/** Where a new order would go in one cart's line (the single-cart rules). */
function insertIntoLine(cart, order, now) {
  const line = cart.line;
  const s = cart.state;
  const start = s.status === "restocking" ? "CH" : s.headingTo ? s.headingTo.node : s.at;
  const lockFirst = s.status === "serving" && !!s.headingTo && line[0]?.id === s.headingTo.orderId;

  const spot = whereIs(order, now);
  let bestIndex = -1;
  let bestDetour = Infinity;

  for (let i = lockFirst ? 1 : 0; i < line.length; i++) {
    const prev = i === 0 ? start : whereIs(line[i - 1], now);
    const next = whereIs(line[i], now);
    const detour =
      travelMinutes(prev, spot) + travelMinutes(spot, next) - travelMinutes(prev, next);
    if (detour > ON_THE_WAY_MIN || detour >= bestDetour) continue;

    const pushedBack = line.slice(i);
    if (pushedBack.some((o) => (o.bumps ?? 0) >= MAX_BUMPS)) continue;
    if (detour > SMALL_DETOUR_MIN && pushedBack.some((o) => minutesWaiting(o, now) >= MAX_WAIT_MIN)) continue;

    bestDetour = detour;
    bestIndex = i;
  }

  const entry = { ...order, bumps: order.bumps ?? 0 };
  if (bestIndex === -1) return { line: [...line, entry], index: line.length };
  return {
    line: [
      ...line.slice(0, bestIndex),
      entry,
      ...line.slice(bestIndex).map((o) => ({ ...o, bumps: (o.bumps ?? 0) + 1 })),
    ],
    index: bestIndex,
  };
}

/** Best cart for an order: the one that reaches the group soonest (ties → shorter line). */
function bestCartFor(fleet, order, now, exclude) {
  let best = null;
  for (const cart of fleet.carts) {
    if (cart.id === exclude) continue;
    const { line, index } = insertIntoLine(cart, order, now);
    const minutes = minutesUntilReached(cart, line, index, now);
    if (
      !best ||
      minutes < best.minutes - 0.01 ||
      (Math.abs(minutes - best.minutes) <= 0.01 && cart.line.length < best.cart.line.length)
    ) {
      best = { cart, line, minutes };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ shifts and restocking */

/** A cart girl starts her shift. She leaves from the clubhouse and picks up any orders she'd reach sooner. */
function startShift(fleet, cartId, name, now) {
  if (fleet.carts.some((c) => c.id === cartId)) throw new Error(`Cart ${cartId} is already on shift`);
  const added = { carts: [...fleet.carts, { id: cartId, name, state: { status: "serving", at: "CH" }, line: [] }] };
  return rebalance(added, now);
}

/**
 * A cart girl ends her shift. Her waiting orders move to the other carts (oldest first).
 * If she was the last cart, those orders come back as `orphaned` so the app can refund or notify them.
 */
function endShift(fleet, cartId, now) {
  const leaving = getCart(fleet, cartId);
  let next = { carts: fleet.carts.filter((c) => c.id !== cartId) };
  if (next.carts.length === 0) return { fleet: next, orphaned: leaving.line };
  for (const o of [...leaving.line].sort((a, b) => a.placedAt - b.placedAt)) {
    const best = bestCartFor(next, { ...o, bumps: 0 }, now);
    next = withCart(next, { ...best.cart, line: best.line });
  }
  return { fleet: next, orphaned: [] };
}

/**
 * Cart girl taps "Restocking". `backInMin` is optional ("back in about 10 min").
 * Her waiting orders move to another cart if that gets them served REBALANCE_MIN sooner.
 */
function startRestock(fleet, cartId, now, backInMin) {
  const cart = getCart(fleet, cartId);
  const restocking = {
    ...cart,
    state: { status: "restocking", since: now, backAt: backInMin ? now + backInMin * 60000 : undefined },
  };
  return rebalance(withCart(fleet, restocking), now, cartId);
}

/** Cart girl taps "Back on course". She leaves from the clubhouse and can pick up orders from busier carts. */
function finishRestock(fleet, cartId, now) {
  const cart = getCart(fleet, cartId);
  return rebalance(withCart(fleet, { ...cart, state: { status: "serving", at: "CH" } }), now);
}

/**
 * Move waiting orders to another cart when that gets them served at least REBALANCE_MIN sooner.
 * `fromCartId` limits it to one cart's orders. Orders a cart is already driving to never move.
 * The app can also call this every few minutes; the threshold stops orders bouncing around.
 */
function rebalance(fleet, now, fromCartId) {
  if (fleet.carts.length < 2) return fleet;
  let next = fleet;
  const candidates = next.carts
    .filter((c) => !fromCartId || c.id === fromCartId)
    .flatMap((c) => c.line.map((o) => ({ cartId: c.id, order: o })))
    .sort((a, b) => a.order.placedAt - b.order.placedAt);

  for (const { cartId, order } of candidates) {
    const src = getCart(next, cartId);
    const index = src.line.findIndex((o) => o.id === order.id);
    if (index === -1) continue;
    const s = src.state;
    if (s.status === "serving" && s.headingTo?.orderId === order.id) continue;

    const stayMinutes = minutesUntilReached(src, src.line, index, now);
    const without = { ...src, line: src.line.filter((o) => o.id !== order.id) };
    const best = bestCartFor(withCart(next, without), { ...order, bumps: 0 }, now, cartId);
    if (!best || best.minutes + REBALANCE_MIN > stayMinutes) continue;

    next = withCart(withCart(next, without), { ...best.cart, line: best.line });
  }
  return next;
}

/** Update where a cart is from her phone's GPS (only works once TEE_GPS is filled in). */
function updateCartFromGps(fleet, cartId, lat, lon) {
  const cart = getCart(fleet, cartId);
  const node = nearestNodeFromGps(lat, lon);
  if (!node || cart.state.status !== "serving") return fleet;
  return withCart(fleet, { ...cart, state: { ...cart.state, at: node } });
}

/* ------------------------------------------------------------------ orders */

/** Whether golfers can order at all (at least one cart on shift). */
function serviceOpen(fleet) {
  return fleet.carts.length > 0;
}

/* interface AddResult {
 *   fleet: Fleet;
 *   // The order to track: the new one, or the existing one it was merged into.
 *   orderId: string;
 *   // Which cart it went to.
 *   cartId: string;
 *   // True if this group already had an order waiting; add the new items to that order.
 *   merged: boolean;
 * }
 */

/**
 * A golfer places an order. It goes to the cart that can reach them soonest.
 * Throws if the hole number is invalid or no carts are on shift.
 */
function addOrder(fleet, order, now) {
  if (!isValidHole(order.hole)) throw new Error(`Invalid hole number: ${order.hole}`);
  if (!serviceOpen(fleet)) throw new Error("No carts on shift");

  if (order.phone) {
    for (const cart of fleet.carts) {
      const existing = cart.line.find((o) => o.phone === order.phone);
      if (existing) return { fleet, orderId: existing.id, cartId: cart.id, merged: true };
    }
  }

  const best = bestCartFor(fleet, { ...order, bumps: 0 }, now);
  return {
    fleet: withCart(fleet, { ...best.cart, line: best.line }),
    orderId: order.id,
    cartId: best.cart.id,
    merged: false,
  };
}

/**
 * Cart girl taps "Go" to head to the first order in her line. Locks that order in first place.
 * Text `golferText` to that golfer.
 */
function startDriving(fleet, cartId, now) {
  const cart = getCart(fleet, cartId);
  if (cart.line.length === 0) return null;
  const order = cart.line[0];
  const target = whereIs(order, now);
  const at = cart.state.status === "serving" ? cart.state.at : "CH";
  const where = target === "CH" ? "the clubhouse" : `the ${ordinal(Number(target))} tee`;
  const who = cart.name ? `${cart.name} is heading your way now.` : "The cart is heading your way now.";
  return {
    fleet: withCart(fleet, { ...cart, state: { status: "serving", at, headingTo: { orderId: order.id, node: target } } }),
    order,
    target,
    golferText: `${who} Watch for the cart around ${where}. Moved on? Reply with your hole number.`,
  };
}

/**
 * Golfer replies with a new hole number. Updates their order, and the cart's target if
 * she's driving to them.
 */
function updateGolferHole(fleet, orderId, newHole, now) {
  if (!isValidHole(newHole)) throw new Error(`Invalid hole number: ${newHole}`);
  const found = findOrder(fleet, orderId);
  if (!found) return fleet;
  const cart = found.cart;
  const line = cart.line.map((o) => (o.id === orderId ? { ...o, hole: newHole, holeAt: now } : o));
  const s = cart.state;
  const state =
    s.status === "serving" && s.headingTo?.orderId === orderId
      ? { ...s, headingTo: { orderId, node: holeNode(newHole) } }
      : s;
  return withCart(fleet, { ...cart, line, state });
}

/**
 * Cart girl taps "Delivered". `deliveredAt` is where she actually found them, if she picks it;
 * otherwise where she was heading.
 */
function markDelivered(fleet, cartId, orderId, deliveredAt) {
  const cart = getCart(fleet, cartId);
  const s = cart.state;
  const prevAt = s.status === "serving" ? (s.headingTo?.node ?? s.at) : "CH";
  return withCart(fleet, {
    ...cart,
    state: { status: "serving", at: deliveredAt ?? prevAt },
    line: cart.line.filter((o) => o.id !== orderId),
  });
}

/** Remove a cancelled order from whichever cart has it. */
function cancelOrder(fleet, orderId) {
  const found = findOrder(fleet, orderId);
  if (!found) return fleet;
  const cart = found.cart;
  const s = cart.state;
  const state =
    s.status === "serving" && s.headingTo?.orderId === orderId ? { status: "serving", at: s.at } : s;
  return withCart(fleet, { ...cart, state, line: cart.line.filter((o) => o.id !== orderId) });
}

/* ------------------------------------------------------------------ what golfers see */

/** Which cart has the order and its 1-based place in that cart's line, or null. */
function placeInLine(fleet, orderId) {
  const found = findOrder(fleet, orderId);
  return found ? { cartId: found.cart.id, place: found.index + 1 } : null;
}

/**
 * Orders whose place or cart changed (including brand-new ones), so the app knows who to update.
 * Compare the fleet before and after any change.
 */
function placeChanges(before, after) {
  const out = [];
  for (const cart of after.carts) {
    cart.line.forEach((o, i) => {
      const was = placeInLine(before, o.id);
      if (!was || was.cartId !== cart.id || was.place !== i + 1) out.push({ orderId: o.id, cartId: cart.id, place: i + 1 });
    });
  }
  return out;
}

function restockNote(cart, now) {
  const s = cart.state;
  if (s.status !== "restocking") return "";
  const who = cart.name ? `${cart.name} is` : "The cart is";
  if (!s.backAt) return ` ${who} restocking at the clubhouse and will be back out shortly.`;
  const left = Math.ceil((s.backAt - now) / 60000);
  return left > 0
    ? ` ${who} restocking at the clubhouse and will be back out in about ${left} min.`
    : ` ${who} restocking at the clubhouse and should be back out any minute.`;
}

/**
 * The message a golfer sees about their order, or null if it isn't in any line.
 * For delivered/cancelled orders, show text based on the order's status in your database.
 */
function golferMessage(fleet, orderId, now) {
  const found = findOrder(fleet, orderId);
  if (!found) return null;
  const { cart, index } = found;
  const place = index + 1;
  const s = cart.state;
  const forWhom = fleet.carts.length > 1 && cart.name ? ` for ${cart.name}'s cart` : "";

  if (place === 1) {
    if (s.status === "serving" && s.headingTo?.orderId === orderId) {
      return cart.name ? `You're next! ${cart.name} is on the way to you.` : "You're next! The cart is on its way to you.";
    }
    return `You're next in line${forWhom}.${restockNote(cart, now)}`;
  }
  return `You're ${ordinal(place)} in line${forWhom}.${restockNote(cart, now)}`;
}

/** Short banner for the order page, so golfers know before they order. */
function cartBanner(fleet, now) {
  const n = fleet.carts.length;
  if (n === 0) return "Cart service is closed right now";
  const waiting = fleet.carts.reduce((sum, c) => sum + c.line.length, 0);
  const lineText = waiting === 0 ? "No one in line" : `${waiting} in line`;

  if (n === 1) {
    const s = fleet.carts[0].state;
    if (s.status === "restocking") {
      const left = s.backAt ? Math.ceil((s.backAt - now) / 60000) : 0;
      const back = !s.backAt ? "" : left > 0 ? ` (back in ~${left} min)` : " (back any minute)";
      return `Cart is restocking${back} · ${lineText}`;
    }
    return `Cart is on the course · ${lineText}`;
  }

  const restocking = fleet.carts.filter((c) => c.state.status === "restocking").length;
  if (restocking === n) return `All ${n} carts are restocking · ${lineText}`;
  return `${n} carts on the course${restocking ? ` (${restocking} restocking)` : ""} · ${lineText}`;
}

  /* ---------------- Exports (the .ts file's `export`s) ---------------- */
  Club.cartDispatch = {
    NODES, EDGES, TEE_GPS,
    CART_YARDS_PER_MIN, MINUTES_PER_HOLE, ON_THE_WAY_MIN, MAX_WAIT_MIN, SMALL_DETOUR_MIN, MAX_BUMPS,
    STOP_MIN, DEFAULT_RESTOCK_MIN, REBALANCE_MIN,
    travelYards, travelMinutes, isValidHole, holeNode, predictedNode, nearestNodeFromGps, ordinal,
    emptyFleet, whereIs,
    startShift, endShift, startRestock, finishRestock, rebalance, updateCartFromGps,
    serviceOpen, addOrder, startDriving, updateGolferHole, markDelivered, cancelOrder,
    placeInLine, placeChanges, golferMessage, cartBanner
  };
})();
