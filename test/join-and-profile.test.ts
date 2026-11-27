import { beforeEach, describe, expect, it } from "vitest";
import type { AppState } from "../src/shared/types";
import { ADMIN, call, clearTables, sessionBody } from "./support/api-client";

const NEW = "newcomer@example.test";
const OTHER = "other@example.test";

beforeEach(clearTables);

const stateAs = async (email: string | null) => (await (await call("GET", "/api/state", undefined, email)).json()) as AppState;
const join = (email: string | null, body: unknown = { name: "Người mới" }) => call("POST", "/api/join", body, email);

describe("asking to join", () => {
  it("needs a sign-in", async () => {
    expect((await join(null)).status).toBe(401);
  });

  it("creates a request that only the requester and admins can see, and gives no rights yet", async () => {
    const res = await join(NEW, { name: "  Người mới ", bankCode: "970436", accountNo: "0123456789", accountName: "NGUOI MOI" });
    expect(res.status).toBe(201);

    const mine = await stateAs(NEW);
    expect(mine.me).toEqual({ email: NEW, memberId: null, admin: false });
    expect(mine.joinRequests).toEqual([
      { id: expect.any(Number), email: NEW, name: "Người mới", bankCode: "970436", accountNo: "0123456789", accountName: "NGUOI MOI" },
    ]);
    expect(mine.members).toHaveLength(0);

    expect((await stateAs(null)).joinRequests).toEqual([]);
    expect((await stateAs(OTHER)).joinRequests).toEqual([]);
    expect((await stateAs(ADMIN)).joinRequests).toHaveLength(1);

    // Still not a member: cannot write anything.
    expect((await call("PUT", "/api/profile", { name: "X" }, NEW)).status).toBe(403);
  });

  it("replaces the earlier request when sent again", async () => {
    await join(NEW, { name: "Sai tên" });
    await join(NEW, { name: "Đúng tên" });
    const requests = (await stateAs(ADMIN)).joinRequests;
    expect(requests.map((r) => r.name)).toEqual(["Đúng tên"]);
  });

  it("validates the name and bank details like a member", async () => {
    expect((await join(NEW, { name: "" })).status).toBe(400);
    expect((await join(NEW, { name: "A", bankCode: "not-a-bank" })).status).toBe(400);
    expect((await stateAs(ADMIN)).joinRequests).toHaveLength(0);
  });

  it("ignores an email or active flag sent by the requester", async () => {
    await join(NEW, { name: "Mới", email: ADMIN, active: false });
    expect((await stateAs(ADMIN)).joinRequests[0].email).toBe(NEW);
  });
});

describe("approving and rejecting", () => {
  it("lets only an admin approve; the requester then is a member linked to their email", async () => {
    await join(NEW, { name: "Người mới" });
    const [request] = (await stateAs(ADMIN)).joinRequests;

    expect((await call("POST", `/api/join/${request.id}/approve`, undefined, NEW)).status).toBe(403);
    expect((await call("POST", `/api/join/${request.id}/approve`, undefined, OTHER)).status).toBe(403);
    expect((await call("POST", `/api/join/${request.id}/approve`)).status).toBe(204);

    const admin = await stateAs(ADMIN);
    expect(admin.joinRequests).toEqual([]);
    expect(admin.members).toMatchObject([{ name: "Người mới", email: NEW, active: true }]);

    const mine = await stateAs(NEW);
    expect(mine.me?.memberId).toBe(admin.members[0].id);
    // Now a member: can enter a session they paid for.
    expect((await call("POST", "/api/sessions", sessionBody([admin.members[0].id], { drinkAmount: 0 }), NEW)).status).toBe(201);
    // And cannot ask to join again.
    expect((await join(NEW)).status).toBe(400);
    // Approving twice finds nothing.
    expect((await call("POST", `/api/join/${request.id}/approve`)).status).toBe(404);
  });

  it("rejecting removes the request; the person can ask again", async () => {
    await join(NEW);
    const [request] = (await stateAs(ADMIN)).joinRequests;
    expect((await call("DELETE", `/api/join/${request.id}`, undefined, NEW)).status).toBe(403);
    expect((await call("DELETE", `/api/join/${request.id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/join/${request.id}`)).status).toBe(404);
    expect((await stateAs(ADMIN)).members).toHaveLength(0);
    expect((await join(NEW)).status).toBe(201);
  });

  it("drops the request once an admin types the requester's email on a member by hand", async () => {
    await join(NEW);
    await join(OTHER);
    await call("POST", "/api/members", { name: "Thêm tay" });
    const added = (await stateAs(ADMIN)).members[0];
    // Editing a member to carry the email answers that request...
    expect((await call("PUT", `/api/members/${added.id}`, { name: "Thêm tay", email: NEW })).status).toBe(200);
    expect((await stateAs(ADMIN)).joinRequests.map((r) => r.email)).toEqual([OTHER]);
    // ...and so does adding a member with it.
    expect((await call("POST", "/api/members", { name: "Khác", email: OTHER })).status).toBe(201);
    expect((await stateAs(ADMIN)).joinRequests).toEqual([]);
    expect((await stateAs(NEW)).me?.memberId).toBe(added.id);
  });

  it("makes an admin a member at once, with no request", async () => {
    const res = await join(ADMIN, { name: "Quản trị" });
    expect(res.status).toBe(201);
    const state = await stateAs(ADMIN);
    expect(state.joinRequests).toEqual([]);
    expect(state.members).toMatchObject([{ name: "Quản trị", email: ADMIN }]);
    expect(state.me).toEqual({ email: ADMIN, memberId: state.members[0].id, admin: true });
  });
});

describe("linking a request to a member added before they signed in", () => {
  const bank = { bankCode: "970436", accountNo: "0123456789", accountName: "NGUOI MOI" };
  const setup = async (member: Record<string, unknown>) => {
    const { id } = (await (await call("POST", "/api/members", member)).json()) as { id: number };
    await call("POST", "/api/sessions", sessionBody([id], { drinkAmount: 0 }));
    await join(NEW, { name: "Tên tự đặt", ...bank });
    const [request] = (await stateAs(ADMIN)).joinRequests;
    return { id, request };
  };

  it("puts the email on that member, keeps their name and sessions, and fills in missing bank details", async () => {
    const { id, request } = await setup({ name: "Long" });
    expect((await call("POST", `/api/join/${request.id}/link`, { memberId: id })).status).toBe(204);

    const admin = await stateAs(ADMIN);
    expect(admin.joinRequests).toEqual([]);
    expect(admin.members).toEqual([{ id, name: "Long", email: NEW, active: true, ...bank }]);
    expect(admin.sessions[0].attendees[0].memberId).toBe(id);
    expect((await stateAs(NEW)).me).toEqual({ email: NEW, memberId: id, admin: false });
  });

  it("keeps bank details the admin already entered", async () => {
    const { id, request } = await setup({ name: "Long", bankCode: "970422", accountNo: "999", accountName: "LONG" });
    expect((await call("POST", `/api/join/${request.id}/link`, { memberId: id })).status).toBe(204);
    expect((await stateAs(ADMIN)).members[0]).toMatchObject({ email: NEW, bankCode: "970422", accountNo: "999", accountName: "LONG" });
  });

  it("is for admins only, and only onto a member who has no email yet", async () => {
    const { id, request } = await setup({ name: "Long" });
    const taken = (await (await call("POST", "/api/members", { name: "Có email", email: OTHER })).json()) as { id: number };
    const link = (memberId: unknown, as?: string) => call("POST", `/api/join/${request.id}/link`, { memberId }, as);

    expect((await link(id, NEW)).status).toBe(403);
    expect((await link(taken.id)).status).toBe(400);
    expect((await link(999_999)).status).toBe(404);
    expect((await link("1")).status).toBe(400);
    expect((await call("POST", "/api/join/999999/link", { memberId: id })).status).toBe(404);

    const admin = await stateAs(ADMIN);
    expect(admin.joinRequests).toHaveLength(1);
    expect(admin.members.find((m) => m.id === id)?.email).toBeNull();
    expect(admin.members.find((m) => m.id === taken.id)?.email).toBe(OTHER);
  });
});

describe("editing your own details", () => {
  it("changes only the caller's name and bank details", async () => {
    await call("POST", "/api/members", { name: "An", email: NEW });
    await call("POST", "/api/members", { name: "Bình", email: OTHER });

    // The whole profile is replaced each time. Email and active are not the member's to change.
    const profile = { name: "An mới", bankCode: "970436", accountNo: "999", accountName: null, email: ADMIN, active: false };
    expect((await call("PUT", "/api/profile", profile, NEW)).status).toBe(204);

    const members = (await stateAs(ADMIN)).members;
    expect(members).toMatchObject([
      { name: "An mới", bankCode: "970436", accountNo: "999", accountName: null, email: NEW, active: true },
      { name: "Bình", bankCode: null, email: OTHER },
    ]);
  });

  it("is refused for a visitor and for an account that is not a member", async () => {
    expect((await call("PUT", "/api/profile", { name: "X" }, null)).status).toBe(401);
    expect((await call("PUT", "/api/profile", { name: "X" }, "stranger@example.test")).status).toBe(403);
  });
});
