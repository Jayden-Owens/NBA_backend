import Queue from 'bull';
import { processPlayerAverageData } from '../utils/playerAverageProcessor.js';

const redisUrl = process.env.REDISCLOUD_URL;

const playerAverageQueue = new Queue('playerAverage', redisUrl);

playerAverageQueue.process(async (job) => {
  const { email, name, year, subscribed, remainingTrialDays } = job.data;
  return await processPlayerAverageData(email, name, year,subscribe, remainingTrialDays);
});

export default playerAverageQueue;
