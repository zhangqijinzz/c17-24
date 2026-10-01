import { describe, expect, it } from 'vitest';
import { createStarterStory } from '../models/story';
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

  it('keeps one shared appearance dataset editable from both sides', () => {
    const repository = new LocalStoryRepository(new MemoryStorageService());
    const viewModel = new StoryViewModel(repository);
    viewModel.initialize();
    const [harbor, storm] = viewModel.allScenes;
    const [mira, june] = viewModel.snapshot.story!.characters;

    // 初始：裘恩只在第二幕
    expect(viewModel.appearsIn(june.id, harbor.id)).toBe(false);
    expect(viewModel.appearsIn(june.id, storm.id)).toBe(true);
    expect(viewModel.appearingSceneIds(june.id)).toEqual([storm.id]);

    // 人物侧勾选第一幕
    viewModel.setAppearance(june.id, harbor.id, true);
    // 场景侧立刻看到同一变化
    expect(viewModel.appearsIn(june.id, harbor.id)).toBe(true);
    expect(viewModel.appearingSceneIds(june.id)).toEqual([harbor.id, storm.id]);

    // 场景侧取消第二幕，人物侧同步消失，米拉的记录不受影响
    viewModel.toggleCharacter(storm.id, june.id);
    expect(viewModel.appearsIn(june.id, storm.id)).toBe(false);
    expect(viewModel.appearingSceneIds(june.id)).toEqual([harbor.id]);
    expect(viewModel.appearsIn(mira.id, storm.id)).toBe(true);

    // 重载后关系仍一致
    const restored = new StoryViewModel(repository);
    restored.initialize();
    expect(restored.appearsIn(june.id, harbor.id)).toBe(true);
    expect(restored.appearsIn(june.id, storm.id)).toBe(false);
  });

  it('marks never-cast characters until they are scheduled into a scene', () => {
    const viewModel = new StoryViewModel(new LocalStoryRepository(new MemoryStorageService()));
    viewModel.initialize();
    viewModel.addCharacter('洛安', '守塔学徒');
    const lo = viewModel.snapshot.story!.characters.find((character) => character.name === '洛安')!;
    expect(viewModel.snapshot.stats.uncastCharacters).toBe(1);
    expect(viewModel.appearingSceneIds(lo.id)).toEqual([]);

    viewModel.setAppearance(lo.id, viewModel.allScenes[0].id, true);
    expect(viewModel.snapshot.stats.uncastCharacters).toBe(0);
  });

  it('loads legacy v1 projects and reads appearances from both sides', () => {
    const storage = new MemoryStorageService();
    storage.write(JSON.stringify({
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
        { id: 's2', title: '第二幕', order: 2, summary: '', conflict: '', characterIds: ['c1'], clueIds: [] },
      ],
      clues: [],
      selectedSceneId: 's1',
      updatedAt: new Date().toISOString(),
    }));
    const viewModel = new StoryViewModel(new LocalStoryRepository(storage));
    viewModel.initialize();
    expect(viewModel.snapshot.story?.version).toBe(2);
    expect(viewModel.appearsIn('c1', 's1')).toBe(true);
    expect(viewModel.appearsIn('c2', 's1')).toBe(true);
    expect(viewModel.appearsIn('c2', 's2')).toBe(false);
    // 人物侧读出的同样是迁移后的关系
    expect(viewModel.appearingSceneIds('c2')).toEqual(['s1']);
    // 在老数据上继续编辑也正常
    viewModel.setAppearance('c2', 's2', true);
    expect(viewModel.appearsIn('c2', 's2')).toBe(true);
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
});
