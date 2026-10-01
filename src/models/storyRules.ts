import type {
  CharacterAppearance,
  StoryCharacter,
  StoryClue,
  StoryDocument,
  StoryScene,
  StoryStats,
} from './story';

export function orderedScenes(story: StoryDocument): StoryScene[] {
  return [...story.scenes].sort((a, b) => a.order - b.order);
}

export function getStats(story: StoryDocument): StoryStats {
  const unresolvedClues = story.clues.filter((clue) => clue.payoffSceneId === '').length;
  const totalSignals = story.characters.length + story.scenes.length + story.clues.length;
  const completedSignals = story.characters.length + story.scenes.length + (story.clues.length - unresolvedClues);
  const completion = totalSignals === 0 ? 0 : Math.round((completedSignals / totalSignals) * 100);
  return {
    characters: story.characters.length,
    scenes: story.scenes.length,
    clues: story.clues.length,
    unresolvedClues,
    completion,
  };
}

export function validateName(value: string): string {
  const cleanValue = value.trim();
  return cleanValue.length < 2 ? '至少输入 2 个字' : cleanValue;
}

export function getTimelineWarning(story: StoryDocument): string | null {
  const orders = story.scenes.map((scene) => scene.order);
  return new Set(orders).size !== orders.length ? '时间线存在重复顺序，请重新排列。' : null;
}

// ---- 出场关系：两个视图（场景详情 / 人物卡）都从这里读、通过这里改，始终是同一份数据 ----

function appearanceKey(characterId: string, sceneId: string): string {
  return `${characterId}::${sceneId}`;
}

export function hasAppearance(story: StoryDocument, characterId: string, sceneId: string): boolean {
  return story.appearances.some(
    (appearance) => appearance.characterId === characterId && appearance.sceneId === sceneId,
  );
}

/** 某一幕的出场人物 id，按人物列表顺序返回 */
export function characterIdsInScene(story: StoryDocument, sceneId: string): string[] {
  return story.characters
    .filter((character) => hasAppearance(story, character.id, sceneId))
    .map((character) => character.id);
}

/** 某个人物出场的场景 id，按时间线顺序返回 */
export function sceneIdsForCharacter(story: StoryDocument, characterId: string): string[] {
  return orderedScenes(story)
    .filter((scene) => hasAppearance(story, characterId, scene.id))
    .map((scene) => scene.id);
}

/** 加了名字却从没安排出场的人物，避免漏排 */
export function charactersWithNoAppearance(story: StoryDocument): StoryCharacter[] {
  return story.characters.filter(
    (character) => !story.appearances.some((appearance) => appearance.characterId === character.id),
  );
}

/**
 * 勾选 / 取消人物在某一幕的出场。场景详情和人物视图共用这一个入口。
 * 取消时连同落在「这个人物 + 这一幕」上的其他记录一起清掉，
 * 任何一侧都不会读到指向已失效关系的孤儿数据。
 */
export function setAppearance(
  story: StoryDocument,
  characterId: string,
  sceneId: string,
  present: boolean,
): StoryDocument {
  const exists = hasAppearance(story, characterId, sceneId);
  if (present === exists) return story;

  const appearances: CharacterAppearance[] = present
    ? [...story.appearances, { characterId, sceneId }]
    : story.appearances.filter(
        (appearance) =>
          !(appearance.characterId === characterId && appearance.sceneId === sceneId),
      );

  // 兼容仍携带旧版 scene.characterIds 冗余副本的内存文档：取消时同步摘除，杜绝悬空副本
  const scenes = story.scenes.map((scene) => {
    if (scene.id !== sceneId || present) return scene;
    const legacy = (scene as StoryScene & { characterIds?: unknown }).characterIds;
    if (!Array.isArray(legacy) || !legacy.includes(characterId)) return scene;
    return {
      id: scene.id,
      title: scene.title,
      order: scene.order,
      summary: scene.summary,
      conflict: scene.conflict,
      clueIds: scene.clueIds,
    };
  });

  return { ...story, scenes, appearances };
}

interface RawCharacter {
  id: unknown;
  name: unknown;
  role?: unknown;
  color?: unknown;
}

function isRawCharacter(value: unknown): value is RawCharacter {
  return !!value && typeof value === 'object' && typeof (value as RawCharacter).id === 'string' && typeof (value as RawCharacter).name === 'string';
}

interface RawScene {
  id: string;
  title: unknown;
  order: unknown;
  summary?: unknown;
  conflict?: unknown;
  clueIds?: unknown;
  characterIds?: unknown;
}

function isRawScene(value: unknown): value is RawScene {
  return !!value && typeof value === 'object' && typeof (value as RawScene).id === 'string';
}

interface RawClue {
  id: unknown;
  title: unknown;
  setupSceneId: unknown;
  payoffSceneId: unknown;
}

function isRawClue(value: unknown): value is RawClue {
  return !!value && typeof value === 'object' && typeof (value as RawClue).id === 'string';
}

/**
 * 校验并规整存档：结构不合法返回 null；
 * 老项目（关系挂在 scene.characterIds 上）迁移到统一的 appearances 关系表，
 * 同时剔除重复关系和指向已删除人物 / 场景的孤儿关系。
 */
export function sanitizeStory(input: unknown): StoryDocument | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<StoryDocument> & Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    !Array.isArray(candidate.characters) ||
    !Array.isArray(candidate.scenes) ||
    !Array.isArray(candidate.clues)
  ) {
    return null;
  }

  const characters: StoryCharacter[] = (candidate.characters as unknown[])
    .filter(isRawCharacter)
    .map((raw) => ({
      id: raw.id as string,
      name: raw.name as string,
      role: typeof raw.role === 'string' ? raw.role : '待定义角色',
      color: typeof raw.color === 'string' ? raw.color : 'coral',
    }));
  const characterIds = new Set(characters.map((character) => character.id));

  // 重建场景时丢弃旧版 characterIds 冗余，出场关系统一由 appearances 承载
  const scenes: StoryScene[] = (candidate.scenes as unknown[])
    .filter(isRawScene)
    .map((raw) => ({
      id: raw.id,
      title: typeof raw.title === 'string' ? raw.title : '未命名场景',
      order: typeof raw.order === 'number' ? raw.order : 0,
      summary: typeof raw.summary === 'string' ? raw.summary : '',
      conflict: typeof raw.conflict === 'string' ? raw.conflict : '',
      clueIds: Array.isArray(raw.clueIds) ? raw.clueIds.filter((id): id is string => typeof id === 'string') : [],
    }));
  const sceneIds = new Set(scenes.map((scene) => scene.id));

  const clues: StoryClue[] = (candidate.clues as unknown[]).filter(isRawClue).map((raw) => ({
    id: raw.id as string,
    title: typeof raw.title === 'string' ? raw.title : '未命名伏笔',
    setupSceneId: typeof raw.setupSceneId === 'string' ? raw.setupSceneId : '',
    payoffSceneId: typeof raw.payoffSceneId === 'string' ? raw.payoffSceneId : '',
  }));

  const rawAppearances: Array<{ characterId: string; sceneId: string }> = [];
  if (Array.isArray(candidate.appearances)) {
    for (const row of candidate.appearances as unknown[]) {
      if (
        row &&
        typeof row === 'object' &&
        typeof (row as CharacterAppearance).characterId === 'string' &&
        typeof (row as CharacterAppearance).sceneId === 'string'
      ) {
        rawAppearances.push({
          characterId: (row as CharacterAppearance).characterId,
          sceneId: (row as CharacterAppearance).sceneId,
        });
      }
    }
  }
  // 老项目迁移：appearances 缺失时，从每一幕的 characterIds 提升关系
  for (const rawScene of (candidate.scenes as unknown[]).filter(isRawScene)) {
    if (!Array.isArray(rawScene.characterIds)) continue;
    for (const id of rawScene.characterIds) {
      if (typeof id === 'string') rawAppearances.push({ characterId: id, sceneId: rawScene.id });
    }
  }

  // 去重 + 剔除指向不存在人物 / 场景的孤儿关系
  const seen = new Set<string>();
  const appearances: CharacterAppearance[] = [];
  for (const appearance of rawAppearances) {
    if (!characterIds.has(appearance.characterId) || !sceneIds.has(appearance.sceneId)) continue;
    const key = appearanceKey(appearance.characterId, appearance.sceneId);
    if (seen.has(key)) continue;
    seen.add(key);
    appearances.push(appearance);
  }

  return {
    version: 1,
    id: candidate.id,
    title: candidate.title,
    status: candidate.status === 'complete' ? 'complete' : 'draft',
    characters,
    scenes,
    clues,
    appearances,
    selectedSceneId:
      typeof candidate.selectedSceneId === 'string' && sceneIds.has(candidate.selectedSceneId)
        ? candidate.selectedSceneId
        : (scenes[0]?.id ?? ''),
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date(0).toISOString(),
  };
}
