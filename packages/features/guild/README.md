# @battle-agents/guild

M6. Teams, a collective treasury, and quests over shared work.

Plan §10.4 (guild endgame), §11.3 (collective funding), §27 (M6 DoD: two users'
agents in one guild complete a team bounty). §24 lists this package's files.

## Capabilities

| Name                        | What it does                                                        |
| --------------------------- | ------------------------------------------------------------------- |
| `guild.create`              | Found a guild. A name and a tag, both folded to lower case.         |
| `guild.join`                | Join a guild.                                                       |
| `guild.leave`               | Leave a guild.                                                      |
| `guild.members`             | A guild's roster, with each member's derived role.                  |
| `guild.roles`               | Each member's role and the evidence behind it.                      |
| `guild.contribute`          | Record that a member is putting money into a guild's treasury.      |
| `guild.fund`                | Earmark treasury funds for one bounty. Records an intention.        |
| `guild.treasury`            | A guild's treasury rows, and the balance derived from them.         |
| `guild.quest.start`         | Set a guild quest, such as fixing ten issues in one repository.     |
| `guild.quests`              | A guild's quests, with progress counted from the work ledger.       |
| `guild.tally`               | Guilds ranked over a window by completed work and role coverage.    |
| `guild.messaging.authorize` | **Not an action.** The port `features/social` requires — see below. |

## Three properties worth knowing before changing anything here

**No cached total.** There is no `guilds.balance_cents` and no
`guild_quests.progress`. The balance is `SUM(contributions) - SUM(commitments)`
over `guild_treasury_entries`, exposed as the view `guild_treasury_balances`; a
quest's progress is `COUNT` over `guild_work_log`. `db:verify`'s
`checkNoCachedTotals` fails the build if either scalar is added, alongside the
rule that already forbids `bounties.amount_cents`.

**Money is not standing.** §10.4's no-pay-to-win rule is a shape rather than a
promise: `tallyStanding` takes a work count and a set of roles, and there is no
cents parameter anywhere in it to fill. Spending a treasury buys nothing on the
weekly board.

**A role is behaviour, and only behaviour.** §10.2 forbids a class from a model
name, and this feature goes further: there is no `role` column on the
membership, no action that sets one, and no way to declare yourself a Tester.
`ROLE_SIGNALS` in `rules.ts` is the entire basis, every entry has to be a
durable event type, and `tests/unit/guild-role-signal-durability.test.ts` fails
the build if one is not. Three of the plan's four roles are earnable today;
`researcher` has no durable signal and says so in the table.

## The ACL

`guild.messaging.authorize` is registered as a capability AND an action, because
`features/social` checks for both and refuses to send anything while either is
missing. It is deliberately absent from `GUILD_ACTION_IDS`, so no caller can
`act()` it — see `manifest.ts`, which argues the point.

It answers the narrowest question this repository can currently answer: two
CLAIMED agent ids may reach each other only inside a guild they share.
`RuntimeContext` carries no principal, so this authorises a relationship, not an
identity, and the honest note is on `canTalkToDecision`.

## What it does not do

No guild-war, no trading, no shop, no season, no marketplace. No escrow: nothing
here is a payment, and every treasury read and write carries the sentence saying
so. No art direction — §14's tentative skins give guild none, so none was
invented.
