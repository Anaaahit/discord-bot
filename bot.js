import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import {
  ActionRowBuilder, ActivityType, ApplicationIntegrationType, ButtonBuilder, ButtonStyle, Client, Events,
  GatewayIntentBits, InteractionContextType, MessageFlags, OAuth2Scopes, PermissionFlagsBits, Routes,
  UserSelectMenuBuilder,
} from 'discord.js';
import { activeRound, canUseRound, inviteBlocked, scopeFor } from './game-state.js';

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
if (!token || (serverId && !/^\d{17,20}$/.test(serverId))) {
  throw new Error('Set DISCORD_TOKEN in .env. DISCORD_SERVER_ID, if present, must be a valid server ID.');
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

// Existing single-server rounds predate the guild field. Keep them in their original server.
if (serverId) {
  for (const [id, round] of Object.entries(rounds)) {
    if (!round.guild) save(id, { ...round, guild: serverId });
  }
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
  const target = name === 'guessbirth' ? (interaction.options.getUser('member')?.id ?? interaction.user.id) : interaction.user.id;
  const entry = activeRound(rounds, scopeFor(interaction), target);
  if (!entry) return privateReply(interaction, 'That member has no active pregnancy game.');
  const [id, round] = entry;

  if (name === 'remind') {
    if (round.context === InteractionContextType.PrivateChannel &&
        interaction.context === InteractionContextType.PrivateChannel) {
      if (round.stage === 'child' && Date.now() >= round.due) {
        const reopened = { ...round, stage: 'birth', child: null, reminded: true };
        save(id, reopened);
        return interaction.reply({ ...card(id, reopened), allowedMentions: silent });
      }
      if (round.stage === 'party' ||
          (round.stage === 'birth' || round.stage === 'reveal') && Date.now() >= round.due) {
        return interaction.reply({ ...card(id, round), allowedMentions: silent });
      }
    }
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
    if (round.context === InteractionContextType.BotDM) {
      return privateReply(interaction, 'Invite a godparent from a server or a chat with friends.');
    }
    const member = interaction.options.getUser('member', true);
    if (member.bot || member.id === round.parent || member.id === round.child) {
      return privateReply(interaction, 'Pick another person in this chat.');
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
    if (round.context === InteractionContextType.BotDM) {
      return privateReply(interaction, 'The baby-sock panic needs friends in a server or shared chat.');
    }
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
          (waiting ? 'The baby is due ' + relative(round.due) + '. Birth choices unlock then.' :
            round.context === InteractionContextType.BotDM ?
              'The baby has arrived! Play in a server or shared DM to choose a member as your kid.' :
              'The baby has arrived! Pick an outcome.'),
        components: [buttons(id, [
          ['choose', 'Choose a member', ButtonStyle.Primary, waiting || round.context === InteractionContextType.BotDM],
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
  const member = interaction.options.getUser('member');
  const solo = interaction.context === InteractionContextType.BotDM;
  const now = Date.now();
  if (!member && !solo) return privateReply(interaction, 'Choose someone in this chat to invite.');
  if (solo && member && member.id !== interaction.user.id) {
    return privateReply(interaction, 'In a private chat with the bot, leave member blank to play solo.');
  }
  const parent = member ?? interaction.user;
  if (parent.bot || (!solo && parent.id === interaction.user.id)) {
    return privateReply(interaction, 'Pick another person in this chat.');
  }
  const scope = scopeFor(interaction);
  if (inviteBlocked(rounds, scope, parent.id, interaction.user.id, now)) {
    return privateReply(interaction, 'That member already has a round or you have an invite pending.');
  }
  const id = randomUUID();
  const round = {
    stage: solo ? 'reveal' : 'invite', starter: interaction.user.id, parent: parent.id,
    guild: scope, context: interaction.context, channel: interaction.channelId,
    due: now + (solo ? revealDelay : inviteDelay),
  };
  save(id, round);
  try {
    await interaction.reply({ ...card(id, round), allowedMentions: solo ? silent : ping(parent.id) });
  } catch (error) {
    save(id);
    throw error;
  }
}

async function handle(interaction) {
  if (!interaction.guildId && !interaction.channelId) return;
  if (interaction.guildId && !client.guilds.cache.has(interaction.guildId)) {
    return privateReply(interaction, 'Add Pregnant Bot to this server to play here, or use it in a DM.');
  }
  if (interaction.isChatInputCommand()) return command(interaction);
  if ((!interaction.isButton() && !interaction.isUserSelectMenu()) ||
      !interaction.customId.startsWith('baby:')) return;

  const [, id, action] = interaction.customId.split(':');
  const round = rounds[id];
  if (!round) return privateReply(interaction, 'This round has ended.');
  if (!canUseRound(round, interaction)) return privateReply(interaction, 'This game belongs to another chat.');
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
    if (round.context === InteractionContextType.PrivateChannel && interaction.channelId !== round.channel) {
      return privateReply(interaction, 'Open the original chat and use /remind to choose a member.');
    }
    const menu = new UserSelectMenuBuilder().setCustomId('baby:' + id + ':select')
      .setPlaceholder('Pick a member of this chat');
    return interaction.reply({
      content: 'Who would you like to invite as your kid?',
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
  } else if (round.stage === 'birth' && now >= round.due &&
             action === 'select' && interaction.isUserSelectMenu()) {
    const child = interaction.users.get(interaction.values[0]);
    if (!child || child.bot || child.id === round.parent) {
      return privateReply(interaction, 'Pick another person in this chat.');
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
const reminderRetryAt = new Map();
async function reminders() {
  if (checking) return;
  checking = true;
  try {
    for (const [id, savedRound] of Object.entries(rounds)) {
      let round = savedRound;
      if (rounds[id] !== round || round.due === null || Date.now() < round.due ||
          Date.now() < (reminderRetryAt.get(id) ?? 0)) continue;
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
        const channel = round.context === InteractionContextType.PrivateChannel
          ? await (await client.users.fetch(round.parent)).createDM()
          : await client.channels.fetch(round.channel);
        if (rounds[id] !== round) continue;
        const correctChannel = round.context === InteractionContextType.PrivateChannel ||
          round.context === InteractionContextType.BotDM ? channel?.id === round.channel :
            channel?.guildId === round.guild;
        if (!channel?.isSendable() || !correctChannel) {
          reminderRetryAt.set(id, Date.now() + 60000);
          continue;
        }
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
        if (rounds[id] === round) {
          save(id, { ...current, reminded: true,
            ...(round.context === InteractionContextType.PrivateChannel ? { deliveryChannel: channel.id } : {}),
          });
          reminderRetryAt.delete(id);
        }
        else await sent.delete();
      } catch (error) {
        reminderRetryAt.set(id, Date.now() + 60000);
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
    ready.user.setActivity('so excited for pregnancies!!', { type: ActivityType.Custom });
    let userInstall = false;
    try {
      const application = await ready.application.fetch();
      userInstall = Object.hasOwn(application.integrationTypesConfig ?? {}, String(ApplicationIntegrationType.UserInstall));
    } catch (error) {
      console.warn('Could not check user-install settings; enabling bot DMs only:', error.message);
    }
    const definitions = [
        {
          name: 'impregnant', description: 'Start a solo DM game or invite someone in a shared chat',
          options: [{ type: 6, name: 'member', description: 'Who to invite (leave blank in bot DMs)' }],
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
            { type: 4, name: 'grams', description: 'Your guess in grams', required: true, min_value: 1500, max_value: 6000 },
            { type: 6, name: 'member', description: 'Which parent’s baby (defaults to you)' },
          ],
        },
        {
          name: 'godparent', description: 'Invite someone to be the baby’s godparent',
          options: [{ type: 6, name: 'member', description: 'Who to invite', required: true }],
        },
        { name: 'babypet', description: 'Give your baby a surprise imaginary pet' },
        { name: 'kick', description: 'Announce a dramatic baby kick' },
        { name: 'panic', description: 'Ask the server to help with a missing baby sock' },
      ];
    const register = enabled => ready.rest.put(Routes.applicationCommands(ready.application.id), {
      body: definitions.map(command => ({
        ...command,
        integration_types: enabled
          ? [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall]
          : [ApplicationIntegrationType.GuildInstall],
        contexts: enabled
          ? [InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]
          : [InteractionContextType.Guild, InteractionContextType.BotDM],
      })),
    });
    try {
      await register(userInstall);
    } catch (error) {
      if (!userInstall) throw error;
      console.warn('Shared-DM commands could not be registered; using server and bot DMs:', error.message);
      userInstall = false;
      await register(false);
    }
    if (serverId) {
      try {
        await ready.rest.put(Routes.applicationGuildCommands(ready.application.id, serverId), { body: [] });
      } catch (error) {
        console.warn('Could not remove old server-only commands:', error.message);
      }
    }
    console.log('Invite link: ' + ready.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
    }));
    if (userInstall) {
      console.log('Account install link for shared DMs: https://discord.com/oauth2/authorize?client_id=' +
        ready.application.id + '&integration_type=1&scope=applications.commands');
    } else {
      console.log('Enable User Install in the Developer Portal to make commands available in shared DMs.');
    }
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
