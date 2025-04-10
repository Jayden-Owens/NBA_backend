"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _express = require("express");
var _axios = _interopRequireDefault(require("axios"));
var _last = _interopRequireDefault(require("../models/last"));
var _player = _interopRequireDefault(require("../models/player"));
var _StatsDate = _interopRequireDefault(require("../models/StatsDate"));
var _current = _interopRequireDefault(require("../models/current"));
var _lastSeasonStat = _interopRequireDefault(require("./lastSeasonStat.json"));
var _mongoose = require("mongoose");
var _auth = require("../middlewares/auth");
var _trial = require("../middlewares/trial");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const router = (0, _express.Router)();
const monthNumberToAbbr = monthNumber => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return months[monthNumber] || 'Invalid month';
};
const fetchPlayerGameStats = async date => {
  try {
    const year = date.getFullYear();
    const formattedDate = `${year}-${monthNumberToAbbr(date.getMonth())}-${String(date.getDate()).padStart(2, '0')}`;
    const url = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerGameStatsByDate/${formattedDate}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
    const response = await _axios.default.get(url);
    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.data;
  } catch (error) {
    console.error(`Error fetching player game stats for ${date.toDateString()}:`, error.message);
    return null;
  }
};
router.get('/', async (req, res) => {
  return res.send({
    state: 'success'
  });
});
router.post('/all_dates_players', async (req, res) => {
  const today = new Date();
  const endDateObj = new Date(today);
  const stats = await fetchPlayerGameStats(endDateObj);
  if (stats.length > 0) {
    await _player.default.deleteMany({});
    await _player.default.create(stats);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return res.send({
    state: 'success'
  });
});
router.post('/last_year_players', async (req, res) => {
  _lastSeasonStat.default.forEach(async (data, i) => {
    await _last.default.create(data);
  });
  return res.send({
    state: 'success'
  });
});
router.post('/current_year_players', async (req, res) => {
  try {
    const date = new Date();
    const year = date.getFullYear();
    const url = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerSeasonStats/${year - 1}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
    const response = await _axios.default.get(url);
    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    response.data.forEach(async (data, i) => {
      await _current.default.create(data);
    });
    return res.send({
      state: 'success'
    });
  } catch (error) {
    console.error(`Error fetching player game stats for ${date()}:`, error.message);
    return res.send({
      state: 'error'
    });
  }
});
const calculatePace = team => {
  const {
    FieldGoalsAttempted,
    FreeThrowsAttempted,
    OffensiveRebounds,
    Turnovers,
    Games
  } = team;
  return (FieldGoalsAttempted + 0.44 * FreeThrowsAttempted - OffensiveRebounds + Turnovers) / 2 / Games;
};
const calculatePaceAdjustedProjection = (player, teamStats) => {
  const playerTeamStats = teamStats.find(team => team.Team === player.Team);
  const opponentTeamStats = teamStats.find(team => team.Team === player.Opponent);
  if (!playerTeamStats || !opponentTeamStats) return player.ProjectedFantasyPoints;
  const playerTeamPace = +calculatePace(playerTeamStats);
  const opponentTeamPace = +calculatePace(opponentTeamStats);
  const avgPace = (playerTeamPace + opponentTeamPace) / 2;
  const paceDifferential = +avgPace - playerTeamPace;
  const extraPossessionsPerMinute = +paceDifferential / 48;
  const extraPossessions = +extraPossessionsPerMinute * +player.ProjectedMinutes;
  let paceAdjustedFantasyPoints = +player.ProjectedFantasyPoints + +extraPossessions * (+player.AvgFPPM / 2.125);
  paceAdjustedFantasyPoints = isNaN(paceAdjustedFantasyPoints) ? 0.0 : paceAdjustedFantasyPoints;
  return paceAdjustedFantasyPoints.toFixed(3);
};
router.post('/player_average_data', _auth.isAuthenticatedUser, _trial.checkTrialExpiration, async (req, res) => {
  try {
    //trial check
    const remainingTrialDays = res.locals.remainingTrialDays;
    const date = new Date();
    const year = date.getFullYear();
    const formattedDate = `${year}-${monthNumberToAbbr(date.getMonth())}-${String(date.getDate()).padStart(2, '0')}`;
    const url4 = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerGameProjectionStatsByDate/${formattedDate}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;

    //scheduled match for tonight with players
    const url5 = `https://api.sportsdata.io/api/nba/fantasy/json/DfsSlatesByDate/${formattedDate}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
    const url6 = `https://api.sportsdata.io/api/nba/odds/json/TeamSeasonStats/${year - 1}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
    const [response, response5, teamStats] = await Promise.all([_axios.default.get(url4), _axios.default.get(url5), _axios.default.get(url6)]);
    if (response.status !== 200 || response5.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    let players = [];
    let ID = 0;
    for (let i = 0; i < response.data.length; i++) {
      let data = response.data[i];
      let DKSalary = 0;
      response5.data.find(slate => slate.DfsSlatePlayers.find(player => {
        if (player.PlayerID == data.PlayerID) {
          DKSalary = player.OperatorSalary;
          return true;
        }
        return false;
      }));
      let Position = 'NaN';
      response5.data.find(slate => slate.DfsSlatePlayers.find(player => {
        if (player.PlayerID == data.PlayerID) {
          Position = player.OperatorPosition;
          return true;
        }
        return false;
      }));
      let home_sum = await _player.default.aggregate([{
        $match: {
          PlayerID: data.PlayerID,
          HomeOrAway: 'HOME'
        }
      }, {
        $group: {
          _id: null,
          FantasyPoints: {
            $sum: '$FantasyPoints'
          },
          Minutes: {
            $sum: '$Minutes'
          },
          Seconds: {
            $sum: '$Seconds'
          }
        }
      }]);
      let AvgFPPMHome = 0;
      if (home_sum[0] != undefined) {
        AvgFPPMHome = home_sum[0].FantasyPoints / (home_sum[0].Minutes + home_sum[0].Seconds / 60);
      }
      // Avg FPPM(AWAY)
      let away_sum = await _player.default.aggregate([{
        $match: {
          PlayerID: data.PlayerID,
          HomeOrAway: 'AWAY'
        }
      }, {
        $group: {
          _id: null,
          FantasyPoints: {
            $sum: '$FantasyPoints'
          },
          Minutes: {
            $sum: '$Minutes'
          },
          Seconds: {
            $sum: '$Seconds'
          }
        }
      }]);
      let AvgFPPMAway = 0;
      if (away_sum[0] != undefined) {
        AvgFPPMAway = away_sum[0].FantasyPoints / (away_sum[0].Minutes + away_sum[0].Seconds / 60);
      }
      // Avg FPPM
      let AvgFPPM = 0;
      if (home_sum[0] != undefined && away_sum[0] != undefined) {
        AvgFPPM = (home_sum[0].FantasyPoints + away_sum[0].FantasyPoints) / (home_sum[0].Minutes + home_sum[0].Seconds / 60 + away_sum[0].Minutes + away_sum[0].Seconds / 60);
      } else {
        if (home_sum[0] != undefined) {
          AvgFPPM = AvgFPPMHome;
        } else if (away_sum[0] != undefined) {
          AvgFPPM = AvgFPPMAway;
        }
      }
      // Avg FPPM(AVG FPPM Last5)
      let last5_sum = await _player.default.aggregate([{
        $match: {
          PlayerID: data.PlayerID
        }
      }, {
        $sort: {
          date: -1
        }
      }, {
        $limit: 5
      }, {
        $group: {
          _id: null,
          FantasyPoints: {
            $sum: '$FantasyPoints'
          },
          Minutes: {
            $sum: '$Minutes'
          },
          Seconds: {
            $sum: '$Seconds'
          }
        }
      }]);
      let AvgFPPMLast5 = 0;
      if (last5_sum[0] != undefined) {
        AvgFPPMLast5 = last5_sum[0].FantasyPoints / (last5_sum[0].Minutes + last5_sum[0].Seconds / 60);
      }
      // Avg FPPM(Oppopnent)
      let opponent_sum = await _player.default.aggregate([{
        $match: {
          PlayerID: data.PlayerID,
          OpponentID: data.OpponentID
        }
      }, {
        $group: {
          _id: null,
          FantasyPoints: {
            $sum: '$FantasyPoints'
          },
          Minutes: {
            $sum: '$Minutes'
          },
          Seconds: {
            $sum: '$Seconds'
          }
        }
      }]);
      let AvgFPPMOpponent = 0;
      if (opponent_sum[0] != undefined) {
        AvgFPPMOpponent = opponent_sum[0].FantasyPoints / (opponent_sum[0].Minutes + opponent_sum[0].Seconds / 60);
      }
      // SDProjectedFPPM
      let SDProjectedFPPM = data.FantasyPoints / (data.Minutes + data.Seconds / 60);
      // ProjectedMinutes
      let ProjectedMinutes = data.Minutes + data.Seconds / 60;
      // ProjectedFantasyPoints
      let count_number = 5;
      if (AvgFPPM === 0 || isNaN(AvgFPPM)) {
        count_number = count_number - 1;
        AvgFPPM = 0;
      }
      if (AvgFPPMHome === 0 || isNaN(AvgFPPMHome)) {
        count_number = count_number - 1;
        AvgFPPMHome = 0;
      }
      if (AvgFPPMAway === 0 || isNaN(AvgFPPMAway)) {
        count_number = count_number - 1;
        AvgFPPMAway = 0;
      }
      if (AvgFPPMLast5 === 0 || isNaN(AvgFPPMLast5)) {
        count_number = count_number - 1;
        AvgFPPMLast5 = 0;
      }
      if (AvgFPPMOpponent === 0 || isNaN(AvgFPPMOpponent)) {
        count_number = count_number - 1;
        AvgFPPMOpponent = 0;
      }
      if (SDProjectedFPPM === 0 || isNaN(SDProjectedFPPM)) {
        count_number = count_number - 1;
        SDProjectedFPPM = 0;
      }
      if (count_number === 0 || count_number === -1) {
        count_number = 1;
      }
      let ProjectedFantasyPoints = 0;
      if (data.HomeOrAway == 'HOME') {
        ProjectedFantasyPoints = (AvgFPPM + AvgFPPMHome + AvgFPPMLast5 + AvgFPPMOpponent + SDProjectedFPPM) / count_number * ProjectedMinutes;
      } else if (data.HomeOrAway == 'AWAY') {
        ProjectedFantasyPoints = (AvgFPPM + AvgFPPMAway + AvgFPPMLast5 + AvgFPPMOpponent + SDProjectedFPPM) / count_number * ProjectedMinutes;
      }
      const player = {
        ID: ++ID,
        Name: data.Name,
        Position: Position,
        Team: data.Team,
        Opponent: data.Opponent,
        ProjectedMinutes: parseFloat(ProjectedMinutes).toFixed(3),
        ProjectedFantasyPoints: parseFloat(ProjectedFantasyPoints).toFixed(3),
        DKSalary: DKSalary,
        HomeOrAway: data.HomeOrAway,
        AvgFPPM: parseFloat(AvgFPPM).toFixed(3),
        AvgFPPMHome: parseFloat(AvgFPPMHome).toFixed(3),
        AvgFPPMAway: parseFloat(AvgFPPMAway).toFixed(3),
        AvgFPPMLast5: parseFloat(AvgFPPMLast5).toFixed(3),
        AvgFPPMOpponent: parseFloat(AvgFPPMOpponent).toFixed(3),
        SDProjectedFPPM: parseFloat(SDProjectedFPPM).toFixed(3),
        FantasyValue: parseFloat(ProjectedFantasyPoints / DKSalary * 1000).toFixed(3),
        TeamID: data.TeamID,
        OpponentID: data.OpponentID,
        PlayerID: data.PlayerID
      };
      const paceAdjustedProjection = calculatePaceAdjustedProjection(player, teamStats.data);
      player.FantasyValue = parseFloat(paceAdjustedProjection / DKSalary * 1000).toFixed(3), player.PaceAdjustedProtection = paceAdjustedProjection;
      players.push(player);
    }
    return res.send({
      success: true,
      state: players,
      paceData: '',
      remainingTrialDays
    });
  } catch (error) {
    console.error(error);
    return res.send({
      state: error.message
    });
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
    const response = await _axios.default.get(url, {
      headers: {
        Authorization: API_KEY
      }
    });
    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return res.send({
      state: response.data
    });
  } catch (error) {
    console.error(`Error fetching player game stats:`, error.message);
    return res.send({
      state: error.message
    });
  }
});
router.post('/today_update', _auth.isAuthenticatedUser, _trial.checkTrialExpiration, async (req, res) => {
  try {
    const currentDate = new Date();
    const startOfSeason = new Date(currentDate.getFullYear() - 1, 9, 1); // October 1

    // Fetch the latest date stored in the database
    const latestDateRecord = await _StatsDate.default.findOne({}).sort({
      Date: -1
    });
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
        const existingPlayerData = await _player.default.findOne({
          Day: date.toISOString().split('T')[0] // Ensure you're using the correct field for the date
        });
        if (existingPlayerData) {
          console.log(`Data for ${date.toDateString()} already exists in Player. Skipping.`);
        } else {
          // Fetch data for PlayerGameStatsByDate
          const stats = await fetchPlayerGameStats(date);
          if (stats && stats.length > 0) {
            await _player.default.insertMany(stats); // Save actual game data to Player model
            console.log(`Data for ${date.toDateString()} saved in Player.`);
          } else {
            console.log(`No stats available for ${date.toDateString()}.`);
          }
        }
      }

      // Update LatestStatsDate to reflect the latest processed date (today)
      const newLatestDate = new _StatsDate.default({
        Date: currentDate
      });
      await newLatestDate.save(); // Save the latest date as today's date
      console.log(`Latest date updated to: ${currentDate.toDateString()}`);
    } else {
      console.log("No new data to store.");
    }

    // Fetch current season data for PlayerSeasonStats if not already done
    const year = currentDate.getFullYear() - 1; // This seems to be a year behind, as per your example
    const currentSeasonExists = await _current.default.findOne({
      Season: year
    });
    if (!currentSeasonExists) {
      console.log(`Fetching season data for ${year}...`);
      const currentSeasonUrl = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerSeasonStats/${year}?key=5e7cd68a3a2f42b0ac2aeb9abc091748`;
      const currentSeasonResponse = await _axios.default.get(currentSeasonUrl);
      if (currentSeasonResponse.status !== 200) {
        throw new Error(`HTTP error! status: ${currentSeasonResponse.status}`);
      }
      await _current.default.insertMany(currentSeasonResponse.data);
      console.log(`Season data for ${year} saved.`);
    } else {
      console.log(`Season data for ${year} already exists.`);
    }
    return res.send({
      message: 'Update completed successfully.'
    });
  } catch (error) {
    console.error(`Error updating player game stats:`, error.message);
    return res.status(500).send({
      error: error.message
    });
  }
});
var _default = exports.default = router;
//# sourceMappingURL=player.js.map