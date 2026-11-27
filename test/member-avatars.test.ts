import { beforeEach, describe, expect, it } from "vitest";
import { call, clearTables, getState } from "./support/api-client";

// Profile photos: each member sets or removes their own; anyone can see them.
const ME = "me@example.test";
const jpeg = (extra = 100) => {
  let bytes = String.fromCharCode(0xff, 0xd8, 0xff, 0xe0);
  for (let i = 0; i < extra; i++) bytes += String.fromCharCode(i % 256);
  return btoa(bytes);
};

let id = 0;
beforeEach(async () => {
  await clearTables();
  id = ((await (await call("POST", "/api/members", { name: "Minh", email: ME })).json()) as { id: number }).id;
});

describe("profile photos", () => {
  it("stores a member's own photo, versions it in the state and serves it cacheably as JPEG", async () => {
    expect((await getState()).members[0].avatar).toBeNull();
    expect((await call("PUT", "/api/avatars", { image: jpeg() }, ME)).status).toBe(204);

    const { avatar } = (await getState()).members[0];
    expect(avatar).toEqual(expect.any(Number));
    const res = await call("GET", `/api/avatars/${id}?v=${avatar}`, undefined, null);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect([...new Uint8Array(await res.arrayBuffer()).slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  it("removes it, after which there is nothing to serve", async () => {
    await call("PUT", "/api/avatars", { image: jpeg() }, ME);
    expect((await call("DELETE", "/api/avatars", undefined, ME)).status).toBe(204);
    expect((await getState()).members[0].avatar).toBeNull();
    expect((await call("GET", `/api/avatars/${id}`, undefined, null)).status).toBe(404);
  });

  it("takes only JPEG, of a sane size, from a member", async () => {
    const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0));
    const html = btoa("<script>alert(1)</script>");
    for (const image of [png, html, "not base64!", jpeg(260_000), ""]) {
      expect((await call("PUT", "/api/avatars", { image }, ME)).status).toBe(400);
    }
    expect((await call("PUT", "/api/avatars", { image: jpeg() }, "stranger@example.test")).status).toBe(403);
    expect((await call("PUT", "/api/avatars", { image: jpeg() }, null)).status).toBe(401);
    expect((await getState()).members[0].avatar).toBeNull();
  });
});
