import { describe, expect, it } from 'vitest';
import { createStarterStory, type StoryDocument } from '../models/story';
import {
  characterAppearsInScene,
  characterIdsInScene,
  getStats,
  getTimelineWarning,
  orderedScenes,
  sanitizeStory,
  sceneIdsForCharacter,
  setCharacterAppearance,
  uncastCharacters,
  validateName,
} from '../models/storyRules';

describe('story domain rules', () => {
  it('sorts scenes and calculates unresolved clues', () => {
    const story = createStarterStory();
    story.scenes = [...story.scenes].reverse();
    expect(orderedScenes(story).map((scene) => scene.title)).toEqual(['旧港口的来信', '风暴前夜']);
    expect(getStats(story)).toMatchObject({ characters: 2, scenes: 2, clues: 1, unresolvedClues: 1, completion: 80 });
  });

  it('guards invalid names and duplicate timeline orders', () => {
    const story = createStarterStory();
    story.scenes[1].order = story.scenes[0].order;
    expect(validateName(' ')).toBe('至少输入 2 个字');
    expect(getTimelineWarning(story)).toContain('重复');
  });

  it('rejects corrupt persisted documents', () => {
    expect(sanitizeStory('{bad json}')).toBeNull();
    expect(sanitizeStory({ version: 99 })).toBeNull();
    expect(sanitizeStory(createStarterStory())).not.toBeNull();
  });

  it('reads the same appearance relation from both the scene side and the character side', () => {
    const story = createStarterStory();
    const [harbor, storm] = orderedScenes(story);
    const mira = story.characters[0];
    const june = story.characters[1];

    // 示例数据：米拉两幕都在，裘恩只在第二幕
    expect(characterIdsInScene(story, harbor.id)).toEqual([mira.id]);
    expect(characterIdsInScene(story, storm.id)).toEqual([mira.id, june.id]);
    expect(sceneIdsForCharacter(story, mira.id).map((id) => id)).toEqual([harbor.id, storm.id]);
    expect(sceneIdsForCharacter(story, june.id)).toEqual([storm.id]);
  });

  it('lets either side edit the relation and reflects it on the other side', () => {
    const story = createStarterStory();
    const [harbor] = orderedScenes(story);
    const mira = story.characters[0];
    const june = story.characters[1];

    // 人物侧勾选：裘恩补进第一幕 —— 场景侧立刻能看到
    const added = setCharacterAppearance(story, june.id, harbor.id, true);
    expect(characterAppearsInScene(added, june.id, harbor.id)).toBe(true);
    expect(characterIdsInScene(added, harbor.id)).toContain(june.id);
    expect(sceneIdsForCharacter(added, june.id)).toContain(harbor.id);
    // 幂等：重复勾选不产生重复记录
    expect(setCharacterAppearance(added, june.id, harbor.id, true).appearances).toHaveLength(added.appearances.length);

    // 场景侧取消：只删掉落在这一对人物/场景上的记录，其他记录保持不变，不产生孤儿
    const removed = setCharacterAppearance(added, june.id, harbor.id, false);
    expect(characterIdsInScene(removed, harbor.id)).not.toContain(june.id);
    expect(characterIdsInScene(removed, harbor.id)).toContain(mira.id);
    expect(characterIdsInScene(removed, orderedScenes(removed)[1].id)).toEqual([mira.id, june.id]);
    expect(removed.appearances.every((appearance) =>
      removed.characters.some((character) => character.id === appearance.characterId) &&
      removed.scenes.some((scene) => scene.id === appearance.sceneId),
    )).toBe(true);
  });

  it('flags characters that never appear in any scene', () => {
    const story = createStarterStory();
    expect(uncastCharacters(story)).toHaveLength(0);
    // 新增一位只登记、尚未安排出场的人物
    const storyWithIdle = {
      ...story,
      characters: [...story.characters, { id: 'character-lo', name: '洛', role: '守塔学徒', color: 'gold' }],
    };
    expect(uncastCharacters(storyWithIdle).map((character) => character.id)).toEqual(['character-lo']);
    expect(getStats(storyWithIdle).uncastCharacters).toBe(1);
    // 安排一场之后不再被标记
    const casted = setCharacterAppearance(storyWithIdle, 'character-lo', story.scenes[0].id, true);
    expect(uncastCharacters(casted)).toHaveLength(0);
  });

  it('migrates legacy v1 documents whose appearances live on scenes[].characterIds', () => {
    const legacy = {
      version: 1,
      id: 'legacy-story',
      title: '老项目',
      status: 'draft',
      characters: [
        { id: 'c1', name: '甲', role: '主角', color: 'coral' },
        { id: 'c2', name: '乙', role: '配角', color: 'blue' },
      ],
      scenes: [
        { id: 's1', title: '第一幕', order: 1, summary: '', conflict: '', characterIds: ['c1', 'c2'], clueIds: [] },
        { id: 's2', title: '第二幕', order: 2, summary: '', conflict: '', characterIds: ['c1', 'c1'], clueIds: [] },
      ],
      clues: [],
      selectedSceneId: 's1',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    const migrated = sanitizeStory(legacy) as StoryDocument;
    expect(migrated).not.toBeNull();
    expect(migrated.version).toBe(2);
    expect(migrated.scenes[0]).not.toHaveProperty('characterIds');
    // 旧数据两边都能读：场景侧
    expect(characterIdsInScene(migrated, 's1').sort()).toEqual(['c1', 'c2']);
    // 重复的 c1 被去重
    expect(characterIdsInScene(migrated, 's2')).toEqual(['c1']);
    // 人物侧
    expect(sceneIdsForCharacter(migrated, 'c1')).toEqual(['s1', 's2']);
    expect(sceneIdsForCharacter(migrated, 'c2')).toEqual(['s1']);
    // 指向已删除人物/场景的悬空关系在迁移时被剔除
    const dangling = sanitizeStory({
      ...legacy,
      scenes: [...legacy.scenes, { id: 's3', title: '第三幕', order: 3, summary: '', conflict: '', characterIds: ['c-ghost', 'c1'], clueIds: [] }],
    }) as StoryDocument;
    expect(characterIdsInScene(dangling, 's3')).toEqual(['c1']);
  });
});
