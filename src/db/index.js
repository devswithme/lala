/**
 * Supabase client and repository functions for rooms, sessions, wallets, etc.
 */
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_KEY,
  ROOMS_TABLE,
  ROOM_MESSAGES_TABLE,
  SESSIONS_TABLE,
  BOTTLES_TABLE,
  GROUP_ROOMS_TABLE,
  GROUP_ROOM_MEMBERS_TABLE,
  GROUP_ROOM_MESSAGES_TABLE,
  WALLETS_TABLE,
  PAYMENTS_TABLE,
  USER_ENTITLEMENTS_TABLE,
  ROOM_IDENTITY_PERMISSIONS_TABLE,
  GROUP_ROOM_IDENTITY_PERMISSIONS_TABLE,
  ROOM_REVEAL_CONSENTS_TABLE,
  GIFT_EVENTS_TABLE,
  GIFT_CLAIMS_TABLE,
  MOOD_DECREMENT_PER_CHAT,
  MOOD_RECOVERY_PER_HOUR,
} from "../config/index.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Rooms ---
export async function getActiveRoomByUserId(userId) {
  const { data, error } = await supabase
    .from(ROOMS_TABLE)
    .select("*")
    .eq("status", "active")
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getRoomById(roomId) {
  const { data, error } = await supabase
    .from(ROOMS_TABLE)
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export function otherUserId(room, userId) {
  return room.user1_id === userId ? room.user2_id : room.user1_id;
}

export async function getActiveGroupRoomByUserId(userId) {
  const { data: memberships, error } = await supabase
    .from(GROUP_ROOM_MEMBERS_TABLE)
    .select("room_id")
    .eq("user_id", userId);
  if (error) throw error;
  const roomIds = (memberships ?? []).map((m) => m.room_id);
  if (roomIds.length === 0) return null;
  const { data: room, error: roomErr } = await supabase
    .from(GROUP_ROOMS_TABLE)
    .select("*")
    .in("id", roomIds)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (roomErr) throw roomErr;
  return room ?? null;
}

// --- Room messages ---
export async function getLastRoomMessageAt(roomId, table = ROOM_MESSAGES_TABLE) {
  const { data, error } = await supabase
    .from(table)
    .select("created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.created_at ?? null;
}

export async function getRecentRoomMessages(roomId, limit = 10, table = ROOM_MESSAGES_TABLE) {
  const { data, error } = await supabase
    .from(table)
    .select("user_id,content,created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).slice().reverse();
}

export async function insertRoomMessage(roomId, userId, content, table = ROOM_MESSAGES_TABLE) {
  const { error } = await supabase.from(table).insert({
    room_id: roomId,
    user_id: userId,
    content,
  });
  if (error) throw error;
}

/** Count messages in room from real users (user_id != 0). */
export async function getRoomMessageCount(roomId, table = ROOM_MESSAGES_TABLE) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .neq("user_id", 0);
  if (error) throw error;
  return count ?? 0;
}

// --- Sessions ---
export async function getSession(userId, columns = "summary,history") {
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select(columns)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertSession(record) {
  const { error } = await supabase.from(SESSIONS_TABLE).upsert(record);
  if (error) throw error;
}

export async function assignQueuePositionForUser(userId) {
  // Ensure we don't change existing positions on re-submit.
  const { data: existing, error: existingErr } = await supabase
    .from(SESSIONS_TABLE)
    .select("user_id,queue_position")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.queue_position != null) {
    return existing.queue_position;
  }

  const { data: maxRow, error: maxErr } = await supabase
    .from(SESSIONS_TABLE)
    .select("queue_position")
    .not("queue_position", "is", null)
    .order("queue_position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;

  const currentMax = typeof maxRow?.queue_position === "number" ? maxRow.queue_position : 0;
  const nextPosition = currentMax + 1;

  const now = new Date();
  const payload = {
    user_id: userId,
    queue_position: nextPosition,
    queue_signed_at: now,
  };

  const { error: upsertErr } = await supabase.from(SESSIONS_TABLE).upsert(payload);
  if (upsertErr) throw upsertErr;
  return nextPosition;
}

export async function getNextBetaBatch(limit) {
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select("user_id,queue_position,queue_signed_at")
    .not("queue_position", "is", null)
    .is("queue_activated_at", null)
    .order("queue_position", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function markQueueActivated(userId) {
  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .update({ queue_activated_at: new Date() })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function markQueueBypassed(userId) {
  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .update({ queue_bypassed: true, queue_activated_at: new Date() })
    .eq("user_id", userId);
  if (error) throw error;
}

// --- Mood Energy ---
export async function getMood(userId) {
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select("mood,mood_updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const stored = data?.mood ?? 100;
  const updatedAt = data?.mood_updated_at ?? new Date();
  const now = Date.now();
  const hoursSince = (now - new Date(updatedAt).getTime()) / 3600000;
  const recovered = Math.min(100, (stored ?? 100) + MOOD_RECOVERY_PER_HOUR * hoursSince);
  return Math.round(Math.max(0, Math.min(100, recovered)));
}

export async function decrementMood(userId) {
  const current = await getMood(userId);
  const next = Math.max(0, current - MOOD_DECREMENT_PER_CHAT);
  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .update({ mood: next, mood_updated_at: new Date() })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function refillMood(userId) {
  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .upsert({
      user_id: userId,
      mood: 100,
      mood_updated_at: new Date(),
    });
  if (error) throw error;
}

export async function updateSessionStatus(userIds, status, currentMatch = null) {
  const payload = { status, ...(currentMatch !== undefined && { current_match: currentMatch }) };
  const { error } = await supabase
    .from(SESSIONS_TABLE)
    .update(payload)
    .in("user_id", Array.isArray(userIds) ? userIds : [userIds]);
  if (error) throw error;
}

export async function getSearchingSessions(limit = 50, excludeUserId = null) {
  let q = supabase
    .from(SESSIONS_TABLE)
    .select("user_id,personality")
    .eq("status", "searching")
    .not("personality", "is", null)
    .limit(limit);
  if (excludeUserId != null) q = q.neq("user_id", excludeUserId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getSearchingGroupSessions(limit = 100, excludeUserId = null) {
  let q = supabase
    .from(SESSIONS_TABLE)
    .select("user_id,personality")
    .eq("status", "searching_group")
    .not("personality", "is", null)
    .limit(limit);
  if (excludeUserId != null) q = q.neq("user_id", excludeUserId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function claimSessionToLive(userId, currentMatch) {
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .update({ status: "live", current_match: currentMatch })
    .eq("user_id", userId)
    .eq("status", "searching")
    .select("user_id")
    .limit(1);
  if (error) throw error;
  return data ?? [];
}

// --- Wallets ---
export async function ensureWalletRow(userId) {
  const { data, error } = await supabase
    .from(WALLETS_TABLE)
    .select("user_id,balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: inserted, error: insErr } = await supabase
    .from(WALLETS_TABLE)
    .insert({ user_id: userId, balance: 0 })
    .select("user_id,balance")
    .single();
  if (insErr) throw insErr;
  return inserted;
}

export async function walletBalance(userId) {
  const row = await ensureWalletRow(userId);
  return row.balance ?? 0;
}

export async function walletAdd(userId, amount) {
  await ensureWalletRow(userId);
  const current = await walletBalance(userId);
  const next = current + amount;
  const { error } = await supabase
    .from(WALLETS_TABLE)
    .update({ balance: next, updated_at: new Date() })
    .eq("user_id", userId);
  if (error) throw error;
  return next;
}

export async function walletDeduct(userId, amount) {
  await ensureWalletRow(userId);
  const current = await walletBalance(userId);
  if (current < amount) return { ok: false, balance: current };
  const next = current - amount;
  const { error } = await supabase
    .from(WALLETS_TABLE)
    .update({ balance: next, updated_at: new Date() })
    .eq("user_id", userId);
  if (error) throw error;
  return { ok: true, balance: next };
}

// --- Payments ---
export async function insertPayment(record) {
  const { error } = await supabase.from(PAYMENTS_TABLE).insert(record);
  if (error) throw error;
}

export async function getPaymentByXenditInvoiceId(invoiceId) {
  const { data, error } = await supabase
    .from(PAYMENTS_TABLE)
    .select("*")
    .eq("xendit_invoice_id", invoiceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setPaymentPaid(paymentId) {
  const { error } = await supabase
    .from(PAYMENTS_TABLE)
    .update({ status: "paid", paid_at: new Date() })
    .eq("id", paymentId);
  if (error) throw error;
}

export async function setPaymentExpiredByInvoiceId(invoiceId) {
  const { error } = await supabase
    .from(PAYMENTS_TABLE)
    .update({ status: "expired" })
    .eq("xendit_invoice_id", invoiceId);
  if (error) throw error;
}

// --- Bottles ---
export async function getPendingBottleByUserId(userId) {
  const { data, error } = await supabase
    .from(BOTTLES_TABLE)
    .select("id,bottle_text")
    .eq("from_user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertBottle(record) {
  const { error } = await supabase.from(BOTTLES_TABLE).insert(record);
  if (error) throw error;
}

export async function markBottleDelivered(bottleId, deliveredToUserId) {
  const { error } = await supabase
    .from(BOTTLES_TABLE)
    .update({ status: "delivered", delivered_to_user_id: deliveredToUserId })
    .eq("id", bottleId)
    .eq("status", "pending");
  if (error) throw error;
}

// --- Identity permissions ---
export async function ensureIdentityPermission(roomId, userId) {
  const { data, error } = await supabase
    .from(ROOM_IDENTITY_PERMISSIONS_TABLE)
    .select("allowed")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data?.allowed;
}

export async function ensureGroupIdentityPermission(roomId, userId) {
  const { data, error } = await supabase
    .from(GROUP_ROOM_IDENTITY_PERMISSIONS_TABLE)
    .select("allowed")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data?.allowed;
}

export async function upsertRoomIdentityPermission(roomId, userId) {
  const { error } = await supabase.from(ROOM_IDENTITY_PERMISSIONS_TABLE).upsert({
    room_id: roomId,
    user_id: userId,
    allowed: true,
    created_at: new Date(),
  });
  if (error) throw error;
}

export async function upsertGroupIdentityPermission(roomId, userId) {
  const { error } = await supabase.from(GROUP_ROOM_IDENTITY_PERMISSIONS_TABLE).upsert({
    room_id: roomId,
    user_id: userId,
    allowed: true,
    created_at: new Date(),
  });
  if (error) throw error;
}

// --- Reveal consent (mutual Kenalan) ---
export async function addRevealConsent(roomId, userId) {
  const { error } = await supabase.from(ROOM_REVEAL_CONSENTS_TABLE).upsert({
    room_id: roomId,
    user_id: userId,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function getRevealConsents(roomId) {
  const { data, error } = await supabase
    .from(ROOM_REVEAL_CONSENTS_TABLE)
    .select("user_id")
    .eq("room_id", roomId);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id);
}

export async function hasRevealConsent(roomId, userId) {
  const { data, error } = await supabase
    .from(ROOM_REVEAL_CONSENTS_TABLE)
    .select("user_id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

// --- Entitlements ---
export async function getUserEntitlements(userId) {
  const { data, error } = await supabase
    .from(USER_ENTITLEMENTS_TABLE)
    .select("has_group_pass")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertGroupPass(userId) {
  const { error } = await supabase.from(USER_ENTITLEMENTS_TABLE).upsert({
    user_id: userId,
    has_group_pass: true,
    updated_at: new Date(),
  });
  if (error) throw error;
}

// --- Rooms CRUD ---
export async function getActiveRoomsUserIds() {
  const { data, error } = await supabase
    .from(ROOMS_TABLE)
    .select("user1_id,user2_id")
    .eq("status", "active");
  if (error) throw error;
  const set = new Set();
  for (const r of data ?? []) {
    if (r.user1_id != null) set.add(r.user1_id);
    if (r.user2_id != null) set.add(r.user2_id);
  }
  return set;
}

export async function getActiveGroupRoomUserIds() {
  const { data: rooms, error: re } = await supabase
    .from(GROUP_ROOMS_TABLE)
    .select("id")
    .eq("status", "active");
  if (re) throw re;
  const ids = (rooms ?? []).map((g) => g.id);
  if (ids.length === 0) return new Set();
  const { data: members, error } = await supabase
    .from(GROUP_ROOM_MEMBERS_TABLE)
    .select("user_id,room_id")
    .in("room_id", ids);
  if (error) throw error;
  const set = new Set();
  for (const m of members ?? []) if (m.user_id != null) set.add(m.user_id);
  return set;
}

export async function createRoom(user1Id, user2Id) {
  const { data, error } = await supabase
    .from(ROOMS_TABLE)
    .insert({ user1_id: user1Id, user2_id: user2Id, status: "active" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function endRoom(roomId) {
  const { error } = await supabase.from(ROOMS_TABLE).update({ status: "ended" }).eq("id", roomId);
  if (error) throw error;
}

export async function createGroupRoom() {
  const { data, error } = await supabase
    .from(GROUP_ROOMS_TABLE)
    .insert({ status: "active" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function addGroupRoomMembers(roomId, userIds) {
  const rows = userIds.map((user_id) => ({ room_id: roomId, user_id }));
  const { error } = await supabase.from(GROUP_ROOM_MEMBERS_TABLE).insert(rows);
  if (error) throw error;
}

export async function getGroupRoomMemberIds(roomId) {
  const { data, error } = await supabase
    .from(GROUP_ROOM_MEMBERS_TABLE)
    .select("user_id")
    .eq("room_id", roomId);
  if (error) throw error;
  return (data ?? []).map((m) => m.user_id);
}

export async function endGroupRoom(roomId) {
  const { error } = await supabase
    .from(GROUP_ROOMS_TABLE)
    .update({ status: "ended" })
    .eq("id", roomId);
  if (error) throw error;
}

// --- Candidates for matchmaking ---
export async function getSessionCandidatesWithPersonality(limit = 80, excludeUserId) {
  let q = supabase
    .from(SESSIONS_TABLE)
    .select("user_id,personality")
    .not("personality", "is", null)
    .limit(limit);
  if (excludeUserId != null) q = q.neq("user_id", excludeUserId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// --- Gift events ---
export async function getGiftEvent(eventId) {
  const { data, error } = await supabase
    .from(GIFT_EVENTS_TABLE)
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertGiftEvent(record) {
  const { data, error } = await supabase
    .from(GIFT_EVENTS_TABLE)
    .insert(record)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function decrementGiftEventRemaining(eventId, currentRemaining) {
  await supabase
    .from(GIFT_EVENTS_TABLE)
    .update({ remaining: Math.max(0, currentRemaining - 1) })
    .eq("id", eventId);
}

export async function insertGiftClaim(eventId, userId) {
  const { error } = await supabase.from(GIFT_CLAIMS_TABLE).insert({
    event_id: eventId,
    user_id: userId,
  });
  return error;
}
