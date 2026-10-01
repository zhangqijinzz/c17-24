import { appearanceId, type StoryAppearance, type StoryDocument, type StoryScene, type StoryStats } from './story';

export function orderedScenes(story: StoryDocument): StoryScene[] {
  return [...story.scenes].sort((a, b) => a.order - b.order);
}

/* ------------------------------------------------------------------ */
/* 出场关系：appearances 是唯一数据源，场景侧与人物侧共用下面的读写函数 */
/* ------------------------------------------------------------------ */

/** 某一幕的出场人物 id（场景侧使用）。 */
export function characterIdsInScene(story: StoryDocument, sceneId: string): string[] {
  return story.appearances.filter((appearance) => appearance.sceneId === sceneId).map((appearance) => appearance.characterId);
}

/** 某个人物出场的场景 id，按时间顺序返回（人物侧使用）。 */
export function sceneIdsForCharacter(story: StoryDocument, characterId: string): string[] {
  const linkedIds = new Set(
    story.appearances.filter((appearance) => appearance.characterId === characterId).map((appearance) => appearance.sceneId),
  );
  return orderedScenes(story).filter((scene) => linkedIds.has(scene.id)).map((scene) => scene.id);
}

export function characterAppearsInScene(story: StoryDocument, characterId: string, sceneId: string): boolean {
  return story.appearances.some((appearance) => appearance.characterId === characterId && appearance.sceneId === sceneId);
}

/** 从未被安排出场的人物。 */
export function uncastCharacters(story: StoryDocument) {
  return story.characters.filter((character) => !story.appearances.some((appearance) => appearance.characterId === character.id));
}

/**
 * 建立或解除一条出场关系。任一侧（场景详情 / 人物卡）都调用它。
 * 解除时只移除精确命中的那一条记录，不触碰其他记录，因此不会产生孤儿数据。
 */
export function setCharacterAppearance(story: StoryDocument, characterId: string, sceneId: string, appears: boolean): StoryDocument {
  if (!story.characters.some((character) => character.id === characterId) || !story.scenes.some((scene) => scene.id === sceneId)) {
    return story;
  }
  const linked = characterAppearsInScene(story, characterId, sceneId);
  if (appears === linked) return story;
  const appearances = appears
    ? [...story.appearances, { id: appearanceId(characterId, sceneId), characterId, sceneId }]
    : story.appearances.filter((appearance) => !(appearance.characterId === characterId && appearance.sceneId === sceneId));
  return { ...story, appearances };
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
    uncastCharacters: uncastCharacters(story).length,
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

/* ------------------------------------------------------------------------ */
/* 读取兼容：v1 文档把出场关系挂在 scenes[].characterIds 上，加载时迁移到     */
/* appearances 关联表，老项目的出场数据在场景侧和人物侧都能正常读出来。       */
/* ------------------------------------------------------------------------ */

interface LegacyScene {
  id: string;
  title: string;
  order: number;
  summary: string;
  conflict: string;
  clueIds: string[];
  characterIds?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeAppearances(
  rawPairs: ReadonlyArray<{ characterId: unknown; sceneId: unknown }>,
  characterIds: Set<string>,
  sceneIds: Set<string>,
): StoryAppearance[] {
  const seen = new Set<string>();
  const appearances: StoryAppearance[] = [];
  for (const pair of rawPairs) {
    if (typeof pair.characterId !== 'string' || typeof pair.sceneId !== 'string') continue;
    if (!characterIds.has(pair.characterId) || !sceneIds.has(pair.sceneId)) continue;
    const key = `${pair.characterId}/${pair.sceneId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    appearances.push({ id: appearanceId(pair.characterId, pair.sceneId), characterId: pair.characterId, sceneId: pair.sceneId });
  }
  return appearances;
}

export function sanitizeStory(input: unknown): StoryDocument | null {
  if (!isRecord(input)) return null;
  const version = input.version === 1 || input.version === 2 ? input.version : null;
  if (
    version === null ||
    typeof input.id !== 'string' ||
    typeof input.title !== 'string' ||
    !Array.isArray(input.characters) ||
    !Array.isArray(input.scenes) ||
    !Array.isArray(input.clues)
  ) {
    return null;
  }

  const characters = input.characters.filter(
    (character): character is StoryDocument['characters'][number] =>
      isRecord(character) && typeof character.id === 'string' && typeof character.name === 'string',
  );
  const scenes: StoryScene[] = input.scenes
    .filter((scene): scene is LegacyScene => isRecord(scene) && typeof scene.id === 'string')
    .map((scene) => ({
      id: scene.id,
      title: typeof scene.title === 'string' ? scene.title : '',
      order: typeof scene.order === 'number' ? scene.order : 0,
      summary: typeof scene.summary === 'string' ? scene.summary : '',
      conflict: typeof scene.conflict === 'string' ? scene.conflict : '',
      clueIds: Array.isArray(scene.clueIds) ? scene.clueIds.filter((clueId): clueId is string => typeof clueId === 'string') : [],
    }));

  const characterIds = new Set(characters.map((character) => character.id));
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const rawPairs: Array<{ characterId: unknown; sceneId: unknown }> = version === 2 && Array.isArray(input.appearances)
    ? input.appearances
    : input.scenes.flatMap((scene) =>
        isRecord(scene) && Array.isArray(scene.characterIds)
          ? scene.characterIds.map((characterId) => ({ characterId, sceneId: scene.id }))
          : [],
      );
  const appearances = normalizeAppearances(rawPairs, characterIds, sceneIds);

  return {
    version: 2,
    id: input.id,
    title: input.title,
    status: input.status === 'complete' ? 'complete' : 'draft',
    characters,
    scenes,
    appearances,
    clues: input.clues as StoryDocument['clues'],
    selectedSceneId: typeof input.selectedSceneId === 'string' ? input.selectedSceneId : '',
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
  };
}
