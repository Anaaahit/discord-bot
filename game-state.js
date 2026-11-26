export function scopeFor(interaction) {
  return interaction.guildId ?? 'dm:' + interaction.channelId;
}

export function canUseRound(round, interaction) {
  if (round.guild === scopeFor(interaction)) return true;
  // A group-DM reminder is delivered to the parent's private chat with the bot.
  return round.context === 2 && interaction.context === 1 &&
    round.deliveryChannel === interaction.channelId && round.parent === interaction.user.id;
}

export function activeRound(rounds, scopeId, parentId) {
  return Object.entries(rounds).find(([, round]) =>
    round.guild === scopeId && round.parent === parentId && round.stage !== 'invite');
}

export function inviteBlocked(rounds, scopeId, parentId, starterId, now) {
  return Object.values(rounds).some(round =>
    round.guild === scopeId &&
    (round.stage !== 'invite' || round.due > now) &&
    (round.parent === parentId || (round.stage === 'invite' && round.starter === starterId)));
}
