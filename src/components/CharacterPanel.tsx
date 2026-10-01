import { useState } from 'react';
import type { StoryCharacter, StoryScene } from '../models/story';
import type { StoryViewModel } from '../viewmodels/storyViewModel';

interface CharacterPanelProps { viewModel: StoryViewModel; characters: StoryCharacter[]; scenes: StoryScene[]; }

export function CharacterPanel({ viewModel, characters, scenes }: CharacterPanelProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const submit = () => { viewModel.addCharacter(name, role); setName(''); setRole(''); };
  const uncastCount = viewModel.snapshot.stats.uncastCharacters;
  return (
    <section className="panel character-panel">
      <div className="panel-heading"><div><span className="eyebrow">CAST / 角色阵容</span><h2>人物卡</h2></div><span className="count-badge">{characters.length}</span></div>
      {uncastCount > 0 && <div className="uncast-banner" role="status">△ 有 {uncastCount} 位人物从未出场，记得在下方为他们安排场景。</div>}
      <div className="character-list">
        {characters.map((character) => {
          const sceneIds = viewModel.appearingSceneIds(character.id);
          const uncast = sceneIds.length === 0;
          return (
            <div className={uncast ? 'character-card uncast' : 'character-card'} key={character.id}>
              <span className={`avatar ${character.color}`}>{character.name.slice(0, 1)}</span>
              <div className="character-body">
                <div className="character-head">
                  <strong>{character.name}</strong>
                  {uncast
                    ? <em className="cast-badge cast-badge-none">从未出场</em>
                    : <em className="cast-badge">出场 {sceneIds.length} 幕</em>}
                </div>
                <span>{character.role}</span>
                <div className="appearance-toggles" role="group" aria-label={`${character.name} 的出场场景`}>
                  {scenes.map((scene, index) => {
                    const checked = sceneIds.includes(scene.id);
                    return (
                      <label key={scene.id} className={checked ? `appearance-chip selected ${character.color}` : 'appearance-chip'}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => viewModel.setAppearance(character.id, scene.id, event.target.checked)}
                        />
                        <span className="appearance-no">{String(index + 1).padStart(2, '0')}</span>
                        <span className="appearance-title">{scene.title}</span>
                      </label>
                    );
                  })}
                  {scenes.length === 0 && <span className="empty-inline">还没有场景，先在时间线里创建一幕。</span>}
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
