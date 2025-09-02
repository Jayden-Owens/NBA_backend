import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import bodyParser from 'body-parser';
import chargebee from 'chargebee';
import routes from './routes/index.js';
//import routes from './routes';

const app = express();

// Configure Chargebee
chargebee.configure({
  site: process.env.CHARGEBEE_SITE,
  api_key: process.env.CHARGEBEE_API_KEY,
});

// const corsOptions = {
//   origin: 'https://app.fantasyhacker.com/', 
// };

// // Middleware
// app.use(cors(corsOptions));
const cors = require('cors');
app.use(cors({ origin: 'https://app.fantasyhacker.com' }));
console.log("1");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
console.log("2");
// Routes
app.use('/player', routes.player);
app.use('/subscription', routes.subscription);
app.use('/user', routes.user);

export default app;