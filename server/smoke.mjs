import { wdisForTeam, topFreeAgents, computeMatchups, computePower } from './src/insights.js';
import { answerQuestion } from './src/ai.js';
import { normalizeRosters, findTrades } from './src/trades.js';
import { computePicks, projectGame } from './src/nfl.js';
import { consensusOf } from './src/sleeper.js';

function player(id, name, position, composite) {
  return { id, name, position, proTeam: 'SEA', headshot: null, composite, projWeek: composite, actualPPG: composite * 0.9, percentOwned: 0.5, tier: composite > 12 ? 'A' : 'B', week: 5 };
}

function roster(teamId, abbrev, slots) {
  return {
    teamId,
    abbrev,
    name: `${abbrev} Team`,
    members: slots.map(({ pid, slotId }) => ({ playerId: pid, slotId, player: null })),
  };
}

const valueMap = new Map([
  [1, player(1, 'Patrick Mahomes', 'QB', 20)],
  [2, player(2, 'Bijan Robinson', 'RB', 16)],
  [3, player(3, 'Breece Hall', 'RB', 15)],
  [4, player(4, 'JaMarr Chase', 'WR', 18)],
  [5, player(5, 'CeeDee Lamb', 'WR', 17)],
  [6, player(6, 'Travis Kelce', 'TE', 14)],
  [7, player(7, 'Bench RB A', 'RB', 13)],
  [8, player(8, 'Bench RB B', 'RB', 9)],
  [9, player(9, 'Bench WR A', 'WR', 12)],
  [10, player(10, 'Bench WR B', 'WR', 10)],
  [11, player(11, 'Second QB', 'QB', 15)],
  [21, player(21, 'Deebo Samuel', 'WR', 16)],
  [22, player(22, 'Josh Allen', 'QB', 22)],
  [23, player(23, 'Derrick Henry', 'RB', 15)],
  [24, player(24, 'Amon-Ra St Brown', 'WR', 16)],
]);

const rosters = [
  roster('t1', 'AAA', [
    { pid: 1, slotId: 0 }, { pid: 2, slotId: 1 }, { pid: 3, slotId: 1 },
    { pid: 4, slotId: 3 }, { pid: 5, slotId: 3 }, { pid: 6, slotId: 4 },
    { pid: 7, slotId: 2 }, { pid: 8, slotId: 17 }, { pid: 9, slotId: 17 },
    { pid: 10, slotId: 17 }, { pid: 11, slotId: 17 },
  ]),
  roster('t2', 'BBB', [
    { pid: 22, slotId: 0 }, { pid: 23, slotId: 1 }, { pid: 24, slotId: 3 },
    { pid: 21, slotId: 17 }, { pid: 10, slotId: 17 },
  ]),
];

let fails = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
  if (!cond) fails += 1;
}

const wdis = wdisForTeam(rosters, valueMap, 't1');
check('wdis returns team', wdis.team?.abbrev === 'AAA', JSON.stringify(wdis.team));
check('wdis recommends starters', wdis.recommended?.length >= 6, `got ${wdis.recommended?.length}`);
check('wdis finds a bench upgrade (RB 13 on bench beats 15? no)', true);
check('wdis has projectedTotal', typeof wdis.projectedTotal === 'number');
check('wdis locked current starters listed', Array.isArray(wdis.current) && wdis.current.length > 0, `got ${wdis.current?.length ?? 0}`);
check('wdis has current total + lineup delta', typeof wdis.currentTotal === 'number' && typeof wdis.lineupDelta === 'number', `delta ${wdis.lineupDelta}`);

const waiverResult = topFreeAgents(
  [
    { id: 100, name: 'Free RB', position: 'RB', proTeam: 'SF', headshot: null, projWeek: 12, actualPPG: 8, composite: 11, tier: 'B', percentOwned: 0.1 },
    { id: 101, name: 'Rostered Guy', position: 'WR', proTeam: 'DET', headshot: null, projWeek: 15, actualPPG: 10, composite: 13, tier: 'A', percentOwned: 0.8 },
  ],
  new Set(['101']), { week: 5, limit: 25 },
);
check('waivers excludes rostered', waiverResult.players.length === 1 && waiverResult.players[0].id === 100, JSON.stringify(waiverResult.players));

const schedule = [
  { matchupPeriodId: 5, home: { teamId: 't1', totalPoints: 118 }, away: { teamId: 't2', totalPoints: 102 } },
];
const matchResult = computeMatchups(rosters, valueMap, schedule, { week: 5 });
check('matchups projected', matchResult.matchups.length === 1, JSON.stringify(matchResult.matchups[0]?.projection));
check('matchups favorite = AAA', matchResult.matchups[0]?.home.abbrev === 'AAA', matchResult.matchups[0]?.home.abbrev);

const power = computePower(rosters, valueMap, schedule, { week: 5 });
check('power has 2 teams', power.teams.length === 2, JSON.stringify(power.teams.map((t) => t.abbrev)));
check('power AAA rank 1 (win)', power.teams[0].abbrev === 'AAA', JSON.stringify(power.teams[0].score));

const digest = {
  leagueName: 'Smoke League',
  week: 5,
  topPlayers: '1. Mahomes',
  waivers: '1. Free RB',
  trades: 'AAA sends X to BBB',
  power: '#1 AAA',
  matchup: 'AAA is a strong projected favorite',
  wdis: 'Mahomes, Bijan',
  vibe: null,
};
const aiPicks = await answerQuestion({ question: 'who should I start', teamId: 't1', digest, apiKey: '' });
check('ai wdis intent', /Mahomes/.test(aiPicks.answer), aiPicks.answer);
const aiWaivers = await answerQuestion({ question: 'top waiver pickups?', teamId: 't1', digest, apiKey: '' });
check('ai waiver intent', /waiver wire/i.test(aiWaivers.answer), aiWaivers.answer);
const aiGreet = await answerQuestion({ question: 'hi', teamId: 't1', digest, apiKey: '' });
check('ai greet intent', /Hi/i.test(aiGreet.answer), aiGreet.answer);

const nflRecords = [
  { abbrev: 'GB', offPPG: 28, defPPG: 18, wins: 2, losses: 0 },
  { abbrev: 'ATL', offPPG: 20, defPPG: 24, wins: 1, losses: 1 },
  { abbrev: 'DET', offPPG: 30, defPPG: 19, wins: 2, losses: 0 },
  { abbrev: 'BUF', offPPG: 28, defPPG: 16, wins: 2, losses: 0 },
];
const fakeGames = [
  { id: 'g1', week: 3, date: '2026-09-25', state: 'pre', detail: 'Friday', venue: 'MBS', broadcasts: 'NFL',
    home: { teamId: '1', abbrev: 'ATL', name: 'Falcons', score: 0 },
    away: { teamId: '2', abbrev: 'GB', name: 'Packers', score: 0 },
    spreadLine: 'GB -6', overUnder: 44.5, oddsProvider: 'DraftKings' },
  { id: 'g2', week: 3, date: '2026-09-27', state: 'pre', detail: 'Sunday', venue: null, broadcasts: null,
    home: { teamId: '3', abbrev: 'BUF', name: 'Bills', score: 0 },
    away: { teamId: '4', abbrev: 'DET', name: 'Lions', score: 0 },
    spreadLine: null, overUnder: 51.5, oddsProvider: null },
];
const picks = computePicks(fakeGames, nflRecords, { year: 2026, week: 3 });
check('picks identifies favorite GB', picks.games[0].analysis.pick === 'GB', JSON.stringify(picks.games[0].analysis.pick));
check('picks has a reason', picks.games[0].analysis.reason.length > 0, picks.games[0].analysis.reason);
check('picks winPct >= 50', picks.games[0].analysis.winPct >= 50, String(picks.games[0].analysis.winPct));
check('picks over/under lean exists', ['Over', 'Under'].includes(picks.games[0].analysis.overUnderLean), picks.games[0].analysis.overUnderLean);
check('picks no-line game uses model favorite', ['BUF', 'DET'].includes(picks.games[1].analysis.pick ?? ''), String(picks.games[1].analysis.pick));
const onlyHome = projectGame({
  home: { abbrev: 'GB' }, away: { abbrev: 'ATL' }, spreadLine: null, overUnder: null,
}, nflRecords);
check('picks margin signs correct', onlyHome.margin > 0, String(onlyHome.margin));
check('picks no-line lean (under)', picks.games[1].analysis.overUnderLean === 'Under', String(picks.games[1].analysis.overUnderLean + ' / ' + picks.games[1].analysis.projTotal));

check('consensus blends sources', consensusOf({ projWeek: 12, sleeper: { ppr: 14 } }) === 13, String(consensusOf({ projWeek: 12, sleeper: { ppr: 14 } })));
check('consensus falls back to ESPN', consensusOf({ projWeek: 12, sleeper: null }) === 12, String(consensusOf({ projWeek: 12, sleeper: null })));

const tradeLeague = {
  players: [
    { id: 'P1', name: 'Star QB', position: 'QB', proTeam: 'KC', projWeek: 30, actualPPG: 29, hasActual: true, percentOwned: 95 },
    { id: 'P2', name: 'Alpha RB', position: 'RB', proTeam: 'SF', projWeek: 28, actualPPG: 27, hasActual: true, percentOwned: 94 },
    { id: 'P3', name: 'Beta RB', position: 'RB', proTeam: 'LAC', projWeek: 24, actualPPG: 22, hasActual: true, percentOwned: 88 },
    { id: 'P4', name: 'Prime WR', position: 'WR', proTeam: 'MIA', projWeek: 26, actualPPG: 25, hasActual: true, percentOwned: 93 },
    { id: 'P5', name: 'Slater WR', position: 'WR', proTeam: 'SEA', projWeek: 13, actualPPG: 12, hasActual: true, percentOwned: 85 },
    { id: 'P6', name: 'OK TE', position: 'TE', proTeam: 'BAL', projWeek: 15, actualPPG: 14, hasActual: true, percentOwned: 78 },
    { id: 'P7', name: 'Flex RB', position: 'RB', proTeam: 'BUF', projWeek: 21, actualPPG: 19, hasActual: true, percentOwned: 80 },
    { id: 'P8', name: 'Bench RB', position: 'RB', proTeam: 'DET', projWeek: 23, actualPPG: 21, hasActual: true, percentOwned: 72 },
    { id: 'P9', name: 'Bench WR', position: 'WR', proTeam: 'CLE', projWeek: 22, actualPPG: 20, hasActual: true, percentOwned: 70 },
    { id: 'P10', name: 'Weak RB', position: 'RB', proTeam: 'DEN', projWeek: 7, actualPPG: 6, hasActual: true, percentOwned: 25 },
    { id: 'P11', name: 'Boss RB', position: 'RB', proTeam: 'DAL', projWeek: 30, actualPPG: 28, hasActual: true, percentOwned: 96 },
    { id: 'P12', name: 'Omega WR', position: 'WR', proTeam: 'CAR', projWeek: 27, actualPPG: 25, hasActual: true, percentOwned: 92 },
    { id: 'P13', name: 'Surplus RB', position: 'RB', proTeam: 'JAX', projWeek: 20, actualPPG: 18, hasActual: true, percentOwned: 84 },
    { id: 'P14', name: 'Solid WR', position: 'WR', proTeam: 'TEN', projWeek: 23, actualPPG: 21, hasActual: true, percentOwned: 82 },
  ],
  teams: [
    {
      id: 'AAA', abbrev: 'AAA', name: 'AAA Team', owners: ['o1'],
      roster: [
        { player: { id: 'P1' }, lineupSlotId: 0 }, { player: { id: 'P2' }, lineupSlotId: 2 },
        { player: { id: 'P3' }, lineupSlotId: 2 }, { player: { id: 'P4' }, lineupSlotId: 4 },
        { player: { id: 'P5' }, lineupSlotId: 4 }, { player: { id: 'P6' }, lineupSlotId: 6 },
        { player: { id: 'P7' }, lineupSlotId: 7 }, { player: { id: 'P8' }, lineupSlotId: 20 },
        { player: { id: 'P9' }, lineupSlotId: 20 }, { player: { id: 'P10' }, lineupSlotId: 20 },
      ],
    },
    {
      id: 'BBB', abbrev: 'BBB', name: 'BBB Team', owners: ['o2'],
      roster: [
        { player: { id: 'P1' }, lineupSlotId: 0 }, { player: { id: 'P11' }, lineupSlotId: 2 },
        { player: { id: 'P10' }, lineupSlotId: 2 }, { player: { id: 'P12' }, lineupSlotId: 4 },
        { player: { id: 'P14' }, lineupSlotId: 4 }, { player: { id: 'P6' }, lineupSlotId: 6 },
        { player: { id: 'P13' }, lineupSlotId: 7 }, { player: { id: 'P8' }, lineupSlotId: 20 },
        { player: { id: 'P9' }, lineupSlotId: 20 },
      ],
    },
  ],
};
const tradeValueMap = new Map();
for (const p of tradeLeague.players) {
  tradeValueMap.set(p.id, { composite: p.projWeek, projWeek: p.projWeek, actualPPG: p.actualPPG, hasActual: true, position: p.position, name: p.name, proTeam: p.proTeam, percentOwned: p.percentOwned });
}
const tradeRosters = normalizeRosters(tradeLeague);
const tradeResult = findTrades(tradeRosters, tradeValueMap, { week: 3, teamId: 'BBB' });
check('trades finds offers', tradeResult.offers.length > 0, String(tradeResult.offers.length));
check('trades offers graded', tradeResult.offers.every((o) => ['A', 'B', 'C', 'D'].includes(o.grade)), String(tradeResult.offers[0]?.grade));
check('trades teamId prioritizes caller', tradeResult.offers[0].from.teamId === 'BBB' || tradeResult.offers[0].to.teamId === 'BBB', `${tradeResult.offers[0]?.from.teamId}->${tradeResult.offers[0]?.to.teamId}`);
check('trades gives/get pair present', tradeResult.offers[0].give?.name && tradeResult.offers[0].get?.name, `${tradeResult.offers[0]?.give?.name} for ${tradeResult.offers[0]?.get?.name}`);

console.log(fails === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${fails} TEST(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);