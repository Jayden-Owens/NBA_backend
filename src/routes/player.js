import { Router } from 'express';
import axios from 'axios';
import chargebee from 'chargebee';
import Last from '../models/last.js';
import Player from '../models/player.js';
import LatestStatsDate from "../models/StatsDate.js"
import Current from '../models/current.js';
import playerAverageQueue from '../queues/playerAvergeQueue.js';
import { fetchProjectionForPosition } from '../utils/playerAverageProcessor.js';
//import lastData from './lastSeasonStat.json' with {type: 'json'};
import { isAuthenticatedUser } from '../middlewares/auth.js';
import { checkTrialExpiration } from '../middlewares/trial.js';

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

const GetCurrentSeason = async () => {
  const url = `https://api.sportsdata.io/v3/nba/scores/json/CurrentSeason?key=0224aa9e70ad409b99dd353a27fccdae`;
  const response = await axios.get(url);//, { headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } });
  if (response.status !== 200) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const year = response.data.Season;
  return year;
};

const fetchPlayerGameStats = async (date) => {
  try {
    const year = date.getFullYear();
    //const year = await GetCurrentSeason();
    // const formattedDate = `${year}-${monthNumberToAbbr(
    //   date.getMonth(),
    // )}-${String(date.getDate()).padStart(2, '0')}`;
    const formattedDate = `${year}-${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}`;
    console.log("Fetching data for date:", formattedDate);
    const url = `https://api.sportsdata.io/v3/nba/stats/json/PlayerGameStatsByDate/${formattedDate}?key=0224aa9e70ad409b99dd353a27fccdae`;
    const response = await axios.get(url);//  , { headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } });

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

// router.post('/last_year_players', async (req, res) => {
//   lastData.forEach(async (data, i) => {
//     await Last.create(data);
//   });
//   return res.send({ state: 'success' });
// });

router.post('/current_year_players', async (req, res) => {
  try {
    const date = new Date();
    //const year = date.getFullYear();
    const year = await GetCurrentSeason();
    const url = `https://api.sportsdata.io/api/nba/fantasy/json/PlayerSeasonStats/${year}`;
    const response = await axios.get(url, { headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } });
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
    const { email, name } = req.body;
    const year = await GetCurrentSeason();
    const subscribed = res.locals.subscribed;
    const remainingTrialDays = res.locals.remainingTrialDays;

    try {
      const chargebeeCustomerResponse = await chargebee.customer.list({ email: { is: email } }).request();

      const chargebeeCustomer = chargebeeCustomerResponse.list.find(c => c.email === email).customer.id;
      const chargebeeCustomerSubscription = await chargebee.subscription.list({
        limit: 1,
        customer_id: { is: chargebeeCustomer }
      }).request();
      //console.log("Chargebee Customer:", chargebeeCustomerSubscription.list);
      //console.log(chargebeeCustomerResponse.list[0].customer);


      if (chargebeeCustomerSubscription.list[0].subscription.status === 'in_trial' || chargebeeCustomerSubscription.list[0].subscription.status === 'active') {
        const job = await playerAverageQueue.add({ email, name, year, subscribed, remainingTrialDays });
        res.send({
          success: true,
          message: 'processing started. please check back in a minute.',
          jobId: job.id,
        });

      } 
      else 
      {
        res.send({
          success: false,
          message: 'No active subscription found. Please subscribe to access this feature.',
        });
      }


    } catch (error) {
      console.error(error);
      return res.send({ state: error.message });
    }
  },
);

router.get(
  '/player_average_stream',
  isAuthenticatedUser,
  checkTrialExpiration,
  async (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    const { email, name } = req.query; // use query params for GET
    const year = await GetCurrentSeason();
    const subscribed = res.locals.subscribed;
    const remainingTrialDays = res.locals.remainingTrialDays;

    try {
      const chargebeeCustomerResponse = await chargebee.customer.list({ email: { is: email } }).request();
      const chargebeeCustomer = chargebeeCustomerResponse.list.find(c => c.email === email).customer.id;
      const chargebeeCustomerSubscription = await chargebee.subscription.list({
        limit: 1,
        customer_id: { is: chargebeeCustomer }
      }).request();

      if (
        chargebeeCustomerSubscription.list[0].subscription.status === 'in_trial' ||
        chargebeeCustomerSubscription.list[0].subscription.status === 'active'
      ) {
        // Instead of queueing, process positions directly and stream them
        const positions = ['PG', 'SG', 'SF', 'PF', 'C'];

        for (const pos of positions) {
          const data = await fetchProjectionForPosition(pos, { email, name, year, subscribed, remainingTrialDays });
          res.write(`data: ${JSON.stringify({ position: pos, data })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } else {
        res.write(`data: ${JSON.stringify({ error: 'No active subscription found.' })}\n\n`);
        res.end();
      }
    } catch (error) {
      console.error(error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
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
      headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY }
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
      //const year = currentDate.getFullYear() - 1; // This seems to be a year behind, as per your example
      const year = await GetCurrentSeason();
      const currentSeasonExists = await Current.findOne({ Season: year });

      if (!currentSeasonExists) {
        console.log(`Fetching season data for ${year}...`);
        const currentSeasonUrl = `https://api.sportsdata.io/v3/nba/stats/json/PlayerSeasonStats/${year}?key=0224aa9e70ad409b99dd353a27fccdae`;
        const currentSeasonResponse = await axios.get(currentSeasonUrl);//, { headers: { 'Ocp-Apim-Subscription-Key': process.env.API_KEY } });

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

// Return current season year from GetCurrentSeason
router.get('/current_season', async (req, res) => {
  console.log("Fetching current season year...");
  try {
    const year = await GetCurrentSeason();
    return res.json({ success: true, season: year });
  } catch (error) {
    console.error('Error getting current season:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/player_average_status/:id', async (req, res) => {
  const job = await playerAverageQueue.getJob(req.params.id);
  if (!job) return res.status(404).send({ error: 'Job not found' });

  const state = await job.getState();
  const result = job.returnvalue;

  res.send({ state, result });
});

export default router;
