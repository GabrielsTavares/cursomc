import { describe, expect, it } from "vitest";
import { LoginUseCase } from "./auth-use-cases.js";
import { UnauthorizedError, ValidationError } from "../domain/errors.js";
import type { PasswordHasher, TokenService, UserRepository } from "./ports.js";
import type { UserRecord } from "../domain/models.js";

const sampleUser: UserRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "admin@creator.local",
  passwordHash: "hashed",
  displayName: "Gabriel",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

class MemoryUsers implements UserRepository {
  constructor(private readonly user: UserRecord | null) {}
  async findByEmail(email: string) {
    return this.user && this.user.email === email ? this.user : null;
  }
  async findById(id: string) {
    return this.user && this.user.id === id ? this.user : null;
  }
}

class FakeHasher implements PasswordHasher {
  async hash(password: string) {
    return `hash:${password}`;
  }
  async verify(hash: string, password: string) {
    return hash === `hash:${password}` || (hash === "hashed" && password === "changeme123");
  }
}

class FakeTokens implements TokenService {
  async sign(payload: { sub: string; email: string }) {
    return `token:${payload.sub}`;
  }
  async verify(token: string) {
    return { sub: token.replace("token:", ""), email: "admin@creator.local" };
  }
}

describe("LoginUseCase", () => {
  it("rejects empty credentials", async () => {
    const useCase = new LoginUseCase(new MemoryUsers(sampleUser), new FakeHasher(), new FakeTokens());
    await expect(useCase.execute({ email: "", password: "" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects wrong password", async () => {
    const useCase = new LoginUseCase(new MemoryUsers(sampleUser), new FakeHasher(), new FakeTokens());
    await expect(
      useCase.execute({ email: "admin@creator.local", password: "nope" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns user and token on success", async () => {
    const useCase = new LoginUseCase(new MemoryUsers(sampleUser), new FakeHasher(), new FakeTokens());
    const result = await useCase.execute({
      email: "admin@creator.local",
      password: "changeme123",
    });
    expect(result.user.email).toBe("admin@creator.local");
    expect(result.token).toBe(`token:${sampleUser.id}`);
  });
});
