import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import type { PasswordHasher, TokenService } from "../../application/ports.js";

export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}

function parseExpiresIn(value: string): string {
  // jose accepts numeric seconds or ms strings like "7d" via setExpirationTime
  return value;
}

export class JoseJwtTokenService implements TokenService {
  private readonly secret: Uint8Array;

  constructor(
    secret: string,
    private readonly expiresIn: string,
  ) {
    this.secret = new TextEncoder().encode(secret);
  }

  async sign(payload: { sub: string; email: string }): Promise<string> {
    return new SignJWT({ email: payload.email })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(parseExpiresIn(this.expiresIn))
      .sign(this.secret);
  }

  async verify(token: string): Promise<{ sub: string; email: string }> {
    const { payload } = await jwtVerify(token, this.secret);
    const sub = payload.sub;
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!sub) {
      throw new Error("Invalid token subject");
    }
    return { sub, email };
  }
}
