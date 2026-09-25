import type { User } from "@creator-hub/shared-types";
import { UnauthorizedError, ValidationError } from "../domain/errors.js";
import { toPublicUser } from "../domain/models.js";
import type { PasswordHasher, TokenService, UserRepository } from "./ports.js";

export class LoginUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: { email: string; password: string }): Promise<{
    user: User;
    token: string;
  }> {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) {
      throw new ValidationError("Email and password are required");
    }

    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const ok = await this.hasher.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const token = await this.tokens.sign({ sub: user.id, email: user.email });
    return { user: toPublicUser(user), token };
  }
}

export class GetCurrentUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError("User not found");
    }
    return toPublicUser(user);
  }
}
