import mongoose from 'mongoose';

const latestStatsDateSchema = new mongoose.Schema(
  {
    Date: {
      type: Date,
      default: () => Date.now(),
    }
  },
  { timestamps: true },
);

const LatestStatsDate = mongoose.model('LatestStatsDate', latestStatsDateSchema);

export default LatestStatsDate;
