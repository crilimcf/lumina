import { useEffect, useState } from 'react';
import { api } from '../api.js';

export function useInvites({ pick, ping }) {
  const [invite, setInvite] = useState(null);
  const [pool, setPool] = useState([]);
  const [idea, setIdea] = useState('');

  useEffect(() => {
    if (!pick) {
      setInvite(null);
      setPool([]);
      return;
    }
    let current = true;
    api.invites.today(pick)
      .then(r => { if (current) setInvite(r); })
      .catch(() => { if (current) setInvite(null); });
    api.invites.proposals(pick)
      .then(r => { if (current) setPool(r.proposals); })
      .catch(() => { if (current) setPool([]); });
    return () => { current = false; };
  }, [pick]);

  const refresh = async () => {
    if (!pick) return;
    const result = await api.invites.proposals(pick);
    setPool(result.proposals);
  };

  const vote = async (proposal) => {
    setPool(list => list.map(x => x.id === proposal.id ? {
      ...x,
      voted: !x.voted,
      vote_count: x.vote_count + (x.voted ? -1 : 1),
    } : x));
    try {
      await api.invites.vote(proposal.id);
    } catch (e) {
      ping(e.message);
      refresh().catch(() => {});
    }
  };

  const propose = async () => {
    if (!idea.trim() || !pick) return;
    try {
      await api.invites.propose(pick, idea.trim());
      setIdea('');
      await refresh();
      ping('Na lista. Se ganhar votos, é o convite de um dia destes.');
    } catch (e) {
      ping(e.message);
    }
  };

  return { invite, pool, idea, setIdea, vote, propose, refresh };
}
