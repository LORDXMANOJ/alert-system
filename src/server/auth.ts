import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import type { Actor, Role } from "./permissions";

/**
 * DEMO AUTHENTICATION. Users pick a fictional account from a role card. The session is a signed,
 * httpOnly cookie. This is not production identity verification.
 */
export const SESSION_COOKIE = "af_session";
const DEV_SECRET = "approveflow-demo-only-secret-change-me";

function secret(): string {
  return process.env.APPROVEFLOW_SESSION_SECRET || DEV_SECRET;
}

function sign(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("base64url");
}

export function createSessionValue(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function readSessionValue(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}

/** Returns the signed-in actor, or null. Reads the user from the database on every call. */
export async function getCurrentActor(): Promise<Actor | null> {
  const jar = await cookies();
  const userId = readSessionValue(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const db = await getDb();
  const res = await db.query<{
    id: string;
    name: string;
    designation: string;
    role: Role;
    institution_id: string | null;
    region_id: string | null;
  }>("SELECT id, name, designation, role, institution_id, region_id FROM users WHERE id = $1", [userId]);
  const u = res.rows[0];
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    designation: u.designation,
    role: u.role,
    institutionId: u.institution_id,
    regionId: u.region_id,
  };
}

export async function setSessionCookie(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionValue(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
