import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import bodyParser from 'body-parser';
import chargebee from 'chargebee';
import Stripe from 'stripe';

import models, { connectDb } from './models';
import routes from './routes';

const app = express();

chargebee.configure({
  site: process.env.CHARGEBEE_SITE,
  api_key: process.env.CHARGEBEE_API_KEY,
});

app.use(
  cors({
    origin: ['http://localhost:3000', 'http://18.224.31.229', '*'],
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/player', routes.player);
app.use('/subscription', routes.subscription);

connectDb().then(async () => {
  app.listen(process.env.PORT, '0.0.0.0', () =>
    console.log(`NBA App listening on port ${process.env.PORT}!`),
  );
});
