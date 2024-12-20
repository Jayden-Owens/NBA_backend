import { Router } from 'express';
import axios from 'axios';

import Last from '../models/last';
import Player from '../models/player';
import Current from '../models/current';
import lastData from './lastSeasonStat.json';
import { STATES } from 'mongoose';

const router = Router();

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

const fetchPlayerGameStats = async (date) => {
  try {
    const year = date.getFullYear();
    const formattedDate = `${year}-${monthNumberToAbbr(
      date.getMonth(),
    )}-${String(date.getDate()).padStart(2, '0')}`;
    const url = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerGameStatsByDate/${formattedDate}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
    const response = await axios.get(url);

    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.data;
  } catch (error) {
    console.error(
      `Error fetching player game stats for ${date.toDateString()}:`,
      error.message,
    );
    return null;
  }
};

router.get('/', async (req, res) => {
  return res.send({ state: 'success' });
});

router.post('/all_dates_players', async (req, res) => {
  const today = new Date();

  const endDateObj = new Date(today);
  const stats = await fetchPlayerGameStats(endDateObj);
  if (stats.length > 0) {
    await Player.deleteMany({});
    await Player.create(stats);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return res.send({ state: 'success' });
});

router.post('/last_year_players', async (req, res) => {
  lastData.forEach(async (data, i) => {
    await Last.create(data);
  });
  return res.send({ state: 'success' });
});

router.post('/current_year_players', async (req, res) => {
  try {
    const date = new Date();
    const year = date.getFullYear();
    const url = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerSeasonStats/${year}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
    const response = await axios.get(url);
    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    response.data.forEach(async (data, i) => {
      await Current.create(data);
    });
    return res.send({ state: 'success' });
  } catch (error) {
    console.error(
      `Error fetching player game stats for ${date()}:`,
      error.message,
    );
    return res.send({ state: 'error' });
  }
});

const calculatePace = (team) => {
  const {
    FieldGoalsAttempted,
    FreeThrowsAttempted,
    OffensiveRebounds,
    Turnovers,
    Games,
  } = team;
  return (
    (FieldGoalsAttempted +
      0.44 * FreeThrowsAttempted -
      OffensiveRebounds +
      Turnovers) /
    2 /
    Games
  );
};

const calculatePaceAdjustedProjection = (player, teamStats) => {
  const playerTeamStats = teamStats.find(
    (team) => team.Team === player.Team,
  );
  const opponentTeamStats = teamStats.find(
    (team) => team.Team === player.Opponent,
  );

  if (!playerTeamStats || !opponentTeamStats)
    return player.ProjectedFantasyPoints;

  const playerTeamPace = +calculatePace(playerTeamStats);
  const opponentTeamPace = +calculatePace(opponentTeamStats);

  const avgPace = (playerTeamPace + opponentTeamPace) / 2;
  const paceDifferential = +avgPace - playerTeamPace;
  const extraPossessionsPerMinute = +paceDifferential / 48;
  const extraPossessions =
    +extraPossessionsPerMinute * +player.ProjectedMinutes;

  let paceAdjustedFantasyPoints =
    +player.ProjectedFantasyPoints +
    +extraPossessions * (+player.AvgFPPM / 2.125);

  paceAdjustedFantasyPoints = isNaN(paceAdjustedFantasyPoints)
    ? 0.0
    : paceAdjustedFantasyPoints;

  return paceAdjustedFantasyPoints.toFixed(3);
};

router.post('/player_average_data', async (req, res) => {
  try {
    //store latest data in DB
    const today = new Date();
    today.setDate(today.getDate() - 1);
    const todayDateString = today.toISOString().split('T')[0];

    //finding if today's data is present
    const existingRecord = await Player.findOne({
      createdAt: {
        $gte: new Date(`${todayDateString}T00:00:00.000Z`),
        $lt: new Date(`${todayDateString}T23:59:59.999Z`),
      },
    });

    if (!existingRecord) {
      // No record with today's date exists; delete old records and insert new ones
      const endDateObj = new Date(today);
      const stats = await fetchPlayerGameStats(endDateObj);
      await Player.deleteMany({});
      const data = await Player.create(stats);
      await new Promise((resolve) => setTimeout(resolve, 10));
      if(data){
          console.log("latest record added")
      }
      else{
        console.log("no data found")
      }
    } else {
      console.log('Records are already up-to-date for today');
    }

    const date = new Date();
    const year = date.getFullYear();
    const formattedDate = `${year}-${monthNumberToAbbr(
      date.getMonth(),
    )}-${String(date.getDate()-1).padStart(2, '0')}`;
    const url4 = `https://api.sportsdata.io/api/nba/fantasy/json/DfsSlatesByDate/${formattedDate}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
    const response = await axios.get(url4);
    const url5 = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerGameStatsByDate/${formattedDate}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
    const response5 = await axios.get(url5);

    const url6 = `https://api.sportsdata.io/api/nba/odds/json/TeamSeasonStats/${year}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
    const teamStats = await axios.get(url6);

    if (response.status !== 200 || response5.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    let players = [];
    let ID = 0;
    if(response5.data.length > 0){
        for (let i = 0; i < response.data.length; i++) {
          let data = response5.data[i];
          let DKSalary = 0;
          response.data.find((slate) =>
            slate.DfsSlatePlayers.find((player) => {
              if (player.PlayerID == data.PlayerID) {
                DKSalary = player.OperatorSalary;
                return true;
              }
              return false;
            }),
          );
          let Position = 'NaN';
          response.data.find((slate) =>
            slate.DfsSlatePlayers.find((player) => {
              if (player.PlayerID == data.PlayerID) {
                Position = player.OperatorPosition;
                return true;
              }
              return false;
            }),
          );
          let home_sum = await Player.aggregate([
            { $match: { PlayerID: data.PlayerID, HomeOrAway: 'HOME' } },
            {
              $group: {
                _id: null,
                FantasyPoints: { $sum: '$FantasyPoints' },
                Minutes: { $sum: '$Minutes' },
                Seconds: { $sum: '$Seconds' },
              },
            },
          ]);
          let AvgFPPMHome = 0;
          if (home_sum[0] != undefined) {
            AvgFPPMHome =
              home_sum[0].FantasyPoints /
              (home_sum[0].Minutes + home_sum[0].Seconds / 60);
          }
          // Avg FPPM(AWAY)
          let away_sum = await Player.aggregate([
            { $match: { PlayerID: data.PlayerID, HomeOrAway: 'AWAY' } },
            {
              $group: {
                _id: null,
                FantasyPoints: { $sum: '$FantasyPoints' },
                Minutes: { $sum: '$Minutes' },
                Seconds: { $sum: '$Seconds' },
              },
            },
          ]);
          let AvgFPPMAway = 0;
          if (away_sum[0] != undefined) {
            AvgFPPMAway =
              away_sum[0].FantasyPoints /
              (away_sum[0].Minutes + away_sum[0].Seconds / 60);
          }
          // Avg FPPM
          let AvgFPPM = 0;
          if (home_sum[0] != undefined && away_sum[0] != undefined) {
            AvgFPPM =
              (home_sum[0].FantasyPoints + away_sum[0].FantasyPoints) /
              (home_sum[0].Minutes +
                home_sum[0].Seconds / 60 +
                away_sum[0].Minutes +
                away_sum[0].Seconds / 60);
          } else {
            if (home_sum[0] != undefined) {
              AvgFPPM = AvgFPPMHome;
            } else if (away_sum[0] != undefined) {
              AvgFPPM = AvgFPPMAway;
            }
          }
          // Avg FPPM(AVG FPPM Last5)
          let last5_sum = await Player.aggregate([
            { $match: { PlayerID: data.PlayerID } },
            { $sort: { date: -1 } },
            { $limit: 5 },
            {
              $group: {
                _id: null,
                FantasyPoints: { $sum: '$FantasyPoints' },
                Minutes: { $sum: '$Minutes' },
                Seconds: { $sum: '$Seconds' },
              },
            },
          ]);
          let AvgFPPMLast5 = 0;
          if (last5_sum[0] != undefined) {
            AvgFPPMLast5 =
              last5_sum[0].FantasyPoints /
              (last5_sum[0].Minutes + last5_sum[0].Seconds / 60);
          }
          // Avg FPPM(Oppopnent)
          let opponent_sum = await Player.aggregate([
            {
              $match: {
                PlayerID: data.PlayerID,
                OpponentID: data.OpponentID,
              },
            },
            {
              $group: {
                _id: null,
                FantasyPoints: { $sum: '$FantasyPoints' },
                Minutes: { $sum: '$Minutes' },
                Seconds: { $sum: '$Seconds' },
              },
            },
          ]);
          let AvgFPPMOpponent = 0;
          if (opponent_sum[0] != undefined) {
            AvgFPPMOpponent =
              opponent_sum[0].FantasyPoints /
              (opponent_sum[0].Minutes + opponent_sum[0].Seconds / 60);
          }
          // SDProjectedFPPM
          let SDProjectedFPPM =
            data.FantasyPoints / (data.Minutes + data.Seconds / 60);
          // ProjectedMinutes
          let ProjectedMinutes = data.Minutes + data.Seconds / 60;
          // ProjectedFantasyPoints
          let count_number = 5;
          if (AvgFPPM === 0 || isNaN(AvgFPPM)) {
            count_number = count_number - 1;
            // AvgFPPM = 0;
          }
          if (AvgFPPMHome === 0 || isNaN(AvgFPPMHome)) {
            count_number = count_number - 1;
            // AvgFPPMHome = 0;
          }
          if (AvgFPPMAway === 0 || isNaN(AvgFPPMAway)) {
            count_number = count_number - 1;
            // AvgFPPMAway = 0;
          }
          if (AvgFPPMLast5 === 0 || isNaN(AvgFPPMLast5)) {
            count_number = count_number - 1;
            // AvgFPPMLast5 = 0;
          }
          if (AvgFPPMOpponent === 0 || isNaN(AvgFPPMOpponent)) {
            count_number = count_number - 1;
            // AvgFPPMOpponent = 0;
          }
          if (SDProjectedFPPM === 0 || isNaN(SDProjectedFPPM)) {
            count_number = count_number - 1;
            // SDProjectedFPPM = 0;
          }
          if (count_number === 0 || count_number === -1) {
            count_number = 1;
          }
          let ProjectedFantasyPoints = 0;
          if (data.HomeOrAway == 'HOME') {
            ProjectedFantasyPoints =
              ((AvgFPPM +
                AvgFPPMHome +
                AvgFPPMLast5 +
                AvgFPPMOpponent +
                SDProjectedFPPM) /
                count_number) *
              ProjectedMinutes;
          } else if (data.HomeOrAway == 'AWAY') {
            ProjectedFantasyPoints =
              ((AvgFPPM +
                AvgFPPMAway +
                AvgFPPMLast5 +
                AvgFPPMOpponent +
                SDProjectedFPPM) /
                count_number) *
              ProjectedMinutes;
          }
          const player = {
            ID: ++ID,
            Name: data.Name,
            Position: Position,
            Team: data.Team,
            Opponent: data.Opponent,
            ProjectedMinutes: parseFloat(ProjectedMinutes).toFixed(3),
            ProjectedFantasyPoints: parseFloat(
              ProjectedFantasyPoints,
            ).toFixed(3),
            DKSalary: DKSalary,
            HomeOrAway: data.HomeOrAway,
            AvgFPPM: parseFloat(AvgFPPM).toFixed(3),
            AvgFPPMHome: parseFloat(AvgFPPMHome).toFixed(3),
            AvgFPPMAway: parseFloat(AvgFPPMAway).toFixed(3),
            AvgFPPMLast5: parseFloat(AvgFPPMLast5).toFixed(3),
            AvgFPPMOpponent: parseFloat(AvgFPPMOpponent).toFixed(3),
            SDProjectedFPPM: parseFloat(SDProjectedFPPM).toFixed(3),
            FantasyValue: parseFloat(
              (ProjectedFantasyPoints / DKSalary) * 1000,
            ).toFixed(3),
            TeamID: data.TeamID,
            OpponentID: data.OpponentID,
            PlayerID: data.PlayerID,
          };
          const paceAdjustedProjection = calculatePaceAdjustedProjection(
            player,
            teamStats.data,
          );
          player.PaceAdjustedProtection = paceAdjustedProjection;
          players.push(player);
        }
    }
    return res.send({ state: players, paceData: '' });
  } catch (error) {
    console.error(error);
    return res.send({ state: error.message });
  }
});

router.post('/pace', async (req, res) => {
  try {
    let teams_query = '';
    let length = req.body.players.length;
    for (let i = 0; i < length; i++) {
      if (i === length - 1) {
        teams_query += `team_ids[]=${req.body.players[i]}`;
      } else {
        teams_query += `team_ids[]=${req.body.players[i]}&`;
      }
    }
    const API_KEY = 'aa200247-6715-4fb1-8520-c842718e498c';
    const url = `https://api.balldontlie.io/v1/stats/advanced?seasons[]=2024&posteason=true&${teams_query}&per_page=10000`;
    const response = await axios.get(url, {
      headers: {
        Authorization: API_KEY,
      },
    });

    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return res.send({ state: response.data });
  } catch (error) {
    console.error(`Error fetching player game stats:`, error.message);
    return res.send({ state: error.message });
  }
});

router.post('/today_update', async (req, res) => {
  try {
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() - 1);
    const year = currentDate.getFullYear();
    const beforeDate = new Date(
      `${currentDate.getFullYear()}-${
        currentDate.getMonth() + 1
      }-${currentDate.getDate()}`,
    );
    const stats = await fetchPlayerGameStats(beforeDate);
    let BeforeData = {};
    if (stats != null && stats.length != 0) {
      BeforeData = await Player.findOne({ Day: stats[0].Day });
    }
    if (BeforeData == null) {
      if (stats != null && stats.length != 0) {
        console.log('Data is!');
        stats.forEach(async (data, i) => {
          await Player.create(data);
        });

        // delete 2024 current data
        await Current.deleteMany({ Season: year });
        const current_url = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerSeasonStats/${year}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
        const current_response = await axios.get(current_url);
        if (current_response.status !== 200) {
          throw new Error(
            `HTTP error! status: ${current_response.status}`,
          );
        }
        // update 2024 current data
        current_response.data.forEach(async (data, i) => {
          await Current.create(data);
        });
      } else {
        console.log('No Data!');
      }
    }
    return res.send({ state: beforeDate });
  } catch (error) {
    console.error(
      `Error fetching player game stats for }:`,
      error.message,
    );
    return res.send({ state: error.message });
  }
});

export default router;
