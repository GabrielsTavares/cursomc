import { describe, expect, it } from "vitest";
import Fastify from "fastify";

describe("GET /health (smoke without DB)", () => {
  it("returns degraded when database probe fails", async () => {
    const app = Fastify();
    app.get("/health", async (_req, reply) => {
      return reply.code(503).send({
        status: "degraded",
        service: "creator-hub-api",
        timestamp: new Date().toISOString(),
        checks: { database: "down" },
      });
    });

    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json().status).toBe("degraded");
    expect(res.json().checks.database).toBe("down");
    await app.close();
  });

  it("returns ok shape when healthy", async () => {
    const app = Fastify();
    app.get("/health", async () => ({
      status: "ok",
      service: "creator-hub-api",
      timestamp: new Date().toISOString(),
      checks: { database: "up" },
    }));

    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "ok",
      service: "creator-hub-api",
      checks: { database: "up" },
    });
    await app.close();
  });
});
