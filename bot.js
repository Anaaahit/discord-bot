import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, Events,
  GatewayIntentBits, MessageFlags, Routes, UserSelectMenuBuilder,
} from 'discord.js';

function minutes(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0 || value > 525600) {
    throw new Error(name + ' must be a positive number of minutes up to 525600.');
  }
  return Math.ceil(value * 60000);
}

const revealDelay = minutes('REVEAL_MINUTES', 240);
const birthDelay = minutes('BIRTH_MINUTES', 1440);
const inviteDelay = 10 * 60000;
const { DISCORD_TOKEN: token, DISCORD_SERVER_ID: serverId } = process.env;
if (!token || !/^\d{17,20}$/.test(serverId ?? '')) {
  throw new Error('Set DISCORD_TOKEN and DISCORD_SERVER_ID in .env.');
}

const file = new URL('./rounds.json', import.meta.url);
const temp = new URL('./rounds.json.tmp', import.meta.url);
let rounds = {};
try {
  rounds = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function save(id, record) {
  const updated = { ...rounds };
  if (record) updated[id] = record;
  else delete updated[id];
  writeFileSync(temp, JSON.stringify(updated, null, 2), { mode: 0o600 });
  renameSync(temp, file);
  rounds = updated;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const mention = id => '<@' + id + '>';
const relative = ms => '<t:' + Math.ceil(ms / 1000) + ':R>';
const silent = { parse: [], repliedUser: false };
const ping = id => ({ ...silent, users: [id] });
const privateReply = (interaction, content) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: silent });
const babyNames = ['Sir Wiggles', 'Crumb', 'Pickle Junior', 'Duchess Naps', 'Bean Supreme', 'Captain Drool'];
const ultrasoundFindings = [
  'The baby appears to be practicing karate.',
  'The baby is demanding a tiny crown.',
  'The baby is already judging everyone’s music taste.',
  'The baby is holding a very small spoon.',
  'The baby has requested a room with better Wi-Fi.',
];
const gifts = {
  crown: 'Tiny Crown',
  pickles: 'Emergency Pickles',
  diapers: 'Diamond Diapers',
};
const babyPets = [
  'a duckling in tiny boots',
  'a dragon that sneezes confetti',
  'a hamster with a briefcase',
  'a sleepy capybara',
  'a goose with an attitude',
];
const kickMessages = [
  'The baby just kicked the Wi-Fi router.',
  'The baby is practicing karate in there.',
  'The baby kicked exactly when someone said “bedtime.”',
  'The baby wants everyone to know they are awake.',
];
const randomItem = items => items[Math.floor(Math.random() * items.length)];
const activeRound = parent => Object.entries(rounds).find(([, round]) =>
  round.parent === parent && !['invite'].includes(round.stage));

async function saveAndReply(id, previous, updated, interaction, response) {
  save(id, updated);
  try {
    return await interaction.reply(response);
  } catch (error) {
    if (rounds[id] === updated) save(id, previous);
    throw error;
  }
}

function closestGuess(round) {
  const guesses = Object.entries(round.guesses ?? {});
  guesses.sort(([, a], [, b]) =>
    Math.abs(a.grams - round.birthWeight) - Math.abs(b.grams - round.birthWeight) || a.at - b.at);
  if (!guesses.length) return 'Nobody guessed the birth weight.';
  const [userId, guess] = guesses[0];
  return 'Closest guess: ' + mention(userId) + ' with ' + guess.grams + ' g.';
}

async function command(interaction) {
  const name = interaction.commandName;
  if (name === 'impregnant') return invite(interaction);
  const target = name === 'guessbirth' ? interaction.options.getUser('member', true).id : interaction.user.id;
  const entry = activeRound(target);
  if (!entry) return privateReply(interaction, 'That member has no active pregnancy game.');
  const [id, round] = entry;

  if (name === 'remind') {
    const timing = round.stage === 'reveal'
      ? 'Gender reveal ' + relative(round.due) + '. Estimated birth ' + relative(round.due + birthDelay) + ' if you reveal on time.'
      : round.stage === 'party' ? 'Choose the gender to start the 24-hour birth timer.'
      : round.stage === 'birth' ? 'Final choices open ' + relative(round.due) + '.'
      : 'The baby has arrived. The kid invitation expires ' + relative(round.due) + '.';
    return privateReply(interaction, timing);
  }
  if (name === 'ultrasound') {
    return interaction.reply({ content: mention(round.parent) + '’s ultrasound: ' + randomItem(ultrasoundFindings), allowedMentions: silent });
  }
  if (name === 'babyname') {
    const chosen = interaction.options.getString('name');
    if (chosen) {
      save(id, { ...round, name: chosen });
      return interaction.reply({ content: 'Baby nickname chosen: ' + chosen + '.', allowedMentions: silent });
    }
    const pool = [...babyNames];
    const suggestions = Array.from({ length: 3 }, () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return interaction.reply({
      content: 'Baby name ideas: ' + suggestions.join(', ') + '. Use `/babyname name:` to pick your own nickname.' +
        (round.name ? ' Current nickname: ' + round.name + '.' : ''), allowedMentions: silent,
    });
  }
  if (name === 'babyshower') {
    if (round.shower) return privateReply(interaction, 'Your baby shower is already open.');
    save(id, { ...round, shower: true });
    return interaction.reply({
      content: mention(round.parent) + '’s baby shower is open! Pick a ridiculous gift. Gifts received: 0.',
      components: [buttons(id, Object.entries(gifts).map(([key, label]) => ['gift_' + key, label, ButtonStyle.Primary]))],
      allowedMentions: silent,
    });
  }
  if (name === 'guessbirth') {
    if (round.stage !== 'birth' || Date.now() >= round.due) {
      return privateReply(interaction, 'Birth-weight guesses open after the gender choice and close when the baby arrives.');
    }
    const grams = interaction.options.getInteger('grams', true);
    save(id, { ...round, guesses: { ...round.guesses, [interaction.user.id]: { grams, at: Date.now() } } });
    return privateReply(interaction, 'Your guess of ' + grams + ' g is saved. You can change it before the timer ends.');
  }
  if (name === 'godparent') {
    const member = interaction.options.getUser('member', true);
    if (member.bot || member.id === round.parent || member.id === round.child) {
      return privateReply(interaction, 'Pick another server member.');
    }
    if (round.godparent) return privateReply(interaction, mention(round.godparent) + ' is already this baby’s godparent.');
    if (round.godparentInvite?.expiresAt > Date.now()) {
      return privateReply(interaction, 'A godparent invitation is already waiting for a reply.');
    }
    const invitation = { user: member.id, token: randomUUID().slice(0, 8), expiresAt: Date.now() + inviteDelay };
    return saveAndReply(id, round, { ...round, godparentInvite: invitation }, interaction, {
      content: mention(member.id) + ', ' + mention(round.parent) + ' invites you to be the baby’s godparent! Reply ' +
        relative(invitation.expiresAt) + '.',
      components: [buttons(id, [
        ['godparent_yes_' + invitation.token, 'Accept', ButtonStyle.Success],
        ['godparent_no_' + invitation.token, 'Decline', ButtonStyle.Secondary],
      ])],
      allowedMentions: ping(member.id),
    });
  }
  if (name === 'babypet') {
    if (round.pet) return privateReply(interaction, 'Your baby already has ' + round.pet + '.');
    const pet = randomItem(babyPets);
    return saveAndReply(id, round, { ...round, pet }, interaction,
      { content: mention(round.parent) + '’s baby adopted ' + pet + '!', allowedMentions: silent });
  }
  if (name === 'kick') {
    const now = Date.now();
    if (round.stage === 'child' || (round.stage === 'birth' && now >= round.due)) {
      return privateReply(interaction, 'The baby has already arrived.');
    }
    if (now - (round.lastKickAt ?? 0) < inviteDelay) {
      return privateReply(interaction, 'The baby is resting. Try another kick ' + relative(round.lastKickAt + inviteDelay) + '.');
    }
    return saveAndReply(id, round, { ...round, lastKickAt: now }, interaction,
      { content: mention(round.parent) + ': ' + randomItem(kickMessages), allowedMentions: silent });
  }
  if (name === 'panic') {
    if (round.stage === 'child' || (round.stage === 'birth' && Date.now() >= round.due)) {
      return privateReply(interaction, 'The baby has already arrived.');
    }
    if (round.panic?.endsAt > Date.now()) return privateReply(interaction, 'There is already a panic in progress.');
    const panic = { token: randomUUID().slice(0, 8), endsAt: Date.now() + 60000, helpers: [] };
    return saveAndReply(id, round, { ...round, panic }, interaction, {
      content: mention(round.parent) + ' is panicking over a missing baby sock! Two people must press **Stay calm** ' +
        'before ' + relative(panic.endsAt) + '. Helpers: 0/2.',
      components: [buttons(id, [['calm_' + panic.token, 'Stay calm', ButtonStyle.Primary]])],
      allowedMentions: silent,
    });
  }
}

function buttons(id, options) {
  return new ActionRowBuilder().addComponents(options.map(([action, label, style, disabled = false]) =>
    new ButtonBuilder().setCustomId('baby:' + id + ':' + action).setLabel(label).setStyle(style).setDisabled(disabled)
  ));
}

function card(id, round) {
  const parent = mention(round.parent);
  const stop = ['stop', 'End game', ButtonStyle.Secondary];
  switch (round.stage) {
    case 'invite':
      return {
        content: parent + ', ' + mention(round.starter) + ' invited you to play the baby game. This invite expires ' + relative(round.due) + '.',
        components: [buttons(id, [['accept', 'Accept', ButtonStyle.Success], ['decline', 'Decline', ButtonStyle.Secondary]])],
      };
    case 'reveal':
      return {
        content: parent + ', your gender reveal opens ' + relative(round.due) +
          '. Birth is estimated ' + relative(round.due + birthDelay) + ' if you reveal on time.',
        components: [buttons(id, [['reveal', 'Start gender reveal', ButtonStyle.Primary], stop])],
      };
    case 'party':
      return {
        content: parent + ' is hosting a gender reveal party! Pick a result below.',
        components: [buttons(id, [['girl', 'Girl', ButtonStyle.Primary], ['boy', 'Boy', ButtonStyle.Primary], stop])],
      };
    case 'birth': {
      const waiting = Date.now() < round.due;
      return {
        content: parent + ' revealed the baby is a ' + round.result + '! ' +
          (waiting ? 'The baby is due ' + relative(round.due) + '. Birth choices unlock then.' : 'The baby has arrived! Pick an outcome.'),
        components: [buttons(id, [
          ['choose', 'Choose a member', ButtonStyle.Primary, waiting],
          ['loss', 'Miscarriage', ButtonStyle.Secondary, waiting],
          stop,
        ])],
      };
    }
    case 'child':
      return {
        content: mention(round.child) + ', ' + parent + ' invited you to play as their kid. This invite expires ' + relative(round.due) + '.',
        components: [buttons(id, [['join', 'Accept', ButtonStyle.Success], ['pass', 'Decline', ButtonStyle.Secondary]])],
      };
  }
}

async function invite(interaction) {
  const member = interaction.options.getUser('member', true);
  const now = Date.now();
  if (member.bot || member.id === interaction.user.id) {
    return privateReply(interaction, 'Pick another server member.');
  }
  const active = Object.values(rounds).filter(round => round.stage !== 'invite' || round.due > now);
  if (active.some(round => round.parent === member.id ||
    (round.stage === 'invite' && round.starter === interaction.user.id))) {
    return privateReply(interaction, 'That member already has a round or you have an invite pending.');
  }
  const id = randomUUID();
  const round = {
    stage: 'invite', starter: interaction.user.id, parent: member.id,
    channel: interaction.channelId, due: now + inviteDelay,
  };
  save(id, round);
  try {
    await interaction.reply({ ...card(id, round), allowedMentions: ping(member.id) });
  } catch (error) {
    save(id);
    throw error;
  }
}

async function handle(interaction) {
  if (interaction.guildId !== serverId) return;
  if (interaction.isChatInputCommand()) return command(interaction);
  if ((!interaction.isButton() && !interaction.isUserSelectMenu()) ||
      !interaction.customId.startsWith('baby:')) return;

  const [, id, action] = interaction.customId.split(':');
  const round = rounds[id];
  if (!round) return privateReply(interaction, 'This round has ended.');
  if (action.startsWith('gift_') && round.shower && gifts[action.slice(5)]) {
    if (round.gifts?.[interaction.user.id]) return privateReply(interaction, 'You already brought a gift.');
    const given = { ...round.gifts, [interaction.user.id]: gifts[action.slice(5)] };
    save(id, { ...round, gifts: given });
    return interaction.update({
      content: mention(round.parent) + '’s baby shower is open! Pick a ridiculous gift. Gifts received: ' + Object.keys(given).length +
        '. Latest gift: ' + given[interaction.user.id] + ' from ' + mention(interaction.user.id) + '.',
      allowedMentions: silent,
    });
  }
  if (action.startsWith('godparent_')) {
    const invitation = round.godparentInvite;
    if (!invitation || !['godparent_yes_' + invitation.token, 'godparent_no_' + invitation.token].includes(action)) {
      return privateReply(interaction, 'This godparent invitation is no longer active.');
    }
    if (interaction.user.id !== invitation.user) {
      return privateReply(interaction, 'This invitation is for ' + mention(invitation.user) + '.');
    }
    if (Date.now() >= invitation.expiresAt) {
      save(id, { ...round, godparentInvite: null });
      return interaction.update({ content: 'The godparent invitation expired.', components: [], allowedMentions: silent });
    }
    const accepted = action.startsWith('godparent_yes_');
    save(id, { ...round, godparentInvite: null, godparent: accepted ? invitation.user : round.godparent });
    return interaction.update({
      content: accepted ? mention(invitation.user) + ' accepted the godparent invitation!' : 'The godparent invitation was declined.',
      components: [], allowedMentions: silent,
    });
  }
  if (action.startsWith('calm_')) {
    const panic = round.panic;
    if (!panic || action !== 'calm_' + panic.token) return privateReply(interaction, 'This panic has ended.');
    if (Date.now() >= panic.endsAt) {
      save(id, { ...round, panic: null });
      return interaction.update({ content: 'The baby sock was under the couch the whole time. Panic over.', components: [] });
    }
    if (panic.helpers.includes(interaction.user.id)) return privateReply(interaction, 'You already helped calm everyone down.');
    const helpers = [...panic.helpers, interaction.user.id];
    const resolved = helpers.length >= 2;
    save(id, { ...round, panic: resolved ? null : { ...panic, helpers } });
    return interaction.update({
      content: resolved ? 'Two helpers found the baby sock! The panic is over. 🧦' :
        mention(round.parent) + ' is panicking over a missing baby sock! Two people must press **Stay calm** before ' +
        relative(panic.endsAt) + '. Helpers: ' + helpers.length + '/2.',
      ...(resolved ? { components: [] } : {}), allowedMentions: silent,
    });
  }
  const player = round.stage === 'child' && action !== 'stop' ? round.child : round.parent;
  if (interaction.user.id !== player) {
    return privateReply(interaction, 'This button is for ' + mention(player) + '.');
  }

  const now = Date.now();
  const next = (stage, due, extra = {}) => ({ ...round, stage, due, reminded: false, ...extra });
  let updated;
  let message;

  if (action === 'stop' && !['invite', 'child'].includes(round.stage)) {
    message = 'The round has ended.';
  } else if (round.stage === 'invite' && now < round.due && action === 'accept') {
    updated = next('reveal', now + revealDelay);
  } else if (round.stage === 'invite' && now < round.due && action === 'decline') {
    message = 'The invitation was declined.';
  } else if (round.stage === 'reveal' && now >= round.due && action === 'reveal') {
    updated = next('party', null);
  } else if (round.stage === 'party' && ['boy', 'girl'].includes(action)) {
    updated = next('birth', now + birthDelay, { result: action, birthWeight: 2500 + Math.floor(Math.random() * 2001) });
  } else if (round.stage === 'birth' && now < round.due && ['choose', 'loss', 'select'].includes(action)) {
    return interaction.update({ ...card(id, round), allowedMentions: silent });
  } else if (round.stage === 'birth' && now >= round.due && action === 'loss') {
    message = 'This round ended with a miscarriage.';
  } else if (round.stage === 'birth' && now >= round.due && action === 'choose') {
    const menu = new UserSelectMenuBuilder().setCustomId('baby:' + id + ':select')
      .setPlaceholder('Pick a server member');
    return interaction.reply({
      content: 'Who would you like to invite as your kid?',
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
  } else if (round.stage === 'birth' && now >= round.due &&
             action === 'select' && interaction.isUserSelectMenu()) {
    const child = interaction.users.get(interaction.values[0]);
    if (!child || child.bot || child.id === round.parent) {
      return privateReply(interaction, 'Pick another server member.');
    }
    updated = next('child', now + inviteDelay, { child: child.id });
  } else if (round.stage === 'child' && now < round.due && action === 'join') {
    message = mention(round.child) + ' joined the game as ' + mention(round.parent) + '’s kid!';
  } else if (round.stage === 'child' && now < round.due && action === 'pass') {
    updated = next('birth', now, { child: null, reminded: true });
  } else {
    return privateReply(interaction, 'That option is unavailable right now. Check the latest game message.');
  }

  save(id, updated);
  const response = updated ? card(id, updated) : { content: message, components: [] };
  if (updated?.stage === 'child') {
    await interaction.reply({ ...response, allowedMentions: ping(updated.child) });
  } else {
    await interaction.update({ ...response, allowedMentions: silent });
  }
}

let checking = false;
async function reminders() {
  if (checking) return;
  checking = true;
  try {
    for (const [id, savedRound] of Object.entries(rounds)) {
      let round = savedRound;
      if (rounds[id] !== round || round.due === null || Date.now() < round.due) continue;
      if (round.stage === 'invite') {
        save(id);
        continue;
      }
      if (round.reminded) continue;
      if (round.stage === 'birth' && !round.birthWeight) {
        save(id, { ...round, birthWeight: 2500 + Math.floor(Math.random() * 2001) });
        round = rounds[id];
      }
      try {
        const channel = await client.channels.fetch(round.channel);
        if (rounds[id] !== round || !channel?.isSendable()) continue;
        const expired = round.stage === 'child';
        const current = expired ? { ...round, stage: 'birth', child: null } : round;
        const content = round.stage === 'reveal' ? 'Your gender reveal is ready!' :
          expired ? 'The kid invitation expired. You can pick someone else.' :
            'Your final choices are ready! The baby weighs ' + round.birthWeight + ' g. ' + closestGuess(round);
        const response = card(id, current);
        const sent = await channel.send({
          ...response, content: mention(round.parent) + ', ' + content,
          allowedMentions: ping(round.parent),
        });
        if (rounds[id] === round) save(id, { ...current, reminded: true });
        else await sent.delete();
      } catch (error) {
        console.error('Could not deliver reminder:', error.message);
      }
    }
  } finally {
    checking = false;
  }
}

client.on(Events.InteractionCreate, interaction => {
  handle(interaction).catch(async error => {
    console.error('Interaction failed:', error.message);
    if (!interaction.replied && !interaction.deferred) {
      await privateReply(interaction, 'Something went wrong. Check the bot console.').catch(() => {});
    }
  });
});

client.once(Events.ClientReady, async ready => {
  try {
    await ready.rest.put(Routes.applicationGuildCommands(ready.application.id, serverId), {
      body: [
        {
          name: 'impregnant', description: 'Invite a member to play the baby game',
          options: [{ type: 6, name: 'member', description: 'Who to invite', required: true }],
        },
        { name: 'babyshower', description: 'Open a baby shower with silly gifts' },
        {
          name: 'babyname', description: 'Get funny baby names or set a nickname',
          options: [{ type: 3, name: 'name', description: 'Optional nickname for your baby', max_length: 30 }],
        },
        { name: 'remind', description: 'See when your reveal or baby is due' },
        { name: 'ultrasound', description: 'Get a funny ultrasound finding' },
        {
          name: 'guessbirth', description: 'Guess the baby’s birth weight in grams',
          options: [
            { type: 6, name: 'member', description: 'Which parent’s baby', required: true },
            { type: 4, name: 'grams', description: 'Your guess in grams', required: true, min_value: 1500, max_value: 6000 },
          ],
        },
        {
          name: 'godparent', description: 'Invite someone to be the baby’s godparent',
          options: [{ type: 6, name: 'member', description: 'Who to invite', required: true }],
        },
        { name: 'babypet', description: 'Give your baby a surprise imaginary pet' },
        { name: 'kick', description: 'Announce a dramatic baby kick' },
        { name: 'panic', description: 'Ask the server to help with a missing baby sock' },
      ],
    });
    console.log('Ready as ' + ready.user.tag + '. Try /impregnant in your server.');
    setInterval(() => void reminders().catch(console.error), 5000);
    await reminders();
  } catch (error) {
    console.error('Startup failed:', error.message);
    ready.destroy();
    process.exitCode = 1;
  }
});

await client.login(token).catch(error => {
  console.error('Login failed:', error.message);
  process.exitCode = 1;
});
