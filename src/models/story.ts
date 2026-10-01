export type StoryStatus = 'draft' | 'complete';

export interface StoryCharacter {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface StoryScene {
  id: string;
  title: string;
  order: number;
  summary: string;
  conflict: string;
  clueIds: string[];
}

/**
 * 出场记录：人物与场景之间多对多关系的唯一数据源。
 * 场景侧的勾选与人物侧的勾选都读写这张表，两边天然保持一致。
 */
export interface StoryAppearance {
  id: string;
  characterId: string;
  sceneId: string;
}

export interface StoryClue {
  id: string;
  title: string;
  setupSceneId: string;
  payoffSceneId: string;
}

export interface StoryDocument {
  version: 2;
  id: string;
  title: string;
  status: StoryStatus;
  characters: StoryCharacter[];
  scenes: StoryScene[];
  appearances: StoryAppearance[];
  clues: StoryClue[];
  selectedSceneId: string;
  updatedAt: string;
}

export interface StoryStats {
  characters: number;
  scenes: number;
  clues: number;
  unresolvedClues: number;
  uncastCharacters: number;
  completion: number;
}

export const characterColors = ['coral', 'blue', 'gold', 'sage', 'violet'] as const;

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 由人物、场景 id 派发出场记录 id，保证迁移幂等、重载后稳定。 */
export function appearanceId(characterId: string, sceneId: string): string {
  return `appearance-${characterId}--${sceneId}`;
}

export function createStarterStory(): StoryDocument {
  const miraId = 'character-mira';
  const juneId = 'character-june';
  const oldHarborId = 'scene-old-harbor';
  const stormId = 'scene-storm';
  const firstLetterId = 'clue-first-letter';
  return {
    version: 2,
    id: 'story-last-lighthouse',
    title: '最后的灯塔',
    status: 'draft',
    characters: [
      { id: miraId, name: '米拉', role: '灯塔守望人', color: 'coral' },
      { id: juneId, name: '裘恩', role: '失踪船长的女儿', color: 'blue' },
    ],
    scenes: [
      {
        id: oldHarborId,
        title: '旧港口的来信',
        order: 1,
        summary: '米拉收到一封来自已故船长的信，潮汐表背面写着一个日期。',
        conflict: '她必须决定是否相信一封不可能寄出的信。',
        clueIds: [firstLetterId],
      },
      {
        id: stormId,
        title: '风暴前夜',
        order: 2,
        summary: '裘恩抵达灯塔，带来一枚从沉船上找到的铜制罗盘。',
        conflict: '两人对罗盘的来历各执一词。',
        clueIds: [],
      },
    ],
    appearances: [
      { id: appearanceId(miraId, oldHarborId), characterId: miraId, sceneId: oldHarborId },
      { id: appearanceId(miraId, stormId), characterId: miraId, sceneId: stormId },
      { id: appearanceId(juneId, stormId), characterId: juneId, sceneId: stormId },
    ],
    clues: [
      {
        id: firstLetterId,
        title: '潮汐表背后的日期',
        setupSceneId: oldHarborId,
        payoffSceneId: '',
      },
    ],
    selectedSceneId: oldHarborId,
    updatedAt: new Date().toISOString(),
  };
}
