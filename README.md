
## Commands

| Command | What happens |
| --- | --- |
| `/impregnant member:@someone` | Invite someone in a server or shared DM; leave `member` blank in a DM with the bot to play solo. |
| `/babyshower` | The parent opens a shower. Server members press a button to bring one silly gift each. |
| `/babyname` | The parent gets three funny baby-name ideas. Use `/babyname name:Crumb` to save a custom nickname. |
| `/remind` | The parent sees how long remains until the reveal or baby. The bot also posts scheduled reminders. |
| `/ultrasound` | The parent gets a random, silly ultrasound finding. |
| `/guessbirth grams:3200 member:@someone` | Guess a baby's birth weight after the gender choice. `member` defaults to you. You can change your guess until the 24-hour timer ends. |
| `/godparent member:@someone` | The parent invites a member to be the baby's godparent. That person accepts or declines within 10 minutes. |
| `/babypet` | The parent gets one random imaginary pet for the baby. |
| `/kick` | The parent announces a random funny kick, with a 10-minute rest between kicks. |
| `/panic` | The parent starts a 60-second baby-sock panic. Two different members must press **Stay calm** to win. |

The parent can use their commands after accepting an invitation. Each parent can open one baby shower per round. Birth weight is a randomly generated game result.

The defaults are four hours to the reveal and 24 hours from the gender choice to birth. Keep one copy of the bot running for on-time pings. It saves active rounds in `rounds.json` and checks overdue reminders when it starts again. If your Mac goes to sleep, reminders can arrive after the bot reconnects.

## Invite to other servers

[Add Pregnant Bot to your server](https://discord.com/oauth2/authorize?client_id=1556291117354319872&scope=bot%20applications.commands&permissions=3072)

When the bot starts, it prints a server invite link. To let other people install it, enable **Public Bot** in the Discord Developer Portal's **Bot** tab. Give the bot permission to view and send messages in channels where the game is played so it can post its reminders. Commands and games work separately in each server. If you used an older single-server version, keep `DISCORD_SERVER_ID` in `.env` for the first restart to preserve active games and remove the old server-only commands. New installations need only `DISCORD_TOKEN` in `.env`. Keep the bot running for timers to fire on time.

## Play in direct messages

- To play solo, open a DM with Pregnant Bot and run `/impregnant` without a member. Timers and result buttons appear in that DM. `/godparent`, `/panic`, and choosing a member as your kid need other people in the same chat, so use a server or shared DM for those.
- To play in a DM with a friend or in a group DM, enable **User Install** under **Installation** in the Discord Developer Portal. Set its default scope to `applications.commands`, then restart the bot. [Add Pregnant Bot to your account](https://discord.com/oauth2/authorize?client_id=1556291117354319872&integration_type=1&scope=applications.commands) and use `/impregnant member:@someone` in your shared chat. Discord may require a member of the chat to install the app before the commands appear.
- The bot can reply to buttons and commands in a shared DM, but it cannot start a new group-DM message hours later. Timed reminders go to the parent's DM with the bot when Discord permits it. If that DM is blocked or the reminder does not arrive, use `/remind` in the original chat to bring up the current choices.
