import { useState } from 'react';
import type { StoryCharacter, StoryScene } from '../models/story';
import type { StoryViewModel } from '../viewmodels/storyViewModel';

interface CharacterPanelProps { viewModel: StoryViewModel; characters: StoryCharacter[]; scenes: StoryScene[]; }

export function CharacterPanel({ viewModel, characters, scenes }: CharacterPanelProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const submit = () => { viewModel.addCharacter(name, role); setName(''); setRole(''); };
  const uncastCount = viewModel.charactersWithNoAppearance.length;
  return (
    <section className="panel character-panel">
      <div className="panel-heading"><div><span className="eyebrow">CAST / 角色阵容</span><h2>人物卡</h2></div>{uncastCount > 0 ? <span className="count-badge count-alert" title="加了名字但还没安排出场">{uncastCount} 人未出场</span> : <span className="count-badge">{characters.length}</span>}</div>
      <div className="character-list">
        {characters.map((character) => {
          const sceneIds = viewModel.sceneIdsForCharacter(character.id);
          const uncast = sceneIds.length === 0;
          return (
            <div className={uncast ? 'character-card uncast' : 'character-card'} key={character.id}>
              <span className={`avatar ${character.color}`}>{character.name.slice(0, 1)}</span>
              <div className="character-body">
                <div className="character-head"><strong>{character.name}</strong>{uncast
                  ? <em className="cast-tag cast-none">从未出场</em>
                  : <em className="cast-tag">{sceneIds.length} 幕</em>}</div>
                <span className="character-role">{character.role}</span>
                <div className="scene-checks">
                  {scenes.map((scene, index) => {
                    const checked = viewModel.isCharacterInScene(character.id, scene.id);
                    return (
                      <label key={scene.id} className={checked ? `scene-check checked ${character.color}` : 'scene-check'} title={scene.title}>
                        <input type="checkbox" checked={checked} onChange={() => viewModel.toggleCharacterScene(character.id, scene.id)} />
                        <span className="scene-no">{String(index + 1).padStart(2, '0')}</span><span className="scene-title">{scene.title}</span>
                      </label>
                    );
                  })}
                  {scenes.length === 0 && <span className="checks-empty">还没有场景，先在时间线上新建一幕。</span>}
                </div>
              </div>
            </div>
          );
        })}
        {characters.length === 0 && <div className="empty-inline">还没有人物，从下方添加第一位角色。</div>}
      </div>
      <div className="inline-form"><input aria-label="人物姓名" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="人物姓名" /><input aria-label="人物身份" value={role} onChange={(event) => setRole(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="身份 / 角色弧" /><button className="icon-add" onClick={submit} aria-label="添加人物">＋</button></div>
    </section>
  );
}
