export function activeRound(rounds, guildId, parentId) {
  return Object.entries(rounds).find(([, round]) =>
    round.guild === guildId && round.parent === parentId && round.stage !== 'invite');
}

export function inviteBlocked(rounds, guildId, parentId, starterId, now) {
  return Object.values(rounds).some(round =>
    round.guild === guildId &&
    (round.stage !== 'invite' || round.due > now) &&
    (round.parent === parentId || (round.stage === 'invite' && round.starter === starterId)));
}
