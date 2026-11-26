import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeRound, canUseRound, inviteBlocked, scopeFor } from '../game-state.js';

test('the same parent can play independently in two servers', () => {
  const rounds = {
    first: { guild: 'one', parent: 'parent', stage: 'birth' },
    second: { guild: 'two', parent: 'parent', stage: 'reveal' },
  };
  assert.equal(activeRound(rounds, 'one', 'parent')?.[0], 'first');
  assert.equal(activeRound(rounds, 'two', 'parent')?.[0], 'second');
  assert.equal(activeRound(rounds, 'three', 'parent'), undefined);
  assert.equal(inviteBlocked(rounds, 'three', 'parent', 'starter', 100), false);
  assert.equal(inviteBlocked(rounds, 'one', 'parent', 'starter', 100), true);
});

test('pending invitations block only the same server and expire', () => {
  const rounds = { invite: { guild: 'one', parent: 'parent', starter: 'starter', stage: 'invite', due: 100 } };
  assert.equal(inviteBlocked(rounds, 'one', 'other', 'starter', 99), true);
  assert.equal(inviteBlocked(rounds, 'two', 'parent', 'starter', 99), false);
  assert.equal(inviteBlocked(rounds, 'one', 'parent', 'starter', 100), false);
});

test('private games stay in their chat, including separate bot DMs', () => {
  const first = { guildId: null, channelId: 'alice-chat', user: { id: 'alice' }, context: 1 };
  const second = { guildId: null, channelId: 'bob-chat', user: { id: 'bob' }, context: 1 };
  assert.equal(scopeFor(first), 'dm:alice-chat');
  assert.equal(scopeFor({ guildId: 'server', channelId: 'guild-channel' }), 'server');
  const round = { guild: scopeFor(first), context: 1, parent: 'alice' };
  assert.equal(canUseRound(round, first), true);
  assert.equal(canUseRound(round, second), false);
  assert.equal(inviteBlocked({ solo: { ...round, stage: 'reveal' } }, scopeFor(second), 'alice', 'bob', 100), false);
});

test('group-DM reminders can only be used by their parent in the delivery DM', () => {
  const round = { guild: 'dm:group', context: 2, channel: 'group', parent: 'alice', deliveryChannel: 'alice-chat' };
  assert.equal(canUseRound(round, { guildId: null, channelId: 'group', context: 2, user: { id: 'bob' } }), true);
  assert.equal(canUseRound(round, { guildId: null, channelId: 'alice-chat', context: 1, user: { id: 'alice' } }), true);
  assert.equal(canUseRound(round, { guildId: null, channelId: 'alice-chat', context: 1, user: { id: 'bob' } }), false);
  assert.equal(canUseRound(round, { guildId: null, channelId: 'other-chat', context: 1, user: { id: 'alice' } }), false);
});
