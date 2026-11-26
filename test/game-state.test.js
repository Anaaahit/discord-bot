import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeRound, inviteBlocked } from '../game-state.js';

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
