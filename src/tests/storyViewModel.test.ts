import { describe, expect, it } from 'vitest';
import { createStarterStory, type StoryDocument } from '../models/story';
import {
  charactersWithNoAppearance,
  characterIdsInScene,
  hasAppearance,
  sanitizeStory,
  sceneIdsForCharacter,
  setAppearance,
} from '../models/storyRules';
import { LocalStoryRepository } from '../repositories/storyRepository';
import { MemoryStorageService } from '../services/storageService';
import { StoryViewModel } from '../viewmodels/storyViewModel';

describe('story view model', () => {
  it('initializes, edits, persists, and restores the main flow', () => {
    const repository = new LocalStoryRepository(new MemoryStorageService());
    const viewModel = new StoryViewModel(repository);
    viewModel.initialize();
    expect(viewModel.snapshot.status).toBe('ready');
    viewModel.addCharacter('阿洛', '修复师');
    viewModel.addScene('地下档案室', '他们找到被隐藏的航海日志。');
    const scene = viewModel.selectedScene;
    expect(scene?.title).toBe('地下档案室');
    viewModel.toggleCharacter(scene?.id ?? '', viewModel.snapshot.story?.characters[2]?.id ?? '');
    expect(viewModel.snapshot.stats.characters).toBe(3);

    const restored = new StoryViewModel(repository);
    restored.initialize();
    expect(restored.snapshot.story?.scenes.some((item) => item.title === '地下档案室')).toBe(true);
    expect(restored.snapshot.story?.characters.some((item) => item.name === '阿洛')).toBe(true);
  });

  it('shows recoverable validation feedback and resets corrupt storage', () => {
    const storage = new MemoryStorageService();
    storage.write('{broken');
    const viewModel = new StoryViewModel(new LocalStoryRepository(storage));
    viewModel.initialize();
    viewModel.addCharacter(' ', '');
    expect(viewModel.snapshot.notice).toContain('至少');
    viewModel.resetProject();
    expect(viewModel.snapshot.story?.id).toBe(createStarterStory().id);
  });

  it('keeps scene-side and character-side toggles on the same data', () => {
    const storage = new MemoryStorageService();
    const viewModel = new StoryViewModel(new LocalStoryRepository(storage));
    viewModel.initialize();
    const story = viewModel.snapshot.story!;
    const mira = story.characters[0].id;
    const harbor = story.scenes.find((scene) => scene.title === '旧港口的来信')!.id;

    // 人物侧取消
    viewModel.toggleCharacterScene(mira, harbor);
    expect(viewModel.isCharacterInScene(mira, harbor)).toBe(false);
    expect(viewModel.sceneIdsForCharacter(mira)).not.toContain(harbor);
    // 场景侧立刻反映同一改动
    expect(viewModel.snapshot.story!.appearances).not.toContainEqual({ characterId: mira, sceneId: harbor });

    // 场景侧勾回
    viewModel.toggleCharacter(harbor, mira);
    expect(viewModel.isCharacterInScene(mira, harbor)).toBe(true);

    // 重新加载后依旧是同一份数据
    const reloaded = new StoryViewModel(new LocalStoryRepository(storage));
    reloaded.initialize();
    expect(reloaded.isCharacterInScene(mira, harbor)).toBe(true);
  });

  it('flags characters that never appear', () => {
    const viewModel = new StoryViewModel(new LocalStoryRepository(new MemoryStorageService()));
    viewModel.initialize();
    viewModel.addCharacter('路人甲', '背景角色');
    const extra = viewModel.snapshot.story!.characters.find((character) => character.name === '路人甲')!;
    expect(viewModel.charactersWithNoAppearance.map((character) => character.id)).toContain(extra.id);
    const firstScene = viewModel.orderedSceneList[0].id;
    viewModel.toggleCharacterScene(extra.id, firstScene);
    expect(viewModel.charactersWithNoAppearance.map((character) => character.id)).not.toContain(extra.id);
  });
});

describe('appearance relationship rules', () => {
  it('removes without leaving orphaned copies in either view', () => {
    const story = createStarterStory();
    const mira = story.characters[0].id;
    const harbor = story.scenes[0].id;
    expect(hasAppearance(story, mira, harbor)).toBe(true);

    const next = setAppearance(story, mira, harbor, false);
    expect(characterIdsInScene(next, harbor)).not.toContain(mira);
    expect(sceneIdsForCharacter(next, mira)).not.toContain(harbor);
    expect(next.appearances.some((item) => item.characterId === mira && item.sceneId === harbor)).toBe(false);

    // 对仍携带旧版内嵌 characterIds 的内存文档，取消时同步摘除，不留悬空副本
    const legacy = createStarterStory();
    legacy.scenes.forEach((scene) => {
      (scene as unknown as Record<string, unknown>).characterIds = characterIdsInScene(story, scene.id);
    });
    const cleaned = setAppearance(legacy, mira, harbor, false);
    expect(cleaned.scenes.find((scene) => scene.id === harbor)).not.toHaveProperty('characterIds');
  });

  it('migrates legacy projects whose appearances live on scene.characterIds', () => {
    const starter = createStarterStory();
    const mira = starter.characters[0].id;
    const june = starter.characters[1].id;
    const harbor = starter.scenes[0].id;
    const storm = starter.scenes[1].id;
    // 构造一份老格式存档：没有 appearances，关系挂在场景上，还带重复和悬空引用
    const legacy = {
      ...starter,
      appearances: undefined,
      scenes: starter.scenes.map((scene) => ({
        ...scene,
        characterIds: scene.id === harbor ? [mira, mira, 'character-deleted'] : [mira, june],
      })),
    } as unknown as StoryDocument;

    const migrated = sanitizeStory(legacy)!;
    expect(migrated.appearances).toEqual([
      { characterId: mira, sceneId: harbor },
      { characterId: mira, sceneId: storm },
      { characterId: june, sceneId: storm },
    ]);
    // 冗余的旧字段不再随场景保存
    expect(migrated.scenes[0]).not.toHaveProperty('characterIds');
    expect(characterIdsInScene(migrated, harbor)).toEqual([mira]);
    expect(charactersWithNoAppearance(migrated)).toEqual([]);
  });

  it('reads legacy appearances end-to-end through the repository', () => {
    const starter = createStarterStory();
    const mira = starter.characters[0].id;
    const june = starter.characters[1].id;
    const legacyDocument = {
      ...starter,
      appearances: undefined,
      scenes: starter.scenes.map((scene, index) => ({ ...scene, characterIds: index === 0 ? [mira] : [] })),
    };
    const storage = new MemoryStorageService();
    storage.write(JSON.stringify(legacyDocument));
    const viewModel = new StoryViewModel(new LocalStoryRepository(storage));
    viewModel.initialize();
    expect(viewModel.sceneIdsForCharacter(mira)).toEqual([starter.scenes[0].id]);
    expect(viewModel.charactersWithNoAppearance.map((character) => character.id)).toEqual([june]);
  });
});
