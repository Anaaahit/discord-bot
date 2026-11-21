# Pregnant Bot

Run this in one Discord server. Use a channel where everyone who wants to play can see the game messages.

## Set up

1. Open https://discord.com/developers/applications and create a new application named **Pregnant Bot**. If you already created it, set the name to **Pregnant Bot** under **General Information**. Paste the included `description.txt` into the application's **Description** field and save. Its text is:

   ```text
   the most pregnant bot EVER ✌️
   made by Ana! (@anaaaahit)
   ```
2. On **Bot**, set the bot **Username** to **Pregnant Bot**. Upload the included `avatar.png` as the bot's profile picture and save. If you want the application icon to match, upload the same image under **General Information**. Then copy the token (use **Reset Token** if needed). Treat it like a password. Put it only in the local `.env` file.
3. On **Installation**, enable **Guild Install** and use the Discord-provided install link. Add the `bot` and `applications.commands` scopes. Give it **View Channel** and **Send Messages** in your game channel. Use the link to add the bot to your server.
4. In Discord, enable **User Settings → Advanced → Developer Mode**. Right-click your server icon and choose **Copy Server ID**.
5. Install Node.js 24.17 or newer. In Terminal, open this folder and run:

   ```sh
   cp .env.example .env
   open -e .env
   ```

   Paste the bot token into `DISCORD_TOKEN` and the server ID into `DISCORD_SERVER_ID`, then save. To test quickly, set both minute values to `0.1` (six seconds).
6. In that same Terminal window, run:

   ```sh
   npm install
   npm start
   ```

   When the console says **Ready**, type `/impregnant` in your game channel and select a member.

## Play

- The selected member accepts or declines. Invitations expire after 10 minutes.
- After acceptance, Discord displays the reveal countdown and estimated birth time. When the reveal opens, the bot pings the player in the original channel.
- The player starts a gender reveal party and picks **Girl** or **Boy**. The birth timer starts with that choice.
- The birth options stay disabled until the 24-hour timer ends. Then the bot posts an unlocked message, and the player can invite a server member to play as their kid, choose **Miscarriage** for the fictional outcome, or end the game. The kid also accepts or declines. If they decline or the invitation expires, the player can pick again.

## Commands

| Command | What happens |
| --- | --- |
| `/impregnant member:@someone` | Invite that member to start a game. |
| `/babyshower` | The parent opens a shower. Server members press a button to bring one silly gift each. |
| `/babyname` | The parent gets three funny baby-name ideas. Use `/babyname name:Crumb` to save a custom nickname. |
| `/remind` | The parent sees how long remains until the reveal or baby. The bot also posts scheduled reminders. |
| `/ultrasound` | The parent gets a random, silly ultrasound finding. |
| `/guessbirth member:@someone grams:3200` | Anyone in the server guesses that baby's birth weight after the gender choice. They can change their guess until the 24-hour timer ends. The bot announces the actual game weight and closest guess when the timer ends. |

The parent can use their commands after accepting an invitation. Each parent can open one baby shower per round. Birth weight is a randomly generated game result.

The defaults are four hours to the reveal and 24 hours from the gender choice to birth. Keep one copy of the bot running for on-time pings. It saves active rounds in `rounds.json` and checks overdue reminders when it starts again. If your Mac goes to sleep, reminders can arrive after the bot reconnects.
