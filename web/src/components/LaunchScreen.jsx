import React from 'react';
import { t } from '../i18n-ui.js';
import '../launch-polish.css';

const LETTERS = [...'Lumina'];

export function LaunchScreen() {
  return <div className="lumina-launch" role="status" aria-label={t('Lumina a iniciar')}>
    <div className="lumina-launch-lockup">
      <span className="lumina-launch-mark" aria-hidden="true" />
      <div className="lumina-launch-word" aria-label="Lumina">
        {LETTERS.map((letter, index) => <span
          key={`${letter}-${index}`}
          className="lumina-launch-letter"
          aria-hidden="true"
          style={{ '--i': index }}
        >{letter}</span>)}
      </div>
      <span className="lumina-launch-glint" aria-hidden="true" />
      <div className="lumina-launch-tagline">{t('Sua luz, suas conexões')}.</div>
    </div>
  </div>;
}
