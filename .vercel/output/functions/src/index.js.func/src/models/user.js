const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    trialStartDate: { type: Date, required: true },
    trialExpired: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.methods.isTrialExpired = function () {
  const now = new Date();
  const trialEndDate = new Date(this.trialStartDate);
  trialEndDate.setDate(trialEndDate.getDate() + 7);
  return now > trialEndDate;
};

const User = mongoose.model("User", userSchema);

module.exports = User;
