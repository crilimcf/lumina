import React from 'react';
import { Orb } from '../ui.jsx';

export function MomentRing({ palette, avatarUrl, allSeen, size = 52, children }) {
  return <div style={{ padding: 2, borderRadius: '50%', background: allSeen ? '#C9C4DB' : 'linear-gradient(135deg,var(--coral),var(--cobalt))', display: 'grid', placeItems: 'center' }}>
    {children || <Orb p={palette} avatarUrl={avatarUrl} s={size} />}
  </div>;
}
