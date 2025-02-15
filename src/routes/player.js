import { Router } from 'express';
import axios from 'axios';

import Last from '../models/last';
import Player from '../models/player';
import LatestStatsDate from "../models/StatsDate"
import Current from '../models/current';
import lastData from './lastSeasonStat.json';
import { STATES } from 'mongoose';
import { isAuthenticatedUser } from '../middlewares/auth';
import { checkTrialExpiration } from '../middlewares/trial';

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
    const url = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerSeasonStats/${
      year - 1
    }?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
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

router.post(
  '/player_average_data',
  isAuthenticatedUser,
  checkTrialExpiration,
  async (req, res) => {
    try {
      //trial check
      const remainingTrialDays = res.locals.remainingTrialDays;
      if(remainingTrialDays <= 0) {
        return res.send({
          success: true,
          message: 'Trial period has expired. Please subscribe to continue using the service.',
          remainingTrialDays,
        });
      }

      const date = new Date();
      const year = date.getFullYear();
      if (date.getHours() >= 22) {
        date.setDate(date.getDate() + 1);
      }
      const formattedDate = `${year}-${monthNumberToAbbr(date.getMonth())}-${String(date.getDate()).padStart(2, '0')}`;
      const apiKey = '5e7cd68a3a2f42b0ac2aeb9abc091748';
      
      const urls = {
        playerGameProjectionStats: `https://api.sportsdata.io/api/nba/fantasy/json/PlayerGameProjectionStatsByDate/${formattedDate}?key=${apiKey}`,
        dfsSlatesByDate: `https://api.sportsdata.io/api/nba/fantasy/json/DfsSlatesByDate/${formattedDate}?key=${apiKey}`,
        teamSeasonStats: `https://api.sportsdata.io/api/nba/odds/json/TeamSeasonStats/${year - 1}?key=${apiKey}`
      };
      
      const [response, response5, teamStats] = await Promise.all([
        axios.get(urls.playerGameProjectionStats),
        axios.get(urls.dfsSlatesByDate),
        axios.get(urls.teamSeasonStats)
      ]);
      console.log('response', response.data);
      
      let players = [];
      let ID = 0;
      
      for (let data of response.data) {
        let DKSalary = 0;
        let Position = 'NaN';
      
        response5.data.forEach(slate => {
          slate.DfsSlatePlayers.forEach(player => {
            if (player.PlayerID == data.PlayerID) {
              DKSalary = player.OperatorSalary;
              Position = player.OperatorPosition;
            }
          });
        });
      
        const home_sum = await getPlayerAggregate(data.PlayerID, 'HOME');
        const away_sum = await getPlayerAggregate(data.PlayerID, 'AWAY');
        const last5_sum = await getPlayerLast5Aggregate(data.PlayerID);
        const opponent_sum = await getPlayerOpponentAggregate(data.PlayerID, data.OpponentID);
      
        const AvgFPPMHome = calculateAvgFPPM(home_sum);
        const AvgFPPMAway = calculateAvgFPPM(away_sum);
        const AvgFPPMLast5 = calculateAvgFPPM(last5_sum);
        const AvgFPPMOpponent = calculateAvgFPPM(opponent_sum);
        const AvgFPPM = calculateOverallAvgFPPM(home_sum, away_sum);
        const SDProjectedFPPM = data.FantasyPoints / (data.Minutes + data.Seconds / 60);
        const ProjectedMinutes = data.Minutes + data.Seconds / 60;
      
        const count_number = calculateCountNumber([AvgFPPM, AvgFPPMHome, AvgFPPMAway, AvgFPPMLast5, AvgFPPMOpponent, SDProjectedFPPM]);
        const ProjectedFantasyPoints = calculateProjectedFantasyPoints(data.HomeOrAway, [AvgFPPM, AvgFPPMHome, AvgFPPMAway, AvgFPPMLast5, AvgFPPMOpponent, SDProjectedFPPM], count_number, ProjectedMinutes);
      
        const player = createPlayerObject(++ID, data, Position, DKSalary, ProjectedMinutes, ProjectedFantasyPoints, AvgFPPM, AvgFPPMHome, AvgFPPMAway, AvgFPPMLast5, AvgFPPMOpponent, SDProjectedFPPM);
        const paceAdjustedProjection = calculatePaceAdjustedProjection(player, teamStats.data);
      
        player.FantasyValue = parseFloat((paceAdjustedProjection / DKSalary) * 1000).toFixed(3);
        player.PaceAdjustedProtection = paceAdjustedProjection;
      
        players.push(player);
      }
      
      async function getPlayerAggregate(PlayerID, HomeOrAway) {
        return await Player.aggregate([
          { $match: { PlayerID, HomeOrAway } },
          {
            $group: {
              _id: null,
              FantasyPoints: { $sum: '$FantasyPoints' },
              Minutes: { $sum: '$Minutes' },
              Seconds: { $sum: '$Seconds' }
            }
          }
        ]);
      }
      
      async function getPlayerLast5Aggregate(PlayerID) {
        return await Player.aggregate([
          { $match: { PlayerID } },
          { $sort: { date: -1 } },
          { $limit: 5 },
          {
            $group: {
              _id: null,
              FantasyPoints: { $sum: '$FantasyPoints' },
              Minutes: { $sum: '$Minutes' },
              Seconds: { $sum: '$Seconds' }
            }
          }
        ]);
      }
      
      async function getPlayerOpponentAggregate(PlayerID, OpponentID) {
        return await Player.aggregate([
          { $match: { PlayerID, OpponentID } },
          {
            $group: {
              _id: null,
              FantasyPoints: { $sum: '$FantasyPoints' },
              Minutes: { $sum: '$Minutes' },
              Seconds: { $sum: '$Seconds' }
            }
          }
        ]);
      }
      
      function calculateAvgFPPM(sum) {
        if (sum[0] != undefined) {
          return sum[0].FantasyPoints / (sum[0].Minutes + sum[0].Seconds / 60);
        }
        return 0;
      }
      
      function calculateOverallAvgFPPM(home_sum, away_sum) {
        if (home_sum[0] != undefined && away_sum[0] != undefined) {
          return (home_sum[0].FantasyPoints + away_sum[0].FantasyPoints) / (home_sum[0].Minutes + home_sum[0].Seconds / 60 + away_sum[0].Minutes + away_sum[0].Seconds / 60);
        } else if (home_sum[0] != undefined) {
          return calculateAvgFPPM(home_sum);
        } else if (away_sum[0] != undefined) {
          return calculateAvgFPPM(away_sum);
        }
        return 0;
      }
      
      function calculateCountNumber(values) {
        return values.reduce((count, value) => {
          if (value === 0 || isNaN(value)) {
            return count - 1;
          }
          return count;
        }, values.length);
      }
      
      function calculateProjectedFantasyPoints(HomeOrAway, values, count_number, ProjectedMinutes) {
        if (count_number === 0 || count_number === -1) {
          count_number = 1;
        }
        const sum = values.reduce((acc, value) => acc + value, 0);
        return (sum / count_number) * ProjectedMinutes;
      }
      
      function createPlayerObject(ID, data, Position, DKSalary, ProjectedMinutes, ProjectedFantasyPoints, AvgFPPM, AvgFPPMHome, AvgFPPMAway, AvgFPPMLast5, AvgFPPMOpponent, SDProjectedFPPM) {
        return {
          ID,
          Name: data.Name,
          Position,
          Team: data.Team,
          Opponent: data.Opponent,
          ProjectedMinutes: parseFloat(ProjectedMinutes).toFixed(3),
          ProjectedFantasyPoints: parseFloat(ProjectedFantasyPoints).toFixed(3),
          DKSalary,
          HomeOrAway: data.HomeOrAway,
          AvgFPPM: parseFloat(AvgFPPM).toFixed(3),
          AvgFPPMHome: parseFloat(AvgFPPMHome).toFixed(3),
          AvgFPPMAway: parseFloat(AvgFPPMAway).toFixed(3),
          AvgFPPMLast5: parseFloat(AvgFPPMLast5).toFixed(3),
          AvgFPPMOpponent: parseFloat(AvgFPPMOpponent).toFixed(3),
          SDProjectedFPPM: parseFloat(SDProjectedFPPM).toFixed(3),
          FantasyValue: parseFloat((ProjectedFantasyPoints / DKSalary) * 1000).toFixed(3),
          TeamID: data.TeamID,
          OpponentID: data.OpponentID,
          PlayerID: data.PlayerID
        };
      }
      return res.send({
        success: true,
        state: players,
        paceData: '',
        remainingTrialDays,
      });
    } catch (error) {
      console.error(error);
      return res.send({ state: error.message });
    }
  },
);

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

router.post(
  '/today_update',
  isAuthenticatedUser,
  checkTrialExpiration,
  async (req, res) => {
    try {
      const currentDate = new Date();
      const startOfSeason = new Date(currentDate.getFullYear() - 1, 9, 1); // October 1

      // Fetch the latest date stored in the database
      const latestDateRecord = await LatestStatsDate.findOne({}).sort({ Date: -1 });
      let latestDate = startOfSeason; // Default to the start of the season if no record exists

      if (latestDateRecord) {
        latestDate = latestDateRecord.Date; // Get the latest date from the database
      }

      console.log("Latest Date in DB:", latestDate);

      // Check if the current date is later than the latest stored date
      if (currentDate > latestDate) {
        // Iterate through each date from latestDate + 1 to today
        for (let date = new Date(latestDate); date <= currentDate; date.setDate(date.getDate() + 1)) {
          // Check if data for this date already exists in Player model
          const existingPlayerData = await Player.findOne({
            Day: date.toISOString().split('T')[0], // Ensure you're using the correct field for the date
          });

          if (existingPlayerData) {
            console.log(`Data for ${date.toDateString()} already exists in Player. Skipping.`);
          } else {
            // Fetch data for PlayerGameStatsByDate
            const stats = await fetchPlayerGameStats(date);
            if (stats && stats.length > 0) {
              await Player.insertMany(stats); // Save actual game data to Player model
              console.log(`Data for ${date.toDateString()} saved in Player.`);
            } else {
              console.log(`No stats available for ${date.toDateString()}.`);
            }
          }
        }

        // Update LatestStatsDate to reflect the latest processed date (today)
        const newLatestDate = new LatestStatsDate({ Date: currentDate });
        await newLatestDate.save(); // Save the latest date as today's date
        console.log(`Latest date updated to: ${currentDate.toDateString()}`);
      } else {
        console.log("No new data to store.");
      }

      // Fetch current season data for PlayerSeasonStats if not already done
      const year = currentDate.getFullYear() - 1; // This seems to be a year behind, as per your example
      const currentSeasonExists = await Current.findOne({ Season: year });

      if (!currentSeasonExists) {
        console.log(`Fetching season data for ${year}...`);
        const currentSeasonUrl = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerSeasonStats/${year}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
        const currentSeasonResponse = await axios.get(currentSeasonUrl);

        if (currentSeasonResponse.status !== 200) {
          throw new Error(`HTTP error! status: ${currentSeasonResponse.status}`);
        }

        await Current.insertMany(currentSeasonResponse.data);
        console.log(`Season data for ${year} saved.`);
      } else {
        console.log(`Season data for ${year} already exists.`);
      }

      return res.send({ message: 'Update completed successfully.' });
    } catch (error) {
      console.error(`Error updating player game stats:`, error.message);
      return res.status(500).send({ error: error.message });
    }
  }
);



export default router;
