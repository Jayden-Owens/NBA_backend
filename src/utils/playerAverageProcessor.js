import axios from 'axios';
import Player from '../models/player.js';
import LatestStatsDate from "../models/StatsDate.js"
import Current from '../models/current.js';
import { calculateProjection } from './calculateProjection.js';

const monthNumberToAbbr = (monthNumber) => {
  const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ];
  return months[monthNumber] || 'Invalid month';
};



export async function processPlayerAverageData(email, name, current_season, subscribed, remainingTrialDays) {
    console.log('started processing for');
    
    
    const date = new Date();
    const curYear = date.getFullYear();
    const curMonth = date.getMonth();
    const year = current_season - 1;
    const formattedDate = `${curYear}-${monthNumberToAbbr(curMonth)}-${String(date.getDate()).padStart(2, '0')}`;
    
    const url4 = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerGameProjectionStatsByDate/${formattedDate}`;
   
    const url5 = `https://api.sportsdata.io/api/nba/fantasy/json/DfsSlatesByDate/${formattedDate}`;

    const url6 = `https://api.sportsdata.io/api/nba/odds/json/TeamSeasonStats/${year}`;

    
    const [response, response5, teamStats] = await Promise.all([
        axios.get(url4, { headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } }),
        axios.get(url5, { headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } }),
        axios.get(url6, { headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } }),
    ]);
    const slateData = response5.data.filter(slate => slate.OperatorGameType == 'Classic' && slate.Operator == 'DraftKings');

    if (response.status !== 200 || response5.status !== 200) {
        console.error('Error fetching data from API'+response.status+response5.status);
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const playerMetaMap = new Map();
    slateData.forEach(slate => {
        slate.DfsSlatePlayers.forEach(player => {
            playerMetaMap.set(player.PlayerID, {
                salary: player.OperatorSalary,
                position: player.OperatorPosition
            });
        });
    });

    let players = [];
    let ID = 0;
    for (const data of response.data) {
        const meta = playerMetaMap.get(data.PlayerID) || {};
        const DKSalary = meta.salary || 0;
        const Position = meta.position || 'NaN';

        // Run all aggregations in parallel
        const [
            home_sum,
            away_sum,
            last5_sum,
            opponent_sum
        ] = await Promise.all([
            Player.aggregate([
                { $match: { PlayerID: data.PlayerID, HomeOrAway: 'HOME' } },
                { $group: { _id: null, FantasyPoints: { $sum: '$FantasyPoints' }, Minutes: { $sum: '$Minutes' }, Seconds: { $sum: '$Seconds' } } }
            ]),
            Player.aggregate([
                { $match: { PlayerID: data.PlayerID, HomeOrAway: 'AWAY' } },
                { $group: { _id: null, FantasyPoints: { $sum: '$FantasyPoints' }, Minutes: { $sum: '$Minutes' }, Seconds: { $sum: '$Seconds' } } }
            ]),
            Player.aggregate([
                { $match: { PlayerID: data.PlayerID } },
                { $sort: { date: -1 } },
                { $limit: 5 },
                { $group: { _id: null, FantasyPoints: { $sum: '$FantasyPoints' }, Minutes: { $sum: '$Minutes' }, Seconds: { $sum: '$Seconds' } } }
            ]),
            Player.aggregate([
                { $match: { PlayerID: data.PlayerID, OpponentID: data.OpponentID } },
                { $group: { _id: null, FantasyPoints: { $sum: '$FantasyPoints' }, Minutes: { $sum: '$Minutes' }, Seconds: { $sum: '$Seconds' } } }
            ])
        ]);

        // Compute averages
        const calcFPPM = (sum) =>
            sum[0] ? sum[0].FantasyPoints / (sum[0].Minutes + sum[0].Seconds / 60) : 0;

        const AvgFPPMHome = calcFPPM(home_sum);
        const AvgFPPMAway = calcFPPM(away_sum);
        const AvgFPPMLast5 = calcFPPM(last5_sum);
        const AvgFPPMOpponent = calcFPPM(opponent_sum);

        const AvgFPPM = (home_sum[0] && away_sum[0])
            ? (home_sum[0].FantasyPoints + away_sum[0].FantasyPoints) /
            (home_sum[0].Minutes + home_sum[0].Seconds / 60 + away_sum[0].Minutes + away_sum[0].Seconds / 60)
            : (home_sum[0] ? AvgFPPMHome : AvgFPPMAway);

        const SDProjectedFPPM = data.FantasyPoints / (data.Minutes + data.Seconds / 60);
        const ProjectedMinutes = data.Minutes + data.Seconds / 60;

        // Weighted projection
        let count_number = 5;
        const weights = [AvgFPPM, AvgFPPMHome, AvgFPPMAway, AvgFPPMLast5, AvgFPPMOpponent, SDProjectedFPPM];
        weights.forEach(val => {
            if (val === 0 || isNaN(val)) count_number--;
        });
        if (count_number <= 0) count_number = 1;

        const projectionSum = weights.reduce((acc, val) => acc + (isNaN(val) ? 0 : val), 0);
        const ProjectedFantasyPoints = (projectionSum / count_number) * ProjectedMinutes;

        const player = {
            ID: ++ID,
            Name: data.Name,
            Position,
            Team: data.Team,
            Opponent: data.Opponent,
            ProjectedMinutes: ProjectedMinutes.toFixed(3),
            ProjectedFantasyPoints: ProjectedFantasyPoints.toFixed(3),
            DKSalary,
            HomeOrAway: data.HomeOrAway,
            AvgFPPM: AvgFPPM.toFixed(3),
            AvgFPPMHome: AvgFPPMHome.toFixed(3),
            AvgFPPMAway: AvgFPPMAway.toFixed(3),
            AvgFPPMLast5: AvgFPPMLast5.toFixed(3),
            AvgFPPMOpponent: AvgFPPMOpponent.toFixed(3),
            SDProjectedFPPM: SDProjectedFPPM.toFixed(3),
            FantasyValue: ((ProjectedFantasyPoints / DKSalary) * 1000).toFixed(3),
            TeamID: data.TeamID,
            OpponentID: data.OpponentID,
            PlayerID: data.PlayerID,
        };

        const paceAdjustedProjection = calculatePaceAdjustedProjection(player, teamStats.data);
        player.FantasyValue = ((paceAdjustedProjection / DKSalary) * 1000).toFixed(3);
        player.PaceAdjustedProtection = paceAdjustedProjection;

        players.push(player);
    }
    console.log('finished processing');
    return [players, subscribed, remainingTrialDays];
}

export async function fetchProjectionForPosition(
  position,
  { email, name, year, subscribed, remainingTrialDays }
) {
  const date = new Date();
  const curYear = date.getFullYear();
  const curMonth = date.getMonth();
  const formattedDate = `${curYear}-${monthNumberToAbbr(curMonth)}-${String(date.getDate()).padStart(2, '0')}`;

  const url4 = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerGameProjectionStatsByDate/${formattedDate}`;
  const url5 = `https://api.sportsdata.io/api/nba/fantasy/json/DfsSlatesByDate/${formattedDate}`;
  const url6 = `https://api.sportsdata.io/api/nba/odds/json/TeamSeasonStats/${year}`;

  const [response, response5, teamStats] = await Promise.all([
    axios.get(url4, { headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } }),
    axios.get(url5, { headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } }),
    axios.get(url6, { headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } }),
  ]);

  // Build meta map for salaries/positions
  const slateData = response5.data.filter(
    slate => slate.OperatorGameType === 'Classic' && slate.Operator === 'DraftKings'
  );
  const playerMetaMap = new Map();
  slateData.forEach(slate => {
    slate.DfsSlatePlayers.forEach(player => {
      playerMetaMap.set(player.PlayerID, {
        salary: player.OperatorSalary,
        position: player.OperatorPosition
      });
    });
  });

  // Filter players for this position
  const playersForPos = response.data.filter(
    d => playerMetaMap.get(d.PlayerID)?.position === position
  );

  let ID = 0;
  const group = [];

  for (const data of playersForPos) {
    const player = await calculateProjection(data, playerMetaMap, teamStats.data, ++ID);
    group.push(player);
  }

  return group;
}
