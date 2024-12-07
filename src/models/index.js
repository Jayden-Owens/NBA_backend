import mongoose from 'mongoose';

import Player from './player';
import Current from './current';
import Last from './last';

const connectDb = () => {
  return mongoose.connect(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, });
};

const models = { Player, Last, Current };

export { connectDb };

export default models;
