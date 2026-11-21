
## Commands

| Command | What happens |
| --- | --- |
| `/impregnant member:@someone` | Invite that member to start a game. |
| `/babyshower` | The parent opens a shower. Server members press a button to bring one silly gift each. |
| `/babyname` | The parent gets three funny baby-name ideas. Use `/babyname name:Crumb` to save a custom nickname. |
| `/remind` | The parent sees how long remains until the reveal or baby. The bot also posts scheduled reminders. |
| `/ultrasound` | The parent gets a random, silly ultrasound finding. |
| `/guessbirth member:@someone grams:3200` | Anyone in the server guesses that baby's birth weight after the gender choice. They can change their guess until the 24-hour timer ends. The bot announces the actual game weight and closest guess when the timer ends. |
| `/godparent member:@someone` | The parent invites a member to be the baby's godparent. That person accepts or declines within 10 minutes. |
| `/babypet` | The parent gets one random imaginary pet for the baby. |
| `/kick` | The parent announces a random funny kick, with a 10-minute rest between kicks. |
| `/panic` | The parent starts a 60-second baby-sock panic. Two different members must press **Stay calm** to win. |

The parent can use their commands after accepting an invitation. Each parent can open one baby shower per round. Birth weight is a randomly generated game result.

The defaults are four hours to the reveal and 24 hours from the gender choice to birth. Keep one copy of the bot running for on-time pings. It saves active rounds in `rounds.json` and checks overdue reminders when it starts again. If your Mac goes to sleep, reminders can arrive after the bot reconnects.
