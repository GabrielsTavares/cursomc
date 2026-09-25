import { describe, expect, it, vi } from "vitest";
import type { SocialPlatform } from "@creator-hub/shared-types";
import type {
  ContentProjectRecord,
  EpisodeRecord,
  MediaAssetRecord,
  ScheduledPublicationRecord,
  SocialAccountRecord,
  SocialCredentialSecrets,
} from "../domain/models.js";
import type {
  EpisodeRepository,
  MediaAssetRepository,
  MediaStorage,
  ProjectRepository,
  PublicationRepository,
  PublisherRegistry,
  SocialAccountRepository,
  SocialPublisher,
} from "./ports.js";
import {
  PublishDuePublicationsUseCase,
} from "./publishing-use-cases.js";
import { FakePublisher } from "../infrastructure/publishers/fake-publisher.js";
import { KwaiPublisher } from "../infrastructure/publishers/kwai-publisher.js";
import { TikTokPublisher } from "../infrastructure/publishers/tiktok-publisher.js";
import { ManualPublisher } from "../infrastructure/publishers/manual-publisher.js";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const EPISODE_ID = "22222222-2222-2222-2222-222222222222";
const ACCOUNT_ID = "33333333-3333-3333-3333-333333333333";
const PUB_ID = "44444444-4444-4444-4444-444444444444";

function basePub(
  overrides: Partial<ScheduledPublicationRecord> = {},
): ScheduledPublicationRecord {
  const now = new Date("2026-09-25T12:00:00.000Z");
  return {
    id: PUB_ID,
    projectId: PROJECT_ID,
    episodeId: EPISODE_ID,
    platform: "TIKTOK",
    socialAccountId: ACCOUNT_ID,
    scheduledAt: now,
    caption: "ola mundo",
    status: "SCHEDULED",
    externalPostId: null,
    errorMessage: null,
    checklist: null,
    publishAttemptId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class MemPublications implements PublicationRepository {
  rows = new Map<string, ScheduledPublicationRecord>();
  claimCalls = 0;

  constructor(initial: ScheduledPublicationRecord[] = []) {
    for (const r of initial) this.rows.set(r.id, { ...r });
  }

  async listByProject(projectId: string) {
    return [...this.rows.values()].filter((r) => r.projectId === projectId);
  }

  async findByIdForProject(id: string, projectId: string) {
    const r = this.rows.get(id);
    if (!r || r.projectId !== projectId) return null;
    return { ...r };
  }

  async createMany(rows: Parameters<PublicationRepository["createMany"]>[0]) {
    const out: ScheduledPublicationRecord[] = [];
    for (const row of rows) {
      const id = crypto.randomUUID();
      const rec = basePub({ ...row, id, status: row.status });
      this.rows.set(id, rec);
      out.push({ ...rec });
    }
    return out;
  }

  async update(id: string, patch: Parameters<PublicationRepository["update"]>[1]) {
    const existing = this.rows.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updatedAt: new Date() };
    this.rows.set(id, next);
    return { ...next };
  }

  async claimDue(limit: number, attemptId: string, now = new Date()) {
    this.claimCalls += 1;
    const due = [...this.rows.values()]
      .filter((r) => r.status === "SCHEDULED" && r.scheduledAt <= now)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .slice(0, limit);
    const claimed: ScheduledPublicationRecord[] = [];
    for (const row of due) {
      const next = {
        ...row,
        status: "PUBLISHING" as const,
        publishAttemptId: attemptId,
        errorMessage: null,
        updatedAt: new Date(),
      };
      this.rows.set(row.id, next);
      claimed.push({ ...next });
    }
    return claimed;
  }
}

class MemSocial implements SocialAccountRepository {
  constructor(
    private readonly account: SocialAccountRecord,
    private readonly secrets: SocialCredentialSecrets | null,
  ) {}
  async listByProject() {
    return [this.account];
  }
  async findByIdForProject(id: string, projectId: string) {
    if (id !== this.account.id || projectId !== this.account.projectId) return null;
    return this.account;
  }
  async create() {
    throw new Error("not used");
  }
  async update() {
    return null;
  }
  async delete() {
    return false;
  }
  async getSecrets() {
    return this.secrets;
  }
  async upsertSecrets() {}
  async deleteSecrets() {}
}

class MemMedia implements MediaAssetRepository {
  constructor(private readonly assets: MediaAssetRecord[]) {}
  async listByProject() {
    return this.assets;
  }
  async listByEpisode(episodeId: string) {
    return this.assets.filter((a) => a.episodeId === episodeId);
  }
  async findByIdForProject() {
    return null;
  }
  async create() {
    throw new Error("not used");
  }
  async delete() {
    return null;
  }
  async nextSortOrder() {
    return 0;
  }
}

class MemStorage implements MediaStorage {
  async store() {
    throw new Error("not used");
  }
  resolvePath(storageKey: string) {
    return `/tmp/media/${storageKey}`;
  }
  async delete() {}
}

describe("FakePublisher dry_run", () => {
  it("simulates success without network", async () => {
    const fake = new FakePublisher();
    const result = await fake.publish({
      publicationId: PUB_ID,
      platform: "TIKTOK",
      caption: "x",
      mediaAbsolutePath: "/tmp/x.mp4",
      mime: "video/mp4",
      mediaType: "VIDEO",
      credentials: {},
      externalAccountId: null,
      accountDisplayName: "demo",
      dryRun: true,
    });
    expect(result.status).toBe("PUBLISHED");
    expect(result.externalPostId).toContain("dry_run");
  });
});

describe("KwaiPublisher", () => {
  it("returns MANUAL_REQUIRED with checklist (no invented API)", async () => {
    const kwai = new KwaiPublisher();
    const result = await kwai.publish({
      publicationId: PUB_ID,
      platform: "KWAI",
      caption: "legenda kwai",
      mediaAbsolutePath: "/data/media/a.mp4",
      mime: "video/mp4",
      mediaType: "VIDEO",
      credentials: {},
      externalAccountId: null,
      accountDisplayName: "Meu Kwai",
      dryRun: false,
    });
    expect(result.status).toBe("MANUAL_REQUIRED");
    expect(result.checklist?.some((c) => c.toLowerCase().includes("kwai"))).toBe(true);
  });
});

describe("TikTokPublisher", () => {
  it("fails clearly without access token in live mode", async () => {
    const pub = new TikTokPublisher({ postMode: "inbox" });
    const result = await pub.publish({
      publicationId: PUB_ID,
      platform: "TIKTOK",
      caption: "c",
      mediaAbsolutePath: "/tmp/missing.mp4",
      mime: "video/mp4",
      mediaType: "VIDEO",
      credentials: {},
      externalAccountId: null,
      accountDisplayName: "tt",
      dryRun: false,
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorMessage).toMatch(/access token/i);
  });

  it("dry_run short-circuits before network", async () => {
    const fetchImpl = vi.fn();
    const pub = new TikTokPublisher({ postMode: "direct", fetchImpl: fetchImpl as typeof fetch });
    const result = await pub.publish({
      publicationId: PUB_ID,
      platform: "TIKTOK",
      caption: "c",
      mediaAbsolutePath: "/tmp/x.mp4",
      mime: "video/mp4",
      mediaType: "VIDEO",
      credentials: { accessToken: "act.secret" },
      externalAccountId: null,
      accountDisplayName: "tt",
      dryRun: true,
    });
    expect(result.status).toBe("PUBLISHED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("PublishDuePublicationsUseCase claim idempotency", () => {
  it("claims due rows once and marks PUBLISHED via FakePublisher", async () => {
    const pubs = new MemPublications([
      basePub({ status: "SCHEDULED", scheduledAt: new Date("2020-01-01T00:00:00Z") }),
      basePub({
        id: "55555555-5555-5555-5555-555555555555",
        status: "SCHEDULED",
        scheduledAt: new Date("2099-01-01T00:00:00Z"),
      }),
    ]);

    const account: SocialAccountRecord = {
      id: ACCOUNT_ID,
      projectId: PROJECT_ID,
      platform: "TIKTOK",
      displayName: "TT",
      status: "CONNECTED",
      externalAccountId: "openid",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const media: MediaAssetRecord = {
      id: "66666666-6666-6666-6666-666666666666",
      projectId: PROJECT_ID,
      episodeId: EPISODE_ID,
      type: "VIDEO",
      storageKey: `${PROJECT_ID}/vid.mp4`,
      mime: "video/mp4",
      sizeBytes: 10,
      checksum: null,
      originalFilename: "vid.mp4",
      sortOrder: 0,
      createdAt: new Date(),
    };

    const registry: PublisherRegistry = {
      resolve: () => new FakePublisher(),
    };

    const useCase = new PublishDuePublicationsUseCase(
      pubs,
      new MemSocial(account, { accessToken: "tok" }),
      new MemMedia([media]),
      new MemStorage(),
      registry,
      { dryRun: true, batchSize: 10 },
    );

    const first = await useCase.execute();
    expect(first.claimed).toBe(1);
    expect(pubs.rows.get(PUB_ID)?.status).toBe("PUBLISHED");
    expect(pubs.rows.get("55555555-5555-5555-5555-555555555555")?.status).toBe("SCHEDULED");

    const second = await useCase.execute();
    expect(second.claimed).toBe(0);
    // Already published row must not be claimed again
    expect(pubs.rows.get(PUB_ID)?.status).toBe("PUBLISHED");
  });

  it("does not double-claim the same SCHEDULED row across concurrent logical claims", async () => {
    const pubs = new MemPublications([
      basePub({ status: "SCHEDULED", scheduledAt: new Date("2020-01-01T00:00:00Z") }),
    ]);
    const attemptA = await pubs.claimDue(1, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const attemptB = await pubs.claimDue(1, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(attemptA).toHaveLength(1);
    expect(attemptB).toHaveLength(0);
    expect(pubs.rows.get(PUB_ID)?.publishAttemptId).toBe(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
  });
});

describe("ManualPublisher", () => {
  it("returns checklist for non-Kwai platforms", async () => {
    const manual = new ManualPublisher();
    const result = await manual.publish({
      publicationId: PUB_ID,
      platform: "YOUTUBE" as SocialPlatform,
      caption: "cap",
      mediaAbsolutePath: "/x.mp4",
      mime: "video/mp4",
      mediaType: "VIDEO",
      credentials: {},
      externalAccountId: null,
      accountDisplayName: "YT",
      dryRun: false,
    });
    expect(result.status).toBe("MANUAL_REQUIRED");
    expect(result.checklist?.length).toBeGreaterThan(2);
  });
});

// silence unused type imports in strict builds
void (null as unknown as ContentProjectRecord);
void (null as unknown as EpisodeRecord);
void (null as unknown as ProjectRepository);
void (null as unknown as EpisodeRepository);
void (null as unknown as SocialPublisher);
