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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/player', routes.player);
app.use('/subscription', routes.subscription);
app.use('/user', routes.user);

connectDb().then(async () => {
  app.listen(process.env.PORT, '0.0.0.0',  () =>
    console.log(`NBA App listening on port booty ${process.env.PORT}!`),
  );
});